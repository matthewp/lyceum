import { createHash } from "node:crypto";
import { bookFilename, bookFilenameRaw } from "./book-filename.ts";
import { getKosyncSettings, getProgress, getProgressByBookId } from "./kosync.ts";
import type { StorageBackend } from "./storage/index.ts";

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

/**
 * Returns all document identifier candidates for a book format:
 * - The sanitized filename (KOReader raw filename mode, Lyceum download name)
 * - MD5 of the raw unsanitized filename (KOReader/CrossPoint filename-MD5 mode)
 * - MD5 of the sanitized filename (in case the client hashes the download filename)
 */
function documentCandidates(title: string, authors: string[], format: string): string[] {
  const sanitized = bookFilename(title, authors, format);
  const raw = bookFilenameRaw(title, authors, format);
  const candidates = [sanitized];
  const rawMd5 = md5(raw);
  if (rawMd5 !== sanitized) candidates.push(rawMd5);
  // Also try MD5 of the sanitized name in case the client hashes the download filename
  const sanitizedMd5 = md5(sanitized);
  if (sanitizedMd5 !== rawMd5) candidates.push(sanitizedMd5);
  return candidates;
}

export async function getBookProgress(
  bookId: number,
  storage: StorageBackend
): Promise<{ percentage: number; device: string; timestamp: number } | null> {
  const settings = getKosyncSettings();
  if (!settings.enabled || !settings.username) return null;
  const username = settings.username;

  // Fast path: look up by stored book_id
  const byId = getProgressByBookId(username, bookId);
  if (byId) return { percentage: byId.percentage * 100, device: byId.device, timestamp: byId.timestamp };

  // Fallback: filename-based lookup for pre-existing records
  const book = await storage.getBook(bookId);
  if (!book) return null;
  for (const format of book.formats) {
    for (const doc of documentCandidates(book.title, book.authors, format)) {
      const record = getProgress(username, doc);
      if (record) return { percentage: record.percentage * 100, device: record.device, timestamp: record.timestamp };
    }
  }
  return null;
}

export async function findBookIdForDocument(
  document: string,
  storage: StorageBackend
): Promise<number | null> {
  let offset = 0;
  const limit = 500;
  while (true) {
    const { books, total } = await storage.listBooks({ limit, offset });
    for (const book of books) {
      for (const format of book.formats) {
        if (documentCandidates(book.title, book.authors, format).includes(document)) {
          return book.id;
        }
      }
    }
    offset += limit;
    if (offset >= total) break;
  }
  return null;
}
