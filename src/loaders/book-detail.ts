import type { Loader } from "./types.ts";
import type { BookDetail } from "../storage/types.ts";
import { listDevices } from "../devices/index.ts";
import { getBookProgress } from "../book-progress.ts";

export interface BookDetailData {
  book: BookDetail;
  devices: string[];
  converterEnabled: boolean;
}

export const loadBookDetail: Loader<BookDetailData> = async ({ params, storage }) => {
  const bookId = parseInt(params.id, 10);
  const book = await storage.getBook(bookId);
  if (!book) throw new Error("Book not found");
  book.reading_progress = await getBookProgress(bookId, storage);
  return {
    book,
    devices: listDevices().map(d => d.name),
    converterEnabled: !!process.env.CONVERTER_URL,
  };
};
