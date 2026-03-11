import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listBooks,
  getBook,
  searchBooks,
  countBooks,
  listAuthors,
  listTags,
  listSeries,
  listReadBooks,
  listUnreadBooks,
  getBookFilePath,
} from "./db.ts";
import { createSignedUrl } from "./auth.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "calibre",
    version: "1.0.0",
  });

  server.registerTool("list_books", {
    description: "List books in the Calibre library, sorted by most recently added.",
    inputSchema: {
      limit: z.number().optional().describe("Max books to return (default 20)"),
      offset: z.number().optional().describe("Offset for pagination (default 0)"),
    },
  }, async ({ limit, offset }) => {
    const books = listBooks({ limit: limit ?? 20, offset: offset ?? 0 });
    const total = countBooks();
    return {
      content: [{ type: "text", text: JSON.stringify({ books, total }, null, 2) }],
    };
  });

  server.registerTool("get_book", {
    description: "Get full details for a specific book by ID, including authors, tags, series, formats, and description.",
    inputSchema: {
      id: z.number().describe("The book ID"),
    },
  }, async ({ id }) => {
    const book = getBook(id);
    if (!book) {
      return { content: [{ type: "text", text: "Book not found." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(book, null, 2) }],
    };
  });

  server.registerTool("search_books", {
    description: "Search books by title, author, tag, or series name.",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 20)"),
      offset: z.number().optional().describe("Offset for pagination (default 0)"),
    },
  }, async ({ query, limit, offset }) => {
    const books = searchBooks(query, { limit: limit ?? 20, offset: offset ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify({ results: books, count: books.length }, null, 2) }],
    };
  });

  server.registerTool("list_authors", {
    description: "List all authors in the library with book counts.",
  }, async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(listAuthors(), null, 2) }],
    };
  });

  server.registerTool("list_tags", {
    description: "List all tags in the library with book counts.",
  }, async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(listTags(), null, 2) }],
    };
  });

  server.registerTool("list_series", {
    description: "List all series in the library with book counts.",
  }, async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(listSeries(), null, 2) }],
    };
  });

  server.registerTool("list_read_books", {
    description: "List books that have been read, sorted by most recently read. Includes read date and authors.",
    inputSchema: {
      limit: z.number().optional().describe("Max books to return (default 20)"),
      offset: z.number().optional().describe("Offset for pagination (default 0)"),
    },
  }, async ({ limit, offset }) => {
    const books = listReadBooks({ limit: limit ?? 20, offset: offset ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(books, null, 2) }],
    };
  });

  server.registerTool("list_unread_books", {
    description: "List books that have NOT been read yet, sorted by most recently added.",
    inputSchema: {
      limit: z.number().optional().describe("Max books to return (default 20)"),
      offset: z.number().optional().describe("Offset for pagination (default 0)"),
    },
  }, async ({ limit, offset }) => {
    const books = listUnreadBooks({ limit: limit ?? 20, offset: offset ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(books, null, 2) }],
    };
  });

  server.registerTool("get_download_link", {
    description: "Get a temporary download link for a book file. Returns a signed URL that expires in 5 minutes.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      format: z.string().describe("File format (e.g. EPUB, PDF, MOBI)"),
    },
  }, async ({ id, format }) => {
    const filePath = getBookFilePath(id, format);
    if (!filePath) {
      return {
        content: [{ type: "text", text: `No ${format.toUpperCase()} file found for book ${id}.` }],
        isError: true,
      };
    }
    const urlPath = `/download/${id}/${format.toUpperCase()}`;
    const url = createSignedUrl(BASE_URL, urlPath);
    return {
      content: [{ type: "text", text: url }],
    };
  });

  return server;
}
