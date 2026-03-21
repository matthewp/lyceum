import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { logger as root } from "./logger.ts";
import { stateDb } from "./state.ts";

const log = root.child({ module: "auth" });

const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  log.fatal("AUTH_PASSWORD environment variable is required");
  process.exit(1);
}

// Clean up expired auth codes on startup
stateDb.prepare("DELETE FROM auth_codes WHERE expires_at < ?").run(Date.now());

// Load state from DB into memory
const authCodes = new Map<string, { clientId: string; redirectUri: string; expiresAt: number }>();
const accessTokens = new Set<string>();
const clients = new Map<string, { clientId: string; redirectUris: string[] }>();

for (const row of stateDb.prepare("SELECT code, client_id, redirect_uri, expires_at FROM auth_codes").all() as { code: string; client_id: string; redirect_uri: string; expires_at: number }[]) {
  authCodes.set(row.code, { clientId: row.client_id, redirectUri: row.redirect_uri, expiresAt: row.expires_at });
}
for (const row of stateDb.prepare("SELECT token FROM access_tokens").all() as { token: string }[]) {
  accessTokens.add(row.token);
}
for (const row of stateDb.prepare("SELECT client_id, redirect_uris FROM clients").all() as { client_id: string; redirect_uris: string }[]) {
  clients.set(row.client_id, { clientId: row.client_id, redirectUris: JSON.parse(row.redirect_uris) });
}

log.info({ clients: clients.size, tokens: accessTokens.size }, "Loaded state");

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function registerClient(body: {
  redirect_uris?: string[];
  client_name?: string;
}): { client_id: string; client_secret: string; redirect_uris: string[] } | null {
  if (!body.redirect_uris?.length) return null;

  const clientId = generateToken();
  const clientSecret = generateToken();
  clients.set(clientId, { clientId, redirectUris: body.redirect_uris });
  stateDb.prepare("INSERT INTO clients (client_id, redirect_uris) VALUES (?, ?)").run(clientId, JSON.stringify(body.redirect_uris));

  return {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: body.redirect_uris,
  };
}

export function createAuthCode(clientId: string, redirectUri: string): string | null {
  const client = clients.get(clientId);
  if (!client) return null;
  if (!client.redirectUris.includes(redirectUri)) return null;

  const code = generateToken();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  authCodes.set(code, { clientId, redirectUri, expiresAt });
  stateDb.prepare("INSERT INTO auth_codes (code, client_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?)").run(code, clientId, redirectUri, expiresAt);
  return code;
}

export function exchangeCode(
  code: string,
  clientId: string,
  redirectUri: string
): string | null {
  const entry = authCodes.get(code);
  if (!entry) return null;
  if (entry.clientId !== clientId) return null;
  if (entry.redirectUri !== redirectUri) return null;
  if (Date.now() > entry.expiresAt) {
    authCodes.delete(code);
    stateDb.prepare("DELETE FROM auth_codes WHERE code = ?").run(code);
    return null;
  }

  authCodes.delete(code);
  stateDb.prepare("DELETE FROM auth_codes WHERE code = ?").run(code);
  const token = generateToken();
  accessTokens.add(token);
  stateDb.prepare("INSERT INTO access_tokens (token) VALUES (?)").run(token);
  return token;
}

export function validateToken(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return accessTokens.has(token);
}

export function checkPassword(password: string): boolean {
  return password === PASSWORD;
}

const SIGNING_KEY = PASSWORD;

export function createSignedUrl(baseUrl: string, path: string, ttlSeconds = 300): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = `${path}:${expires}`;
  const signature = createHmac("sha256", SIGNING_KEY).update(data).digest("hex");
  return `${baseUrl}${path}?expires=${expires}&sig=${signature}`;
}

// --- Session cookies for /app ---

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export function createSessionCookie(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const data = `session:${expires}`;
  const sig = createHmac("sha256", SIGNING_KEY).update(data).digest("hex");
  const value = `${expires}.${sig}`;
  return `session=${value}; Path=/app; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function verifySessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/(?:^|;\s*)session=(\d+)\.([a-f0-9]+)/);
  if (!match) return false;
  const [, expires, sig] = match;
  const now = Math.floor(Date.now() / 1000);
  if (now > parseInt(expires, 10)) return false;
  const data = `session:${expires}`;
  const expected = createHmac("sha256", SIGNING_KEY).update(data).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifySignedUrl(path: string, expires: string, signature: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now > parseInt(expires, 10)) return false;

  const data = `${path}:${expires}`;
  const expected = createHmac("sha256", SIGNING_KEY).update(data).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

