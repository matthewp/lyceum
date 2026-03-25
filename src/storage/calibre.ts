import { randomUUID, createHash, randomBytes } from "node:crypto";
import { logger as root } from "../logger.ts";
import type { StorageBackend, BookSummary, BookDetail, CategoryItem, AddBookResult } from "./types.ts";

const log = root.child({ module: "calibre" });

interface CalibreConfig {
  serverUrl: string;
  libraryId: string;
  username: string;
  password: string;
}

// --- Digest auth internals ---

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
  username: string,
  password: string,
): string {
  const cnonce = randomBytes(16).toString("hex");
  const nc = "00000001";
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  let response: string;
  if (challenge.qop?.includes("auth")) {
    response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`);
  }

  let header =
    `Digest username="${username}", realm="${challenge.realm}", ` +
    `nonce="${challenge.nonce}", uri="${uri}", response="${response}"`;

  if (challenge.qop?.includes("auth")) {
    header += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  }
  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`;
  }
  return header;
}

// --- Helpers ---

function encodeHex(s: string): string {
  return Buffer.from(s).toString("hex");
}

function formatBook(raw: any): BookSummary {
  return {
    id: raw.application_id ?? raw.id,
    title: raw.title,
    authors: raw.authors ?? [],
    timestamp: raw.timestamp,
    pubdate: raw.pubdate,
    formats: raw.formats ?? [],
    tags: raw.tags ?? [],
    series: raw.series ?? null,
    series_id: null, // Calibre backend does not expose series IDs
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

function formatBookDetail(raw: any, serverUrl: string): BookDetail {
  return {
    id: raw.application_id ?? raw.id,
    title: raw.title,
    authors: raw.authors ?? [],
    author_sort: raw.author_sort,
    timestamp: raw.timestamp,
    pubdate: raw.pubdate,
    last_modified: raw.last_modified,
    series: raw.series ?? null,
    series_id: null,
    series_index: raw.series_index ?? null,
    publisher: raw.publisher ?? null,
    rating: raw.rating ?? null,
    tags: raw.tags ?? [],
    formats: raw.formats ?? [],
    identifiers: raw.identifiers ?? {},
    languages: raw.languages ?? [],
    comments: raw.comments ?? null,
    has_cover: raw.has_cover ?? false,
    cover: raw.cover ? `${serverUrl}${raw.cover}` : null,
    read_at: raw.user_metadata?.["#read"]?.["#value#"] ?? null,
    custom_columns: extractCustomColumns(raw.user_metadata),
  };
}

// --- Implementation ---

export class CalibreBackend implements StorageBackend {
  private serverUrl: string;
  private libraryId: string;
  private username: string;
  private password: string;

  constructor(config: CalibreConfig) {
    this.serverUrl = config.serverUrl;
    this.libraryId = config.libraryId;
    this.username = config.username;
    this.password = config.password;
  }

  private libraryPath(path: string): string {
    return this.libraryId ? `${path}/${this.libraryId}` : path;
  }

  private async digestFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();

    if (!this.username) {
      return fetch(url, init);
    }

    const initial = await fetch(url, { ...init, redirect: "manual" });
    if (initial.status !== 401) return initial;

    const wwwAuth = initial.headers.get("www-authenticate");
    if (!wwwAuth || !wwwAuth.toLowerCase().startsWith("digest")) return initial;

    const challenge = parseDigestChallenge(wwwAuth);
    const uri = new URL(url).pathname + new URL(url).search;

    const headers = new Headers(init.headers);
    headers.set("Authorization", buildDigestHeader(challenge, method, uri, this.username, this.password));

    return fetch(url, { ...init, headers });
  }

  private async get(path: string): Promise<any> {
    const url = `${this.serverUrl}${path}`;
    log.debug({ method: "GET", url }, "request");
    const res = await this.digestFetch(url);
    if (!res.ok) {
      const body = await res.text();
      log.error({ method: "GET", url, status: res.status, body }, "request failed");
      throw new Error(`Calibre server error (${res.status}): ${body}`);
    }
    const json = await res.json();
    log.debug({ method: "GET", url, status: res.status }, "response");
    return json;
  }

  private async post(path: string, body: unknown): Promise<any> {
    const url = `${this.serverUrl}${path}`;
    log.debug({ method: "POST", url, body }, "request");
    const res = await this.digestFetch(url, {
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

  async listBooks(opts: { limit?: number; offset?: number } = {}) {
    const num = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const path = this.libraryPath(`/ajax/search`);
    const result = await this.get(`${path}?num=${num}&offset=${offset}&sort=timestamp&sort_order=desc`);

    const bookIds: number[] = result.book_ids;
    const total: number = result.total_num;

    if (bookIds.length === 0) return { books: [], total };

    const booksPath = this.libraryPath(`/ajax/books`);
    const books = await this.get(`${booksPath}?ids=${bookIds.join(",")}`);

    const ordered = bookIds.map(id => formatBook(books[String(id)]));
    return { books: ordered, total };
  }

  async getBook(id: number) {
    const path = this.libraryPath(`/ajax/book/${id}`);
    try {
      const book = await this.get(path);
      return formatBookDetail(book, this.serverUrl);
    } catch {
      return null;
    }
  }

  async searchBooks(query: string, opts: { limit?: number; offset?: number } = {}) {
    const num = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const path = this.libraryPath(`/ajax/search`);
    const result = await this.get(`${path}?query=${encodeURIComponent(query)}&num=${num}&offset=${offset}&sort=timestamp&sort_order=desc`);

    const bookIds: number[] = result.book_ids;
    if (bookIds.length === 0) return { results: [], count: 0 };

    const booksPath = this.libraryPath(`/ajax/books`);
    const books = await this.get(`${booksPath}?ids=${bookIds.join(",")}`);

    const results = bookIds.map(id => formatBook(books[String(id)]));
    return { results, count: results.length };
  }

  async listAuthors(): Promise<CategoryItem[]> {
    const path = this.libraryPath(`/ajax/category/${encodeHex("authors")}`);
    const result = await this.get(`${path}?num=10000`);
    return result.items.map((item: any) => ({
      name: item.name,
      count: item.count,
    }));
  }

  async listTags(): Promise<CategoryItem[]> {
    const path = this.libraryPath(`/ajax/category/${encodeHex("tags")}`);
    const result = await this.get(`${path}?num=10000`);
    return result.items.map((item: any) => ({
      name: item.name,
      count: item.count,
    }));
  }

  async listSeries(): Promise<CategoryItem[]> {
    const path = this.libraryPath(`/ajax/category/${encodeHex("series")}`);
    const result = await this.get(`${path}?num=10000`);
    return result.items.map((item: any) => ({
      name: item.name,
      count: item.count,
    }));
  }

  async listBooksByAuthor(author: string, opts: { limit?: number; offset?: number } = {}) {
    const result = await this.searchBooks(`authors:"=${author}"`, opts);
    return { books: result.results, total: result.count };
  }

  async listBooksByTag(tag: string, opts: { limit?: number; offset?: number } = {}) {
    const result = await this.searchBooks(`tags:"=${tag}"`, opts);
    return { books: result.results, total: result.count };
  }

  async listBooksBySeries(_seriesId: number, _opts: { limit?: number; offset?: number } = {}) {
    // Calibre backend does not expose series IDs; unsupported
    return { books: [], total: 0, seriesName: null };
  }

  // --- Write operations ---

  async addBook(filename: string, data: Buffer): Promise<AddBookResult> {
    const jobId = randomUUID();
    const path = this.libraryPath(`/cdb/add-book/${jobId}/n/${encodeURIComponent(filename)}`);

    const res = await this.digestFetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(data),
    });

    const result = await res.json() as any;
    if (result.err) throw new Error(result.err);
    return result;
  }

  async addFormat(_bookId: number, _filename: string, _data: Buffer): Promise<void> {
    throw new Error("addFormat is not supported by the Calibre backend");
  }

  async setMetadata(bookId: number, fields: Record<string, unknown>): Promise<void> {
    const path = this.libraryPath(`/cdb/set-fields/${bookId}`);
    await this.post(path, {
      changes: fields,
      loaded_book_ids: [bookId],
    });
  }

  async setCover(bookId: number, imageUrl: string): Promise<void> {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to download cover image: ${imgRes.status}`);
    const imgData = new Uint8Array(await imgRes.arrayBuffer());

    const path = this.libraryPath(`/cdb/set-cover/${bookId}`);
    const url = `${this.serverUrl}${path}`;
    const res = await this.digestFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: imgData,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to set cover (${res.status}): ${body}`);
    }
  }

  async removeFormats(bookId: number, formats: string[]): Promise<void> {
    const path = this.libraryPath(`/cdb/set-fields/${bookId}`);
    await this.post(path, {
      changes: { removed_formats: formats.map(f => f.toUpperCase()) },
      loaded_book_ids: [bookId],
    });
  }

  async deleteBooks(bookIds: number[]): Promise<void> {
    const ids = bookIds.join(",");
    const path = this.libraryPath(`/cdb/delete-books/${ids}`);
    await this.post(path, {});
  }

  // --- Conversion ---

  async convertBook(bookId: number, inputFmt: string, outputFmt: string): Promise<string> {
    const jobId = await this.startConversion(bookId, inputFmt, outputFmt);

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await this.conversionStatus(jobId);
      if (!status.running) {
        if (status.ok) return `Conversion complete: ${outputFmt.toUpperCase()}`;
        throw new Error(`Conversion failed: ${status.msg ?? "unknown error"}`);
      }
    }
    throw new Error("Conversion timed out after 4 minutes");
  }

  private async startConversion(bookId: number, inputFmt: string, outputFmt: string): Promise<number> {
    const result = await this.post(this.libraryPath(`/conversion/start/${bookId}`), {
      input_fmt: inputFmt.toLowerCase(),
      output_fmt: outputFmt.toLowerCase(),
      options: {},
    });
    return typeof result === "number" ? result : result.job_id;
  }

  private async conversionStatus(jobId: number): Promise<{ running: boolean; ok?: boolean; msg?: string }> {
    return this.get(this.libraryPath(`/conversion/status/${jobId}`));
  }

  // --- File access ---

  bookDownloadPath(format: string, id: number): string {
    return `/${format.toUpperCase()}/${id}`;
  }

  async downloadBook(path: string): Promise<Response> {
    const fullPath = this.libraryPath(`/get${path}`);
    const url = `${this.serverUrl}${fullPath}`;
    return this.digestFetch(url);
  }

  async getBookCover(id: number): Promise<Buffer | null> {
    const path = this.libraryPath(`/ajax/book/${id}`);
    try {
      const book = await this.get(path);
      if (!book.cover) return null;
      const url = `${this.serverUrl}${book.cover}`;
      const res = await this.digestFetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
}
