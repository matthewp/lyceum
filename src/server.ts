import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { logger as root } from "./logger.ts";

const log = root.child({ module: "server" });
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.ts";
import {
  registerClient,
  createAuthCode,
  exchangeCode,
  validateToken,
  verifySignedUrl,
  checkPassword,
  LANDING_HTML,
  AUTHORIZE_HTML,
  UPLOAD_HTML,
} from "./auth.ts";
import { parseMultipart } from "./multipart.ts";
import { addBook, downloadBook, getBook, getBookCover } from "./calibre.ts";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

function json(res: import("node:http").ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function html(res: import("node:http").ServerResponse, body: string, status = 200) {
  res.writeHead(status, { "Content-Type": "text/html" });
  res.end(body);
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBodyRaw(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE_URL);
  const path = url.pathname;

  // --- Landing Page ---
  if (req.method === "GET" && path === "/") {
    html(res, LANDING_HTML);
    return;
  }

  // --- Favicon at root (for Google favicon indexing) ---
  if (req.method === "GET" && path === "/favicon.ico") {
    try {
      const filePath = join(import.meta.dirname!, "..", "public", "favicon.png");
      const data = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
      res.end(data);
    } catch {
      json(res, { error: "Not found" }, 404);
    }
    return;
  }

  // --- Static assets ---
  if (req.method === "GET" && path.startsWith("/public/")) {
    const MIME: Record<string, string> = {
      ".webp": "image/webp",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".svg": "image/svg+xml",
    };
    const fileName = path.slice("/public/".length);
    if (fileName.includes("..") || fileName.includes("/")) {
      json(res, { error: "Not found" }, 404);
      return;
    }
    const ext = extname(fileName);
    const contentType = MIME[ext];
    if (!contentType) {
      json(res, { error: "Not found" }, 404);
      return;
    }
    try {
      const filePath = join(import.meta.dirname!, "..", "public", fileName);
      const data = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" });
      res.end(data);
    } catch {
      json(res, { error: "Not found" }, 404);
    }
    return;
  }

  // --- OAuth Discovery ---
  if (req.method === "GET" && path === "/.well-known/oauth-authorization-server") {
    json(res, {
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/authorize`,
      token_endpoint: `${BASE_URL}/token`,
      registration_endpoint: `${BASE_URL}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    });
    return;
  }

  // --- Dynamic Client Registration ---
  if (req.method === "POST" && path === "/register") {
    const body = JSON.parse(await readBody(req));
    const client = registerClient(body);
    if (!client) {
      json(res, { error: "invalid_client_metadata" }, 400);
      return;
    }
    json(res, client, 201);
    return;
  }

  // --- Authorization Endpoint ---
  if (path === "/authorize") {
    if (req.method === "GET") {
      const clientId = url.searchParams.get("client_id") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const state = url.searchParams.get("state") ?? "";

      const page = AUTHORIZE_HTML
        .replace("CLIENT_ID", clientId)
        .replace("REDIRECT_URI", redirectUri)
        .replace("STATE", state);

      html(res, page);
      return;
    }

    if (req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const password = body.get("password") ?? "";
      const clientId = body.get("client_id") ?? "";
      const redirectUri = body.get("redirect_uri") ?? "";
      const state = body.get("state") ?? "";

      if (!checkPassword(password)) {
        html(res, AUTHORIZE_HTML
          .replace("CLIENT_ID", clientId)
          .replace("REDIRECT_URI", redirectUri)
          .replace("STATE", state)
          .replace("</form>", '<p class="error">Wrong password.</p></form>'), 401);
        return;
      }

      const code = createAuthCode(clientId, redirectUri);
      if (!code) {
        json(res, { error: "invalid_request" }, 400);
        return;
      }

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (state) redirect.searchParams.set("state", state);

      res.writeHead(302, { Location: redirect.toString() });
      res.end();
      return;
    }
  }

  // --- Token Endpoint ---
  if (req.method === "POST" && path === "/token") {
    const body = new URLSearchParams(await readBody(req));
    const grantType = body.get("grant_type");
    const code = body.get("code") ?? "";
    const clientId = body.get("client_id") ?? "";
    const redirectUri = body.get("redirect_uri") ?? "";

    if (grantType !== "authorization_code") {
      json(res, { error: "unsupported_grant_type" }, 400);
      return;
    }

    const token = exchangeCode(code, clientId, redirectUri);
    if (!token) {
      json(res, { error: "invalid_grant" }, 400);
      return;
    }

    json(res, {
      access_token: token,
      token_type: "Bearer",
      expires_in: 31536000,
    });
    return;
  }

  // --- MCP Endpoint (protected) ---
  if (path === "/mcp") {
    if (!validateToken(req.headers.authorization)) {
      res.writeHead(401, {
        "WWW-Authenticate": `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-authorization-server"`,
      });
      res.end();
      return;
    }

    if (req.method === "POST") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);

      const body = await readBody(req);
      await transport.handleRequest(req, res, JSON.parse(body));

      await mcpServer.close();
      return;
    }
    if (req.method === "GET" || req.method === "DELETE") {
      json(res, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, 405);
      return;
    }
  }

  // --- View Book Details (signed URL) ---
  const viewMatch = path.match(/^\/view\/(\d+)$/);
  if (req.method === "GET" && viewMatch) {
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";

    if (!verifySignedUrl(path, expires, sig)) {
      json(res, { error: "Invalid or expired view link" }, 403);
      return;
    }

    const bookId = parseInt(viewMatch[1], 10);
    try {
      const book = await getBook(bookId);
      if (!book) {
        json(res, { error: "Book not found" }, 404);
        return;
      }

      let coverDataUrl = "";
      const coverBuf = await getBookCover(bookId);
      if (coverBuf) {
        coverDataUrl = `data:image/jpeg;base64,${coverBuf.toString("base64")}`;
      }

      html(res, viewBookHtml(book, coverDataUrl));
    } catch (e: any) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // --- Download Endpoint (signed URL) ---
  if (path.startsWith("/download/")) {
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";
    const downloadPath = path.replace("/download", "");

    if (!verifySignedUrl(path, expires, sig)) {
      json(res, { error: "Invalid or expired download link" }, 403);
      return;
    }

    try {
      const upstream = await downloadBook(downloadPath);
      if (!upstream.ok) {
        res.writeHead(upstream.status);
        res.end();
        return;
      }
      const headers: Record<string, string> = {};
      const ct = upstream.headers.get("content-type");
      if (ct) headers["Content-Type"] = ct;
      const cd = upstream.headers.get("content-disposition");
      if (cd) headers["Content-Disposition"] = cd;
      const cl = upstream.headers.get("content-length");
      if (cl) headers["Content-Length"] = cl;
      res.writeHead(200, headers);
      const body = new Uint8Array(await upstream.arrayBuffer());
      res.end(body);
    } catch (e: any) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  if (path === "/upload") {
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";

    if (!verifySignedUrl("/upload", expires, sig)) {
      json(res, { error: "Invalid or expired upload link" }, 403);
      return;
    }

    if (req.method === "GET") {
      html(res, UPLOAD_HTML);
      return;
    }

    if (req.method === "POST") {
      const contentType = req.headers["content-type"] ?? "";
      const body = await readBodyRaw(req);
      const file = parseMultipart(body, contentType);

      if (!file) {
        html(res, UPLOAD_HTML.replace("</form>", '<p class="error">No file received.</p></form>'), 400);
        return;
      }

      try {
        const result = await addBook(file.filename, file.data);
        html(res, UPLOAD_HTML.replace(
          "</form>",
          `<p class="success">Added "${result.title}" (ID: ${result.book_id})</p></form>`
        ));
      } catch (e: any) {
        html(res, UPLOAD_HTML.replace(
          "</form>",
          `<p class="error">Upload failed: ${e.message}</p></form>`
        ), 500);
      }
      return;
    }
  }

  json(res, { error: "Not found" }, 404);
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function viewBookHtml(book: any, coverDataUrl: string): string {
  const authors = (book.authors as string[])?.join(", ") ?? "";
  const tags = (book.tags as string[]) ?? [];
  const formats = (book.formats as string[]) ?? [];
  const languages = (book.languages as string[]) ?? [];

  let seriesLine = "";
  if (book.series) {
    const idx = book.series_index != null ? ` #${book.series_index}` : "";
    seriesLine = `<div class="meta-row"><span class="label">Series</span><span>${escapeHtml(book.series)}${escapeHtml(idx)}</span></div>`;
  }

  let publisherLine = "";
  if (book.publisher) {
    publisherLine = `<div class="meta-row"><span class="label">Publisher</span><span>${escapeHtml(book.publisher)}</span></div>`;
  }

  let ratingLine = "";
  if (book.rating != null && book.rating > 0) {
    const stars = "\u2605".repeat(Math.round(book.rating / 2)) + "\u2606".repeat(5 - Math.round(book.rating / 2));
    ratingLine = `<div class="meta-row"><span class="label">Rating</span><span>${stars}</span></div>`;
  }

  const pubdate = book.pubdate ? new Date(book.pubdate).getFullYear() : null;
  let pubdateLine = "";
  if (pubdate && pubdate > 100) {
    pubdateLine = `<div class="meta-row"><span class="label">Published</span><span>${pubdate}</span></div>`;
  }

  const coverImg = coverDataUrl
    ? `<img class="cover" src="${coverDataUrl}" alt="Cover">`
    : `<div class="cover no-cover">No Cover</div>`;

  const description = book.comments ?? "";

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(book.title)} - Lyceum</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/public/favicon.png">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #1a1a1a; min-height: 100vh; }
    .header { background: #162238; padding: 16px 24px; }
    .header a { color: #fff; text-decoration: none; font-size: 1.1em; font-weight: 600; display: inline-flex; align-items: center; gap: 10px; }
    .header img { height: 28px; }
    .container { max-width: 720px; margin: 32px auto; padding: 0 20px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .book-layout { display: flex; gap: 28px; padding: 28px; }
    .cover { width: 180px; min-width: 180px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); object-fit: contain; align-self: flex-start; }
    .no-cover { height: 260px; display: flex; align-items: center; justify-content: center; background: #e5e7eb; color: #9ca3af; font-size: 0.9em; }
    .details { flex: 1; min-width: 0; }
    .title { font-size: 1.5em; font-weight: 700; line-height: 1.3; margin-bottom: 4px; }
    .authors { font-size: 1.1em; color: #4b5563; margin-bottom: 20px; }
    .meta-row { display: flex; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 0.92em; }
    .meta-row:last-child { border-bottom: none; }
    .label { color: #6b7280; width: 90px; min-width: 90px; font-weight: 500; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { background: #f0f4ff; color: #2563eb; border-radius: 3px; padding: 2px 8px; font-size: 0.85em; }
    .format { background: #f0fdf4; color: #16a34a; border-radius: 3px; padding: 2px 8px; font-size: 0.85em; font-weight: 500; }
    .description { padding: 24px 28px; border-top: 1px solid #e5e7eb; font-size: 0.95em; line-height: 1.6; color: #374151; }
    .description h3 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 12px; }
    .description :is(p, ul, ol) { margin-bottom: 12px; }
    @media (max-width: 560px) {
      .book-layout { flex-direction: column; align-items: center; text-align: center; padding: 20px; }
      .cover { width: 160px; min-width: 160px; }
      .meta-row { justify-content: center; }
      .tags { justify-content: center; }
    }
  </style>
</head>
<body>
  <div class="header"><a href="/"><img src="/public/logo.webp" alt="">Lyceum</a></div>
  <div class="container">
    <div class="card">
      <div class="book-layout">
        ${coverImg}
        <div class="details">
          <div class="title">${escapeHtml(book.title)}</div>
          <div class="authors">${escapeHtml(authors)}</div>
          ${seriesLine}
          ${publisherLine}
          ${pubdateLine}
          ${ratingLine}
          ${languages.length ? `<div class="meta-row"><span class="label">Language</span><span>${languages.map((l: string) => escapeHtml(l)).join(", ")}</span></div>` : ""}
          ${tags.length ? `<div class="meta-row"><span class="label">Tags</span><div class="tags">${tags.map((t: string) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div></div>` : ""}
          ${formats.length ? `<div class="meta-row"><span class="label">Formats</span><div class="tags">${formats.map((f: string) => `<span class="format">${escapeHtml(f)}</span>`).join("")}</div></div>` : ""}
        </div>
      </div>
      ${description ? `<div class="description"><h3>Description</h3>${description}</div>` : ""}
    </div>
  </div>
</body>
</html>`;
}

server.listen(PORT, () => {
  log.info({ url: BASE_URL }, "Lyceum listening");
});
