import { test } from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { parseStringPromise } from "xml2js";
import { injectEpubMetadata } from "../src/epub-inject.ts";

// --- Helper: build a minimal valid epub in memory ---

interface MinimalEpubOptions {
  opfPath?: string;       // defaults to "OEBPS/content.opf"
  title?: string;
  authors?: string[];
  existingCoverHref?: string;       // OPF2-style cover (via <meta name="cover">)
  existingCoverHrefOpf3?: string;   // OPF3-style cover (via properties="cover-image")
}

function buildEpub(opts: MinimalEpubOptions = {}): Buffer {
  const {
    opfPath = "OEBPS/content.opf",
    title = "Test Title",
    authors = ["Test Author"],
    existingCoverHref,
    existingCoverHrefOpf3,
  } = opts;

  const opfDir = opfPath.includes("/") ? opfPath.split("/").slice(0, -1).join("/") : ".";

  const creatorsXml = authors
    .map(a => `<dc:creator opf:role="aut">${a}</dc:creator>`)
    .join("\n    ");

  let coverMeta = "";
  let coverManifestItem = "";
  if (existingCoverHref) {
    coverMeta = `\n    <meta name="cover" content="existing-cover"/>`;
    coverManifestItem = `\n    <item id="existing-cover" href="${existingCoverHref}" media-type="image/jpeg"/>`;
  } else if (existingCoverHrefOpf3) {
    coverManifestItem = `\n    <item id="existing-cover" href="${existingCoverHrefOpf3}" media-type="image/jpeg" properties="cover-image"/>`;
  }

  const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${title}</dc:title>
    ${creatorsXml}${coverMeta}
  </metadata>
  <manifest>${coverManifestItem}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx"/>
</package>`;

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const zip = new AdmZip();
  // mimetype must be first, stored uncompressed
  zip.addFile("mimetype", Buffer.from("application/epub+zip"), "", 0);
  zip.addFile("META-INF/container.xml", Buffer.from(containerXml));
  zip.addFile(opfPath, Buffer.from(opfXml));
  if (existingCoverHref) {
    const coverZipPath = opfDir === "." ? existingCoverHref : `${opfDir}/${existingCoverHref}`;
    zip.addFile(coverZipPath, Buffer.from("fake-cover-bytes"));
  }
  if (existingCoverHrefOpf3) {
    const coverZipPath = opfDir === "." ? existingCoverHrefOpf3 : `${opfDir}/${existingCoverHrefOpf3}`;
    zip.addFile(coverZipPath, Buffer.from("fake-cover-bytes"));
  }
  return zip.toBuffer();
}

async function parseOpf(epubBytes: Buffer): Promise<any> {
  const zip = new AdmZip(epubBytes);
  const containerDoc = await parseStringPromise(
    zip.readAsText("META-INF/container.xml")
  ) as any;
  const opfPath = containerDoc.container.rootfiles[0].rootfile[0]["$"]["full-path"];
  return parseStringPromise(zip.readAsText(opfPath));
}

function fakeCover(): Buffer {
  return Buffer.from("fake-cover-jpeg-bytes");
}

// --- Tests ---

test("title is updated in output OPF", async () => {
  const epub = buildEpub({ title: "Old Title" });
  const result = await injectEpubMetadata(epub, { title: "New Title", authors: ["Author"], cover: null });
  const opf = await parseOpf(result);
  const title = opf.package.metadata[0]["dc:title"][0];
  assert.equal(typeof title === "object" ? title._ : title, "New Title");
});

test("single author replaces existing dc:creator", async () => {
  const epub = buildEpub({ authors: ["Old Author"] });
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["New Author"], cover: null });
  const opf = await parseOpf(result);
  const creators = opf.package.metadata[0]["dc:creator"];
  assert.equal(creators.length, 1);
  const name = typeof creators[0] === "object" ? creators[0]._ : creators[0];
  assert.equal(name, "New Author");
});

test("multiple authors produce multiple dc:creator elements", async () => {
  const epub = buildEpub({ authors: ["Old Author"] });
  const result = await injectEpubMetadata(epub, {
    title: "Title",
    authors: ["Author A", "Author B"],
    cover: null,
  });
  const opf = await parseOpf(result);
  const creators = opf.package.metadata[0]["dc:creator"];
  assert.equal(creators.length, 2);
  const names = creators.map((c: any) => (typeof c === "object" ? c._ : c));
  assert.deepEqual(names, ["Author A", "Author B"]);
});

test("empty authors list removes dc:creator", async () => {
  const epub = buildEpub({ authors: ["Some Author"] });
  const result = await injectEpubMetadata(epub, { title: "Title", authors: [], cover: null });
  const opf = await parseOpf(result);
  const creators = opf.package.metadata[0]["dc:creator"];
  assert.equal(creators, undefined);
});

test("cover injection into epub with no existing cover", async () => {
  const epub = buildEpub();
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["Author"], cover: fakeCover() });

  const zip = new AdmZip(result);
  const opf = await parseOpf(result);
  const metadata = opf.package.metadata[0];
  const manifest = opf.package.manifest[0];

  // Cover file present in zip
  assert.ok(zip.getEntry("OEBPS/images/lyceum-cover.jpg"), "cover file not in zip");

  // Manifest item present
  const items: any[] = manifest.item;
  const coverItem = items.find((i: any) => i["$"].id === "lyceum-injected-cover");
  assert.ok(coverItem, "manifest item not found");
  assert.equal(coverItem["$"]["media-type"], "image/jpeg");

  // OPF2 meta present
  const metas: any[] = metadata.meta ?? [];
  const coverMeta = metas.find((m: any) => m["$"].name === "cover");
  assert.ok(coverMeta, "OPF2 cover meta not found");
  assert.equal(coverMeta["$"].content, "lyceum-injected-cover");
});

test("cover injection replaces existing OPF2 cover", async () => {
  const epub = buildEpub({ existingCoverHref: "images/old-cover.jpg" });
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["Author"], cover: fakeCover() });

  const zip = new AdmZip(result);
  assert.equal(zip.getEntry("OEBPS/images/old-cover.jpg"), null, "old cover still in zip");
  assert.ok(zip.getEntry("OEBPS/images/lyceum-cover.jpg"), "new cover not in zip");

  const opf = await parseOpf(result);
  const metas: any[] = opf.package.metadata[0].meta ?? [];
  const coverMeta = metas.find((m: any) => m["$"].name === "cover");
  assert.ok(coverMeta);
  assert.equal(coverMeta["$"].content, "lyceum-injected-cover");
});

test("cover injection replaces existing OPF3 cover", async () => {
  const epub = buildEpub({ existingCoverHrefOpf3: "images/old-cover.jpg" });
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["Author"], cover: fakeCover() });

  const zip = new AdmZip(result);
  assert.equal(zip.getEntry("OEBPS/images/old-cover.jpg"), null, "old cover still in zip");
  assert.ok(zip.getEntry("OEBPS/images/lyceum-cover.jpg"), "new cover not in zip");
});

test("null cover leaves existing cover entries unchanged", async () => {
  const epub = buildEpub({ existingCoverHref: "images/original.jpg" });
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["Author"], cover: null });

  const zip = new AdmZip(result);
  assert.ok(zip.getEntry("OEBPS/images/original.jpg"), "original cover was removed");

  const opf = await parseOpf(result);
  const metas: any[] = opf.package.metadata[0].meta ?? [];
  const coverMeta = metas.find((m: any) => m["$"]?.name === "cover");
  assert.ok(coverMeta, "OPF2 cover meta was removed");
  assert.equal(coverMeta["$"].content, "existing-cover");
});

test("OPF at root — cover path is images/lyceum-cover.jpg not OEBPS/images/...", async () => {
  const epub = buildEpub({ opfPath: "content.opf" });
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["Author"], cover: fakeCover() });

  const zip = new AdmZip(result);
  assert.ok(zip.getEntry("images/lyceum-cover.jpg"), "cover not at root-relative path");
  assert.equal(zip.getEntry("OEBPS/images/lyceum-cover.jpg"), null, "cover wrongly nested under OEBPS");
});

test("malformed input returns original bytes unchanged", async () => {
  const garbage = Buffer.from("this is not a zip file");
  const result = await injectEpubMetadata(garbage, { title: "Title", authors: ["Author"], cover: null });
  assert.deepEqual(result, garbage);
});

test("mimetype entry is present after injection", async () => {
  // Note: adm-zip sorts entries alphabetically when building a zip from scratch,
  // so "META-INF" precedes "mimetype" in our test helper output. For real epub
  // files (loaded from buffer), adm-zip preserves original entry order and
  // updateFile() is in-place, so mimetype stays first throughout injection.
  const epub = buildEpub();
  const result = await injectEpubMetadata(epub, { title: "Title", authors: ["Author"], cover: fakeCover() });
  const zip = new AdmZip(result);
  const entry = zip.getEntry("mimetype");
  assert.ok(entry, "mimetype entry missing from output");
  assert.equal(entry.getData().toString("utf-8"), "application/epub+zip");
});
