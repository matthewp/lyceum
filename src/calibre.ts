import { randomUUID, createHash, randomBytes } from "node:crypto";
import { logger as root } from "./logger.ts";

const log = root.child({ module: "calibre" });
const CALIBRE_SERVER = process.env.CALIBRE_SERVER_URL ?? "http://localhost:8080";
const LIBRARY_ID = process.env.CALIBRE_LIBRARY_ID ?? "";
const CALIBRE_USERNAME = process.env.CALIBRE_USERNAME ?? "";
const CALIBRE_PASSWORD = process.env.CALIBRE_PASSWORD ?? "";

function md5(data: string): string {
  return createHash("md5").update(data).digest("hex");
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}

function parseDigestChallenge(header: string): DigestChallenge {
  const params: Record<string, string> = {};
  const body = header.replace(/^Digest\s+/i, "");
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    params[m[1]] = m[2] ?? m[3];
  }
  return params as unknown as DigestChallenge;
}

function buildDigestHeader(
  challenge: DigestChallenge,
  method: string,
  uri: string,
): string {
  const cnonce = randomBytes(16).toString("hex");
  const nc = "00000001";
  const ha1 = md5(`${CALIBRE_USERNAME}:${challenge.realm}:${CALIBRE_PASSWORD}`);
  const ha2 = md5(`${method}:${uri}`);

  let response: string;
  if (challenge.qop?.includes("auth")) {
    response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`);
  }

  let header =
    `Digest username="${CALIBRE_USERNAME}", realm="${challenge.realm}", ` +
    `nonce="${challenge.nonce}", uri="${uri}", response="${response}"`;

  if (challenge.qop?.includes("auth")) {
    header += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  }
  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`;
  }
  return header;
}

async function digestFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();

  if (!CALIBRE_USERNAME) {
    return fetch(url, init);
  }

  const initial = await fetch(url, { ...init, redirect: "manual" });

  if (initial.status !== 401) return initial;

  const wwwAuth = initial.headers.get("www-authenticate");
  if (!wwwAuth || !wwwAuth.toLowerCase().startsWith("digest")) return initial;

  const challenge = parseDigestChallenge(wwwAuth);
  const uri = new URL(url).pathname + new URL(url).search;

  const headers = new Headers(init.headers);
  headers.set("Authorization", buildDigestHeader(challenge, method, uri));

  return fetch(url, { ...init, headers });
}

function libraryPath(path: string): string {
  return LIBRARY_ID ? `${path}/${LIBRARY_ID}` : path;
}

async function get(path: string): Promise<any> {
  const url = `${CALIBRE_SERVER}${path}`;
  log.debug({ method: "GET", url }, "request");
  const res = await digestFetch(url);
  if (!res.ok) {
    const body = await res.text();
    log.error({ method: "GET", url, status: res.status, body }, "request failed");
    throw new Error(`Calibre server error (${res.status}): ${body}`);
  }
  const json = await res.json();
  log.debug({ method: "GET", url, status: res.status }, "response");
  return json;
}

async function post(path: string, body: unknown): Promise<any> {
  const url = `${CALIBRE_SERVER}${path}`;
  log.debug({ method: "POST", url, body }, "request");
  const res = await digestFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    log.error({ method: "POST", url, status: res.status, body: text }, "request failed");
    throw new Error(`Calibre server error (${res.status}): ${text}`);
  }
  log.debug({ method: "POST", url, status: res.status, response: text }, "response");

  try {
    const json = JSON.parse(text);
    if (json.err) throw new Error(json.err);
    return json;
  } catch (e: any) {
    if (e.message.startsWith("Calibre server error")) throw e;
    return text;
  }
}

// --- Read operations ---

export async function listBooks(opts: { limit?: number; offset?: number } = {}) {
  const num = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const path = libraryPath(`/ajax/search`);
  const result = await get(`${path}?num=${num}&offset=${offset}&sort=timestamp&sort_order=desc`);

  // result.book_ids is an array of IDs, fetch metadata for each
  const bookIds: number[] = result.book_ids;
  const total: number = result.total_num;

  if (bookIds.length === 0) return { books: [], total };

  const booksPath = libraryPath(`/ajax/books`);
  const books = await get(`${booksPath}?ids=${bookIds.join(",")}`);

  // books is a map of id -> metadata, return in order
  const ordered = bookIds.map(id => formatBook(books[String(id)]));
  return { books: ordered, total };
}

export async function getBook(id: number) {
  const path = libraryPath(`/ajax/book/${id}`);
  try {
    const book = await get(path);
    return formatBookDetail(book);
  } catch {
    return null;
  }
}

export async function searchBooks(query: string, opts: { limit?: number; offset?: number } = {}) {
  const num = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const path = libraryPath(`/ajax/search`);
  const result = await get(`${path}?query=${encodeURIComponent(query)}&num=${num}&offset=${offset}&sort=timestamp&sort_order=desc`);

  const bookIds: number[] = result.book_ids;
  if (bookIds.length === 0) return { results: [], count: 0 };

  const booksPath = libraryPath(`/ajax/books`);
  const books = await get(`${booksPath}?ids=${bookIds.join(",")}`);

  const results = bookIds.map(id => formatBook(books[String(id)]));
  return { results, count: results.length };
}

export async function countBooks(): Promise<number> {
  const path = libraryPath(`/ajax/search`);
  const result = await get(`${path}?num=0`);
  return result.total_num;
}

export async function listAuthors() {
  const path = libraryPath(`/ajax/category/${encodeHex("authors")}`);
  const result = await get(`${path}?num=10000`);
  return result.items.map((item: any) => ({
    name: item.name,
    count: item.count,
  }));
}

