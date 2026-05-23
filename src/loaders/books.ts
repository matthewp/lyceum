import type { Loader } from "./types.ts";
import type { BooksData } from "../pages/books.ts";
import { parseReadFilter } from "./filter.ts";

export const loadBooks: Loader<BooksData> = async ({ url, storage }) => {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = 50;
  const readFilter = parseReadFilter(url);
  const { books, total } = await storage.listBooks({
    limit: perPage,
    offset: (page - 1) * perPage,
    readFilter,
  });
  return { books, total, page, perPage, basePath: "/app", pageTitle: "Library", readFilter };
};
