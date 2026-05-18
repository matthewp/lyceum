import type { StorageBackend } from "../storage/index.ts";

export interface LoaderContext {
  url: URL;
  params: Record<string, string>;
  storage: StorageBackend;
  baseUrl: string;
}

export type Loader<Data = unknown> = (ctx: LoaderContext) => Promise<Data>;
