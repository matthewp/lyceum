import { html, unsafeHTML, UnsafeHTML, SafeHTML } from "./html.ts";
import type { BookSummary } from "./storage/types.ts";

function cssLinks(paths: string[]): UnsafeHTML {
  return unsafeHTML(paths.map(p => `<link rel="stylesheet" href="${p}">`).join("\n  "));
}

function scriptTags(urls: string[]): UnsafeHTML {
  return unsafeHTML(urls.map(u => `<script src="${u}" defer></script>`).join("\n  "));
}

const THEME_BLOCKING_SCRIPT = `<script>if(localStorage.getItem("theme")==="dark")document.documentElement.setAttribute("data-theme","dark")</script>`;

const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet">`;

function layout(title: SafeHTML | string, stylesheets: string[], body: SafeHTML, opts: { scripts?: string[]; headModule?: string; bodyClass?: string } = {}): SafeHTML {
  const moduleTag = opts.headModule
    ? unsafeHTML(`<script type="module">${opts.headModule}</script>`)
    : unsafeHTML("");
  const bodyClass = opts.bodyClass ? unsafeHTML(` class="${opts.bodyClass}"`) : unsafeHTML("");

  return html`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${typeof title === "string" ? title : title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/public/favicon.png">
  ${unsafeHTML(GOOGLE_FONTS)}
  ${cssLinks(stylesheets)}
  ${scriptTags(opts.scripts ?? [])}
  ${unsafeHTML(THEME_BLOCKING_SCRIPT)}
  ${moduleTag}
</head>
<body${bodyClass}>
  ${body}
</body>
</html>`;
}

function header(activePage?: string): SafeHTML {
  const navLink = (href: string, label: string, id: string) => {
    const cls = activePage === id ? ' class="active"' : '';
    return unsafeHTML(`<a href="${href}"${cls}>${label}</a>`);
  };

  return html`<header class="header">
    <div class="header-left">
      <a href="/app" class="logo"><img src="/public/logo.webp" alt="" class="logo-img">Lyceum</a>
      <nav class="nav">
        ${navLink("/app", "Library", "library")}
      </nav>
    </div>
    <div class="header-right">
      <form action="/app/search" method="GET" class="search-form">
        ${unsafeHTML('<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')}
        <input type="text" name="q" class="search-box" placeholder="Search books...">
        <kbd class="search-kbd">Ctrl K</kbd>
      </form>
      <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark mode" id="theme-btn">&#9789;</button>
    </div>
  </header>`;
}

const APP_MODULE = `
function toggleTheme(){var h=document.documentElement,d=h.getAttribute("data-theme")==="dark";h.setAttribute("data-theme",d?"":"dark");document.getElementById("theme-btn").textContent=d?"\\u263D":"\\u2600";localStorage.setItem("theme",d?"light":"dark")}
window.toggleTheme=toggleTheme;
if(localStorage.getItem("theme")==="dark")document.getElementById("theme-btn").textContent="\\u2600";
addEventListener("load",()=>quicklink.listen());
if("serviceWorker"in navigator)navigator.serviceWorker.register("/public/sw.js",{scope:"/"});
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();document.querySelector(".search-box")?.focus();}});
`;

function appLayout(title: SafeHTML | string, pageStyles: string[], body: SafeHTML, activePage?: string, extraModule?: string, bodyClass?: string): SafeHTML {
  const stylesheets = ["/public/css/base.css", "/public/css/layout.css", ...pageStyles];
  const headModule = APP_MODULE + (extraModule ?? "");
  const page = html`
  ${header(activePage)}
  ${body}`;
  return layout(title, stylesheets, page, { scripts: ["https://unpkg.com/quicklink"], headModule, bodyClass });
}

// --- Landing page ---

export function landingPage(baseUrl: string): SafeHTML {
  const body = html`
  <div class="landing">
    <img src="/public/logo.webp" alt="Lyceum" class="logo-img">
    <h1>Lyceum</h1>
    <p class="tagline">An <span class="mcp-badge">MCP</span> bridge to your ebook library.</p>
    <p>Lyceum lets AI assistants browse, search, and manage your ebook collection through the Model Context Protocol.</p>
    <ul class="features">
      <li>Search and browse your library</li>
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
    </footer>
  </div>`;

  return layout("Lyceum", ["/public/css/base.css", "/public/css/landing.css"], body);
}

// --- Auth pages ---

export function authorizePage(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  error?: string;
}): SafeHTML {
  const errorMsg = opts.error ? html`<p class="error">${opts.error}</p>` : html``;

  const body = html`
  <div class="form-container">
    <h1>Authorize</h1>
    <p>An application is requesting access to your library.</p>
    <form method="POST">
      <input type="hidden" name="client_id" value="${opts.clientId}">
      <input type="hidden" name="redirect_uri" value="${opts.redirectUri}">
      <input type="hidden" name="state" value="${opts.state}">
      <input type="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Authorize</button>
      ${errorMsg}
    </form>
  </div>`;

  return layout("Lyceum - Authorize", ["/public/css/base.css", "/public/css/forms.css"], body);
}

