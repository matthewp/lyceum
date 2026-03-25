import { extname } from "node:path";
import type Database from "better-sqlite3";
import { openDatabase, bookDirPath, bookFilePath, coverFilePath, insertFts, deleteFts, getOrCreateAuthor, getOrCreateTag, getOrCreateSeries } from "./database.ts";
import type { FileStore } from "./filestore.ts";
import type { StorageBackend, BookSummary, BookDetail, CategoryItem, AddBookResult } from "./types.ts";
import { extractMetadata } from "../metadata-extract/index.ts";
import { logger as root } from "../logger.ts";

const log = root.child({ module: "local" });

export interface LocalConfig {
  dbPath: string;
  fileStore: FileStore;
  converterUrl?: string;
  converterApiKey?: string;
}

interface BookRow {
  id: number;
  title: string;
  author_sort: string | null;
  publisher: string | null;
  pubdate: string | null;
  rating: number | null;
  comments: string | null;
  series_id: number | null;
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
  private converterUrl: string | null;
  private converterApiKey: string | null;

  constructor(config: LocalConfig) {
    this.db = openDatabase(config.dbPath);
    this.files = config.fileStore;
    this.converterUrl = config.converterUrl ?? null;
    this.converterApiKey = config.converterApiKey ?? null;
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
      ORDER BY NULLIF(b.created_at, 'None') DESC NULLS LAST
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

  async listBooksByTag(tag: string, opts: { limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const total = (this.db.prepare(`
      SELECT COUNT(*) as count FROM book_tags bt
      JOIN tags t ON t.id = bt.tag_id WHERE t.name = ?
    `).get(tag) as { count: number }).count;

    const rows = this.db.prepare(`
      SELECT b.*, s.name as series_name FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      JOIN book_tags bt ON bt.book_id = b.id
      JOIN tags t ON t.id = bt.tag_id
      WHERE t.name = ?
      ORDER BY NULLIF(b.created_at, 'None') DESC NULLS LAST LIMIT ? OFFSET ?
    `).all(tag, limit, offset) as BookRow[];

    return { books: rows.map(row => this.rowToSummary(row)), total };
  }

  async listBooksByAuthor(author: string, opts: { limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const total = (this.db.prepare(`
      SELECT COUNT(*) as count FROM book_authors ba
      JOIN authors a ON a.id = ba.author_id WHERE a.name = ?
    `).get(author) as { count: number }).count;

    const rows = this.db.prepare(`
      SELECT b.*, s.name as series_name FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      JOIN book_authors ba ON ba.book_id = b.id
      JOIN authors a ON a.id = ba.author_id
      WHERE a.name = ?
      ORDER BY NULLIF(b.created_at, 'None') DESC NULLS LAST LIMIT ? OFFSET ?
    `).all(author, limit, offset) as BookRow[];

    return { books: rows.map(row => this.rowToSummary(row)), total };
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

  async listBooksBySeries(seriesId: number, opts: { limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const seriesRow = this.db.prepare("SELECT name FROM series WHERE id = ?").get(seriesId) as { name: string } | undefined;
    const seriesName = seriesRow?.name ?? null;

    const total = (this.db.prepare("SELECT COUNT(*) as count FROM books WHERE series_id = ?").get(seriesId) as { count: number }).count;

    const rows = this.db.prepare(`
      SELECT b.*, s.name as series_name
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      WHERE b.series_id = ?
      ORDER BY b.series_index ASC, b.title ASC
      LIMIT ? OFFSET ?
    `).all(seriesId, limit, offset) as BookRow[];

    return { books: rows.map(row => this.rowToSummary(row)), total, seriesName };
  }

  // --- Write operations ---

  async addBook(filename: string, data: Buffer): Promise<AddBookResult> {
    const ext = extname(filename).replace(/^\./, "").toLowerCase();
    const format = ext.toUpperCase();

    // Extract metadata from the file
    const meta = await extractMetadata(data, filename);
    const title = meta.title || filename.replace(/\.[^.]+$/, "");
    const authors = meta.authors.length > 0 ? meta.authors : ["Unknown"];
    const authorSort = authors.map(a => {
      const parts = a.split(" ");
      return parts.length > 1 ? `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}` : a;
    }).join(" & ");

    const bookId = this.db.transaction(() => {
      // Insert book with placeholder path
      const result = this.db.prepare(`
        INSERT INTO books (title, author_sort, publisher, pubdate, comments, has_cover, path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, '', datetime('now'), datetime('now'))
      `).run(title, authorSort, meta.publisher, meta.date, meta.description);
      const id = result.lastInsertRowid as number;

      // Set real path
      const path = bookDirPath(authors[0], title, id);
      this.db.prepare("UPDATE books SET path = ? WHERE id = ?").run(path, id);

      // Authors
      for (const name of authors) {
        const authorId = getOrCreateAuthor(this.db, name);
        this.db.prepare("INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)").run(id, authorId);
      }

      // Tags from subjects
      for (const subject of meta.subjects) {
        const tagId = getOrCreateTag(this.db, subject);
        this.db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)").run(id, tagId);
      }

      // Identifiers
      if (meta.isbn) {
        this.db.prepare("INSERT OR IGNORE INTO identifiers (book_id, type, value) VALUES (?, 'isbn', ?)").run(id, meta.isbn);
      }

      // Language
      if (meta.language) {
        this.db.prepare("INSERT OR IGNORE INTO languages (book_id, lang) VALUES (?, ?)").run(id, meta.language);
      }

      // Format
      this.db.prepare("INSERT INTO formats (book_id, format, filename, size) VALUES (?, ?, ?, ?)").run(
        id, format, `book.${ext}`, data.byteLength
      );

      // FTS
      insertFts(this.db, id, {
        title,
        authors: authors.join(", "),
        tags: meta.subjects.join(", "),
        series: "",
        publisher: meta.publisher ?? "",
        comments: meta.description ?? "",
      });

      return { id, path };
    })();

    // Store the book file
    await this.files.put(bookFilePath(bookId.path, ext), data);

    // Store cover if extracted
    if (meta.cover) {
      await this.files.put(coverFilePath(bookId.path), meta.cover);
      this.db.prepare("UPDATE books SET has_cover = 1 WHERE id = ?").run(bookId.id);
    }

    log.info({ id: bookId.id, title, authors, format }, "Book added");
    return { book_id: bookId.id, title, authors };
  }

  async addFormat(bookId: number, filename: string, data: Buffer): Promise<void> {
    const row = this.db.prepare("SELECT path, has_cover FROM books WHERE id = ?").get(bookId) as { path: string; has_cover: number } | undefined;
    if (!row) throw new Error(`Book ${bookId} not found`);

    const ext = extname(filename).replace(/^\./, "").toLowerCase();
    const format = ext.toUpperCase();

    await this.files.put(bookFilePath(row.path, ext), data);
    this.db.prepare(
      "INSERT OR REPLACE INTO formats (book_id, format, filename, size) VALUES (?, ?, ?, ?)"
    ).run(bookId, format, `book.${ext}`, data.byteLength);

    // Extract and store cover only if the book doesn't already have one
    if (!row.has_cover) {
      const meta = await extractMetadata(data, filename);
      if (meta.cover) {
        await this.files.put(coverFilePath(row.path), meta.cover);
        this.db.prepare("UPDATE books SET has_cover = 1, updated_at = datetime('now') WHERE id = ?").run(bookId);
      }
    }

    this.db.prepare("UPDATE books SET updated_at = datetime('now') WHERE id = ?").run(bookId);
    log.info({ bookId, format, size: data.byteLength }, "Format added");
  }

  async setMetadata(bookId: number, fields: Record<string, unknown>): Promise<void> {
    const row = this.db.prepare("SELECT * FROM books WHERE id = ?").get(bookId) as any;
    if (!row) throw new Error(`Book ${bookId} not found`);

    const renameNeeded = this.db.transaction(() => {
      // Update scalar fields
      const scalarMap: Record<string, string> = {
        title: "title",
        publisher: "publisher",
        pubdate: "pubdate",
        rating: "rating",
        comments: "comments",
        series_index: "series_index",
        read_at: "read_at",
      };

      for (const [field, column] of Object.entries(scalarMap)) {
        if (field in fields) {
          this.db.prepare(`UPDATE books SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).run(
            fields[field] as any, bookId
          );
        }
      }

      // Authors
      if ("authors" in fields && Array.isArray(fields.authors)) {
        this.db.prepare("DELETE FROM book_authors WHERE book_id = ?").run(bookId);
        for (const name of fields.authors as string[]) {
          const authorId = getOrCreateAuthor(this.db, name);
          this.db.prepare("INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)").run(bookId, authorId);
        }
        // Update author_sort
        const authors = fields.authors as string[];
        const authorSort = authors.map(a => {
          const parts = a.split(" ");
          return parts.length > 1 ? `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}` : a;
        }).join(" & ");
        this.db.prepare("UPDATE books SET author_sort = ?, updated_at = datetime('now') WHERE id = ?").run(authorSort, bookId);
      }

      // Tags
      if ("tags" in fields && Array.isArray(fields.tags)) {
        this.db.prepare("DELETE FROM book_tags WHERE book_id = ?").run(bookId);
        for (const name of fields.tags as string[]) {
          const tagId = getOrCreateTag(this.db, name);
          this.db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)").run(bookId, tagId);
        }
      }

      // Series
      if ("series" in fields) {
        const seriesName = fields.series as string | null;
        if (seriesName) {
          const seriesId = getOrCreateSeries(this.db, seriesName);
          this.db.prepare("UPDATE books SET series_id = ?, updated_at = datetime('now') WHERE id = ?").run(seriesId, bookId);
        } else {
          this.db.prepare("UPDATE books SET series_id = NULL, updated_at = datetime('now') WHERE id = ?").run(bookId);
        }
      }

      // Identifiers
      if ("identifiers" in fields && typeof fields.identifiers === "object") {
        this.db.prepare("DELETE FROM identifiers WHERE book_id = ?").run(bookId);
        for (const [type, value] of Object.entries(fields.identifiers as Record<string, string>)) {
          this.db.prepare("INSERT INTO identifiers (book_id, type, value) VALUES (?, ?, ?)").run(bookId, type, value);
        }
      }

      // Languages
      if ("languages" in fields && Array.isArray(fields.languages)) {
        this.db.prepare("DELETE FROM languages WHERE book_id = ?").run(bookId);
        for (const lang of fields.languages as string[]) {
          this.db.prepare("INSERT INTO languages (book_id, lang) VALUES (?, ?)").run(bookId, lang);
        }
      }

      // Update FTS
      deleteFts(this.db, bookId);
      const updated = this.db.prepare(`
        SELECT b.*, s.name as series_name FROM books b
        LEFT JOIN series s ON b.series_id = s.id WHERE b.id = ?
      `).get(bookId) as any;
      insertFts(this.db, bookId, {
        title: updated.title,
        authors: this.getAuthors(bookId).join(", "),
        tags: this.getTags(bookId).join(", "),
        series: updated.series_name ?? "",
        publisher: updated.publisher ?? "",
        comments: updated.comments ?? "",
      });

      // Check if directory needs renaming
      if ("title" in fields || "authors" in fields) {
        const newAuthors = this.getAuthors(bookId);
        const newTitle = updated.title;
        const newPath = bookDirPath(newAuthors[0] ?? "Unknown", newTitle, bookId);
        const oldPath = row.path;
        if (newPath !== oldPath) {
          this.db.prepare("UPDATE books SET path = ? WHERE id = ?").run(newPath, bookId);
          return { oldPath, newPath };
        }
      }
      return null;
    })();

    // File rename must happen outside the sync transaction
    if (renameNeeded) {
      await this.files.rename(renameNeeded.oldPath, renameNeeded.newPath);
    }
  }

  async setCover(bookId: number, imageUrl: string): Promise<void> {
    const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(bookId) as { path: string } | undefined;
    if (!row) throw new Error(`Book ${bookId} not found`);

    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to download cover image: ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());

    await this.files.put(coverFilePath(row.path), data);
    this.db.prepare("UPDATE books SET has_cover = 1, updated_at = datetime('now') WHERE id = ?").run(bookId);
  }

  async removeFormats(bookId: number, formats: string[]): Promise<void> {
    const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(bookId) as { path: string } | undefined;
    if (!row) throw new Error(`Book ${bookId} not found`);

    for (const format of formats) {
      const upper = format.toUpperCase();
      const ext = format.toLowerCase();
      this.db.prepare("DELETE FROM formats WHERE book_id = ? AND format = ?").run(bookId, upper);
      await this.files.delete(bookFilePath(row.path, ext));
    }
  }

  async deleteBooks(bookIds: number[]): Promise<void> {
    for (const id of bookIds) {
      const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(id) as { path: string } | undefined;
      if (!row) continue;

      // Delete book directory and all its files
      await this.files.deleteDir(row.path);
      // Remove author directory if now empty
      const authorDir = row.path.split("/").slice(0, 2).join("/");
      await this.files.deleteDirIfEmpty(authorDir);

      // Delete DB records (cascade handles join tables)
      deleteFts(this.db, id);
      this.db.prepare("DELETE FROM formats WHERE book_id = ?").run(id);
      this.db.prepare("DELETE FROM identifiers WHERE book_id = ?").run(id);
      this.db.prepare("DELETE FROM languages WHERE book_id = ?").run(id);
      this.db.prepare("DELETE FROM book_authors WHERE book_id = ?").run(id);
      this.db.prepare("DELETE FROM book_tags WHERE book_id = ?").run(id);
      this.db.prepare("DELETE FROM books WHERE id = ?").run(id);
    }
  }

  // --- Conversion ---

  async convertBook(bookId: number, inputFmt: string, outputFmt: string): Promise<string> {
    if (!this.converterUrl) {
      throw new Error("No converter URL configured. Set CONVERTER_URL to enable format conversion.");
    }

    const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(bookId) as { path: string } | undefined;
    if (!row) throw new Error(`Book ${bookId} not found`);

    const inputExt = inputFmt.toLowerCase();
    const outputExt = outputFmt.toLowerCase();
    const sourcePath = bookFilePath(row.path, inputExt);
    log.info({ bookId, sourcePath }, "Fetching source file for conversion");
    const sourceData = await this.files.get(sourcePath);
    if (!sourceData) {
      log.error({ bookId, sourcePath, inputFmt }, "Source file not found for conversion");
      throw new Error(`Format ${inputFmt} not found for book ${bookId}`);
    }

    // POST to ebook-converter-api
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(sourceData)]), `book.${inputExt}`);
    form.append("format", outputExt);

    const headers: Record<string, string> = {};
    if (this.converterApiKey) {
      headers["Authorization"] = `Bearer ${this.converterApiKey}`;
    }

    const res = await fetch(`${this.converterUrl}/convert`, {
      method: "POST",
      headers,
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Conversion failed (${res.status}): ${body}`);
    }

    const converted = Buffer.from(await res.arrayBuffer());

    // Store the converted file
    await this.files.put(bookFilePath(row.path, outputExt), converted);
    this.db.prepare(
      "INSERT OR REPLACE INTO formats (book_id, format, filename, size) VALUES (?, ?, ?, ?)"
    ).run(bookId, outputFmt.toUpperCase(), `book.${outputExt}`, converted.byteLength);

    log.info({ bookId, from: inputFmt, to: outputFmt, size: converted.byteLength }, "Conversion complete");
    return `Conversion complete: ${outputFmt.toUpperCase()}`;
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

    const data = await this.files.get(bookFilePath(row.path, format));
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
        "Content-Length": String(data.byteLength),
      },
    });
  }

  async getBookCover(id: number): Promise<Buffer | null> {
    const row = this.db.prepare("SELECT path FROM books WHERE id = ?").get(id) as { path: string } | undefined;
    if (!row) return null;
    return await this.files.get(coverFilePath(row.path));
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
      tags: this.getTags(row.id),
      series: row.series_name,
      series_id: row.series_id ?? null,
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
      series_id: row.series_id ?? null,
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
