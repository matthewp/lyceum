import { parseArgs } from "node:util";
import { startServer } from "./server.ts";
import { createStorage, type StorageMode } from "./storage/index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: {
      type: "string",
      short: "p",
      default: process.env.PORT ?? "3000",
    },
    "base-url": {
      type: "string",
      default: process.env.BASE_URL,
    },
    storage: {
      type: "string",
      short: "s",
      default: process.env.STORAGE_MODE ?? "calibre",
    },
    "data-dir": {
      type: "string",
      short: "d",
      default: process.env.DATA_DIR ?? "/data",
    },
    "calibre-url": {
      type: "string",
      default: process.env.CALIBRE_SERVER_URL ?? "http://localhost:8080",
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    },
  },
});

const command = positionals[0];

if (values.help || !command) {
  console.log(`Usage: lyceum <command> [options]

Commands:
  serve    Start the Lyceum server
  import   Import books from a Calibre content server into local storage

Options:
  -p, --port <port>        Port to listen on (default: 3000)
      --base-url <url>     Public base URL (default: http://localhost:<port>)
  -s, --storage <mode>     Storage backend: calibre | local (default: calibre)
  -d, --data-dir <path>    Data directory for local storage (default: /data)
      --calibre-url <url>  Calibre server URL for import (default: http://localhost:8080)
  -h, --help               Show this help message`);
  process.exit(0);
}

if (command === "serve") {
  const port = parseInt(values.port as string, 10);
  const baseUrl = (values["base-url"] as string) ?? `http://localhost:${port}`;
  const storage = createStorage(values.storage as StorageMode, {
    dataDir: values["data-dir"] as string,
  });

  startServer({ port, baseUrl, storage });
} else if (command === "import") {
  const { importFromCalibre } = await import("./import.ts");
  await importFromCalibre({
    calibreUrl: values["calibre-url"] as string,
    calibreUsername: process.env.CALIBRE_USERNAME ?? "",
    calibrePassword: process.env.CALIBRE_PASSWORD ?? "",
    calibreLibraryId: process.env.CALIBRE_LIBRARY_ID ?? "",
    dataDir: values["data-dir"] as string,
  });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
