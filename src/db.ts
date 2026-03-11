import Database from "better-sqlite3";

const DB_PATH =
  process.env.CALIBRE_DB_PATH ?? `${process.env.HOME}/calibre-library/metadata.db`;

const db = new Database(DB_PATH, { readonly: true });
// readonly — skip WAL since we can't write to the mounted fs

export interface Book {
  id: number;
  title: string;
  sort: string;
  author_sort: string;
  timestamp: string;
  pubdate: string;
  last_modified: string;
  series_index: number;
  has_cover: boolean;
  path: string;
  uuid: string;
}

export interface BookDetail extends Book {
  authors: string[];
  tags: string[];
  series: string | null;
  publisher: string | null;
  rating: number | null;
  comment: string | null;
  formats: string[];
  identifiers: Record<string, string>;
  languages: string[];
  read_date: string | null;
}

export function listBooks(opts: { limit?: number; offset?: number } = {}): Book[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  return db
    .prepare(
      `SELECT id, title, sort, author_sort, timestamp, pubdate,
              last_modified, series_index, has_cover, path, uuid
       FROM books
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Book[];
}

export function getBook(id: number): BookDetail | null {
  const book = db
    .prepare(
      `SELECT id, title, sort, author_sort, timestamp, pubdate,
              last_modified, series_index, has_cover, path, uuid
       FROM books WHERE id = ?`
    )
    .get(id) as Book | undefined;

  if (!book) return null;

  const authors = db
    .prepare(
      `SELECT a.name FROM authors a
       JOIN books_authors_link bal ON bal.author = a.id
       WHERE bal.book = ?`
    )
    .all(id)
    .map((r: any) => r.name);

  const tags = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN books_tags_link btl ON btl.tag = t.id
       WHERE btl.book = ?`
    )
    .all(id)
    .map((r: any) => r.name);

  const series = db
    .prepare(
      `SELECT s.name FROM series s
       JOIN books_series_link bsl ON bsl.series = s.id
       WHERE bsl.book = ?`
    )
    .get(id) as { name: string } | undefined;

  const publisher = db
    .prepare(
      `SELECT p.name FROM publishers p
       JOIN books_publishers_link bpl ON bpl.publisher = p.id
       WHERE bpl.book = ?`
    )
    .get(id) as { name: string } | undefined;

  const rating = db
    .prepare(
      `SELECT r.rating FROM ratings r
       JOIN books_ratings_link brl ON brl.rating = r.id
       WHERE brl.book = ?`
    )
    .get(id) as { rating: number } | undefined;

  const comment = db
    .prepare(`SELECT text FROM comments WHERE book = ?`)
    .get(id) as { text: string } | undefined;

  const formats = db
    .prepare(`SELECT format FROM data WHERE book = ?`)
    .all(id)
    .map((r: any) => r.format);

  const identifierRows = db
    .prepare(`SELECT type, val FROM identifiers WHERE book = ?`)
    .all(id) as { type: string; val: string }[];

  const identifiers: Record<string, string> = {};
  for (const row of identifierRows) {
    identifiers[row.type] = row.val;
  }

  const languages = db
    .prepare(
      `SELECT l.lang_code FROM languages l
       JOIN books_languages_link bll ON bll.lang_code = l.id
       WHERE bll.book = ?
       ORDER BY bll.item_order`
    )
    .all(id)
    .map((r: any) => r.lang_code);

  const readDate = db
    .prepare(`SELECT value FROM custom_column_1 WHERE book = ?`)
    .get(id) as { value: string } | undefined;

  return {
    ...book,
    authors,
    tags,
    series: series?.name ?? null,
    publisher: publisher?.name ?? null,
    rating: rating?.rating ?? null,
    comment: comment?.text ?? null,
    formats,
    identifiers,
    languages,
    read_date: readDate?.value ?? null,
  };
}

