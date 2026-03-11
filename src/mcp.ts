import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listBooks,
  getBook,
  searchBooks,
  listAuthors,
  listTags,
  listSeries,
  getDownloadUrl,
  setMetadata,
  convertBook,
} from "./calibre.ts";
import { createSignedUrl } from "./auth.ts";
import { fetchMetadata } from "./metadata.ts";

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
    const result = await listBooks({ limit: limit ?? 20, offset: offset ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool("get_book", {
    description: "Get full details for a specific book by ID, including authors, tags, series, formats, and description.",
    inputSchema: {
      id: z.number().describe("The book ID"),
    },
  }, async ({ id }) => {
    const book = await getBook(id);
    if (!book) {
      return { content: [{ type: "text", text: "Book not found." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(book, null, 2) }],
    };
  });

  server.registerTool("search_books", {
    description: "Search books by title, author, tag, or series name. Supports Calibre's search syntax (e.g. author:Asimov, tag:sci-fi).",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 20)"),
      offset: z.number().optional().describe("Offset for pagination (default 0)"),
    },
  }, async ({ query, limit, offset }) => {
    const result = await searchBooks(query, { limit: limit ?? 20, offset: offset ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool("list_authors", {
    description: "List all authors in the library with book counts.",
  }, async () => {
    const authors = await listAuthors();
    return {
      content: [{ type: "text", text: JSON.stringify(authors, null, 2) }],
    };
  });

  server.registerTool("list_tags", {
    description: "List all tags in the library with book counts.",
  }, async () => {
    const tags = await listTags();
    return {
      content: [{ type: "text", text: JSON.stringify(tags, null, 2) }],
    };
  });

  server.registerTool("list_series", {
    description: "List all series in the library with book counts.",
  }, async () => {
    const series = await listSeries();
    return {
      content: [{ type: "text", text: JSON.stringify(series, null, 2) }],
    };
  });

  server.registerTool("get_download_link", {
    description: "Get a download link for a book file. Returns the Calibre server URL for the file.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      format: z.string().describe("File format (e.g. EPUB, PDF, MOBI)"),
    },
  }, async ({ id, format }) => {
    const url = getDownloadUrl(id, format);
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

  server.registerTool("set_metadata", {
    description: "Update metadata fields on a book in the Calibre library. Fields can include: title, authors (as array), tags (as array), series, publisher, rating, comments, etc.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      fields: z.record(z.string(), z.unknown()).describe('Metadata fields to set (e.g. {"title": "New Title", "tags": ["fiction", "sci-fi"], "authors": ["Author Name"]})'),
    },
  }, async ({ id, fields }) => {
    try {
      await setMetadata(id, fields as Record<string, unknown>);
      return {
        content: [{ type: "text", text: "Metadata updated successfully." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("convert_book", {
    description: "Convert a book to a different format (e.g. EPUB to MOBI). This may take a few minutes.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      from_format: z.string().describe("Source format (e.g. EPUB)"),
      to_format: z.string().describe("Target format (e.g. MOBI, PDF, AZW3)"),
    },
  }, async ({ id, from_format, to_format }) => {
    try {
      const result = await convertBook(id, from_format, to_format);
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

  server.registerTool("fetch_metadata", {
    description: "Search online for book metadata by title, author, or ISBN. Returns multiple results from Google Books that the user can choose from. Use this when a book's metadata is missing or incorrect.",
    inputSchema: {
      title: z.string().describe("Book title to search for"),
      authors: z.string().optional().describe("Author name to narrow the search"),
      isbn: z.string().optional().describe("ISBN to search for (most precise)"),
    },
  }, async ({ title, authors, isbn }) => {
    try {
      const results = await fetchMetadata(title, authors, isbn);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No metadata results found." }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
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
