import sharp from "sharp";

const PALETTE: Array<{ color: string }> = [
  { color: "#1e3a5f" }, // navy
  { color: "#5f1e3a" }, // burgundy
  { color: "#1e5f3a" }, // forest
  { color: "#3a1e5f" }, // indigo
  { color: "#5f3a1e" }, // walnut
  { color: "#1e5f5f" }, // teal
  { color: "#5f5f1e" }, // olive
  { color: "#5f1e1e" }, // crimson
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function generateArticleCover(
  title: string,
  author: string,
  hostname: string,
): Promise<Buffer> {
  const W = 600;
  const H = 900;

  const { color } = PALETTE[hashString(hostname) % PALETTE.length];

  // Border geometry
  const B1 = 20; // outer border inset
  const B2 = 30; // inner border inset
  const PAD = 54; // text left/right padding (same as inner border + extra)

  // Title: ~18 chars per line at 42px in ~492px wide column
  const titleFontSize = 42;
  const titleLineH = titleFontSize * 1.45;
  const titleLines = wrapText(title, 18);
  const titleBlockH = titleLines.length * titleLineH;

  // Divider between title and author
  const DIVIDER_GAP = 32;
  const DIVIDER_H = 20;
  const AUTHOR_GAP = 20;

  // Author: ~36 chars per line at 24px
  const authorFontSize = 24;
  const authorLineH = authorFontSize * 1.4;
  const authorLines = wrapText(author, 36).slice(0, 2);
  const authorBlockH = authorLines.length * authorLineH;

  const totalH = titleBlockH + DIVIDER_GAP + DIVIDER_H + AUTHOR_GAP + authorBlockH;

  // Center content vertically in the space between inner border + padding
  const zoneTop = B2 + 40;
  const zoneBot = H - B2 - 60; // leave room for hostname at bottom
  const zoneH = zoneBot - zoneTop;
  const titleStartY = zoneTop + Math.max(0, (zoneH - totalH) / 2);
  const dividerY = titleStartY + titleBlockH + DIVIDER_GAP;
  const authorStartY = dividerY + DIVIDER_H + AUTHOR_GAP;

  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${titleStartY + i * titleLineH}" font-family="DejaVu Sans, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#1a1a1a" text-anchor="middle" dominant-baseline="hanging">${escXml(line)}</text>`,
    )
    .join("\n  ");

  const authorSvg = authorLines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${authorStartY + i * authorLineH}" font-family="DejaVu Sans, sans-serif" font-size="${authorFontSize}" fill="#555555" text-anchor="middle" dominant-baseline="hanging">${escXml(line)}</text>`,
    )
    .join("\n  ");

  // Divider: a horizontal rule with a small diamond ornament in the center
  const divMidY = dividerY + DIVIDER_H / 2;
  const divLeft = PAD + 20;
  const divRight = W - PAD - 20;
  const DIAMOND = 5;
  const dividerSvg = `
  <line x1="${divLeft}" y1="${divMidY}" x2="${W / 2 - DIAMOND * 2 - 4}" y2="${divMidY}" stroke="${color}" stroke-width="1"/>
  <polygon points="${W / 2},${divMidY - DIAMOND} ${W / 2 + DIAMOND},${divMidY} ${W / 2},${divMidY + DIAMOND} ${W / 2 - DIAMOND},${divMidY}" fill="${color}"/>
  <line x1="${W / 2 + DIAMOND * 2 + 4}" y1="${divMidY}" x2="${divRight}" y2="${divMidY}" stroke="${color}" stroke-width="1"/>`;

  // Corner ornaments: small diamonds at the 4 corners of the inner border
  function corner(cx: number, cy: number): string {
    const s = 6;
    return `<polygon points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="${color}"/>`;
  }

  const corners = [
    corner(B2, B2),
    corner(W - B2, B2),
    corner(B2, H - B2),
    corner(W - B2, H - B2),
  ].join("\n  ");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- White background -->
  <rect width="${W}" height="${H}" fill="white"/>

  <!-- Outer border -->
  <rect x="${B1}" y="${B1}" width="${W - B1 * 2}" height="${H - B1 * 2}"
        fill="none" stroke="${color}" stroke-width="2"/>

  <!-- Inner border -->
  <rect x="${B2}" y="${B2}" width="${W - B2 * 2}" height="${H - B2 * 2}"
        fill="none" stroke="${color}" stroke-width="0.75"/>

  <!-- Corner diamonds -->
  ${corners}

  <!-- Title -->
  ${titleSvg}

  <!-- Ornamental divider -->
  ${dividerSvg}

  <!-- Author -->
  ${authorSvg}

  <!-- Hostname at bottom -->
  <text x="${W / 2}" y="${H - B2 - 14}" font-family="DejaVu Sans, sans-serif" font-size="13" fill="#999999" text-anchor="middle">${escXml(hostname)}</text>
</svg>`;

  return sharp(Buffer.from(svg))
    .jpeg({ progressive: false, quality: 90 })
    .toBuffer();
}
