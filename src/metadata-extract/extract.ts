import { extname } from "node:path";
import type { BookMetadata } from "./types.ts";

const EMPTY: BookMetadata = {
  title: null,
  authors: [],
  publisher: null,
  description: null,
  date: null,
  language: null,
  isbn: null,
  cover: null,
  subjects: [],
};

/**
 * Extract metadata from an ebook file.
 *
 * @param data - The raw file contents
 * @param filename - Original filename (used to determine format)
 * @returns Extracted metadata, with nulls for fields that couldn't be read
 */
export async function extractMetadata(data: Buffer, filename: string): Promise<BookMetadata> {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case ".epub": {
      const { extractEpub } = await import("./epub.ts");
      return extractEpub(data);
    }
    case ".pdf": {
      const { extractPdf } = await import("./pdf.ts");
      return extractPdf(data);
    }
    case ".mobi":
    case ".azw3":
    case ".azw": {
      const { extractMobi } = await import("./mobi.ts");
      return extractMobi(data);
    }
    default:
      return { ...EMPTY };
  }
}
