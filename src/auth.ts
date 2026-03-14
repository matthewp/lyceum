import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger as root } from "./logger.ts";

const log = root.child({ module: "auth" });

const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  log.fatal("AUTH_PASSWORD environment variable is required");
  process.exit(1);
}

const STATE_FILE = process.env.AUTH_STATE_FILE ?? "/data/auth-state.json";

interface PersistedState {
  authCodes: Record<string, { clientId: string; redirectUri: string; expiresAt: number }>;
  accessTokens: string[];
  clients: Record<string, { clientId: string; redirectUris: string[] }>;
}

// In-memory stores
const authCodes = new Map<string, { clientId: string; redirectUri: string; expiresAt: number }>();
const accessTokens = new Set<string>();
const clients = new Map<string, { clientId: string; redirectUris: string[] }>();

function loadState(): void {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as PersistedState;
    for (const [k, v] of Object.entries(data.authCodes ?? {})) {
      if (v.expiresAt > Date.now()) authCodes.set(k, v);
    }
    for (const t of data.accessTokens ?? []) accessTokens.add(t);
    for (const [k, v] of Object.entries(data.clients ?? {})) clients.set(k, v);
    log.info({ clients: clients.size, tokens: accessTokens.size }, "Loaded state");
  } catch {
    log.info("No existing state file, starting fresh");
  }
}

function saveState(): void {
  const state: PersistedState = {
    authCodes: Object.fromEntries(authCodes),
    accessTokens: [...accessTokens],
    clients: Object.fromEntries(clients),
  };
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e: any) {
    log.error({ err: e }, "Failed to save state");
  }
}

loadState();

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
  saveState();

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
  authCodes.set(code, {
    clientId,
    redirectUri,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  saveState();
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
    return null;
  }

  authCodes.delete(code);
  const token = generateToken();
  accessTokens.add(token);
  saveState();
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

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export const LANDING_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Lyceum</title>
  <style>
    body { font-family: system-ui; max-width: 520px; margin: 80px auto; padding: 0 20px; color: #1a1a1a; }
    h1 { font-size: 1.6em; margin-bottom: 0.2em; }
    .tagline { color: #555; margin-top: 0; }
    .features { list-style: none; padding: 0; }
    .features li { padding: 6px 0; }
    .features li::before { content: "\\2022"; color: #2563eb; font-weight: bold; margin-right: 8px; }
    .mcp-badge { display: inline-block; background: #f0f4ff; border: 1px solid #c7d6f5; border-radius: 4px; padding: 2px 8px; font-size: 0.85em; color: #2563eb; }
    h2 { font-size: 1.1em; margin-top: 32px; }
    pre { background: #f5f5f5; padding: 12px 16px; border-radius: 4px; overflow-x: auto; }
    code { font-size: 0.95em; }
    footer { margin-top: 40px; font-size: 0.85em; color: #888; }
    footer a { color: #1a1a1a; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    footer svg { vertical-align: middle; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Lyceum</h1>
  <p class="tagline">An <span class="mcp-badge">MCP</span> bridge to your Calibre library.</p>
  <p>Lyceum lets AI assistants browse, search, and manage your ebook collection through the Model Context Protocol.</p>
  <ul class="features">
    <li>Search and browse your Calibre library</li>
    <li>Download and upload books</li>
    <li>Edit metadata and covers</li>
    <li>Convert between formats</li>
    <li>Send books to e-readers</li>
  </ul>
  <h2>Connect</h2>
  <p>Point your MCP-compatible AI tool to:</p>
  <pre><code>${BASE_URL}/mcp</code></pre>
  <footer>
    <a href="https://github.com/matthewp/lyceum"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg> GitHub</a>
  </footer>
</body>
</html>`;

export const UPLOAD_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Lyceum - Upload Book</title>
  <style>
    body { font-family: system-ui; max-width: 400px; margin: 80px auto; padding: 0 20px; }
    h1 { font-size: 1.4em; }
    input, button { display: block; width: 100%; padding: 10px; margin: 8px 0; box-sizing: border-box; font-size: 1em; }
    button { background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .success { color: #16a34a; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1>Lyceum</h1>
  <p>Upload a book to your Calibre library.</p>
  <form method="POST" enctype="multipart/form-data">
    <input type="file" name="book" accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.txt,.rtf,.docx" required>
    <button type="submit">Upload</button>
  </form>
</body>
</html>`;

export const AUTHORIZE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Lyceum - Authorize</title>
  <style>
    body { font-family: system-ui; max-width: 400px; margin: 80px auto; padding: 0 20px; }
    h1 { font-size: 1.4em; }
    input, button { display: block; width: 100%; padding: 10px; margin: 8px 0; box-sizing: border-box; font-size: 1em; }
    button { background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1>Lyceum</h1>
  <p>An application is requesting access to your Calibre library.</p>
  <form method="POST">
    <input type="hidden" name="client_id" value="CLIENT_ID">
    <input type="hidden" name="redirect_uri" value="REDIRECT_URI">
    <input type="hidden" name="state" value="STATE">
    <input type="password" name="password" placeholder="Password" required autofocus>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
