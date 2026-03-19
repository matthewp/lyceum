import { startServer } from "./server.ts";
import { createStorage } from "./storage/index.ts";

const port = parseInt(process.env.PORT ?? "3000", 10);
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
const storageMode = (process.env.STORAGE_MODE ?? "calibre") as "calibre" | "local";

const storage = createStorage(storageMode);

startServer({ port, baseUrl, storage });
