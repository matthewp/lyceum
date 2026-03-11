import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.ts";
import { listBooks, getBook, countBooks, getBookFilePath } from "./db.ts";
import {
  registerClient,
  createAuthCode,
  exchangeCode,
  validateToken,
  verifySignedUrl,
  checkPassword,
  AUTHORIZE_HTML,
} from "./auth.ts";

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE_URL);
  const path = url.pathname;

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

  // --- Download Endpoint (signed URL) ---
  const downloadMatch = path.match(/^\/download\/(\d+)\/([A-Z]+)$/);
  if (req.method === "GET" && downloadMatch) {
    const id = parseInt(downloadMatch[1], 10);
    const format = downloadMatch[2];
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";

    if (!verifySignedUrl(path, expires, sig)) {
      json(res, { error: "Invalid or expired download link" }, 403);
      return;
    }

    const filePath = getBookFilePath(id, format);
    if (!filePath) {
      json(res, { error: "File not found" }, 404);
      return;
    }

    try {
      const stat = statSync(filePath);
      const filename = basename(filePath);
      const contentTypes: Record<string, string> = {
        EPUB: "application/epub+zip",
        PDF: "application/pdf",
        MOBI: "application/x-mobipocket-ebook",
        AZW3: "application/x-mobi8-ebook",
        CBZ: "application/x-cbz",
        CBR: "application/x-cbr",
      };

      res.writeHead(200, {
        "Content-Type": contentTypes[format] ?? "application/octet-stream",
        "Content-Length": stat.size,
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
      createReadStream(filePath).pipe(res);
    } catch {
      json(res, { error: "File not found on disk" }, 404);
    }
    return;
  }

  // --- REST Endpoints ---
  if (req.method === "GET" && path === "/books") {
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const books = listBooks({ limit, offset });
    const total = countBooks();
    json(res, { books, total, limit, offset });
    return;
  }

  const bookMatch = path.match(/^\/books\/(\d+)$/);
  if (req.method === "GET" && bookMatch) {
    const id = parseInt(bookMatch[1], 10);
    const book = getBook(id);
    if (!book) {
      json(res, { error: "Book not found" }, 404);
      return;
    }
    json(res, book);
    return;
  }

  json(res, { error: "Not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`Calibre API listening on ${BASE_URL}`);
  console.log(`MCP endpoint: ${BASE_URL}/mcp`);
  console.log(`OAuth metadata: ${BASE_URL}/.well-known/oauth-authorization-server`);
});
