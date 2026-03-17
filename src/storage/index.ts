export type { StorageBackend, BookSummary, BookDetail, CategoryItem, AddBookResult } from "./types.ts";
export { CalibreBackend } from "./calibre.ts";

import type { StorageBackend } from "./types.ts";
import { CalibreBackend } from "./calibre.ts";

export type StorageMode = "calibre" | "local";

export function createStorage(mode: StorageMode): StorageBackend {
  switch (mode) {
    case "calibre":
      return new CalibreBackend({
        serverUrl: process.env.CALIBRE_SERVER_URL ?? "http://localhost:8080",
        libraryId: process.env.CALIBRE_LIBRARY_ID ?? "",
        username: process.env.CALIBRE_USERNAME ?? "",
        password: process.env.CALIBRE_PASSWORD ?? "",
      });
    case "local":
      throw new Error("Local storage backend is not yet implemented");
    default:
      throw new Error(`Unknown storage mode: ${mode}`);
  }
}
