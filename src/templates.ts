import { html, unsafeHTML, UnsafeHTML, SafeHTML } from "./html.ts";
import type { BookSummary } from "./storage/types.ts";

function cssLinks(paths: string[]): UnsafeHTML {
  return unsafeHTML(paths.map(p => `<link rel="stylesheet" href="${p}">`).join("\n  "));
}

function scriptTags(urls: string[]): UnsafeHTML {
  return unsafeHTML(urls.map(u => `<script src="${u}" defer></script>`).join("\n  "));
}

const THEME_BLOCKING_SCRIPT = `<script>document.documentElement.setAttribute("data-theme","dark")</script>`;
const VIEW_BLOCKING_SCRIPT = `<script>document.documentElement.setAttribute("data-view",localStorage.getItem("view")||"grid")</script>`;

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
  ${unsafeHTML(VIEW_BLOCKING_SCRIPT)}
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
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" name="q" class="search-box" placeholder="Search books...">
        <kbd class="search-kbd">Ctrl K</kbd>
      </form>
      <div class="user-menu">
        <button class="user-btn" id="user-btn" aria-label="User menu" aria-expanded="false">
          <svg class="user-book-icon" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </button>
        <div class="user-dropdown" id="user-dropdown" hidden>
          <form method="POST" action="/app/logout">
            <button type="submit" class="dropdown-item">Sign out</button>
          </form>
        </div>
      </div>
    </div>
  </header>`;
}

const APP_MODULE = `
addEventListener("load",()=>quicklink.listen());
if("serviceWorker"in navigator)navigator.serviceWorker.register("/public/sw.js",{scope:"/"});
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();document.querySelector(".search-box")?.focus();}});
(function(){
  var btn=document.getElementById("user-btn"),drop=document.getElementById("user-dropdown");
  if(!btn||!drop)return;
  btn.addEventListener("click",function(e){e.stopPropagation();var open=drop.hidden;drop.hidden=!open;btn.setAttribute("aria-expanded",String(open));});
  document.addEventListener("click",function(){drop.hidden=true;btn.setAttribute("aria-expanded","false");});
})();
`;

const VIEW_TOGGLE_MODULE = `
(function(){
  var btns=document.querySelectorAll(".view-btn");
  if(!btns.length)return;
  btns.forEach(function(b){
    b.addEventListener("click",function(){
      var nv=b.dataset.view;
      document.documentElement.setAttribute("data-view",nv);
      localStorage.setItem("view",nv);
    });
  });
})();
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
    <div class="landing-left">
      <a href="/app" class="landing-logo">
        <img src="/public/logo.webp" alt="" class="landing-logo-img">
        Lyceum
      </a>
      <h1 class="landing-title">Your<br>library.</h1>
      <p class="landing-tagline">Browse, search, and manage your ebook collection. AI-ready via MCP.</p>
      <a href="/app" class="landing-cta">Open Library &rarr;</a>
    </div>
    <div class="landing-right">
      <div class="landing-card">
        <h2 class="card-heading">Connect your AI</h2>
        <p class="card-sub">Point any MCP-compatible assistant to your library.</p>
        <div class="card-url-wrap">
          <pre class="card-url"><code>${baseUrl}/mcp</code></pre>
          <button class="copy-btn" data-copy="${baseUrl}/mcp" aria-label="Copy to clipboard">Copy</button>
        </div>
        <ul class="landing-features">
          <li>Browse &amp; search your collection</li>
          <li>Download books &amp; send to e-readers</li>
          <li>Edit metadata and covers</li>
          <li>Convert between formats</li>
        </ul>
      </div>
    </div>
  </div>`;

  const landingModule = `
