import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author_sort TEXT,
  publisher TEXT,
  pubdate TEXT,
  rating REAL,
  comments TEXT,
  series_id INTEGER REFERENCES series(id),
  series_index REAL,
  has_cover INTEGER DEFAULT 0,
  path TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book_authors (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES authors(id),
  PRIMARY KEY (book_id, author_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book_tags (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id),
  PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER,
  UNIQUE(book_id, format)
);

CREATE TABLE IF NOT EXISTS identifiers (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (book_id, type)
);

CREATE TABLE IF NOT EXISTS languages (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  PRIMARY KEY (book_id, lang)
);

CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
  title, authors, tags, series, publisher, comments,
  content='', content_rowid='rowid'
);
`;

export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function insertFts(db: Database.Database, rowid: number, fields: {
  title: string;
  authors: string;
  tags: string;
  series: string;
  publisher: string;
  comments: string;
}): void {
  db.prepare(`
    INSERT INTO books_fts(rowid, title, authors, tags, series, publisher, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(rowid, fields.title, fields.authors, fields.tags, fields.series, fields.publisher, fields.comments);
}

export function deleteFts(db: Database.Database, rowid: number): void {
  db.prepare(`
    INSERT INTO books_fts(books_fts, rowid, title, authors, tags, series, publisher, comments)
    VALUES ('delete', ?, '', '', '', '', '', '')
  `).run(rowid);
}

function sanitizePath(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, "_").replace(/\.+$/, "").trim() || "Unknown";
}

export function bookDirPath(author: string, title: string, id: number): string {
  return `books/${sanitizePath(author)}/${sanitizePath(title)} (${id})`;
}

export function bookFilePath(dirPath: string, format: string): string {
  return `${dirPath}/book.${format.toLowerCase()}`;
}

export function coverFilePath(dirPath: string): string {
  return `${dirPath}/cover.jpg`;
}

export function getOrCreateAuthor(db: Database.Database, name: string): number {
  const existing = db.prepare("SELECT id FROM authors WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return (db.prepare("INSERT INTO authors (name) VALUES (?)").run(name)).lastInsertRowid as number;
}

export function getOrCreateTag(db: Database.Database, name: string): number {
  const existing = db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return (db.prepare("INSERT INTO tags (name) VALUES (?)").run(name)).lastInsertRowid as number;
}

export function getOrCreateSeries(db: Database.Database, name: string): number {
  const existing = db.prepare("SELECT id FROM series WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return (db.prepare("INSERT INTO series (name) VALUES (?)").run(name)).lastInsertRowid as number;
}
