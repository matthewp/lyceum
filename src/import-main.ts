import { importFromCalibre } from "./import.ts";

await importFromCalibre({
  calibreUrl: process.env.CALIBRE_SERVER_URL ?? "http://localhost:8080",
  calibreUsername: process.env.CALIBRE_USERNAME ?? "",
  calibrePassword: process.env.CALIBRE_PASSWORD ?? "",
  calibreLibraryId: process.env.CALIBRE_LIBRARY_ID ?? "",
  dataDir: process.env.DATA_DIR ?? "/data",
});
