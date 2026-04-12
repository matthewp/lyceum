import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
  createSignedUrl,
  checkPassword,
  createSessionCookie,
  verifySessionCookie,
} from "./auth.ts";
import { renderToString, SafeHTML } from "./html.ts";
import { bookFilename } from "./book-filename.ts";
import { landingPage, authorizePage, authorizeSuccessPage, addFormatPage, uploadPage, viewBookPage, appLoginPage, appBooksPage, appTagPage, appSeriesPage, appAuthorPage, appSearchPage, appDevicesPage, appSettingsPage } from "./templates.ts";
import {
  verifyOpdsAuth, getOpdsSettings, setOpdsSettings,
  rootFeed, recentFeed, authorsFeed, authorBooksFeed,
  seriesFeed, seriesBooksFeed, tagsFeed, tagBooksFeed,
  searchFeed, openSearchDescriptor,
} from "./opds.ts";
import {
  verifyKosyncAuth, verifyKosyncCredentials, getKosyncSettings, setKosyncSettings,
  getProgress, putProgress,
} from "./kosync.ts";
import { listDevices, addDevice, verifyDevice, removeDevice, sendToDevice } from "./devices/index.ts";
import { parseMultipart } from "./multipart.ts";
import type { StorageBackend } from "./storage/index.ts";

export interface ServerConfig {
  port: number;
  baseUrl: string;
  storage: StorageBackend;
}

let PORT: number;
let BASE_URL: string;
let storage: StorageBackend;

