import { parseHTML } from "linkedom";
import { DefuddleClass as Defuddle } from "defuddle/node";
import { zipSync } from "fflate";
import { bookFilename } from "./book-filename.ts";

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1$|fc|fd)/i;

function assertSafeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL scheme not allowed: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || PRIVATE_IP_RE.test(host)) {
    throw new Error(`URL resolves to a private or reserved address: ${host}`);
  }
  const ipv4Parts = host.split(".");
  if (ipv4Parts.length === 4) {
    const [a, b] = ipv4Parts.map(Number);
    if (a === 172 && b >= 16 && b <= 31) {
      throw new Error(`URL resolves to a private or reserved address: ${host}`);
    }
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toDateString(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().split("T")[0];
  return value.split("T")[0];
}

export async function urlToEpub(url: string): Promise<{ data: Buffer; filename: string; title: string; author: string }> {
  assertSafeUrl(url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();

  const { document } = parseHTML(html);
  const result = new Defuddle(document as unknown as Document, { url }).parse();

  if (!result.content) {
    throw new Error(`No article content found at ${url}`);
  }

  const hostname = new URL(url).hostname;
  const title = result.title || hostname;
  const author = result.author || result.site || hostname;
  const date = toDateString(result.published);
  const description = result.description || "";
  const language = result.language || "en";
  const uuid = crypto.randomUUID();

  const enc = new TextEncoder();

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:date>${escapeXml(date)}</dc:date>
    <dc:description>${escapeXml(description)}</dc:description>
    <dc:source>${escapeXml(url)}</dc:source>
    <dc:language>${escapeXml(language)}</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="content" href="content.html" media-type="text/html"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="content"/>
  </spine>
</package>`;

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel>
        <text>${escapeXml(title)}</text>
      </navLabel>
      <content src="content.html"/>
    </navPoint>
  </navMap>
</ncx>`;

  const contentHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
</head>
<body>
${result.content}
</body>
</html>`;

  const zipped = zipSync({
    "mimetype": [enc.encode("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": enc.encode(containerXml),
    "OEBPS/content.opf": enc.encode(opf),
    "OEBPS/toc.ncx": enc.encode(ncx),
    "OEBPS/content.html": enc.encode(contentHtml),
  });

  const filename = bookFilename(title, [author], "epub");

  return {
    data: Buffer.from(zipped),
    filename,
    title,
    author,
  };
}
