import Database from "better-sqlite3";
import { join } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY,
  redirect_uris TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_tokens (
  token TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS auth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  credentials TEXT NOT NULL
);
`;

const dataDir = process.env.DATA_DIR ?? "/data";

export const stateDb = new Database(join(dataDir, "lyceum.db"));
stateDb.pragma("journal_mode = WAL");
stateDb.pragma("foreign_keys = ON");
stateDb.exec(SCHEMA);
