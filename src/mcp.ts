import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listBooks,
  getBook,
  searchBooks,
  listAuthors,
  listTags,
  listSeries,
  setMetadata,
  setCover,
  deleteBooks,
  removeFormats,
  convertBook,
  downloadBook,
  bookDownloadPath,
} from "./calibre.ts";
import { createSignedUrl } from "./auth.ts";
import { fetchMetadata } from "./metadata.ts";
import {
  addDevice,
  verifyDevice,
  listDevices,
  removeDevice,
  sendToDevice,
} from "./devices/index.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "lyceum",
    version: "1.0.0",
    icons: [{
      src: `${BASE_URL}/public/favicon.png`,
      mimeType: "image/png",
    }],
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
    description: "Get a temporary download link for a book file. Returns a signed URL that expires in 5 minutes.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      format: z.string().describe("File format (e.g. EPUB, PDF, MOBI)"),
    },
  }, async ({ id, format }) => {
    const url = createSignedUrl(BASE_URL, `/download${bookDownloadPath(format, id)}`, 300);
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

  server.registerTool("get_view_link", {
    description: "Get a temporary link to view a book's details page showing its cover and metadata. Returns a signed URL that expires in 10 minutes. IMPORTANT: Always present this URL as a markdown link like [View Book](url) so the full URL is preserved in the href.",
    inputSchema: {
      id: z.number().describe("The book ID"),
    },
  }, async ({ id }) => {
    const book = await getBook(id);
    const url = createSignedUrl(BASE_URL, `/view/${id}`, 600);
    const label = book ? `View "${book.title}"` : "View book";
    return {
      content: [{ type: "text", text: `[${label}](${url})` }],
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

  server.registerTool("set_cover", {
    description: "Set a book's cover image from a URL. Use this after fetch_metadata to apply a cover from the returned cover_url.",
    inputSchema: {
      id: z.number().describe("The book ID"),
      image_url: z.string().describe("URL of the cover image to download and set"),
    },
  }, async ({ id, image_url }) => {
    try {
      await setCover(id, image_url);
      return {
        content: [{ type: "text", text: "Cover updated successfully." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("remove_book", {
    description: "Permanently remove one or more books from the Calibre library. This cannot be undone.",
    inputSchema: {
      ids: z.array(z.number()).describe("Array of book IDs to remove"),
    },
  }, async ({ ids }) => {
    try {
      await deleteBooks(ids);
      const label = ids.length === 1 ? `Book ${ids[0]} removed.` : `${ids.length} books removed.`;
      return {
        content: [{ type: "text", text: label }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("remove_format", {
    description: "Remove one or more file formats from a book (e.g. remove the MOBI copy but keep EPUB).",
    inputSchema: {
      id: z.number().describe("The book ID"),
      formats: z.array(z.string()).describe("Formats to remove (e.g. [\"EPUB\", \"MOBI\"])"),
    },
  }, async ({ id, formats }) => {
    try {
      await removeFormats(id, formats);
      return {
        content: [{ type: "text", text: `Removed ${formats.join(", ")} from book ${id}.` }],
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

  // --- Device tools ---

  server.registerTool("add_device", {
    description: "Start adding an e-reader device. For Boox: params should include email and optionally region (us, eu, or cn, defaults to eu). A verification code will be sent. For Xteink: params should include email and password. Logs in and lists bound devices.",
    inputSchema: {
      type: z.enum(["boox", "xteink"]).describe("Device type: boox (Boox e-readers via Send2Boox) or xteink (Xteink X3/X4 via XT Cloud)"),
      name: z.string().describe("A friendly name for this device"),
      params: z.record(z.string(), z.string()).describe("Type-specific parameters. Boox: {email, region?}. Xteink: {email, password}."),
    },
  }, async ({ type, name, params }) => {
    try {
      const result = await addDevice(type, name, params);
      return {
        content: [{ type: "text", text: result.message }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("verify_device", {
    description: "Complete device setup by providing the verification code received by email.",
    inputSchema: {
      name: z.string().describe("The device name used in add_device"),
      code: z.string().describe("The verification code"),
    },
  }, async ({ name, code }) => {
    try {
      const device = await verifyDevice(name, { code });
      return {
        content: [{ type: "text", text: `Device "${device.name}" (${device.type}) added successfully.` }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("list_devices", {
    description: "List all configured e-reader devices.",
  }, async () => {
    const devices = listDevices();
    if (devices.length === 0) {
      return {
        content: [{ type: "text", text: "No devices configured. Use add_device to set one up." }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(devices, null, 2) }],
    };
  });

  server.registerTool("remove_device", {
    description: "Remove a configured e-reader device.",
    inputSchema: {
      name: z.string().describe("The device name to remove"),
    },
  }, async ({ name }) => {
    try {
      removeDevice(name);
      return {
        content: [{ type: "text", text: `Device "${name}" removed.` }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: e.message }],
        isError: true,
      };
    }
  });

  server.registerTool("send_to_device", {
    description: "Send a book to an e-reader device. Downloads the book from the Calibre library and sends it to the specified device.",
    inputSchema: {
      device_name: z.string().describe("Name of the target device"),
      book_id: z.coerce.number().describe("The book ID"),
      format: z.string().describe("File format (e.g. EPUB, PDF)"),
    },
  }, async ({ device_name, book_id, format }) => {
    try {
      // Get book metadata for the filename
      const book = await getBook(book_id);
      if (!book) throw new Error(`Book ${book_id} not found`);
      const ext = format.toLowerCase();
      const authors = (book.authors as string[])?.join(" & ") ?? "";
      const rawName = authors ? `${book.title} - ${authors}.${ext}` : `${book.title}.${ext}`;
      const filename = rawName.replace(/[:<>?*"|\\\/]/g, "_");

      const downloadPath = bookDownloadPath(format, book_id);
      const res = await downloadBook(downloadPath);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to download book (${res.status}): ${body}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await sendToDevice(device_name, buf, filename);
      return {
        content: [{ type: "text", text: `"${book.title}" sent to "${device_name}".` }],
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
