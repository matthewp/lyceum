// Server-only registry: for each route name, how to load data, how to
// import the page module, and what document title to use.

import type { View } from "@matthewp/zebra";
import type { Loader } from "./loaders/types.ts";
import { loadBooks } from "./loaders/books.ts";
import { loadSearch } from "./loaders/search.ts";
import { loadSeries } from "./loaders/series.ts";
import { loadAuthor } from "./loaders/author.ts";
import { loadTag } from "./loaders/tag.ts";
import { loadSettings } from "./loaders/settings.ts";
import { loadLogin } from "./loaders/login.ts";
import { loadDevices } from "./loaders/devices.ts";
import { loadDeviceDetail } from "./loaders/device-detail.ts";
import { loadBookmarklet } from "./loaders/bookmarklet.ts";
import { loadBookDetail } from "./loaders/book-detail.ts";
import type { BooksData } from "./pages/books.ts";

export interface ServerPage<Data = unknown> {
  loader: Loader<Data>;
  importPage: () => Promise<{ default: new (data: Data) => View }>;
  title: (data: Data) => string;
}

// All listing pages share the same Zebra view (pages/books.ts) — they only
// differ in where they fetch data from and how the title reads.
const booksPage = () => import("./pages/books.ts");

export const serverPages: Record<string, ServerPage<any>> = {
  books: {
    loader: loadBooks,
    importPage: booksPage,
    title: () => "Lyceum - Library",
  },
  search: {
    loader: loadSearch,
    importPage: booksPage,
    title: (d: BooksData) => `Search: ${d.pageTitle} - Lyceum`,
  },
  series: {
    loader: loadSeries,
    importPage: booksPage,
    title: (d: BooksData) => `${d.pageTitle} - Lyceum`,
  },
  author: {
    loader: loadAuthor,
    importPage: booksPage,
    title: (d: BooksData) => `${d.pageTitle} - Lyceum`,
  },
  tag: {
    loader: loadTag,
    importPage: booksPage,
    title: (d: BooksData) => `${d.pageTitle} - Lyceum`,
  },
  settings: {
    loader: loadSettings,
    importPage: () => import("./pages/settings.ts"),
    title: () => "Settings - Lyceum",
  },
  login: {
    loader: loadLogin,
    importPage: () => import("./pages/login.ts"),
    title: () => "Lyceum - Sign In",
  },
  devices: {
    loader: loadDevices,
    importPage: () => import("./pages/devices.ts"),
    title: () => "Devices - Lyceum",
  },
  "device-detail": {
    loader: loadDeviceDetail,
    importPage: () => import("./pages/device-detail.ts"),
    title: (d: { name: string }) => `${d.name} - Lyceum`,
  },
  bookmarklet: {
    loader: loadBookmarklet,
    importPage: () => import("./pages/bookmarklet.ts"),
    title: () => "Sending to device — Lyceum",
  },
  "book-detail": {
    loader: loadBookDetail,
    importPage: () => import("./pages/book-detail.ts"),
    title: (d: { book: { title: string } }) => `${d.book.title} - Lyceum`,
  },
};
