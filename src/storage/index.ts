export type { StorageBackend, BookSummary, BookDetail, CategoryItem, AddBookResult } from "./types.ts";
export type { FileStore } from "./filestore.ts";
export { CalibreBackend } from "./calibre.ts";
export { LocalBackend } from "./local.ts";
export { DiskFileStore } from "./filestore.ts";

import type { StorageBackend } from "./types.ts";
import { CalibreBackend } from "./calibre.ts";
import { LocalBackend } from "./local.ts";
import { DiskFileStore } from "./filestore.ts";
import { join } from "node:path";

export type StorageMode = "calibre" | "local";

export interface StorageOptions {
  dataDir?: string;
}

export function createStorage(mode: StorageMode, opts: StorageOptions = {}): StorageBackend {
  const dataDir = opts.dataDir ?? process.env.DATA_DIR ?? "/data";

  switch (mode) {
    case "calibre":
      return new CalibreBackend({
        serverUrl: process.env.CALIBRE_SERVER_URL ?? "http://localhost:8080",
        libraryId: process.env.CALIBRE_LIBRARY_ID ?? "",
        username: process.env.CALIBRE_USERNAME ?? "",
        password: process.env.CALIBRE_PASSWORD ?? "",
      });
    case "local":
      return new LocalBackend({
        dbPath: join(dataDir, "library.db"),
        fileStore: new DiskFileStore(dataDir),
        converterUrl: process.env.CONVERTER_URL,
        converterApiKey: process.env.CONVERTER_API_KEY,
      });
    default:
      throw new Error(`Unknown storage mode: ${mode}`);
  }
}
