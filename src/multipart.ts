export interface UploadedFile {
  filename: string;
  data: Buffer;
}

export function parseMultipart(body: Buffer, contentType: string): UploadedFile | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!match) return null;
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);

  const parts = splitBuffer(body, boundary);

  // parts[0] is before first boundary (empty), last is "--\r\n" (closing)
  for (let i = 1; i < parts.length - 1; i++) {
    let part = parts[i];

    // Strip leading \r\n
    if (part[0] === 0x0d && part[1] === 0x0a) part = part.subarray(2);
    // Strip trailing \r\n
    if (part[part.length - 2] === 0x0d && part[part.length - 1] === 0x0a) {
      part = part.subarray(0, part.length - 2);
    }

    const headerEnd = indexOf(part, Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString();
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!filenameMatch) continue;

    return {
      filename: filenameMatch[1],
      data: Buffer.from(part.subarray(headerEnd + 4)),
    };
  }

  return null;
}

function splitBuffer(buf: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;

  while (start < buf.length) {
    const idx = indexOf(buf, delimiter, start);
    if (idx === -1) {
      parts.push(buf.subarray(start));
      break;
    }
    parts.push(buf.subarray(start, idx));
    start = idx + delimiter.length;
  }

  return parts;
}

function indexOf(buf: Buffer, search: Buffer, fromIndex = 0): number {
  for (let i = fromIndex; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}
