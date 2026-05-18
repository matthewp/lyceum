import type { Loader } from "./types.ts";

export interface BookmarkletData {
  deviceName: string;
  articleUrl: string;
}

export const loadBookmarklet: Loader<BookmarkletData> = async ({ url }) => {
  const deviceName = url.searchParams.get("device") ?? "";
  const articleUrl = url.searchParams.get("url") ?? "";
  if (!deviceName || !articleUrl) throw new Error("Missing device or url");
  return { deviceName, articleUrl };
};
