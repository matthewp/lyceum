import { EPub } from "epub2";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { BookMetadata } from "./types.ts";

export async function extractEpub(data: Buffer): Promise<BookMetadata> {
  // epub2 requires a file path, so write to a temp file
  const dir = join(tmpdir(), `lyceum-epub-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "book.epub");
  writeFileSync(filePath, data);

  try {
    const epub = await EPub.createAsync(filePath);
    const meta = epub.metadata;

    // Extract cover image
    let cover: Buffer | null = null;
    const images = epub.listImage();
    const coverImage = images.find(
      (img: any) => img.id === "cover" || img.id === "cover-image"
    ) ?? images[0];

    if (coverImage) {
      try {
        const [imageData] = await epub.getImageAsync(coverImage.id);
        cover = Buffer.from(imageData);
      } catch {
        // cover extraction failed, not critical
      }
    }

    // Parse subjects (can be string or array)
    const subjects: string[] = [];
    if (meta.subject) {
      if (Array.isArray(meta.subject)) {
        subjects.push(...meta.subject);
      } else {
        subjects.push(...meta.subject.split(/[,;]\s*/));
      }
    }

    return {
      title: meta.title || null,
      authors: meta.creator ? [meta.creator] : [],
      publisher: meta.publisher || null,
      description: meta.description || null,
      date: meta.date || null,
      language: meta.language || null,
      isbn: meta.ISBN || null,
      cover,
      subjects,
    };
  } finally {
    // Clean up temp files
    try {
      const { rmSync } = await import("node:fs");
      rmSync(dir, { recursive: true });
    } catch {
      // best effort cleanup
    }
  }
}
