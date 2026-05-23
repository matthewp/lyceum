import type { ReadFilter } from "../storage/types.ts";

/** Parse the `filter` query param into a ReadFilter. Defaults to "all". */
export function parseReadFilter(url: URL): ReadFilter {
  const v = url.searchParams.get("filter");
  if (v === "read" || v === "unread") return v;
  return "all";
}
