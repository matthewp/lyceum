export interface MetadataResult {
  source: string;
  title: string;
  authors: string[];
  publisher: string | null;
  pubdate: string | null;
  description: string | null;
  isbn: string | null;
  tags: string[];
  language: string | null;
  cover_url: string | null;
  identifiers: Record<string, string>;
}

export async function fetchMetadata(
  title: string,
  authors?: string,
  isbn?: string
): Promise<MetadataResult[]> {
  const results = await Promise.allSettled([
    searchGoogleBooks(title, authors, isbn),
  ]);

  const all: MetadataResult[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }
  return all;
}

async function searchGoogleBooks(
  title: string,
  authors?: string,
  isbn?: string
): Promise<MetadataResult[]> {
  let query: string;
  if (isbn) {
    query = `isbn:${isbn}`;
  } else {
    query = `intitle:${title}`;
    if (authors) query += `+inauthor:${authors}`;
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`;
  console.log(`[metadata] Google Books: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[metadata] Google Books error: ${res.status}`);
    return [];
  }

  const data = await res.json() as any;
  if (!data.items?.length) return [];

  return data.items.map((item: any) => {
    const vol = item.volumeInfo;
    const identifiers: Record<string, string> = {
      google: item.id,
    };

    const isbns = vol.industryIdentifiers ?? [];
    const isbn13 = isbns.find((i: any) => i.type === "ISBN_13");
    const isbn10 = isbns.find((i: any) => i.type === "ISBN_10");
    const isbnVal = isbn13?.identifier ?? isbn10?.identifier ?? null;
    if (isbnVal) identifiers.isbn = isbnVal;

    return {
      source: "google_books",
      title: vol.title ?? "",
      authors: vol.authors ?? [],
      publisher: vol.publisher ?? null,
      pubdate: vol.publishedDate ?? null,
      description: vol.description ?? null,
      isbn: isbnVal,
      tags: vol.categories ?? [],
      language: vol.language ?? null,
      cover_url: vol.imageLinks?.thumbnail?.replace("http:", "https:") ?? null,
      identifiers,
    } satisfies MetadataResult;
  });
}
