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
    // Use event-based API so we can recover metadata even when
    // epub2 fails on a bad TOC or other non-critical parse error.
    const epub = await new Promise<InstanceType<typeof EPub>>((resolve) => {
      const ep = new EPub(filePath);
      ep.on("end", () => resolve(ep));
      ep.on("error", () => resolve(ep)); // metadata is still available
      ep.parse();
    });
    const meta = epub.metadata;

    // Extract cover image
    let cover: Buffer | null = null;
    try {
      const images = epub.listImage();
      const coverImage = images.find(
        (img: any) => img.id === "cover" || img.id === "cover-image" || img.id === "bookcover"
      ) ?? images.find((img: any) => /cover/i.test(img.href)) ?? images[0];

      if (coverImage) {
        const [imageData] = await epub.getImageAsync(coverImage.id as string);
        cover = Buffer.from(imageData);
      }
    } catch {
      // cover extraction failed, not critical
    }

    // Parse subjects (can be string or array)
    const subjects: string[] = [];
    if (meta.subject) {
      if (Array.isArray(meta.subject)) {
        subjects.push(...meta.subject);
      } else {
        subjects.push(...(meta.subject as string).split(/[,;]\s*/));
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
