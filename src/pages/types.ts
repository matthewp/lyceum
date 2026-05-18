import type { View } from "@matthewp/zebra";

// Match params extracted from a URLPattern (groups + query).
export interface RouteMatch {
  params: Record<string, string>;
  search: URLSearchParams;
}

// A page module: client-importable, server-importable, no Node-only deps.
// The default export is a Page View class that takes its data in the constructor.
export interface PageModule<Data = unknown> {
  default: new (data: Data) => View;
}
