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
} from "./auth.ts";
import { landingPage, authorizePage, uploadPage, viewBookPage } from "./templates.ts";
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
    html(res, landingPage(BASE_URL));
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

      html(res, authorizePage({ clientId, redirectUri, state }));
      return;
    }

    if (req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const password = body.get("password") ?? "";
      const clientId = body.get("client_id") ?? "";
      const redirectUri = body.get("redirect_uri") ?? "";
      const state = body.get("state") ?? "";

      if (!checkPassword(password)) {
        html(res, authorizePage({ clientId, redirectUri, state, error: "Wrong password." }), 401);
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

      html(res, viewBookPage(book, coverDataUrl));
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
      html(res, uploadPage());
      return;
    }

    if (req.method === "POST") {
      const contentType = req.headers["content-type"] ?? "";
      const body = await readBodyRaw(req);
      const file = parseMultipart(body, contentType);

      if (!file) {
        html(res, uploadPage({ error: "No file received." }), 400);
        return;
      }

      try {
        const result = await addBook(file.filename, file.data);
        html(res, uploadPage({ success: `Added "${result.title}" (ID: ${result.book_id})` }));
      } catch (e: any) {
        html(res, uploadPage({ error: `Upload failed: ${e.message}` }), 500);
      }
      return;
    }
  }

  json(res, { error: "Not found" }, 404);
});


server.listen(PORT, () => {
  log.info({ url: BASE_URL }, "Lyceum listening");
});
