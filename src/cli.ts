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
    },
    storage: {
      type: "string",
      short: "s",
      default: process.env.STORAGE_MODE ?? "calibre",
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

Options:
  -p, --port <port>        Port to listen on (default: 3000)
      --base-url <url>     Public base URL (default: http://localhost:<port>)
  -s, --storage <mode>     Storage backend: calibre | local (default: calibre)
  -h, --help               Show this help message`);
  process.exit(0);
}

if (command === "serve") {
  const port = parseInt(values.port as string, 10);
  const baseUrl = (values["base-url"] as string) ?? `http://localhost:${port}`;
  const storage = createStorage(values.storage as StorageMode);

  startServer({ port, baseUrl, storage });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
