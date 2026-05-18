import type { Loader } from "./types.ts";
import type { BooksData } from "../pages/books.ts";

export const loadSeries: Loader<BooksData> = async ({ url, params, storage }) => {
  const seriesId = parseInt(params.id, 10);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = 50;
  const { books, total, seriesName } = await storage.listBooksBySeries(seriesId, { limit: perPage, offset: (page - 1) * perPage });
  if (!seriesName) throw new Error("Series not found");
  return {
    books, total, page, perPage,
    basePath: `/app/series/${seriesId}`,
    pageTitle: seriesName,
  };
};
