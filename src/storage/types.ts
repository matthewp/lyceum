export interface BookSummary {
  id: number;
  title: string;
  authors: string[];
  timestamp: string;
  pubdate: string;
  formats: string[];
  tags: string[];
  series: string | null;
  series_id: number | null;
  series_index: number | null;
  has_cover: boolean;
}

export interface BookDetail {
  id: number;
  title: string;
  authors: string[];
  author_sort: string;
  timestamp: string;
  pubdate: string;
  last_modified: string;
  series: string | null;
  series_id: number | null;
  series_index: number | null;
  publisher: string | null;
  rating: number | null;
  tags: string[];
  formats: string[];
  identifiers: Record<string, string>;
  languages: string[];
  comments: string | null;
  has_cover: boolean;
  cover: string | null;
  read_at: string | null;
  reading_progress: { percentage: number; device: string; timestamp: number } | null;
  custom_columns: Record<string, { name: string; datatype: string; value: unknown }>;
}

export interface CategoryItem {
  id?: number;
  name: string;
  count: number;
}

export interface AddBookResult {
  book_id: number;
  title: string;
  authors: string[];
}

export interface StorageBackend {
  // Read
  listBooks(opts?: { limit?: number; offset?: number }): Promise<{ books: BookSummary[]; total: number }>;
  getBook(id: number): Promise<BookDetail | null>;
  searchBooks(query: string, opts?: { limit?: number; offset?: number }): Promise<{ results: BookSummary[]; count: number }>;
  listAuthors(): Promise<CategoryItem[]>;
  listTags(): Promise<CategoryItem[]>;
  listSeries(): Promise<CategoryItem[]>;
  listBooksByTag(tag: string, opts?: { limit?: number; offset?: number }): Promise<{ books: BookSummary[]; total: number }>;
  listBooksBySeries(seriesId: number, opts?: { limit?: number; offset?: number }): Promise<{ books: BookSummary[]; total: number; seriesName: string | null }>;
  listBooksByAuthor(author: string, opts?: { limit?: number; offset?: number }): Promise<{ books: BookSummary[]; total: number }>;

  // Write
  addBook(filename: string, data: Buffer): Promise<AddBookResult>;
  addFormat(bookId: number, filename: string, data: Buffer): Promise<void>;
  setMetadata(bookId: number, fields: Record<string, unknown>): Promise<void>;
  markRead(bookId: number, readAt: string | null): Promise<void>;
  setCover(bookId: number, imageUrl: string): Promise<void>;
  setCoverBuffer(bookId: number, buffer: Buffer): Promise<void>;
  removeFormats(bookId: number, formats: string[]): Promise<void>;
  deleteBooks(bookIds: number[]): Promise<void>;

  // Conversion
  convertBook(bookId: number, inputFmt: string, outputFmt: string): Promise<string>;

  // File access
  bookDownloadPath(format: string, id: number): string;
  downloadBook(path: string): Promise<Response>;
  getBookCover(id: number): Promise<Buffer | null>;
}