document.documentElement.setAttribute("data-theme","dark");
document.querySelectorAll(".copy-btn").forEach(function(btn){
  btn.addEventListener("click",function(){
    navigator.clipboard.writeText(btn.dataset.copy).then(function(){
      btn.textContent="Copied!";btn.classList.add("copied");
      setTimeout(function(){btn.textContent="Copy";btn.classList.remove("copied");},2000);
    });
  });
});`;
  return layout("Lyceum", ["/public/css/base.css", "/public/css/landing.css"], body, {
    headModule: landingModule
  });
}

// --- Auth pages ---

export function authorizePage(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  error?: string;
}): SafeHTML {
  const errorMsg = opts.error ? html`<p class="error">${opts.error}</p>` : html``;
  const clientName = opts.clientId || "An application";

  const body = html`
  <div class="login-container">
    <a href="/" class="login-logo">
      <img src="/public/logo.webp" alt="" class="logo-img">
      Lyceum
    </a>
    <h1 class="login-heading">Authorize</h1>
    <p class="login-sub"><strong class="auth-client">${clientName}</strong> is requesting access to your library.</p>
    <form method="POST" class="login-form">
      <input type="hidden" name="client_id" value="${opts.clientId}">
      <input type="hidden" name="redirect_uri" value="${opts.redirectUri}">
      <input type="hidden" name="state" value="${opts.state}">
      <input type="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Grant Access &rarr;</button>
      ${errorMsg}
    </form>
  </div>`;

  return layout("Lyceum - Authorize", ["/public/css/base.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark")`,
    bodyClass: "login-page",
  });
}

export function authorizeSuccessPage(redirectUrl: string): SafeHTML {
  const body = html`
  <div class="login-container">
    <a href="/" class="login-logo">
      <img src="/public/logo.webp" alt="" class="logo-img">
      Lyceum
    </a>
    <h1 class="login-heading auth-success-heading">Access<br>Granted.</h1>
    <p class="login-sub">You can close this window and return to your AI assistant.</p>
  </div>`;

  return layout("Lyceum - Authorized", ["/public/css/base.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark");window.location.href=${JSON.stringify(redirectUrl)};`,
    bodyClass: "login-page",
  });
}

export function addFormatPage(bookTitle: string, opts?: { success?: string; error?: string }): SafeHTML {
  let message = html``;
  if (opts?.success) {
    message = html`<p class="upload-success">${opts.success}</p>`;
  } else if (opts?.error) {
    message = html`<p class="error">${opts.error}</p>`;
  }

  const body = html`
  <div class="mcp-brand-bar upload-brand-bar">
    <a href="/" class="mcp-brand-logo">
      <img src="/public/logo.webp" alt="" class="logo-img">
      Lyceum
    </a>
  </div>
  <div class="upload-container">
    <h1 class="upload-heading">Add Format</h1>
    <p class="upload-sub">Adding a new format to <strong style="color:#f0e8dc;">${bookTitle}</strong></p>
    <form method="POST" enctype="multipart/form-data" class="upload-form">
      <label class="file-label">
        <input type="file" name="book" accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.txt,.rtf,.docx" required>
        <span class="file-hint">epub, pdf, mobi, azw3, cbz, txt&hellip;</span>
      </label>
      <button type="submit">Upload Format &rarr;</button>
      ${message}
    </form>
  </div>`;

  return layout("Lyceum - Add Format", ["/public/css/base.css", "/public/css/book-detail.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark")`,
  });
}

