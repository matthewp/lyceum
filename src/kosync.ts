import { createHash, timingSafeEqual } from "node:crypto";
import { stateDb } from "./state.ts";
import type { IncomingMessage } from "node:http";

// --- MD5 helper ---

export function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

// --- Settings CRUD ---

export interface KosyncSettings {
  enabled: boolean;
  username: string | null;
  hasPassword: boolean;
}

const getSetting = stateDb.prepare("SELECT value FROM kosync_settings WHERE key = ?");
const upsertSetting = stateDb.prepare("INSERT INTO kosync_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

export function getKosyncSettings(): KosyncSettings {
  const enabled = getSetting.get("enabled") as { value: string } | undefined;
  const username = getSetting.get("username") as { value: string } | undefined;
  const passwordHash = getSetting.get("password_hash") as { value: string } | undefined;
  return {
    enabled: enabled?.value === "true",
    username: username?.value ?? null,
    hasPassword: !!passwordHash?.value,
  };
}

export function setKosyncSettings(opts: { enabled?: boolean; username?: string; password?: string }): void {
  if (opts.enabled !== undefined) {
    upsertSetting.run("enabled", opts.enabled ? "true" : "false");
  }
  if (opts.username !== undefined) {
    upsertSetting.run("username", opts.username.trim());
  }
  if (opts.password !== undefined) {
    // Store as MD5 hash — KOReader sends MD5-hashed passwords
    upsertSetting.run("password_hash", md5(opts.password));
  }
}

// --- Auth verification ---

function getStoredPasswordHash(): string | null {
  const row = getSetting.get("password_hash") as { value: string } | undefined;
  return row?.value ?? null;
}

export function verifyKosyncCredentials(username: string, passwordHash: string): boolean {
  const settings = getKosyncSettings();
  if (!settings.enabled || !settings.username || !settings.hasPassword) return false;
  if (username !== settings.username) return false;

  const stored = getStoredPasswordHash();
  if (!stored) return false;

  // Timing-safe comparison of the MD5 hashes
  const a = Buffer.from(passwordHash);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyKosyncAuth(req: IncomingMessage): { ok: boolean; username?: string } {
  const user = req.headers["x-auth-user"] as string | undefined;
  const key = req.headers["x-auth-key"] as string | undefined;
  if (!user || !key) return { ok: false };
  if (!verifyKosyncCredentials(user, key)) return { ok: false };
  return { ok: true, username: user };
}

// --- Progress CRUD ---

const getProgressStmt = stateDb.prepare(
  "SELECT document, progress, percentage, device, device_id, timestamp, book_id FROM kosync_progress WHERE document = ? AND username = ?"
);

const getProgressByBookIdStmt = stateDb.prepare(
  "SELECT document, progress, percentage, device, device_id, timestamp, book_id FROM kosync_progress WHERE book_id = ? AND username = ?"
);

const upsertProgressStmt = stateDb.prepare(`
  INSERT INTO kosync_progress (document, username, progress, percentage, device, device_id, timestamp, book_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(document, username) DO UPDATE SET
    progress = excluded.progress,
    percentage = excluded.percentage,
    device = excluded.device,
    device_id = excluded.device_id,
    timestamp = excluded.timestamp,
    book_id = COALESCE(excluded.book_id, kosync_progress.book_id)
`);

export interface ProgressRecord {
  document: string;
  progress: string;
  percentage: number;
  device: string;
  device_id: string;
  timestamp: number;
  book_id: number | null;
}

export function getProgress(username: string, document: string): ProgressRecord | null {
  return (getProgressStmt.get(document, username) as ProgressRecord) ?? null;
}

export function getProgressByBookId(username: string, bookId: number): ProgressRecord | null {
  return (getProgressByBookIdStmt.get(bookId, username) as ProgressRecord) ?? null;
}

export function putProgress(username: string, document: string, progress: string, percentage: number, device: string, deviceId: string, bookId: number | null = null): number {
  const timestamp = Math.floor(Date.now() / 1000);
  upsertProgressStmt.run(document, username, progress, percentage, device, deviceId, timestamp, bookId);
  return timestamp;
}