export function searchBooks(query: string, opts: { limit?: number; offset?: number } = {}): Book[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const pattern = `%${query}%`;

  return db
    .prepare(
      `SELECT DISTINCT b.id, b.title, b.sort, b.author_sort, b.timestamp, b.pubdate,
              b.last_modified, b.series_index, b.has_cover, b.path, b.uuid
       FROM books b
       LEFT JOIN books_authors_link bal ON bal.book = b.id
       LEFT JOIN authors a ON a.id = bal.author
       LEFT JOIN books_tags_link btl ON btl.book = b.id
       LEFT JOIN tags t ON t.id = btl.tag
       LEFT JOIN books_series_link bsl ON bsl.book = b.id
       LEFT JOIN series s ON s.id = bsl.series
       WHERE b.title LIKE ? OR a.name LIKE ? OR t.name LIKE ? OR s.name LIKE ?
       ORDER BY b.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(pattern, pattern, pattern, pattern, limit, offset) as Book[];
}

export function listAuthors(): { id: number; name: string; count: number }[] {
  return db
    .prepare(
      `SELECT a.id, a.name, COUNT(bal.book) as count
       FROM authors a
       JOIN books_authors_link bal ON bal.author = a.id
       GROUP BY a.id
       ORDER BY a.sort`
    )
    .all() as any[];
}

export function listTags(): { id: number; name: string; count: number }[] {
  return db
    .prepare(
      `SELECT t.id, t.name, COUNT(btl.book) as count
       FROM tags t
       JOIN books_tags_link btl ON btl.tag = t.id
       GROUP BY t.id
       ORDER BY t.name`
    )
    .all() as any[];
}

export function listSeries(): { id: number; name: string; count: number }[] {
  return db
    .prepare(
      `SELECT s.id, s.name, COUNT(bsl.book) as count
       FROM series s
       JOIN books_series_link bsl ON bsl.series = s.id
       GROUP BY s.id
       ORDER BY s.sort`
    )
    .all() as any[];
}

export interface ReadBook extends Book {
  read_date: string;
  authors: string[];
}

export function listReadBooks(opts: { limit?: number; offset?: number } = {}): ReadBook[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  return db
    .prepare(
      `SELECT b.id, b.title, b.sort, b.author_sort, b.timestamp, b.pubdate,
              b.last_modified, b.series_index, b.has_cover, b.path, b.uuid,
              cc.value as read_date
       FROM books b
       JOIN custom_column_1 cc ON cc.book = b.id
       ORDER BY cc.value DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
    .map((row: any) => {
      const authors = db
        .prepare(
          `SELECT a.name FROM authors a
           JOIN books_authors_link bal ON bal.author = a.id
           WHERE bal.book = ?`
        )
        .all(row.id)
        .map((r: any) => r.name);
      return { ...row, authors };
    }) as ReadBook[];
}

export function listUnreadBooks(opts: { limit?: number; offset?: number } = {}): Book[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  return db
    .prepare(
      `SELECT b.id, b.title, b.sort, b.author_sort, b.timestamp, b.pubdate,
              b.last_modified, b.series_index, b.has_cover, b.path, b.uuid
       FROM books b
       LEFT JOIN custom_column_1 cc ON cc.book = b.id
       WHERE cc.value IS NULL
       ORDER BY b.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Book[];
}

export function getBookFilePath(id: number, format: string): string | null {
  const row = db
    .prepare(
      `SELECT b.path, d.name, d.format
       FROM books b
       JOIN data d ON d.book = b.id
       WHERE b.id = ? AND UPPER(d.format) = UPPER(?)`
    )
    .get(id, format) as { path: string; name: string; format: string } | undefined;

  if (!row) return null;

  const libraryPath = DB_PATH.replace(/\/metadata\.db$/, "");
  return `${libraryPath}/${row.path}/${row.name}.${row.format.toLowerCase()}`;
}

export function countBooks(): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM books`).get() as { count: number };
  return row.count;
}