export function uploadPage(opts?: { success?: string; error?: string }): SafeHTML {
  let message = html``;
  if (opts?.success) {
    message = html`<p class="upload-success">${opts.success}</p>`;
  } else if (opts?.error) {
    message = html`<p class="error">${opts.error}</p>`;
  }

  const body = html`
  <div class="mcp-brand-bar upload-brand-bar">
    <a href="/" class="mcp-brand-logo">
      <img src="/public/logo.webp" alt="" class="logo-img">
      Lyceum
    </a>
  </div>
  <div class="upload-container">
    <h1 class="upload-heading">Upload a Book</h1>
    <p class="upload-sub">Add a new book to your library.</p>
    <form method="POST" enctype="multipart/form-data" class="upload-form">
      <label class="file-label">
        <input type="file" name="book" accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.txt,.rtf,.docx" required>
        <span class="file-hint">epub, pdf, mobi, azw3, cbz, txt&hellip;</span>
      </label>
      <button type="submit">Upload &rarr;</button>
      ${message}
    </form>
  </div>`;

  return layout("Lyceum - Upload Book", ["/public/css/base.css", "/public/css/book-detail.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark")`,
  });
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

    const backdropStyle = book.has_cover
      ? unsafeHTML(` style="--cover-url: url(/app/cover/${book.id})"`)
      : unsafeHTML("");

    const formatsBlock = formats.length
      ? html`<div class="detail-formats">${unsafeHTML(formats.map((f: string) => `<span class="format-badge">${f}</span>`).join(""))}</div>`
      : html``;

    const detailBody = html`
  <div class="book-backdrop"${backdropStyle}></div>
  <div class="detail-layout">
    <div class="detail-col-left">
      ${coverImg}
      ${formatsBlock}
    </div>
    <div class="detail-col-right">
      ${seriesLabel}
      <h1 class="detail-title" style="view-transition-name: title-${book.id};">${book.title}</h1>
      <p class="detail-author">${authors}</p>
      ${metaRow}
      ${tagsBlock}
      ${ratingBlock}
      ${descriptionBlock}
    </div>
  </div>`;

    const scrollModule = `(function(){var h=document.querySelector('.header');if(!h)return;function u(){h.classList.toggle('opaque',window.scrollY>30);}window.addEventListener('scroll',u,{passive:true});u();})();`;
    return appLayout(html`${book.title} - Lyceum`, ["/public/css/book-detail.css"], detailBody, "library", scrollModule, "book-detail-page");
  }

  // MCP mode: same two-column layout, brand bar instead of app header
  let coverImg: SafeHTML;
  if (coverDataUrl) {
    coverImg = html`<img class="detail-cover" src="${coverDataUrl}" alt="Cover">`;
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
  const metaRow = metaParts.length
    ? html`<p class="detail-meta-row">${unsafeHTML(metaParts.map(p => p.toString()).join(""))}</p>`
    : html``;

  const formatsBlock = formats.length
    ? html`<div class="detail-formats">${unsafeHTML(formats.map((f: string) => `<span class="format-badge">${f}</span>`).join(""))}</div>`
    : html``;

  const backdropStyle = coverDataUrl
    ? unsafeHTML(` style="--cover-url: url('${coverDataUrl}')"`)
    : unsafeHTML("");

  const detailBody = html`
  <div class="book-backdrop"${backdropStyle}></div>
  <div class="mcp-brand-bar">
    <a href="/" class="mcp-brand-logo">
      <img src="/public/logo.webp" alt="" class="logo-img">
      Lyceum
    </a>
  </div>
  <div class="detail-layout mcp-detail-layout">
    <div class="detail-col-left">
      ${coverImg}
      ${formatsBlock}
    </div>
    <div class="detail-col-right">
      ${seriesLabel}
      <h1 class="detail-title">${book.title}</h1>
      <p class="detail-author">${authors}</p>
      ${metaRow}
      ${tagsBlock}
      ${descriptionBlock}
    </div>
  </div>`;

  return layout(html`${book.title} - Lyceum`, ["/public/css/base.css", "/public/css/book-detail.css"], detailBody, {
    headModule: `document.documentElement.setAttribute("data-theme","dark")`,
    bodyClass: "book-detail-page mcp-view-page"
  });
}

// --- App pages ---

export function appLoginPage(opts?: { error?: string }): SafeHTML {
  const errorMsg = opts?.error ? html`<p class="error">${opts.error}</p>` : html``;

  const body = html`
  <div class="login-container">
    <a href="/" class="login-logo">
      <img src="/public/logo.webp" alt="" class="logo-img">
      Lyceum
    </a>
    <h1 class="login-heading">Sign In</h1>
    <p class="login-sub">Enter your password to access your library.</p>
    <form method="POST" class="login-form">
      <input type="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Sign In</button>
      ${errorMsg}
    </form>
  </div>`;

  return layout("Lyceum - Sign In", ["/public/css/base.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark")`,
    bodyClass: "login-page",
  });
}

function viewToggleButtons(): SafeHTML {
  return html`<div class="view-toggle">
      <button class="view-btn" data-view="grid">Grid</button>
      <button class="view-btn" data-view="table">Table</button>
    </div>`;
}

function booksContainer(books: BookSummary[]): SafeHTML {
  return html`<div id="books-container">
    ${coverWall(books)}
    ${bookList(books)}
  </div>`;
}

