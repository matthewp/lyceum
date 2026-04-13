import sharp from "sharp";

export async function normalizeToBaselineJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .jpeg({ progressive: false, quality: 90 })
    .toBuffer();
}
