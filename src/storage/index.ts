export type { StorageBackend, BookSummary, BookDetail, CategoryItem, AddBookResult } from "./types.ts";
export type { FileStore } from "./filestore.ts";
export { LocalBackend } from "./local.ts";
export { DiskFileStore } from "./filestore.ts";

import type { StorageBackend } from "./types.ts";
import { LocalBackend } from "./local.ts";
import { DiskFileStore } from "./filestore.ts";
import { join } from "node:path";

export interface StorageOptions {
  dataDir?: string;
}

export function createStorage(opts: StorageOptions = {}): StorageBackend {
  const dataDir = opts.dataDir ?? process.env.DATA_DIR ?? "/data";

  return new LocalBackend({
    dbPath: join(dataDir, "library.db"),
    fileStore: new DiskFileStore(dataDir),
    converterUrl: process.env.CONVERTER_URL,
    converterApiKey: process.env.CONVERTER_API_KEY,
  });
}
