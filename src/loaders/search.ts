import type { Loader } from "./types.ts";
import type { BooksData } from "../pages/books.ts";

export const loadSearch: Loader<BooksData> = async ({ url, storage }) => {
  const q = url.searchParams.get("q") ?? "";
  const { results, count } = await storage.searchBooks(q, { limit: 100 });
  return {
    books: results,
    total: count,
    page: 1,
    perPage: count,
    basePath: `/app/search?q=${encodeURIComponent(q)}`,
    pageTitle: `Results for “${q}”`,
    readFilter: "all",
  };
};
