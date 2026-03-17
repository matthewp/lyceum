import { CalibreBackend } from "./storage/calibre.ts";
import { DiskFileStore } from "./storage/filestore.ts";
import { openDatabase, insertFts, getOrCreateAuthor, getOrCreateTag, getOrCreateSeries, bookPath } from "./storage/database.ts";
import { join } from "node:path";
import { logger as root } from "./logger.ts";

const log = root.child({ module: "import" });

export interface ImportConfig {
  calibreUrl: string;
  calibreUsername: string;
  calibrePassword: string;
  calibreLibraryId: string;
  dataDir: string;
}

export async function importFromCalibre(config: ImportConfig) {
  const calibre = new CalibreBackend({
    serverUrl: config.calibreUrl,
    libraryId: config.calibreLibraryId,
    username: config.calibreUsername,
    password: config.calibrePassword,
  });

  const fileStore = new DiskFileStore(config.dataDir);
  const dbPath = join(config.dataDir, "library.db");
  const db = openDatabase(dbPath);

  // Get total book count
  const { total } = await calibre.listBooks({ limit: 0 });
  log.info({ total }, "Starting import from Calibre");

  let imported = 0;
  const batchSize = 50;

  for (let offset = 0; offset < total; offset += batchSize) {
    const { books } = await calibre.listBooks({ limit: batchSize, offset });

    for (const summary of books) {
      const detail = await calibre.getBook(summary.id);
      if (!detail) {
        log.warn({ id: summary.id }, "Could not fetch book details, skipping");
        continue;
      }

      // Insert into local DB inside a transaction
      const insertBook = db.transaction(() => {
        // Series
        let seriesId: number | null = null;
        if (detail.series) {
          seriesId = getOrCreateSeries(db, detail.series);
        }

        // Book row — insert with a placeholder path, then update with the real one
        const author = detail.authors[0] ?? "Unknown";
        const result = db.prepare(`
          INSERT INTO books (title, author_sort, publisher, pubdate, rating, comments, series_id, series_index, has_cover, path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
        `).run(
          detail.title,
          detail.author_sort || null,
          detail.publisher,
          detail.pubdate || null,
          detail.rating,
          detail.comments,
          seriesId,
          detail.series_index,
          detail.has_cover ? 1 : 0,
          detail.timestamp || new Date().toISOString(),
          detail.last_modified || new Date().toISOString(),
        );
        const bookId = result.lastInsertRowid as number;
        const path = bookPath(author, detail.title, bookId);
        db.prepare("UPDATE books SET path = ? WHERE id = ?").run(path, bookId);

        // Authors
        for (const authorName of detail.authors) {
          const authorId = getOrCreateAuthor(db, authorName);
          db.prepare("INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)").run(bookId, authorId);
        }

        // Tags
        for (const tagName of detail.tags) {
          const tagId = getOrCreateTag(db, tagName);
          db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)").run(bookId, tagId);
        }

        // Identifiers
        for (const [type, value] of Object.entries(detail.identifiers)) {
          db.prepare("INSERT OR IGNORE INTO identifiers (book_id, type, value) VALUES (?, ?, ?)").run(bookId, type, value);
        }

        // Languages
        for (const lang of detail.languages) {
          db.prepare("INSERT OR IGNORE INTO languages (book_id, lang) VALUES (?, ?)").run(bookId, lang);
        }

        // FTS
        insertFts(db, bookId, {
          title: detail.title,
          authors: detail.authors.join(", "),
          tags: detail.tags.join(", "),
          series: detail.series ?? "",
          publisher: detail.publisher ?? "",
          comments: detail.comments ?? "",
        });

        return { bookId, path };
      });

      const { bookId, path } = insertBook();

      // Download and store files
      for (const format of detail.formats) {
        try {
          const dlPath = calibre.bookDownloadPath(format, summary.id);
          const res = await calibre.downloadBook(dlPath);
          if (res.ok) {
            const data = Buffer.from(await res.arrayBuffer());
            const ext = format.toLowerCase();
            const key = `${path}/book.${ext}`;
            fileStore.put(key, data);

            db.prepare("INSERT INTO formats (book_id, format, filename, size) VALUES (?, ?, ?, ?)").run(
              bookId, format.toUpperCase(), `book.${ext}`, data.length
            );

            log.debug({ bookId, format }, "Stored format");
          }
        } catch (e: any) {
          log.warn({ bookId, format, error: e.message }, "Failed to download format");
        }
      }

      // Download and store cover
      if (detail.has_cover) {
        try {
          const coverData = await calibre.getBookCover(summary.id);
          if (coverData) {
            fileStore.put(`${path}/cover.jpg`, coverData);
          }
        } catch (e: any) {
          log.warn({ bookId, error: e.message }, "Failed to download cover");
        }
      }

      imported++;
      if (imported % 10 === 0 || imported === total) {
        log.info({ imported, total }, "Import progress");
      }
    }
  }

  db.close();
  log.info({ imported, total }, "Import complete");
}
