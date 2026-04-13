/**
 * Returns a safe filename for a book download, e.g. "Dune - Frank Herbert.epub".
 * Special characters that are illegal on common filesystems are replaced with "_".
 */
export function bookFilename(title: string, authors: string[], format: string): string {
  const ext = format.toLowerCase();
  const authorStr = authors.join(" & ");
  const rawName = authorStr ? `${title} - ${authorStr}.${ext}` : `${title}.${ext}`;
  return rawName.replace(/[:<>?*"|\\\/]/g, "_");
}

/**
 * Returns the unsanitized display filename for a book, e.g. "Dune - Frank Herbert.epub".
 * Used for computing MD5-based document identifiers (e.g. KOReader filename mode).
 */
export function bookFilenameRaw(title: string, authors: string[], format: string): string {
  const ext = format.toLowerCase();
  const authorStr = authors.join(" & ");
  return authorStr ? `${title} - ${authorStr}.${ext}` : `${title}.${ext}`;
}
