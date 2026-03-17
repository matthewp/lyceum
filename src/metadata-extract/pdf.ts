import { PDFParse } from "pdf-parse";
import type { BookMetadata } from "./types.ts";

export async function extractPdf(data: Buffer): Promise<BookMetadata> {
  const parser = new PDFParse(new Uint8Array(data));
  try {
    const result = await parser.getInfo();
    const info = result.info ?? {};

    return {
      title: info.Title || null,
      authors: info.Author ? [info.Author] : [],
      publisher: null,
      description: null,
      date: parsePdfDate(info.CreationDate) || null,
      language: info.Language || null,
      isbn: null,
      cover: null,
      subjects: [],
    };
  } finally {
    parser.destroy();
  }
}

function parsePdfDate(raw: string | undefined): string | null {
  if (!raw) return null;
  // PDF dates look like "D:20150401223548+08'00'"
  const match = raw.match(/^D:(\d{4})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}