export function uploadPage(opts?: { success?: string; error?: string }): SafeHTML {
  let message = html``;
  if (opts?.success) {
    message = html`<p class="success">${opts.success}</p>`;
  } else if (opts?.error) {
    message = html`<p class="error">${opts.error}</p>`;
  }

  const body = html`
  <div class="form-container">
    <h1>Upload</h1>
    <p>Upload a book to your library.</p>
    <form method="POST" enctype="multipart/form-data">
      <input type="file" name="book" accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.txt,.rtf,.docx" required>
      <button type="submit">Upload</button>
      ${message}
    </form>
  </div>`;

  return appLayout("Lyceum - Upload Book", ["/public/css/forms.css"], body, "upload");
}

// --- Book detail page ---

export function viewBookPage(book: any, mode: "app" | "mcp", coverDataUrl?: string): SafeHTML {
  const authors = (book.authors as string[])?.join(", ") ?? "";
  const tags = (book.tags as string[]) ?? [];
  const formats = (book.formats as string[]) ?? [];
  const languages = (book.languages as string[]) ?? [];

  const pubYear = book.pubdate ? new Date(book.pubdate).getFullYear() : null;
  const pubYearValid = pubYear && pubYear > 100 ? pubYear : null;

  const tagsBlock = tags.length
    ? html`<div class="detail-tags">${unsafeHTML(tags.map((t: string) => {
        const href = mode === "app" ? `/app/tag/${encodeURIComponent(t)}` : "#";
        return html`<a class="tag" href="${href}">${t}</a>`;
      }).join(""))}</div>`
    : html``;

  const description = book.comments ?? "";
  const descriptionBlock = description
    ? html`<div class="description">${unsafeHTML(description)}</div>`
    : html``;

  if (mode === "app") {
    // App mode: hero with blurred cover backdrop
    let coverImg: SafeHTML;
    if (book.has_cover) {
      coverImg = html`<img class="detail-cover" src="/app/cover/${book.id}" alt="Cover" style="view-transition-name: cover-${book.id};">`;
    } else {
      coverImg = html`<div class="no-cover">No Cover</div>`;
    }

    const seriesLabel = book.series
      ? html`<p class="detail-series-label">${book.series}${book.series_index != null ? ` · Book ${book.series_index}` : ""}</p>`
      : html``;

    const metaParts: SafeHTML[] = [];
    if (pubYearValid) metaParts.push(html`<span>${pubYearValid}</span>`);
    if (book.publisher) metaParts.push(html`<span>${book.publisher}</span>`);
    if (languages.length) metaParts.push(html`<span>${languages.join(", ")}</span>`);
    if (formats.length) metaParts.push(html`<span>${formats.join(" · ")}</span>`);
    const metaRow = metaParts.length
      ? html`<p class="detail-meta-row">${unsafeHTML(metaParts.map(p => p.toString()).join(""))}</p>`
      : html``;

    const ratingVal = typeof book.rating === "number" && book.rating > 0 ? book.rating : null;
    const ratingBlock = ratingVal
      ? (() => {
          const stars = Math.round(ratingVal / 2);
          return html`<p class="detail-rating">${"★".repeat(stars)}${"☆".repeat(5 - stars)}</p>`;
        })()
      : html``;

    const heroStyle = book.has_cover
      ? unsafeHTML(` style="--cover-url: url(/app/cover/${book.id})"`)
      : unsafeHTML("");

    const detailBody = html`
  <div class="book-hero"${heroStyle}>
    <div class="book-hero-content">
      ${coverImg}
      <div class="detail-hero-info">
        ${seriesLabel}
        <h1 class="detail-title" style="view-transition-name: title-${book.id};">${book.title}</h1>
        <p class="detail-author">${authors}</p>
        ${metaRow}
        ${ratingBlock}
      </div>
    </div>
  </div>
  <div class="detail-body">
    ${tagsBlock}
    ${descriptionBlock}
  </div>`;

    const heroModule = `(function(){var h=document.querySelector('.header'),e=document.querySelector('.book-hero');if(!h||!e)return;new IntersectionObserver(function(entries){h.classList.toggle('opaque',!entries[0].isIntersecting);},{threshold:0,rootMargin:'-60px 0px 0px 0px'}).observe(e);})();`;
    return appLayout(html`${book.title} - Lyceum`, ["/public/css/book-detail.css"], detailBody, "library", heroModule, "book-detail-page");
  }

  // MCP mode: simple layout, no app header/nav
  let coverImg: SafeHTML;
  if (coverDataUrl) {
    coverImg = html`<img class="detail-cover" src="${coverDataUrl}" alt="Cover">`;
  } else {
    coverImg = html`<div class="no-cover">No Cover</div>`;
  }

  let seriesLine = html``;
  if (book.series) {
    const idx = book.series_index != null ? ` #${book.series_index}` : "";
    seriesLine = html`<div class="meta-item"><span class="meta-label">Series</span><span class="meta-value">${book.series}${idx}</span></div>`;
  }
  const publisherLine = book.publisher
    ? html`<div class="meta-item"><span class="meta-label">Publisher</span><span class="meta-value">${book.publisher}</span></div>`
    : html``;
  const pubdateLine = pubYearValid
    ? html`<div class="meta-item"><span class="meta-label">Published</span><span class="meta-value">${pubYearValid}</span></div>`
    : html``;
  const languagesLine = languages.length
    ? html`<div class="meta-item"><span class="meta-label">Language</span><span class="meta-value">${languages.join(", ")}</span></div>`
    : html``;
  const formatsLine = formats.length
    ? html`<div class="meta-item"><span class="meta-label">Formats</span><span class="meta-value format">${formats.join("  ")}</span></div>`
    : html``;

  const detailBody = html`
  <div class="detail-simple">
    <div class="detail-simple-layout">
      ${coverImg}
      <div class="detail-info">
        <h1 class="detail-title">${book.title}</h1>
        <div class="detail-author">${authors}</div>
        <div class="detail-meta">
          ${seriesLine}${publisherLine}${pubdateLine}${languagesLine}${formatsLine}
        </div>
        ${tagsBlock}
        ${descriptionBlock}
      </div>
    </div>
  </div>`;

  return layout(html`${book.title} - Lyceum`, ["/public/css/base.css", "/public/css/book-detail.css"], detailBody);
}