function json(res: import("node:http").ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res: import("node:http").ServerResponse, body: SafeHTML, status = 200) {
  res.writeHead(status, { "Content-Type": "text/html" });
  res.end(renderToString(body));
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

export function startServer(config: ServerConfig) {
  PORT = config.port;
  BASE_URL = config.baseUrl;
  storage = config.storage;

  const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE_URL);
  const path = url.pathname;

  // --- Landing Page ---
  if (req.method === "GET" && path === "/") {
    sendHtml(res, landingPage(BASE_URL));
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
      ".css": "text/css",
      ".js": "text/javascript",
    };
    const fileName = path.slice("/public/".length);
    if (fileName.includes("..")) {
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
      const filePath = join(import.meta.dirname!, "..", "public", ...fileName.split("/"));
      const data = readFileSync(filePath);
      const etag = `"${createHash("md5").update(data).digest("hex")}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304);
        res.end();
        return;
      }
      const headers: Record<string, string> = { "Content-Type": contentType, "Cache-Control": "no-cache", "ETag": etag };
      if (fileName === "sw.js") headers["Service-Worker-Allowed"] = "/";
      res.writeHead(200, headers);
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

      sendHtml(res, authorizePage({ clientId, redirectUri, state }));
      return;
    }

    if (req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const password = body.get("password") ?? "";
      const clientId = body.get("client_id") ?? "";
      const redirectUri = body.get("redirect_uri") ?? "";
      const state = body.get("state") ?? "";

      if (!checkPassword(password)) {
        sendHtml(res, authorizePage({ clientId, redirectUri, state, error: "Wrong password." }), 401);
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

      sendHtml(res, authorizeSuccessPage(redirect.toString()));
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
      const mcpServer = createMcpServer(storage, BASE_URL);
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
      const book = await storage.getBook(bookId);
      if (!book) {
        json(res, { error: "Book not found" }, 404);
        return;
      }

      let coverDataUrl = "";
      const coverBuf = await storage.getBookCover(bookId);
      if (coverBuf) {
        coverDataUrl = `data:image/jpeg;base64,${coverBuf.toString("base64")}`;
      }

      sendHtml(res, viewBookPage(book, "mcp", coverDataUrl));
    } catch (e: any) {
      log.error({ err: e, bookId }, "View book failed");
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
      const upstream = await storage.downloadBook(downloadPath);
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
      log.error({ err: e, path: downloadPath }, "Download failed");
      json(res, { error: e.message }, 500);
    }
    return;
  }

  const addFormatMatch = path.match(/^\/add-format\/(\d+)$/);
  if (addFormatMatch) {
    const bookId = parseInt(addFormatMatch[1], 10);
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";

    if (!verifySignedUrl(path, expires, sig)) {
      json(res, { error: "Invalid or expired link" }, 403);
      return;
    }

    const book = await storage.getBook(bookId);
    if (!book) {
      json(res, { error: "Book not found" }, 404);
      return;
    }

    if (req.method === "GET") {
      sendHtml(res, addFormatPage(book.title));
      return;
    }

    if (req.method === "POST") {
      try {
        const contentType = req.headers["content-type"] ?? "";
        const body = await readBodyRaw(req);
        const file = parseMultipart(body, contentType);

        if (!file) {
          sendHtml(res, addFormatPage(book.title, { error: "No file received." }), 400);
          return;
        }

        await storage.addFormat(bookId, file.filename, file.data);
        const ext = extname(file.filename).replace(/^\./, "").toUpperCase() || "file";
        sendHtml(res, addFormatPage(book.title, { success: `${ext} format added successfully.` }));
      } catch (e: any) {
        log.error({ err: e, bookId }, "Add format failed");
        sendHtml(res, addFormatPage(book.title, { error: `Failed: ${e.message}` }), 500);
      }
      return;
    }
  }

  if (path === "/upload") {
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";

    if (!verifySignedUrl("/upload", expires, sig)) {
      json(res, { error: "Invalid or expired upload link" }, 403);
      return;
    }

    if (req.method === "GET") {
      sendHtml(res, uploadPage());
      return;
    }

    if (req.method === "POST") {
      let filename: string | undefined;
      try {
        const contentType = req.headers["content-type"] ?? "";
        const body = await readBodyRaw(req);
        const file = parseMultipart(body, contentType);

        if (!file) {
          sendHtml(res, uploadPage({ error: "No file received." }), 400);
          return;
        }

        filename = file.filename;
        const result = await storage.addBook(file.filename, file.data);
        sendHtml(res, uploadPage({ success: `Added "${result.title}" (ID: ${result.book_id})` }));
      } catch (e: any) {
        log.error({ err: e, filename }, "Upload failed");
        sendHtml(res, uploadPage({ error: `Upload failed: ${e.message}` }), 500);
      }
      return;
    }
  }

  // --- OPDS Catalog ---
  if (path.startsWith("/opds")) {
    if (!verifyOpdsAuth(req)) {
      log.info({ url: req.url }, "OPDS request rejected: unauthorized");
      res.writeHead(401, {
        "WWW-Authenticate": 'Basic realm="Lyceum OPDS"',
        "Content-Type": "text/plain",
      });
      res.end("Unauthorized");
      return;
    }

    const sendXml = (xml: string, kind: "navigation" | "acquisition" = "navigation") => {
      res.writeHead(200, { "Content-Type": `application/atom+xml;profile=opds-catalog;kind=${kind}` });
      res.end(xml);
    };

    if (req.method === "GET" && (path === "/opds" || path === "/opds/")) {
      sendXml(rootFeed(BASE_URL));
      return;
    }

    if (req.method === "GET" && path === "/opds/recent") {
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      try {
        sendXml(await recentFeed(BASE_URL, storage, page), "acquisition");
      } catch (err) {
        log.error({ err }, "OPDS recentFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    if (req.method === "GET" && path === "/opds/authors") {
      try {
        sendXml(await authorsFeed(BASE_URL, storage));
      } catch (err) {
        log.error({ err }, "OPDS authorsFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    const opdsAuthorMatch = path.match(/^\/opds\/author\/(.+)$/);
    if (req.method === "GET" && opdsAuthorMatch) {
      const author = decodeURIComponent(opdsAuthorMatch[1]);
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      try {
        sendXml(await authorBooksFeed(BASE_URL, storage, author, page), "acquisition");
      } catch (err) {
        log.error({ err, author }, "OPDS authorBooksFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    if (req.method === "GET" && path === "/opds/series") {
      try {
        sendXml(await seriesFeed(BASE_URL, storage));
      } catch (err) {
        log.error({ err }, "OPDS seriesFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    const opdsSeriesMatch = path.match(/^\/opds\/series\/(\d+)$/);
    if (req.method === "GET" && opdsSeriesMatch) {
      const seriesId = parseInt(opdsSeriesMatch[1], 10);
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      try {
        const xml = await seriesBooksFeed(BASE_URL, storage, seriesId, page);
        if (!xml) { json(res, { error: "Series not found" }, 404); return; }
        sendXml(xml, "acquisition");
      } catch (err) {
        log.error({ err, seriesId }, "OPDS seriesBooksFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    if (req.method === "GET" && path === "/opds/tags") {
      try {
        sendXml(await tagsFeed(BASE_URL, storage));
      } catch (err) {
        log.error({ err }, "OPDS tagsFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    const opdsTagMatch = path.match(/^\/opds\/tag\/(.+)$/);
    if (req.method === "GET" && opdsTagMatch) {
      const tag = decodeURIComponent(opdsTagMatch[1]);
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      try {
        sendXml(await tagBooksFeed(BASE_URL, storage, tag, page), "acquisition");
      } catch (err) {
        log.error({ err, tag }, "OPDS tagBooksFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    if (req.method === "GET" && path === "/opds/search") {
      const q = url.searchParams.get("q") ?? "";
      if (!q) { json(res, { error: "query required" }, 400); return; }
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      try {
        sendXml(await searchFeed(BASE_URL, storage, q, page), "acquisition");
      } catch (err) {
        log.error({ err, q }, "OPDS searchFeed failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    if (req.method === "GET" && path === "/opds/opensearch.xml") {
      res.writeHead(200, { "Content-Type": "application/opensearchdescription+xml" });
      res.end(openSearchDescriptor(BASE_URL));
      return;
    }

    const opdsCoverMatch = path.match(/^\/opds\/cover\/(\d+)$/);
    if (req.method === "GET" && opdsCoverMatch) {
      const bookId = parseInt(opdsCoverMatch[1], 10);
      try {
        const coverBuf = await storage.getBookCover(bookId);
        if (!coverBuf) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": String(coverBuf.byteLength),
          "Cache-Control": "public, max-age=86400",
        });
        res.end(coverBuf);
      } catch (err) {
        log.error({ err, bookId }, "OPDS cover fetch failed");
        res.writeHead(500); res.end();
      }
      return;
    }

    const opdsDownloadMatch = path.match(/^\/opds\/download\/(\d+)\/(.+)$/);
    if (req.method === "GET" && opdsDownloadMatch) {
      const bookId = parseInt(opdsDownloadMatch[1], 10);
      const format = decodeURIComponent(opdsDownloadMatch[2]).toUpperCase();
      try {
        const downloadPath = storage.bookDownloadPath(format, bookId);
        const upstream = await storage.downloadBook(downloadPath);
        if (!upstream.ok) { res.writeHead(upstream.status); res.end(); return; }
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
        log.error({ err: e, bookId, format }, "OPDS download failed");
        json(res, { error: e.message }, 500);
      }
      return;
    }

    json(res, { error: "Not found" }, 404);
    return;
  }

  // --- KOSync (KOReader Progress Sync) ---
  if (path.startsWith("/kosync/")) {
    const kosyncSettings = getKosyncSettings();

    // PUT /kosync/users/create
    if (req.method === "PUT" && path === "/kosync/users/create") {
      if (!kosyncSettings.enabled) { json(res, { message: "KOSync is not enabled" }, 403); return; }
      const body = JSON.parse(await readBody(req));
      const { username, password } = body;
      if (!username || !password) { json(res, { message: "Missing username or password" }, 400); return; }
      if (verifyKosyncCredentials(username, password)) {
        json(res, { username }, 201);
      } else {
        json(res, { message: "Forbidden" }, 403);
      }
      return;
    }

    // GET /kosync/users/auth
    if (req.method === "GET" && path === "/kosync/users/auth") {
      const auth = verifyKosyncAuth(req);
      if (!auth.ok) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ authorized: "DENIED" }));
        return;
      }
      json(res, { authorized: "OK" });
      return;
    }

    // PUT /kosync/syncs/progress
    if (req.method === "PUT" && path === "/kosync/syncs/progress") {
      const auth = verifyKosyncAuth(req);
      if (!auth.ok) { json(res, { authorized: "DENIED" }, 401); return; }
      const body = JSON.parse(await readBody(req));
      const { document, progress, percentage, device, device_id } = body;
      if (!document || !progress) { json(res, { message: "Missing required fields" }, 400); return; }
      const timestamp = putProgress(auth.username!, document, progress, percentage ?? 0, device ?? "", device_id ?? "");
      json(res, { document, timestamp });
      return;
    }

    // GET /kosync/syncs/progress/:document
    const progressMatch = path.match(/^\/kosync\/syncs\/progress\/(.+)$/);
    if (req.method === "GET" && progressMatch) {
      const auth = verifyKosyncAuth(req);
      if (!auth.ok) { json(res, { authorized: "DENIED" }, 401); return; }
      const document = decodeURIComponent(progressMatch[1]);
      const record = getProgress(auth.username!, document);
      if (!record) { json(res, {}); return; }
      json(res, record);
      return;
    }

    json(res, { error: "Not found" }, 404);
    return;
  }

  // --- App: Login ---
  if (path === "/app/login") {
    if (req.method === "GET") {
      sendHtml(res, appLoginPage());
      return;
    }

    if (req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const password = body.get("password") ?? "";

      if (!checkPassword(password)) {
        sendHtml(res, appLoginPage({ error: "Wrong password." }), 401);
        return;
      }

      res.writeHead(302, {
        Location: "/app",
        "Set-Cookie": createSessionCookie(),
      });
      res.end();
      return;
    }
  }

  if (path === "/app/logout" && req.method === "POST") {
    res.writeHead(302, {
      Location: "/app/login",
      "Set-Cookie": "session=; Path=/app; HttpOnly; SameSite=Lax; Max-Age=0",
    });
    res.end();
    return;
  }

  // --- App: Protected routes ---
  if (path.startsWith("/app")) {
    if (!verifySessionCookie(req.headers.cookie)) {
      res.writeHead(302, { Location: "/app/login" });
      res.end();
      return;
    }

    // Book list
    if (req.method === "GET" && path === "/app") {
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = 50;
      const { books, total } = await storage.listBooks({ limit: perPage, offset: (page - 1) * perPage });
      sendHtml(res, appBooksPage(books, total, page, perPage, "/app"));
      return;
    }

    // Search
    if (req.method === "GET" && path === "/app/search") {
      const q = url.searchParams.get("q") ?? "";
      if (!q) {
        res.writeHead(302, { Location: "/app" });
        res.end();
        return;
      }
      const { results, count } = await storage.searchBooks(q, { limit: 100 });
      sendHtml(res, appSearchPage(q, results, count));
      return;
    }

    // Series page
    const seriesMatch = path.match(/^\/app\/series\/(\d+)$/);
    if (req.method === "GET" && seriesMatch) {
      const seriesId = parseInt(seriesMatch[1], 10);
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = 50;
      const { books, total, seriesName } = await storage.listBooksBySeries(seriesId, { limit: perPage, offset: (page - 1) * perPage });
      if (!seriesName) { json(res, { error: "Series not found" }, 404); return; }
      sendHtml(res, appSeriesPage(seriesName, books, total, page, perPage));
      return;
    }

    // Author page
    const authorMatch = path.match(/^\/app\/author\/(.+)$/);
    if (req.method === "GET" && authorMatch) {
      const author = decodeURIComponent(authorMatch[1]);
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = 50;
      const { books, total } = await storage.listBooksByAuthor(author, { limit: perPage, offset: (page - 1) * perPage });
      sendHtml(res, appAuthorPage(author, books, total, page, perPage));
      return;
    }

    // Tag page
    const tagMatch = path.match(/^\/app\/tag\/(.+)$/);
    if (req.method === "GET" && tagMatch) {
      const tag = decodeURIComponent(tagMatch[1]);
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = 50;
      const { books, total } = await storage.listBooksByTag(tag, { limit: perPage, offset: (page - 1) * perPage });
      sendHtml(res, appTagPage(tag, books, total, page, perPage));
      return;
    }

    // Devices
    if (req.method === "GET" && path === "/app/devices") {
      const devices = listDevices();
      sendHtml(res, appDevicesPage(devices));
      return;
    }

    // Add device (step 1)
    if (req.method === "POST" && path === "/app/devices/add") {
      const body = await readBody(req);
      const params = JSON.parse(body);
      try {
        const result = await addDevice(params.type, params.name, params.params ?? {});
        json(res, result);
      } catch (e: any) {
        json(res, { error: e.message }, 400);
      }
      return;
    }

    // Verify device (step 2)
    if (req.method === "POST" && path === "/app/devices/verify") {
      const body = await readBody(req);
      const params = JSON.parse(body);
      try {
        const device = await verifyDevice(params.name, params.params ?? {});
        json(res, { name: device.name, type: device.type });
      } catch (e: any) {
        json(res, { error: e.message }, 400);
      }
      return;
    }

    // Remove device
    if (req.method === "POST" && path === "/app/devices/remove") {
      const body = await readBody(req);
      const params = JSON.parse(body);
      try {
        removeDevice(params.name);
        json(res, { ok: true });
      } catch (e: any) {
        json(res, { error: e.message }, 400);
      }
      return;
    }

    // Settings
    if (req.method === "GET" && path === "/app/settings") {
      const opds = getOpdsSettings();
      const kosync = getKosyncSettings();
      sendHtml(res, appSettingsPage({
        opdsEnabled: opds.enabled, opdsUsername: opds.username, opdsUrl: `${BASE_URL}/opds/`,
        kosyncEnabled: kosync.enabled, kosyncUsername: kosync.username, kosyncUrl: `${BASE_URL}/kosync`,
      }));
      return;
    }

    if (req.method === "POST" && path === "/app/settings/opds") {
      const body = new URLSearchParams(await readBody(req));
      const enabled = body.get("enabled") === "true";
      const username = body.get("username") ?? "";
      const password = body.get("password") ?? "";

      const current = getOpdsSettings();
      const kosync = getKosyncSettings();
      const updates: { enabled?: boolean; username?: string; password?: string } = { enabled };
      const settingsBase = { kosyncEnabled: kosync.enabled, kosyncUsername: kosync.username, kosyncUrl: `${BASE_URL}/kosync` };

      if (username) updates.username = username;
      if (password) updates.password = password;

      if (enabled && !current.hasPassword && !password) {
        sendHtml(res, appSettingsPage({ opdsEnabled: current.enabled, opdsUsername: current.username, opdsUrl: `${BASE_URL}/opds/`, ...settingsBase, error: "Password is required to enable OPDS." }));
        return;
      }
      if (enabled && !current.username && !username) {
        sendHtml(res, appSettingsPage({ opdsEnabled: current.enabled, opdsUsername: current.username, opdsUrl: `${BASE_URL}/opds/`, ...settingsBase, error: "Username is required to enable OPDS." }));
        return;
      }

      setOpdsSettings(updates);
      const updated = getOpdsSettings();
      sendHtml(res, appSettingsPage({ opdsEnabled: updated.enabled, opdsUsername: updated.username, opdsUrl: `${BASE_URL}/opds/`, ...settingsBase, success: "OPDS settings saved." }));
      return;
    }

    if (req.method === "POST" && path === "/app/settings/kosync") {
      const body = new URLSearchParams(await readBody(req));
      const enabled = body.get("enabled") === "true";
      const username = body.get("username") ?? "";
      const password = body.get("password") ?? "";

      const current = getKosyncSettings();
      const opds = getOpdsSettings();
      const updates: { enabled?: boolean; username?: string; password?: string } = { enabled };
      const settingsBase = { opdsEnabled: opds.enabled, opdsUsername: opds.username, opdsUrl: `${BASE_URL}/opds/` };

      if (username) updates.username = username;
      if (password) updates.password = password;

      if (enabled && !current.hasPassword && !password) {
        sendHtml(res, appSettingsPage({ kosyncEnabled: current.enabled, kosyncUsername: current.username, kosyncUrl: `${BASE_URL}/kosync`, ...settingsBase, error: "Password is required to enable KOSync." }));
        return;
      }
      if (enabled && !current.username && !username) {
        sendHtml(res, appSettingsPage({ kosyncEnabled: current.enabled, kosyncUsername: current.username, kosyncUrl: `${BASE_URL}/kosync`, ...settingsBase, error: "Username is required to enable KOSync." }));
        return;
      }

      setKosyncSettings(updates);
      const updated = getKosyncSettings();
      sendHtml(res, appSettingsPage({ kosyncEnabled: updated.enabled, kosyncUsername: updated.username, kosyncUrl: `${BASE_URL}/kosync`, ...settingsBase, success: "KOSync settings saved." }));
      return;
    }

    // Book detail
    const bookMatch = path.match(/^\/app\/book\/(\d+)$/);
    if (req.method === "GET" && bookMatch) {
      const bookId = parseInt(bookMatch[1], 10);
      const book = await storage.getBook(bookId);
      if (!book) {
        json(res, { error: "Book not found" }, 404);
        return;
      }
      const devices = listDevices();
      sendHtml(res, viewBookPage(book, "app", undefined, !!process.env.CONVERTER_URL, devices.map(d => d.name)));
      return;
    }

    // Get signed download URL for a format
    const downloadUrlMatch = path.match(/^\/app\/book\/(\d+)\/download-url$/);
    if (req.method === "GET" && downloadUrlMatch) {
      const bookId = parseInt(downloadUrlMatch[1], 10);
      const format = url.searchParams.get("format")?.toUpperCase();
      if (!format) { json(res, { error: "format required" }, 400); return; }
      const book = await storage.getBook(bookId);
      if (!book) { json(res, { error: "Book not found" }, 404); return; }
      const dlUrl = createSignedUrl(config.baseUrl, `/download${storage.bookDownloadPath(format, bookId)}`, 300);
      const filename = bookFilename(book.title, (book.authors as string[]) ?? [], format);
      json(res, { url: dlUrl, filename });
      return;
    }

    // Remove format from book
    const removeFormatMatch = path.match(/^\/app\/book\/(\d+)\/remove-format$/);
    if (req.method === "POST" && removeFormatMatch) {
      const bookId = parseInt(removeFormatMatch[1], 10);
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const format = params.get("format")?.toUpperCase();
      if (!format) { json(res, { error: "format required" }, 400); return; }

      try {
        await storage.removeFormats(bookId, [format]);
        const updated = await storage.getBook(bookId);
        json(res, { formats: updated?.formats ?? [] });
      } catch (e: any) {
        json(res, { error: e.message }, 500);
      }
      return;
    }

    // Send book to device
    const sendToDeviceMatch = path.match(/^\/app\/book\/(\d+)\/send-to-device$/);
    if (req.method === "POST" && sendToDeviceMatch) {
      const bookId = parseInt(sendToDeviceMatch[1], 10);
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const format = params.get("format")?.toUpperCase();
      const deviceName = params.get("device");
      if (!format || !deviceName) { json(res, { error: "format and device required" }, 400); return; }

      try {
        const book = await storage.getBook(bookId);
        if (!book) { json(res, { error: "Book not found" }, 404); return; }

        const filename = bookFilename(book.title, (book.authors as string[]) ?? [], format);

        const downloadPath = storage.bookDownloadPath(format, bookId);
        const dlRes = await storage.downloadBook(downloadPath);
        if (!dlRes.ok) { json(res, { error: "Failed to download book" }, 500); return; }
        const buf = Buffer.from(await dlRes.arrayBuffer());
        await sendToDevice(deviceName, buf, filename);
        json(res, { ok: true });
      } catch (e: any) {
        json(res, { error: e.message }, 500);
      }
      return;
    }

    // Convert book format
    const convertMatch = path.match(/^\/app\/book\/(\d+)\/convert$/);
    if (req.method === "POST" && convertMatch) {
      const bookId = parseInt(convertMatch[1], 10);
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const toFormat = params.get("to_format")?.toUpperCase();
      if (!toFormat) { json(res, { error: "to_format required" }, 400); return; }

      const book = await storage.getBook(bookId);
      if (!book) { json(res, { error: "Book not found" }, 404); return; }

      const priority = ["EPUB", "MOBI", "AZW3", "LIT", "FB2", "RTF", "HTMLZ", "DOCX", "TXT", "PDF"];
      const fromFormat = priority.find(f => (book.formats as string[]).includes(f)) ?? (book.formats as string[])[0];
      if (!fromFormat) { json(res, { error: "No source format available" }, 400); return; }

      try {
        await storage.convertBook(bookId, fromFormat, toFormat);
        const updated = await storage.getBook(bookId);
        json(res, { formats: updated?.formats ?? [] });
      } catch (e: any) {
        log.error({ bookId, fromFormat, toFormat, err: e.message }, "Conversion failed");
        json(res, { error: e.message }, 500);
      }
      return;
    }

    // Set rating
    const ratingMatch = path.match(/^\/app\/book\/(\d+)\/rating$/);
    if (req.method === "POST" && ratingMatch) {
      const bookId = parseInt(ratingMatch[1], 10);
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const rating = parseInt(params.get("rating") ?? "0", 10);
      await storage.setMetadata(bookId, { rating: rating > 0 ? rating : null });
      res.writeHead(302, { Location: `/app/book/${bookId}` });
      res.end();
      return;
    }

    // Toggle read status
    const readMatch = path.match(/^\/app\/book\/(\d+)\/read$/);
    if (req.method === "POST" && readMatch) {
      const bookId = parseInt(readMatch[1], 10);
      const book = await storage.getBook(bookId);
      if (!book) { json(res, { error: "Book not found" }, 404); return; }
      const newReadAt = book.read_at ? null : new Date().toISOString();
      await storage.markRead(bookId, newReadAt);
      res.writeHead(302, { Location: `/app/book/${bookId}` });
      res.end();
      return;
    }

    // Cover thumbnail
    const coverMatch = path.match(/^\/app\/cover\/(\d+)$/);
    if (req.method === "GET" && coverMatch) {
      const bookId = parseInt(coverMatch[1], 10);
      const coverBuf = await storage.getBookCover(bookId);
      if (!coverBuf) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": String(coverBuf.byteLength),
        "Cache-Control": "public, max-age=86400",
      });
      res.end(coverBuf);
      return;
    }
  }

  json(res, { error: "Not found" }, 404);
});

  server.listen(PORT, () => {
    log.info({ url: BASE_URL }, "Lyceum listening");
  });

  return server;
}
