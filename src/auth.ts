import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  console.error("AUTH_PASSWORD environment variable is required");
  process.exit(1);
}

// In-memory stores
const authCodes = new Map<string, { clientId: string; redirectUri: string; expiresAt: number }>();
const accessTokens = new Set<string>();
const clients = new Map<string, { clientId: string; redirectUris: string[] }>();

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
