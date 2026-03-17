import { CalibreBackend } from "./storage/calibre.ts";
import { DiskFileStore } from "./storage/filestore.ts";
import { openDatabase, insertFts, getOrCreateAuthor, getOrCreateTag, getOrCreateSeries, bookDirPath, bookFilePath, coverFilePath } from "./storage/database.ts";
import { extractMetadata } from "./metadata-extract/index.ts";
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
          INSERT INTO books (title, author_sort, publisher, pubdate, rating, comments, series_id, series_index, has_cover, path, read_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
        `).run(
          detail.title,
          detail.author_sort || null,
          detail.publisher,
          detail.pubdate || null,
          detail.rating,
          detail.comments,
          seriesId,
          detail.series_index,
          0,
          detail.read_at || null,
          detail.timestamp || new Date().toISOString(),
          detail.last_modified || new Date().toISOString(),
        );
        const bookId = result.lastInsertRowid as number;
        const path = bookDirPath(author, detail.title, bookId);
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
            const key = bookFilePath(path, ext);
            await fileStore.put(key, data);

            db.prepare("INSERT INTO formats (book_id, format, filename, size) VALUES (?, ?, ?, ?)").run(
              bookId, format.toUpperCase(), `book.${ext}`, data.byteLength
            );

            log.debug({ bookId, format }, "Stored format");
          }
        } catch (e: any) {
          log.warn({ bookId, format, error: e.message }, "Failed to download format");
        }
      }

      // Extract cover: try Calibre API first, fall back to extracting from book file
      let coverData: Buffer | null = null;
      try {
        coverData = await calibre.getBookCover(summary.id);
      } catch {
        // Calibre cover fetch failed, will try extraction
      }

      if (!coverData) {
        // Try extracting cover from the first downloaded book file
        for (const format of detail.formats) {
          const ext = format.toLowerCase();
          const fileData = await fileStore.get(bookFilePath(path, ext));
          if (fileData) {
            try {
              const meta = await extractMetadata(fileData, `book.${ext}`);
              if (meta.cover) {
                coverData = meta.cover;
                break;
              }
            } catch {
              // extraction failed for this format, try next
            }
          }
        }
      }

      if (coverData) {
        await fileStore.put(coverFilePath(path), coverData);
        db.prepare("UPDATE books SET has_cover = 1 WHERE id = ?").run(bookId);
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
