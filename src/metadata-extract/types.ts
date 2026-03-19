export interface BookMetadata {
  title: string | null;
  authors: string[];
  publisher: string | null;
  description: string | null;
  date: string | null;
  language: string | null;
  isbn: string | null;
  cover: Buffer | null;
  subjects: string[];
}
