import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeToBaselineJpeg } from "../src/image-normalize.ts";

async function makeImage(format: "jpeg" | "png" | "webp", opts: object = {}): Promise<Buffer> {
  return sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 128, g: 64, b: 32 } },
  })
    .toFormat(format, opts)
    .toBuffer();
}

test("PNG input produces a JPEG output", async () => {
  const png = await makeImage("png");
  const out = await normalizeToBaselineJpeg(png);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
});

test("WebP input produces a JPEG output", async () => {
  const webp = await makeImage("webp");
  const out = await normalizeToBaselineJpeg(webp);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
});

test("progressive JPEG becomes baseline", async () => {
  const progressive = await makeImage("jpeg", { progressive: true });
  const out = await normalizeToBaselineJpeg(progressive);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.isProgressive, false);
});

test("baseline JPEG passthrough remains baseline", async () => {
  const baseline = await makeImage("jpeg", { progressive: false });
  const out = await normalizeToBaselineJpeg(baseline);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.isProgressive, false);
});

test("output is a non-empty Buffer", async () => {
  const png = await makeImage("png");
  const out = await normalizeToBaselineJpeg(png);
  assert.ok(Buffer.isBuffer(out));
  assert.ok(out.byteLength > 0);
});

test("invalid input throws", async () => {
  const garbage = Buffer.from("this is not an image");
  await assert.rejects(() => normalizeToBaselineJpeg(garbage));
});
