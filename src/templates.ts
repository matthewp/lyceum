import { html, unsafeHTML, UnsafeHTML, SafeHTML } from "./html.ts";
import type { BookSummary } from "./storage/types.ts";

function header(): SafeHTML {
  return html`<div class="header"><a href="/"><img src="/public/logo.webp" alt="">Lyceum</a></div>`;
}

function cssLinks(paths: string[]): UnsafeHTML {
  return unsafeHTML(paths.map(p => `<link rel="stylesheet" href="${p}">`).join("\n  "));
}

function scriptTags(urls: string[]): UnsafeHTML {
  return unsafeHTML(urls.map(u => `<script src="${u}" defer></script>`).join("\n  "));
}

function layout(title: SafeHTML | string, stylesheets: string[], body: SafeHTML, scripts: string[] = []): SafeHTML {
  return html`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${typeof title === "string" ? title : title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/public/favicon.png">
  ${cssLinks(stylesheets)}
  ${scriptTags(scripts)}
</head>
<body>
  ${body}
</body>
</html>`;
}

const APP_SCRIPTS = ["https://unpkg.com/quicklink"];

function appLayout(title: SafeHTML | string, pageStyles: string[], card: SafeHTML): SafeHTML {
  const stylesheets = ["/public/css/base.css", "/public/css/layout.css", ...pageStyles];
  const body = html`
  ${header()}
  <div class="container">
    <div class="card">
      ${card}
    </div>
  </div>

  <script>addEventListener("load",()=>quicklink.listen())</script>`;
  return layout(title, stylesheets, body, APP_SCRIPTS);
}

export function landingPage(baseUrl: string): SafeHTML {
  const body = html`
  <img src="/public/logo.webp" alt="Lyceum" class="logo">
  <h1>Lyceum</h1>
  <p class="tagline">An <span class="mcp-badge">MCP</span> bridge to your Calibre library.</p>
  <p>Lyceum lets AI assistants browse, search, and manage your ebook collection through the Model Context Protocol.</p>
  <ul class="features">
    <li>Search and browse your Calibre library</li>
    <li>Download and upload books</li>
    <li>Edit metadata and covers</li>
    <li>Convert between formats</li>
    <li>Send books to e-readers</li>
  </ul>
  <h2>Connect</h2>
  <p>Point your MCP-compatible AI tool to:</p>
  <pre><code>${baseUrl}/mcp</code></pre>
  <footer>
    <a href="https://github.com/matthewp/lyceum">${unsafeHTML('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>')} GitHub</a>
  </footer>`;

  return layout("Lyceum", ["/public/css/base.css", "/public/css/landing.css"], body);
}

export function authorizePage(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  error?: string;
}): SafeHTML {
  const errorMsg = opts.error
    ? html`<p class="error">${opts.error}</p>`
    : html``;

  const card = html`
    <h1>Authorize</h1>
    <p>An application is requesting access to your Calibre library.</p>
    <form method="POST">
      <input type="hidden" name="client_id" value="${opts.clientId}">
      <input type="hidden" name="redirect_uri" value="${opts.redirectUri}">
      <input type="hidden" name="state" value="${opts.state}">
      <input type="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Authorize</button>
      ${errorMsg}
    </form>`;

  return appLayout("Lyceum - Authorize", ["/public/css/forms.css"], card);
}

export function uploadPage(opts?: { success?: string; error?: string }): SafeHTML {
  let message = html``;
  if (opts?.success) {
    message = html`<p class="success">${opts.success}</p>`;
  } else if (opts?.error) {
    message = html`<p class="error">${opts.error}</p>`;
  }

  const card = html`
    <h1>Upload</h1>
    <p>Upload a book to your Calibre library.</p>
    <form method="POST" enctype="multipart/form-data">
      <input type="file" name="book" accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.txt,.rtf,.docx" required>
      <button type="submit">Upload</button>
      ${message}
    </form>`;

  return appLayout("Lyceum - Upload Book", ["/public/css/forms.css"], card);
}

