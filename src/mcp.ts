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
import { addBook, fetchMetadata, setMetadata } from "./calibre.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "lyceum",
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

  server.registerTool("get_upload_link", {
    description: "Get a temporary upload link to add a book to the Calibre library. Returns a signed URL that opens a file upload form in the browser. The link expires in 10 minutes.",
  }, async () => {
    const url = createSignedUrl(BASE_URL, "/upload", 600);
    return {
      content: [{ type: "text", text: url }],
    };
  });

  server.registerTool("add_book", {
    description: "Add a book to the Calibre library by file path (for files already on the server).",
    inputSchema: {
      file_path: z.string().describe("Absolute path to the book file on the server"),
    },
  }, async ({ file_path }) => {
    try {
      const result = await addBook(file_path);
      return {
        content: [{ type: "text", text: result || "Book added successfully." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("fetch_metadata", {
    description: "Search online for book metadata by title and optionally author. Returns metadata from various sources (Amazon, Google, etc.).",
    inputSchema: {
      title: z.string().describe("Book title to search for"),
      authors: z.string().optional().describe("Author name to narrow the search"),
    },
  }, async ({ title, authors }) => {
    try {
      const result = await fetchMetadata(title, authors);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("set_metadata", {
    description: "Update metadata fields on a book in the Calibre library. Fields can include: title, authors, tags, series, publisher, rating, comments, etc.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      fields: z.record(z.string(), z.string()).describe("Key-value pairs of metadata fields to set (e.g. {\"title\": \"New Title\", \"tags\": \"fiction,sci-fi\"})"),
    },
  }, async ({ id, fields }) => {
    try {
      const result = await setMetadata(id, fields);
      return {
        content: [{ type: "text", text: result || "Metadata updated successfully." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  return server;
}