export async function listTags() {
  const path = libraryPath(`/ajax/category/${encodeHex("tags")}`);
  const result = await get(`${path}?num=10000`);
  return result.items.map((item: any) => ({
    name: item.name,
    count: item.count,
  }));
}

export async function listSeries() {
  const path = libraryPath(`/ajax/category/${encodeHex("series")}`);
  const result = await get(`${path}?num=10000`);
  return result.items.map((item: any) => ({
    name: item.name,
    count: item.count,
  }));
}

export function bookDownloadPath(format: string, id: number): string {
  return `/${format.toUpperCase()}/${id}`;
}

export async function downloadBook(path: string): Promise<Response> {
  const fullPath = libraryPath(`/get${path}`);
  const url = `${CALIBRE_SERVER}${fullPath}`;
  return digestFetch(url);
}

// --- Write operations ---

export async function addBook(
  filename: string,
  data: Buffer,
  addDuplicates = false
): Promise<{ book_id: number; title: string; authors: string[] }> {
  const jobId = randomUUID();
  const dupes = addDuplicates ? "y" : "n";
  const path = libraryPath(`/cdb/add-book/${jobId}/${dupes}/${encodeURIComponent(filename)}`);

  const res = await digestFetch(`${CALIBRE_SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(data),
  });

  const result = await res.json() as any;
  if (result.err) throw new Error(result.err);
  return result;
}

export async function setMetadata(
  bookId: number,
  fields: Record<string, unknown>
): Promise<void> {
  const path = libraryPath(`/cdb/set-fields/${bookId}`);
  await post(path, {
    changes: fields,
    loaded_book_ids: [bookId],
  });
}

export async function removeFormats(bookId: number, formats: string[]): Promise<void> {
  const path = libraryPath(`/cdb/set-fields/${bookId}`);
  await post(path, {
    changes: { removed_formats: formats.map(f => f.toUpperCase()) },
    loaded_book_ids: [bookId],
  });
}

export async function setCover(bookId: number, imageUrl: string): Promise<void> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download cover image: ${imgRes.status}`);
  const imgData = new Uint8Array(await imgRes.arrayBuffer());

  const path = libraryPath(`/cdb/set-cover/${bookId}`);
  const url = `${CALIBRE_SERVER}${path}`;
  const res = await digestFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: imgData,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to set cover (${res.status}): ${body}`);
  }
}

export async function deleteBooks(bookIds: number[]): Promise<void> {
  const ids = bookIds.join(",");
  const path = libraryPath(`/cdb/delete-books/${ids}`);
  await post(path, {});
}

export async function startConversion(
  bookId: number,
  inputFmt: string,
  outputFmt: string
): Promise<number> {
  const result = await post(libraryPath(`/conversion/start/${bookId}`), {
    input_fmt: inputFmt.toLowerCase(),
    output_fmt: outputFmt.toLowerCase(),
    options: {},
  });
  return typeof result === "number" ? result : result.job_id;
}

export async function conversionStatus(
  jobId: number
): Promise<{ running: boolean; ok?: boolean; percent?: number; msg?: string; fmt?: string }> {
  return get(libraryPath(`/conversion/status/${jobId}`));
}

export async function convertBook(
  bookId: number,
  inputFmt: string,
  outputFmt: string
): Promise<string> {
  const jobId = await startConversion(bookId, inputFmt, outputFmt);

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await conversionStatus(jobId);
    if (!status.running) {
      if (status.ok) return `Conversion complete: ${outputFmt.toUpperCase()}`;
      throw new Error(`Conversion failed: ${status.msg ?? "unknown error"}`);
    }
  }
  throw new Error("Conversion timed out after 4 minutes");
}

export async function getBookCover(id: number): Promise<Buffer | null> {
  const path = libraryPath(`/ajax/book/${id}`);
  try {
    const book = await get(path);
    if (!book.cover) return null;
    const url = `${CALIBRE_SERVER}${book.cover}`;
    const res = await digestFetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// --- Helpers ---

function encodeHex(s: string): string {
  return Buffer.from(s).toString("hex");
}

function formatBook(raw: any) {
  return {
    id: raw.application_id ?? raw.id,
    title: raw.title,
    authors: raw.authors ?? [],
    timestamp: raw.timestamp,
    pubdate: raw.pubdate,
    formats: raw.formats ?? [],
    series: raw.series ?? null,
    series_index: raw.series_index ?? null,
    has_cover: raw.has_cover ?? false,
  };
}

function extractCustomColumns(userMetadata: any): Record<string, any> {
  if (!userMetadata) return {};
  const result: Record<string, any> = {};
  for (const [key, meta] of Object.entries(userMetadata) as any) {
    result[key] = {
      name: meta.name,
      datatype: meta.datatype,
      value: meta["#value#"] ?? null,
    };
  }
  return result;
}

function formatBookDetail(raw: any) {
  return {
    id: raw.application_id ?? raw.id,
    title: raw.title,
    authors: raw.authors ?? [],
    author_sort: raw.author_sort,
    timestamp: raw.timestamp,
    pubdate: raw.pubdate,
    last_modified: raw.last_modified,
    series: raw.series ?? null,
    series_index: raw.series_index ?? null,
    publisher: raw.publisher ?? null,
    rating: raw.rating ?? null,
    tags: raw.tags ?? [],
    formats: raw.formats ?? [],
    identifiers: raw.identifiers ?? {},
    languages: raw.languages ?? [],
    comments: raw.comments ?? null,
    has_cover: raw.has_cover ?? false,
    cover: raw.cover ? `${CALIBRE_SERVER}${raw.cover}` : null,
    custom_columns: extractCustomColumns(raw.user_metadata),
  };
}
