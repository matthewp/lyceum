import { startServer } from "./server.ts";
import { createStorage } from "./storage/index.ts";

const port = parseInt(process.env.PORT ?? "3000", 10);
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

const storage = createStorage();

startServer({ port, baseUrl, storage });