function coverWall(books: BookSummary[]): SafeHTML {
  const cards = books.map(book => {
    if (book.has_cover) {
      return html`<a class="book-card" href="/app/book/${book.id}">
        <div class="cover-wrap" style="view-transition-name: cover-${book.id};">
          <img src="/app/cover/${book.id}" alt="">
          <div class="cover-overlay">
            <span class="cover-title" style="view-transition-name: title-${book.id};">${book.title}</span>
            <span class="cover-author">${book.authors.join(", ")}</span>
          </div>
        </div>
      </a>`;
    } else {
      return html`<a class="book-card" href="/app/book/${book.id}">
        <div class="cover-wrap no-cover-tile">
          <span class="no-cover-title" style="view-transition-name: title-${book.id};">${book.title}</span>
          <span class="no-cover-author">${book.authors.join(", ")}</span>
        </div>
      </a>`;
    }
  });

  return html`<div class="cover-wall">
    ${unsafeHTML(cards.map(c => c.toString()).join(""))}
  </div>`;
}

function bookList(books: BookSummary[]): SafeHTML {
  const rows = books.map(book => {
    const tagPills = book.tags.map((t: string) =>
      html`<a class="tag" href="/app/tag/${encodeURIComponent(t)}">${t}</a>`
    );
    const coverCell = book.has_cover
      ? html`<img class="cover-small" src="/app/cover/${book.id}" alt="" style="view-transition-name: cover-${book.id};">`
      : html`<span class="no-cover-small"></span>`;
    const formats = book.formats.join(" · ");
    const seriesCell = book.series
      ? html`<span class="row-series">${book.series}${book.series_index != null ? ` #${book.series_index}` : ""}</span>`
      : html``;
    const pubYear = book.pubdate ? new Date(book.pubdate).getFullYear() : null;
    const yearStr = pubYear && pubYear > 100 ? String(pubYear) : "";

    return html`<tr class="book-row">
      <td class="col-cover">${coverCell}</td>
      <td class="col-title">
        <a class="row-title" href="/app/book/${book.id}" style="view-transition-name: title-${book.id};">${book.title}</a>
        ${seriesCell}
      </td>
      <td class="col-author">${book.authors.join(", ")}</td>
      <td class="col-year">${yearStr}</td>
      <td class="col-tags"><div class="tag-list">${unsafeHTML(tagPills.map((p: SafeHTML) => p.toString()).join(""))}</div></td>
      <td class="col-format">${formats}</td>
    </tr>`;
  });

  return html`<table class="book-list">
    <thead>
      <tr class="list-header">
        <th class="col-cover"></th>
        <th class="col-title">Title</th>
        <th class="col-author">Author</th>
        <th class="col-year">Year</th>
        <th class="col-tags">Tags</th>
        <th class="col-format">Format</th>
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
  const body = html`
  <div class="container">
    <div class="page-header">
      <h1 class="page-title">Library <span class="page-count">${total} books</span></h1>
      ${viewToggleButtons()}
    </div>
    ${booksContainer(books)}
    ${pagination(page, perPage, total, basePath)}
  </div>`;

  return appLayout("Lyceum - Library", ["/public/css/book-table.css"], body, "library", VIEW_TOGGLE_MODULE, "cover-wall-page");
}

export function appTagPage(tag: string, books: BookSummary[], total: number, page: number, perPage: number): SafeHTML {
  const tagBasePath = `/app/tag/${encodeURIComponent(tag)}`;
  const body = html`
  <div class="container">
    <div class="page-header">
      <h1 class="page-title">${tag} <span class="page-count">${total} books</span></h1>
      ${viewToggleButtons()}
    </div>
    ${booksContainer(books)}
    ${pagination(page, perPage, total, tagBasePath)}
  </div>`;

  return appLayout(html`${tag} - Lyceum`, ["/public/css/book-table.css"], body, "library", VIEW_TOGGLE_MODULE, "cover-wall-page");
}

export function appSearchPage(query: string, books: BookSummary[], count: number): SafeHTML {
  const body = html`
  <div class="container">
    <div class="page-header">
      <h1 class="page-title">Results for &#8220;${query}&#8221; <span class="page-count">${count} books</span></h1>
      ${viewToggleButtons()}
    </div>
    ${booksContainer(books)}
  </div>`;

  return appLayout(html`Search: ${query} - Lyceum`, ["/public/css/book-table.css"], body, "library", VIEW_TOGGLE_MODULE, "cover-wall-page");
}
