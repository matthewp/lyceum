import type Database from "better-sqlite3";
import { openDatabase } from "./database.ts";
import type { FileStore } from "./filestore.ts";
import type { StorageBackend, BookSummary, BookDetail, CategoryItem, AddBookResult } from "./types.ts";
import { logger as root } from "../logger.ts";

const log = root.child({ module: "local" });

export interface LocalConfig {
  dbPath: string;
  fileStore: FileStore;
}

interface BookRow {
  id: number;
  title: string;
  author_sort: string | null;
  publisher: string | null;
  pubdate: string | null;
  rating: number | null;
  comments: string | null;
  series_name: string | null;
  series_index: number | null;
  has_cover: number;
  path: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export class LocalBackend implements StorageBackend {
  private db: Database.Database;
  private files: FileStore;

  constructor(config: LocalConfig) {
    this.db = openDatabase(config.dbPath);
    this.files = config.fileStore;
    log.info({ db: config.dbPath }, "Local storage initialized");
  }

  // --- Read operations ---

  async listBooks(opts: { limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const total = (this.db.prepare("SELECT COUNT(*) as count FROM books").get() as { count: number }).count;

    const rows = this.db.prepare(`
      SELECT b.*, s.name as series_name
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as BookRow[];

    const books = rows.map(row => this.rowToSummary(row));
    return { books, total };
  }

  async getBook(id: number): Promise<BookDetail | null> {
    const row = this.db.prepare(`
      SELECT b.*, s.name as series_name
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      WHERE b.id = ?
    `).get(id) as BookRow | undefined;

    if (!row) return null;
    return this.rowToDetail(row);
  }

  async searchBooks(query: string, opts: { limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const ftsRows = this.db.prepare(`
      SELECT rowid FROM books_fts WHERE books_fts MATCH ? LIMIT ? OFFSET ?
    `).all(query, limit, offset) as { rowid: number }[];

    if (ftsRows.length === 0) return { results: [], count: 0 };

    const ids = ftsRows.map(r => r.rowid);
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT b.*, s.name as series_name
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      WHERE b.id IN (${placeholders})
    `).all(...ids) as BookRow[];

    const results = rows.map(row => this.rowToSummary(row));
    return { results, count: results.length };
  }

  async listAuthors(): Promise<CategoryItem[]> {
    return this.db.prepare(`
      SELECT a.name, COUNT(ba.book_id) as count
      FROM authors a
      JOIN book_authors ba ON a.id = ba.author_id
      GROUP BY a.id
      ORDER BY a.name
    `).all() as CategoryItem[];
  }

  async listTags(): Promise<CategoryItem[]> {
    return this.db.prepare(`
      SELECT t.name, COUNT(bt.book_id) as count
      FROM tags t
      JOIN book_tags bt ON t.id = bt.tag_id
      GROUP BY t.id
      ORDER BY t.name
    `).all() as CategoryItem[];
  }

  async listSeries(): Promise<CategoryItem[]> {
    return this.db.prepare(`
      SELECT s.name, COUNT(b.id) as count
      FROM series s
      JOIN books b ON b.series_id = s.id
      GROUP BY s.id
      ORDER BY s.name
    `).all() as CategoryItem[];
  }

  // --- Write operations (Phase 3) ---

  async addBook(_filename: string, _data: Buffer): Promise<AddBookResult> {
    throw new Error("Write operations not yet implemented for local storage");
  }

  async setMetadata(_bookId: number, _fields: Record<string, unknown>): Promise<void> {
    throw new Error("Write operations not yet implemented for local storage");
  }

  async setCover(_bookId: number, _imageUrl: string): Promise<void> {
    throw new Error("Write operations not yet implemented for local storage");
  }

  async removeFormats(_bookId: number, _formats: string[]): Promise<void> {
    throw new Error("Write operations not yet implemented for local storage");
  }

  async deleteBooks(_bookIds: number[]): Promise<void> {
    throw new Error("Write operations not yet implemented for local storage");
  }

  // --- Conversion (Phase 3) ---

  async convertBook(_bookId: number, _inputFmt: string, _outputFmt: string): Promise<string> {
    throw new Error("Conversion not yet implemented for local storage");
  }

  // --- File access ---

  bookDownloadPath(format: string, id: number): string {
    // Encode as id/format so the download handler can resolve the real path
    return `/${id}/${format.toLowerCase()}`;
  }

  async downloadBook(dlPath: string): Promise<Response> {
    // dlPath is /{id}/{format} from bookDownloadPath
    const parts = dlPath.split("/").filter(Boolean);
    const id = parseInt(parts[0], 10);
    const format = parts[1];

    const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(id) as { path: string } | undefined;
    if (!row) return new Response(null, { status: 404 });

    const data = this.files.get(`${row.path}/book.${format}`);
    if (!data) return new Response(null, { status: 404 });

    const mimeTypes: Record<string, string> = {
      epub: "application/epub+zip",
      pdf: "application/pdf",
      mobi: "application/x-mobipocket-ebook",
      azw3: "application/x-mobi8-ebook",
    };

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": mimeTypes[format] ?? "application/octet-stream",
        "Content-Length": String(data.length),
      },
    });
  }

  async getBookCover(id: number): Promise<Buffer | null> {
    const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(id) as { path: string } | undefined;
    if (!row) return null;
    return this.files.get(`${row.path}/cover.jpg`);
  }

  // --- Private helpers ---

  private getAuthors(bookId: number): string[] {
    const rows = this.db.prepare(`
      SELECT a.name FROM authors a
      JOIN book_authors ba ON a.id = ba.author_id
      WHERE ba.book_id = ?
      ORDER BY a.name
    `).all(bookId) as { name: string }[];
    return rows.map(r => r.name);
  }

  private getFormats(bookId: number): string[] {
    const rows = this.db.prepare(
      "SELECT format FROM formats WHERE book_id = ?"
    ).all(bookId) as { format: string }[];
    return rows.map(r => r.format);
  }

  private getTags(bookId: number): string[] {
    const rows = this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN book_tags bt ON t.id = bt.tag_id
      WHERE bt.book_id = ?
      ORDER BY t.name
    `).all(bookId) as { name: string }[];
    return rows.map(r => r.name);
  }

  private getIdentifiers(bookId: number): Record<string, string> {
    const rows = this.db.prepare(
      "SELECT type, value FROM identifiers WHERE book_id = ?"
    ).all(bookId) as { type: string; value: string }[];
    const result: Record<string, string> = {};
    for (const r of rows) result[r.type] = r.value;
    return result;
  }

  private getLanguages(bookId: number): string[] {
    const rows = this.db.prepare(
      "SELECT lang FROM languages WHERE book_id = ?"
    ).all(bookId) as { lang: string }[];
    return rows.map(r => r.lang);
  }

  private rowToSummary(row: BookRow): BookSummary {
    return {
      id: row.id,
      title: row.title,
      authors: this.getAuthors(row.id),
      timestamp: row.created_at,
      pubdate: row.pubdate ?? "",
      formats: this.getFormats(row.id),
      series: row.series_name,
      series_index: row.series_index,
      has_cover: row.has_cover === 1,
    };
  }

  private rowToDetail(row: BookRow): BookDetail {
    return {
      id: row.id,
      title: row.title,
      authors: this.getAuthors(row.id),
      author_sort: row.author_sort ?? "",
      timestamp: row.created_at,
      pubdate: row.pubdate ?? "",
      last_modified: row.updated_at,
      series: row.series_name,
      series_index: row.series_index,
      publisher: row.publisher,
      rating: row.rating,
      tags: this.getTags(row.id),
      formats: this.getFormats(row.id),
      identifiers: this.getIdentifiers(row.id),
      languages: this.getLanguages(row.id),
      comments: row.comments,
      has_cover: row.has_cover === 1,
      cover: null,
      read_at: row.read_at,
      custom_columns: {},
    };
  }
}
