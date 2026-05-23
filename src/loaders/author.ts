import type { Loader } from "./types.ts";
import type { BooksData } from "../pages/books.ts";
import { parseReadFilter } from "./filter.ts";

export const loadAuthor: Loader<BooksData> = async ({ url, params, storage }) => {
  const author = decodeURIComponent(params.author);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = 50;
  const readFilter = parseReadFilter(url);
  const { books, total } = await storage.listBooksByAuthor(author, {
    limit: perPage,
    offset: (page - 1) * perPage,
    readFilter,
  });
  return {
    books, total, page, perPage,
    basePath: `/app/author/${encodeURIComponent(author)}`,
    pageTitle: author,
    readFilter,
  };
};