// --- App pages ---

export function appLoginPage(opts?: { error?: string }): SafeHTML {
  const errorMsg = opts?.error ? html`<p class="error">${opts.error}</p>` : html``;

  const body = html`
  <div class="form-container">
    <h1>Sign In</h1>
    <p>Enter your password to access your library.</p>
    <form method="POST">
      <input type="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Sign In</button>
      ${errorMsg}
    </form>
  </div>`;

  return layout("Lyceum - Sign In", ["/public/css/base.css", "/public/css/forms.css"], body);
}

function bookList(books: BookSummary[]): SafeHTML {
  const rows = books.map(book => {
    const tagPills = book.tags.map((t: string) =>
      html`<a class="tag" href="/app/tag/${encodeURIComponent(t)}">${t}</a>`
    );
    const coverCell = book.has_cover
      ? html`<img class="cover-small" src="/app/cover/${book.id}" alt="" style="view-transition-name: cover-${book.id};">`
      : html`<span class="no-cover-small"></span>`;
    const formats = book.formats.join(", ");
    const seriesCell = book.series
      ? html`<span class="row-series">${book.series}${book.series_index != null ? ` #${book.series_index}` : ""}</span>`
      : html``;
    const pubYear = book.pubdate ? new Date(book.pubdate).getFullYear() : null;
    const yearCell = pubYear && pubYear > 100
      ? html`<span class="row-year">${pubYear}</span>`
      : html`<span class="row-year"></span>`;

    return html`<div class="book-row">
      ${coverCell}
      <div class="row-main">
        <a class="row-title" href="/app/book/${book.id}" style="view-transition-name: title-${book.id};">${book.title}</a>
        ${seriesCell}
      </div>
      <span class="row-author">${book.authors.join(", ")}</span>
      ${yearCell}
      <span class="row-tags">${unsafeHTML(tagPills.map((p: SafeHTML) => p.toString()).join(""))}</span>
      <span class="row-format">${formats}</span>
    </div>`;
  });

  return html`<div class="book-list" id="list-view">
    <div class="list-header">
      <span class="col-cover"></span>
      <span class="col-title">Title</span>
      <span class="col-author">Author</span>
      <span class="col-year">Year</span>
      <span class="col-tags">Tags</span>
      <span class="col-format">Format</span>
    </div>
    ${unsafeHTML(rows.map(r => r.toString()).join(""))}
  </div>`;
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
  const body = html`
  <div class="container">
    <div class="page-header">
      <h1 class="page-title">Library <span class="page-count">${total} books</span></h1>
    </div>
    ${bookList(books)}
    ${pagination(page, perPage, total, basePath)}
  </div>`;

  return appLayout("Lyceum - Library", ["/public/css/book-table.css"], body, "library");
}

export function appTagPage(tag: string, books: BookSummary[], total: number, page: number, perPage: number): SafeHTML {
  const tagBasePath = `/app/tag/${encodeURIComponent(tag)}`;
  const body = html`
  <div class="container">
    <div class="page-header">
      <h1 class="page-title">${tag} <span class="page-count">${total} books</span></h1>
    </div>
    ${bookList(books)}
    ${pagination(page, perPage, total, tagBasePath)}
  </div>`;

  return appLayout(html`${tag} - Lyceum`, ["/public/css/book-table.css"], body, "library");
}

export function appSearchPage(query: string, books: BookSummary[], count: number): SafeHTML {
  const body = html`
  <div class="container">
    <div class="page-header">
      <h1 class="page-title">Results for &#8220;${query}&#8221; <span class="page-count">${count} books</span></h1>
    </div>
    ${bookList(books)}
  </div>`;

  return appLayout(html`Search: ${query} - Lyceum`, ["/public/css/book-table.css"], body, "library");
}