export function viewBookPage(book: any, coverDataUrl: string): SafeHTML {
  const authors = (book.authors as string[])?.join(", ") ?? "";
  const tags = (book.tags as string[]) ?? [];
  const formats = (book.formats as string[]) ?? [];
  const languages = (book.languages as string[]) ?? [];

  let seriesLine = html``;
  if (book.series) {
    const idx = book.series_index != null ? ` #${book.series_index}` : "";
    seriesLine = html`<div class="meta-row"><span class="label">Series</span><span>${book.series}${idx}</span></div>`;
  }

  let publisherLine = html``;
  if (book.publisher) {
    publisherLine = html`<div class="meta-row"><span class="label">Publisher</span><span>${book.publisher}</span></div>`;
  }

  let ratingLine = html``;
  if (book.rating != null && book.rating > 0) {
    const stars = "\u2605".repeat(Math.round(book.rating / 2)) + "\u2606".repeat(5 - Math.round(book.rating / 2));
    ratingLine = html`<div class="meta-row"><span class="label">Rating</span><span>${stars}</span></div>`;
  }

  const pubdate = book.pubdate ? new Date(book.pubdate).getFullYear() : null;
  let pubdateLine = html``;
  if (pubdate && pubdate > 100) {
    pubdateLine = html`<div class="meta-row"><span class="label">Published</span><span>${pubdate}</span></div>`;
  }

  const coverImg = coverDataUrl
    ? html`<img class="cover" src="${coverDataUrl}" alt="Cover" style="view-transition-name: cover-${book.id};">`
    : html`<div class="cover no-cover">No Cover</div>`;

  const description = book.comments ?? "";

  const languagesLine = languages.length
    ? html`<div class="meta-row"><span class="label">Language</span><span>${languages.join(", ")}</span></div>`
    : html``;

  const tagsLine = tags.length
    ? html`<div class="meta-row"><span class="label">Tags</span><div class="tags">${unsafeHTML(tags.map((t: string) => html`<span class="tag">${t}</span>`).join(""))}</div></div>`
    : html``;

  const formatsLine = formats.length
    ? html`<div class="meta-row"><span class="label">Formats</span><div class="tags">${unsafeHTML(formats.map((f: string) => html`<span class="format">${f}</span>`).join(""))}</div></div>`
    : html``;

  const descriptionBlock = description
    ? html`<div class="description"><h3>Description</h3>${unsafeHTML(description)}</div>`
    : html``;

  const card = html`
      <div class="book-layout">
        ${coverImg}
        <div class="details">
          <div class="title" style="view-transition-name: title-${book.id};">${book.title}</div>
          <div class="authors">${authors}</div>
          ${seriesLine}
          ${publisherLine}
          ${pubdateLine}
          ${ratingLine}
          ${languagesLine}
          ${tagsLine}
          ${formatsLine}
        </div>
      </div>
      ${descriptionBlock}`;

  return appLayout(html`${book.title} - Lyceum`, ["/public/css/book-detail.css"], card);
}

// --- App pages ---

export function appLoginPage(opts?: { error?: string }): SafeHTML {
  const errorMsg = opts?.error
    ? html`<p class="error">${opts.error}</p>`
    : html``;

  const card = html`
    <h1>Sign In</h1>
    <p>Enter your password to access your library.</p>
    <form method="POST">
      <input type="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Sign In</button>
      ${errorMsg}
    </form>`;

  return appLayout("Lyceum - Sign In", ["/public/css/forms.css"], card);
}

function bookTable(books: BookSummary[]): SafeHTML {
  const rows = books.map(book => {
    const authors = book.authors.join(", ");
    const formats = book.formats.join(", ");
    const tagPills = book.tags.map((t: string) =>
      html`<a class="tag" href="/app/tag/${encodeURIComponent(t)}">${t}</a>`
    );
    const coverCell = book.has_cover
      ? html`<img class="cover-thumb" src="/app/cover/${book.id}" alt="" style="view-transition-name: cover-${book.id};">`
      : html`<span class="no-thumb"></span>`;

    return html`<tr>
      <td>${coverCell}</td>
      <td class="title"><a href="/app/book/${book.id}" style="view-transition-name: title-${book.id};">${book.title}</a></td>
      <td class="authors">${authors}</td>
      <td class="tags">${unsafeHTML(tagPills.map((p: SafeHTML) => p.toString()).join(""))}</td>
      <td class="formats">${formats}</td>
    </tr>`;
  });

  return html`<table>
    <thead>
      <tr>
        <th></th>
        <th>Title</th>
        <th>Author</th>
        <th class="tags">Tags</th>
        <th class="formats">Formats</th>
      </tr>
    </thead>
    <tbody>
      ${unsafeHTML(rows.map(r => r.toString()).join(""))}
    </tbody>
  </table>`;
}

function pagination(page: number, perPage: number, total: number, basePath: string): SafeHTML {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return html``;

  const prev = page > 1
    ? html`<a class="page-link" href="${basePath}?page=${page - 1}">&larr; Previous</a>`
    : html`<span class="page-link disabled">&larr; Previous</span>`;

  const next = page < totalPages
    ? html`<a class="page-link" href="${basePath}?page=${page + 1}">Next &rarr;</a>`
    : html`<span class="page-link disabled">Next &rarr;</span>`;

  return html`<div class="pagination">${prev}<span class="page-info">Page ${page} of ${totalPages}</span>${next}</div>`;
}

export function appBooksPage(books: BookSummary[], total: number, page: number, perPage: number, basePath: string): SafeHTML {
  const card = html`
    <h2 class="page-title">Library <span class="count">(${total})</span></h2>
    ${bookTable(books)}
    ${pagination(page, perPage, total, basePath)}`;

  return appLayout("Lyceum - Library", ["/public/css/book-table.css"], card);
}

export function appTagPage(tag: string, books: BookSummary[], total: number, page: number, perPage: number): SafeHTML {
  const basePath = `/app/tag/${encodeURIComponent(tag)}`;
  const card = html`
    <h2 class="page-title">${tag} <span class="count">(${total})</span></h2>
    ${bookTable(books)}
    ${pagination(page, perPage, total, basePath)}`;

  return appLayout(html`${tag} - Lyceum`, ["/public/css/book-table.css"], card);
}
