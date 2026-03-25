import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { stateDb } from "./state.ts";
import { escapeHtml } from "./html.ts";
import type { StorageBackend, BookSummary, CategoryItem } from "./storage/types.ts";
import type { IncomingMessage } from "node:http";

// --- Password hashing ---

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  try {
    return timingSafeEqual(derived, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// --- Settings CRUD ---

export interface OpdsSettings {
  enabled: boolean;
  username: string | null;
  hasPassword: boolean;
}

const getSetting = stateDb.prepare("SELECT value FROM opds_settings WHERE key = ?");
const upsertSetting = stateDb.prepare("INSERT INTO opds_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

export function getOpdsSettings(): OpdsSettings {
  const enabled = getSetting.get("enabled") as { value: string } | undefined;
  const username = getSetting.get("username") as { value: string } | undefined;
  const passwordHash = getSetting.get("password_hash") as { value: string } | undefined;
  return {
    enabled: enabled?.value === "true",
    username: username?.value ?? null,
    hasPassword: !!passwordHash?.value,
  };
}

export function setOpdsSettings(opts: { enabled?: boolean; username?: string; password?: string }): void {
  if (opts.enabled !== undefined) {
    upsertSetting.run("enabled", opts.enabled ? "true" : "false");
  }
  if (opts.username !== undefined) {
    upsertSetting.run("username", opts.username);
  }
  if (opts.password !== undefined) {
    upsertSetting.run("password_hash", hashPassword(opts.password));
  }
}

// --- OPDS Basic Auth ---

export function verifyOpdsAuth(req: IncomingMessage): boolean {
  const settings = getOpdsSettings();
  if (!settings.enabled || !settings.username || !settings.hasPassword) return false;

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return false;

  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  if (user !== settings.username) return false;

  const stored = (getSetting.get("password_hash") as { value: string } | undefined)?.value;
  if (!stored) return false;

  return verifyPassword(pass, stored);
}

// --- XML helpers ---

const esc = escapeHtml;

const FORMAT_MIME: Record<string, string> = {
  EPUB: "application/epub+zip",
  PDF: "application/pdf",
  MOBI: "application/x-mobipocket-ebook",
  AZW3: "application/x-mobi8-ebook",
  CBZ: "application/x-cbz",
  CBR: "application/x-cbr",
  FB2: "application/x-fictionbook+xml",
  LIT: "application/x-ms-reader",
  LRF: "application/x-sony-bbeb",
  TXT: "text/plain",
  RTF: "application/rtf",
  DJVU: "image/vnd.djvu",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  HTMLZ: "application/zip",
};

function toRfc3339(sqlDate: string): string {
  // SQLite gives YYYY-MM-DD HH:MM:SS, convert to RFC 3339
  if (!sqlDate) return new Date().toISOString();
  if (sqlDate.includes("T")) return sqlDate;
  return sqlDate.replace(" ", "T") + "Z";
}

const PER_PAGE = 50;

function feedWrap(id: string, title: string, baseUrl: string, updated: string, entries: string, extra: string = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>${esc(id)}</id>
  <title>${esc(title)}</title>
  <updated>${esc(updated)}</updated>
  <author><name>Lyceum</name></author>
  <link rel="self" href="${esc(baseUrl + "/opds/")}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${esc(baseUrl + "/opds/")}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" type="application/opensearchdescription+xml" href="${esc(baseUrl + "/opds/opensearch.xml")}"/>
${extra}${entries}</feed>`;
}

function navEntry(id: string, title: string, href: string, content: string, updated: string): string {
  return `  <entry>
    <id>${esc(id)}</id>
    <title>${esc(title)}</title>
    <link href="${esc(href)}" type="application/atom+xml;profile=opds-catalog" rel="subsection"/>
    <content type="text">${esc(content)}</content>
    <updated>${esc(updated)}</updated>
  </entry>\n`;
}

function bookEntry(baseUrl: string, book: BookSummary): string {
  const updated = toRfc3339(book.timestamp);
  const authors = book.authors.map(a => `    <author><name>${esc(a)}</name></author>`).join("\n");
  const categories = book.tags.map(t => `    <category term="${esc(t)}"/>`).join("\n");

  const acquisitions = book.formats.map(f => {
    const mime = FORMAT_MIME[f] ?? "application/octet-stream";
    return `    <link rel="http://opds-spec.org/acquisition" href="${esc(baseUrl)}/opds/download/${book.id}/${esc(f)}" type="${esc(mime)}"/>`;
  }).join("\n");

  const cover = book.has_cover
    ? `    <link rel="http://opds-spec.org/image" href="${esc(baseUrl)}/opds/cover/${book.id}" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${esc(baseUrl)}/opds/cover/${book.id}" type="image/jpeg"/>`
    : "";

  const series = book.series && book.series_index != null
    ? `    <opds:series name="${esc(book.series)}" position="${book.series_index}"/>`
    : book.series ? `    <opds:series name="${esc(book.series)}"/>` : "";

  return `  <entry>
    <id>urn:lyceum:book:${book.id}</id>
    <title>${esc(book.title)}</title>
    <updated>${esc(updated)}</updated>
${authors}
${categories}
${acquisitions}
${cover}
${series}
  </entry>\n`;
}

function paginationLinks(baseUrl: string, path: string, page: number, total: number, params?: string): string {
  const q = params ? `&${params}` : "";
  let links = "";
  if (page > 1) {
    links += `  <link rel="first" href="${esc(baseUrl)}${esc(path)}?page=1${esc(q)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n`;
    links += `  <link rel="previous" href="${esc(baseUrl)}${esc(path)}?page=${page - 1}${esc(q)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n`;
  }
  if (page * PER_PAGE < total) {
    links += `  <link rel="next" href="${esc(baseUrl)}${esc(path)}?page=${page + 1}${esc(q)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n`;
  }
  return links;
}

function acquisitionFeedWrap(id: string, title: string, baseUrl: string, updated: string, entries: string, paging: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>${esc(id)}</id>
  <title>${esc(title)}</title>
  <updated>${esc(updated)}</updated>
  <author><name>Lyceum</name></author>
  <link rel="start" href="${esc(baseUrl + "/opds/")}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" type="application/opensearchdescription+xml" href="${esc(baseUrl + "/opds/opensearch.xml")}"/>
${paging}${entries}</feed>`;
}

// --- Feed generation ---

export function rootFeed(baseUrl: string): string {
  const now = new Date().toISOString();
  const entries = [
    navEntry("urn:lyceum:nav:recent", "Recent Additions", baseUrl + "/opds/recent", "Recently added books", now),
    navEntry("urn:lyceum:nav:authors", "By Author", baseUrl + "/opds/authors", "Browse books by author", now),
    navEntry("urn:lyceum:nav:series", "By Series", baseUrl + "/opds/series", "Browse books by series", now),
    navEntry("urn:lyceum:nav:tags", "By Tag", baseUrl + "/opds/tags", "Browse books by tag", now),
  ].join("");
  return feedWrap("urn:lyceum:root", "Lyceum", baseUrl, now, entries);
}

export async function recentFeed(baseUrl: string, storage: StorageBackend, page: number): Promise<string> {
  const { books, total } = await storage.listBooks({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const now = books[0] ? toRfc3339(books[0].timestamp) : new Date().toISOString();
  const entries = books.map(b => bookEntry(baseUrl, b)).join("");
  const paging = paginationLinks(baseUrl, "/opds/recent", page, total);
  return acquisitionFeedWrap("urn:lyceum:recent", "Recent Additions", baseUrl, now, entries, paging);
}

export async function authorsFeed(baseUrl: string, storage: StorageBackend): Promise<string> {
  const authors = await storage.listAuthors();
  const now = new Date().toISOString();
  const entries = authors.map((a: CategoryItem) =>
    navEntry(`urn:lyceum:author:${a.name}`, a.name, `${baseUrl}/opds/author/${encodeURIComponent(a.name)}`, `${a.count} book${a.count !== 1 ? "s" : ""}`, now)
  ).join("");
  return feedWrap("urn:lyceum:authors", "Authors", baseUrl, now, entries);
}

export async function authorBooksFeed(baseUrl: string, storage: StorageBackend, author: string, page: number): Promise<string> {
  const { books, total } = await storage.listBooksByAuthor(author, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const now = books[0] ? toRfc3339(books[0].timestamp) : new Date().toISOString();
  const entries = books.map(b => bookEntry(baseUrl, b)).join("");
  const paging = paginationLinks(baseUrl, `/opds/author/${encodeURIComponent(author)}`, page, total);
  return acquisitionFeedWrap(`urn:lyceum:author:${author}`, author, baseUrl, now, entries, paging);
}

export async function seriesFeed(baseUrl: string, storage: StorageBackend): Promise<string> {
  const series = await storage.listSeries();
  const now = new Date().toISOString();
  const entries = series.map((s: CategoryItem) => {
    const id = s.id ?? s.name;
    return navEntry(`urn:lyceum:series:${id}`, s.name, `${baseUrl}/opds/series/${id}`, `${s.count} book${s.count !== 1 ? "s" : ""}`, now);
  }).join("");
  return feedWrap("urn:lyceum:series", "Series", baseUrl, now, entries);
}

export async function seriesBooksFeed(baseUrl: string, storage: StorageBackend, seriesId: number, page: number): Promise<string | null> {
  const { books, total, seriesName } = await storage.listBooksBySeries(seriesId, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  if (!seriesName) return null;
  const now = books[0] ? toRfc3339(books[0].timestamp) : new Date().toISOString();
  const entries = books.map(b => bookEntry(baseUrl, b)).join("");
  const paging = paginationLinks(baseUrl, `/opds/series/${seriesId}`, page, total);
  return acquisitionFeedWrap(`urn:lyceum:series:${seriesId}`, seriesName, baseUrl, now, entries, paging);
}

export async function tagsFeed(baseUrl: string, storage: StorageBackend): Promise<string> {
  const tags = await storage.listTags();
  const now = new Date().toISOString();
  const entries = tags.map((t: CategoryItem) =>
    navEntry(`urn:lyceum:tag:${t.name}`, t.name, `${baseUrl}/opds/tag/${encodeURIComponent(t.name)}`, `${t.count} book${t.count !== 1 ? "s" : ""}`, now)
  ).join("");
  return feedWrap("urn:lyceum:tags", "Tags", baseUrl, now, entries);
}

export async function tagBooksFeed(baseUrl: string, storage: StorageBackend, tag: string, page: number): Promise<string> {
  const { books, total } = await storage.listBooksByTag(tag, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const now = books[0] ? toRfc3339(books[0].timestamp) : new Date().toISOString();
  const entries = books.map(b => bookEntry(baseUrl, b)).join("");
  const paging = paginationLinks(baseUrl, `/opds/tag/${encodeURIComponent(tag)}`, page, total);
  return acquisitionFeedWrap(`urn:lyceum:tag:${tag}`, tag, baseUrl, now, entries, paging);
}

export async function searchFeed(baseUrl: string, storage: StorageBackend, query: string, page: number): Promise<string> {
  const { results, count } = await storage.searchBooks(query, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const now = new Date().toISOString();
  const entries = results.map(b => bookEntry(baseUrl, b)).join("");
  const paging = paginationLinks(baseUrl, "/opds/search", page, count, `q=${encodeURIComponent(query)}`);
  return acquisitionFeedWrap(`urn:lyceum:search:${query}`, `Search: ${query}`, baseUrl, now, entries, paging);
}

export function openSearchDescriptor(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Lyceum</ShortName>
  <Description>Search the Lyceum library</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="${esc(baseUrl)}/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;
}
