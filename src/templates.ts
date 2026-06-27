import { html, unsafeHTML, UnsafeHTML, SafeHTML, escapeHtml } from "./html.ts";
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

function sidebar(activePage?: string): SafeHTML {
  const item = (href: string, page: string, icon: string, label: string) => {
    const active = activePage === page ? " active" : "";
    return unsafeHTML(`<a href="${href}" class="sidebar-item${active}">${icon}${label}</a>`);
  };
  const libraryIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
  const devicesIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
  const settingsIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  return html`<aside class="sidebar" id="sidebar"><nav class="sidebar-nav">
    ${item("/app", "library", libraryIcon, "Library")}
    ${item("/app/devices", "devices", devicesIcon, "Devices")}
    ${item("/app/settings", "settings", settingsIcon, "Settings")}
  </nav></aside>`;
}

function header(_activePage?: string): SafeHTML {
  return html`<header class="header">
    <div class="header-left">
      <a href="/app" class="logo"><img src="/public/logo.webp" alt="" class="logo-img">Lyceum</a>
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
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();document.querySelector(".search-box")?.focus();}});
(function(){
  var btn=document.getElementById("user-btn"),drop=document.getElementById("user-dropdown");
  if(!btn||!drop)return;
  btn.addEventListener("click",function(e){e.stopPropagation();var open=drop.hidden;drop.hidden=!open;btn.setAttribute("aria-expanded",String(open));});
  document.addEventListener("click",function(){drop.hidden=true;btn.setAttribute("aria-expanded","false");});
})();
(function(){
  function openModal(el){el.hidden=false;requestAnimationFrame(function(){requestAnimationFrame(function(){el.classList.add("open");});});}
  function closeModal(el){el.classList.remove("open");function h(){el.hidden=true;el.removeEventListener("transitionend",h);}el.addEventListener("transitionend",h);}
  document.addEventListener("click",function(e){
    var open=e.target.closest("[data-modal-open]");
    if(open){var m=document.getElementById(open.dataset.modalOpen);if(m)openModal(m);}
    if(e.target.closest("[data-modal-close]")){var b=e.target.closest(".modal-backdrop");if(b)closeModal(b);}
    if(e.target.classList.contains("modal-backdrop"))closeModal(e.target);
  });
  document.addEventListener("keydown",function(e){if(e.key==="Escape"){var m=document.querySelector(".modal-backdrop.open");if(m)closeModal(m);}});
})();
(function(){
  var btn=document.getElementById("sidebar-toggle");
  var overlay=document.getElementById("sidebar-overlay");
  function closeSidebar(){document.body.classList.remove("sidebar-open");localStorage.setItem("sidebar","closed");}
  if(btn)btn.addEventListener("click",function(){
    var open=document.body.classList.toggle("sidebar-open");
    localStorage.setItem("sidebar",open?"open":"closed");
  });
  if(overlay)overlay.addEventListener("click",closeSidebar);
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
  const stylesheets = ["/public/css/base.css", "/public/css/layout.css", "/public/css/modal.css", ...pageStyles];
  const headModule = APP_MODULE + (extraModule ?? "");
  const sidebarScript = unsafeHTML(`<script>if(localStorage.getItem("sidebar")==="open")document.body.classList.add("sidebar-open");</script>`);
  const toggleIcon = `<svg class="grid-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect class="grid-tl" x="3" y="3" width="8" height="8" rx="2"/><rect class="grid-tr" x="13" y="3" width="8" height="8" rx="2"/><rect class="grid-bl" x="3" y="13" width="8" height="8" rx="2"/><rect class="grid-br" x="13" y="13" width="8" height="8" rx="2"/></svg>`;
  const page = html`
  ${sidebarScript}
  ${header(activePage)}
  ${sidebar(activePage)}
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <div class="main-wrap">
    <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">${unsafeHTML(toggleIcon)}</button>
    ${body}
    <footer class="app-footer"></footer>
  </div>`;
  return layout(title, stylesheets, page, { scripts: ["https://unpkg.com/quicklink"], headModule, bodyClass });
}

// --- Landing page ---

export function landingPage(baseUrl: string): SafeHTML {
  const body = html`
  <div class="landing">
    <div class="landing-left">
      <div class="landing-logo">
        <img src="/public/logo.webp" alt="" class="landing-logo-img">
        Lyceum
      </div>
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
    <p class="upload-sub">Adding a new format to <strong style="color:var(--text-strong);">${bookTitle}</strong></p>
    <form method="POST" enctype="multipart/form-data" class="upload-form">
      <label class="file-label">
        <input type="file" name="book" accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.txt,.rtf,.docx" required>
        <span class="file-hint">epub, pdf, mobi, azw3, cbz, txt&hellip;</span>
      </label>
      <button type="submit"><span class="btn-text">Upload Format &rarr;</span><span class="upload-spinner"></span></button>
      ${message}
    </form>
  </div>`;

  return layout("Lyceum - Add Format", ["/public/css/base.css", "/public/css/book-detail.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark");(function(){var f=document.querySelector('.upload-form');if(!f)return;f.addEventListener('submit',function(){var btn=f.querySelector('button[type="submit"]');btn.disabled=true;btn.classList.add('uploading');});})();`,
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
      <button type="submit"><span class="btn-text">Upload &rarr;</span><span class="upload-spinner"></span></button>
      ${message}
    </form>
  </div>`;

  return layout("Lyceum - Upload Book", ["/public/css/base.css", "/public/css/book-detail.css", "/public/css/forms.css"], body, {
    headModule: `document.documentElement.setAttribute("data-theme","dark");(function(){var f=document.querySelector('.upload-form');if(!f)return;f.addEventListener('submit',function(){var btn=f.querySelector('button[type="submit"]');btn.disabled=true;btn.classList.add('uploading');});})();`,
  });
}

// --- Book detail page ---

export function modal(id: string, title: string, body: SafeHTML, footer?: SafeHTML): SafeHTML {
  return html`<div class="modal-backdrop" id="${id}" hidden>
    <div class="modal" role="dialog" aria-labelledby="${id}-title">
      <div class="modal-header">
        <h2 class="modal-title" id="${id}-title">${title}</h2>
        <button class="modal-close" data-modal-close aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? html`<div class="modal-footer">${footer}</div>` : html``}
    </div>
  </div>`;
}

const SUPPORTED_FORMATS = ["EPUB", "MOBI", "TXT", "DOCX", "HTMLZ", "LRF"];

export function viewBookPage(book: any, mode: "app" | "mcp", coverDataUrl?: string, converterEnabled?: boolean, deviceNames?: string[]): SafeHTML {
  const authorNames = (book.authors as string[]) ?? [];
  const authors = mode === "app"
    ? unsafeHTML(authorNames.map(a => `<a href="/app/author/${encodeURIComponent(a)}">${escapeHtml(a)}</a>`).join(", "))
    : html`${authorNames.join(", ")}`;
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
      ? html`<p class="detail-series-label"><a href="/app/series/${book.series_id}" class="series-link">${book.series}${book.series_index != null ? ` · Book ${book.series_index}` : ""}</a></p>`
      : html``;

    const metaParts: SafeHTML[] = [];
    if (pubYearValid) metaParts.push(html`<span>${pubYearValid}</span>`);
    if (book.publisher) metaParts.push(html`<span>${book.publisher}</span>`);
    if (languages.length) metaParts.push(html`<span>${languages.join(", ")}</span>`);
    const metaRow = metaParts.length
      ? html`<p class="detail-meta-row">${unsafeHTML(metaParts.map(p => p.toString()).join(""))}</p>`
      : html``;

    const currentRating = typeof book.rating === "number" && book.rating > 0 ? Math.round(book.rating) : 0;
    const ratingBlock = html`<form method="POST" action="/app/book/${book.id}/rating" class="rating-form">${unsafeHTML(
      Array.from({ length: 5 }, (_, i) => {
        const val = i + 1;
        const filled = val <= currentRating;
        // clicking the active star clears the rating
        const submitVal = val === currentRating ? 0 : val;
        return `<button type="submit" name="rating" value="${submitVal}" class="star-btn${filled ? " filled" : ""}" aria-label="${val} star">${filled ? "★" : "☆"}</button>`;
      }).join("")
    )}</form>`;

    const progress = book.reading_progress ?? null;
    const readAt: string | null = book.read_at ?? null;
    const progressBlock = progress && !readAt
      ? html`<div class="detail-progress">
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${Math.round(progress.percentage)}%"></div></div>
          <span class="progress-label">${Math.round(progress.percentage)}%${progress.device ? unsafeHTML(` &middot; ${escapeHtml(progress.device)}`) : ""}</span>
        </div>`
      : html``;

    const readAtDate = readAt ? new Date(readAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
    const readBlock = html`<div class="detail-read-status">
      <form method="POST" action="/app/book/${book.id}/read">
        <button type="submit" class="read-toggle${readAt ? " is-read" : ""}">
          ${readAt
            ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Read${unsafeHTML(readAtDate ? ` &middot; ${readAtDate}` : "")}`
            : html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Mark as read`}
        </button>
      </form>
    </div>`;

    const backdropStyle = book.has_cover
      ? unsafeHTML(` style="--cover-url: url(/app/cover/${book.id})"`)
      : unsafeHTML("");

    const formatsBlock = formats.length
      ? html`<div class="detail-formats" id="book-formats">${unsafeHTML(formats.map((f: string) => `<button class="format-badge format-badge-btn" data-format="${f}">${f}</button>`).join(""))}</div>`
      : html`<div class="detail-formats" id="book-formats"></div>`;

    const devices = deviceNames ?? [];
    const deviceOptions = devices.length
      ? unsafeHTML(devices.map(d => `<button class="fmt-action-btn" data-send-device="${escapeHtml(d)}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>Send to ${escapeHtml(d)}</button>`).join(""))
      : unsafeHTML("");
    const formatModal = modal("format-modal", "", html`
      <div id="fmt-step-actions">
        <div class="fmt-action-list">
          <a class="fmt-action-btn" id="fmt-download" href="#"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</a>
          ${deviceOptions}
          <button class="fmt-action-btn fmt-action-danger" id="fmt-remove-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Remove format</button>
        </div>
        <p class="fmt-send-status" id="fmt-send-status" hidden></p>
      </div>
      <div id="fmt-step-confirm" hidden>
        <p>Are you sure you want to remove <strong id="fmt-confirm-name"></strong> from this book? This cannot be undone.</p>
        <div class="fmt-confirm-buttons">
          <button class="btn btn-ghost" id="fmt-confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="fmt-confirm-remove">Remove</button>
        </div>
      </div>
      <div id="fmt-step-rediscover" hidden>
        <p class="fmt-rediscover-msg" id="fmt-rediscover-msg"></p>
        <div class="device-select-list" id="fmt-device-select-list"></div>
        <p class="modal-error" id="fmt-rediscover-error" hidden></p>
      </div>
    `, html`
      <button class="btn btn-ghost" data-modal-close id="fmt-close-btn">Close</button>
    `);

    const convertable = converterEnabled
      ? SUPPORTED_FORMATS.filter(f => !formats.includes(f))
      : [];
    const convertBlock = convertable.length > 0
      ? html`<div class="convert-wrap" id="convert-wrap"><button class="convert-btn" id="convert-btn" aria-expanded="false"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><span class="btn-label">Convert</span><span class="btn-spinner"></span><svg class="btn-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button><ul class="convert-dropdown" id="convert-dropdown" role="menu">${unsafeHTML(convertable.map(f => `<li><button class="convert-option" data-fmt="${f}">${f}</button></li>`).join(""))}</ul></div>`
      : html``;

    const detailBody = html`
  <div class="book-backdrop"${backdropStyle}></div>
  <div class="detail-layout">
    <div class="detail-col-left">
      ${coverImg}
      ${formatsBlock}
      ${convertBlock}
    </div>
    <div class="detail-col-right">
      ${seriesLabel}
      <h1 class="detail-title" style="view-transition-name: title-${book.id};">${book.title}</h1>
      <p class="detail-author">${authors}</p>
      ${metaRow}
      ${tagsBlock}
      ${ratingBlock}
      ${progressBlock}
      ${readBlock}
      ${descriptionBlock}
    </div>
  </div>
  ${formatModal}`;

    const convertModule = converterEnabled ? `(function(){var wrap=document.getElementById('convert-wrap');var btn=document.getElementById('convert-btn');var dropdown=document.getElementById('convert-dropdown');if(!wrap||!btn||!dropdown)return;btn.addEventListener('click',function(e){e.stopPropagation();var open=dropdown.classList.toggle('open');btn.setAttribute('aria-expanded',open?'true':'false');});document.addEventListener('click',function(){dropdown.classList.remove('open');btn.setAttribute('aria-expanded','false');});dropdown.addEventListener('click',function(e){e.stopPropagation();var target=e.target.closest('[data-fmt]');if(!target)return;var toFmt=target.dataset.fmt;dropdown.classList.remove('open');btn.setAttribute('aria-expanded','false');btn.disabled=true;btn.classList.add('loading');fetch(location.pathname+'/convert',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'to_format='+encodeURIComponent(toFmt)}).then(function(r){return r.json();}).then(function(data){if(data.error)throw new Error(data.error);var container=document.getElementById('book-formats');if(container){var pill=document.createElement('button');pill.className='format-badge format-badge-btn format-badge-new';pill.dataset.format=toFmt;pill.textContent=toFmt;container.appendChild(pill);}var li=target.closest('li');if(li)li.remove();btn.disabled=false;btn.classList.remove('loading');if(!dropdown.querySelector('[data-fmt]')){wrap.style.display='none';}}).catch(function(){btn.disabled=false;btn.classList.remove('loading');btn.classList.add('convert-error');setTimeout(function(){btn.classList.remove('convert-error');},3000);});});})();` : "";

    const formatModule = `(function(){
var modal=document.getElementById('format-modal');if(!modal)return;
var title=modal.querySelector('.modal-title');
var stepActions=document.getElementById('fmt-step-actions');
var stepConfirm=document.getElementById('fmt-step-confirm');
var stepRediscover=document.getElementById('fmt-step-rediscover');
var rediscoverMsg=document.getElementById('fmt-rediscover-msg');
var rediscoverList=document.getElementById('fmt-device-select-list');
var rediscoverError=document.getElementById('fmt-rediscover-error');
var confirmName=document.getElementById('fmt-confirm-name');
var confirmBtn=document.getElementById('fmt-confirm-remove');
var confirmCancel=document.getElementById('fmt-confirm-cancel');
var downloadLink=document.getElementById('fmt-download');
var removeBtn=document.getElementById('fmt-remove-btn');
var sendStatus=document.getElementById('fmt-send-status');
var closeBtn=document.getElementById('fmt-close-btn');
var footer=closeBtn.parentElement;
var currentFormat='';
var pendingDevice='';

function closeModal(){modal.classList.remove('open');modal.addEventListener('transitionend',function h(){modal.hidden=true;modal.removeEventListener('transitionend',h);});}
function resetModal(){stepActions.hidden=false;stepConfirm.hidden=true;stepRediscover.hidden=true;footer.hidden=false;sendStatus.hidden=true;sendStatus.textContent='';sendStatus.className='fmt-send-status';rediscoverList.innerHTML='';rediscoverError.hidden=true;pendingDevice='';}

document.getElementById('book-formats').addEventListener('click',function(e){
  var badge=e.target.closest('[data-format]');if(!badge)return;
  currentFormat=badge.dataset.format;
  title.textContent=currentFormat;
  downloadLink.href='#';
  fetch('/app/book/${book.id}/download-url?format='+encodeURIComponent(currentFormat)).then(function(r){return r.json();}).then(function(d){if(d.url){downloadLink.href=d.url;downloadLink.download=d.filename||'';}});
  resetModal();
  modal.hidden=false;requestAnimationFrame(function(){requestAnimationFrame(function(){modal.classList.add('open');});});
});

removeBtn.addEventListener('click',function(){
  stepActions.hidden=true;stepConfirm.hidden=false;footer.hidden=true;
  confirmName.textContent=currentFormat;
});

confirmCancel.addEventListener('click',function(){
  resetModal();
});

confirmBtn.addEventListener('click',function(){
  confirmBtn.disabled=true;confirmBtn.textContent='Removing...';
  fetch(location.pathname+'/remove-format',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'format='+encodeURIComponent(currentFormat)}).then(function(r){return r.json();}).then(function(data){
    if(data.error)throw new Error(data.error);
    var badge=document.querySelector('[data-format="'+currentFormat+'"]');if(badge)badge.remove();
    closeModal();
    confirmBtn.disabled=false;confirmBtn.textContent='Remove';
  }).catch(function(err){
    confirmBtn.disabled=false;confirmBtn.textContent='Remove';
    sendStatus.hidden=false;sendStatus.textContent=err.message||'Failed to remove format';sendStatus.className='fmt-send-status fmt-error';
    resetModal();
  });
});

function doSend(device,sendBtn){
  console.log('[lyceum] doSend called', {device:device, format:currentFormat});
  sendStatus.hidden=false;sendStatus.textContent='Sending to '+device+'...';sendStatus.className='fmt-send-status';
  if(sendBtn)sendBtn.disabled=true;
  fetch(location.pathname+'/send-to-device',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'format='+encodeURIComponent(currentFormat)+'&device='+encodeURIComponent(device)}).then(function(r){
    console.log('[lyceum] send-to-device HTTP status', r.status);
    return r.json();
  }).then(function(data){
    console.log('[lyceum] send-to-device response', JSON.stringify(data));
    if(data.error)throw new Error(data.error);
    if(data.needsRediscovery){
      console.log('[lyceum] showing rediscovery UI, devices:', data.devices);
      sendStatus.hidden=true;
      pendingDevice=device;
      rediscoverList.innerHTML='';
      rediscoverError.hidden=true;
      if(!data.devices||data.devices.length===0){
        rediscoverMsg.textContent='Could not reach '+device+' and no CrossPoint devices were found on the network. Make sure your device is in transfer mode and try again.';
      }else if(data.devices.length===1){
        rediscoverMsg.textContent='Could not reach '+device+' at its saved address. A CrossPoint device was found at a new address — is this your device?';
      }else{
        rediscoverMsg.textContent='Could not reach '+device+' at its saved address. Select your device from the list below.';
      }
      data.devices.forEach(function(d){
        var btn=document.createElement('button');
        btn.type='button';btn.className='device-pick-btn';
        btn.textContent=d.ip+':'+d.port;
        btn.addEventListener('click',function(){
          console.log('[lyceum] device pick clicked', {ip:d.ip, port:d.port});
          rediscoverError.hidden=true;
          btn.disabled=true;
          fetch('/app/devices/'+encodeURIComponent(device)+'/update-ip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ip:d.ip,port:d.port})}).then(function(r){
            console.log('[lyceum] update-ip HTTP status', r.status);
            return r.json();
          }).then(function(upd){
            console.log('[lyceum] update-ip response', JSON.stringify(upd));
            if(upd.error)throw new Error(upd.error);
            stepRediscover.hidden=true;
            stepActions.hidden=false;
            doSend(device,null);
          }).catch(function(err){
            console.log('[lyceum] update-ip error', err.message);
            btn.disabled=false;
            rediscoverError.textContent=err.message||'Failed to update device address.';rediscoverError.hidden=false;
          });
        });
        rediscoverList.appendChild(btn);
      });
      stepActions.hidden=true;
      stepRediscover.hidden=false;
      return;
    }
    console.log('[lyceum] send success');
    sendStatus.textContent='Sent to '+device;sendStatus.className='fmt-send-status fmt-success';
    if(sendBtn)sendBtn.disabled=false;
  }).catch(function(err){
    console.log('[lyceum] send error', err.message);
    sendStatus.hidden=false;sendStatus.textContent=err.message||'Failed to send';sendStatus.className='fmt-send-status fmt-error';
    if(sendBtn)sendBtn.disabled=false;
  });
}

modal.addEventListener('click',function(e){
  var sendBtn=e.target.closest('[data-send-device]');if(!sendBtn)return;
  doSend(sendBtn.dataset.sendDevice,sendBtn);
});

var obs=new MutationObserver(function(){if(modal.hidden)resetModal();});
obs.observe(modal,{attributes:true,attributeFilter:['hidden']});
})();`;

    const scrollModule = `(function(){var h=document.querySelector('.header');if(!h)return;function u(){h.classList.toggle('opaque',window.scrollY>30);}window.addEventListener('scroll',u,{passive:true});u();})();(function(){var f=document.querySelector('.rating-form');if(!f)return;var btns=Array.from(f.querySelectorAll('.star-btn'));function applyRating(n){btns.forEach(function(b,j){var v=j+1;var filled=v<=n;b.classList.toggle('filled',filled);b.textContent=filled?'★':'☆';b.value=(v===n?0:v).toString();});}f.addEventListener('submit',function(e){e.preventDefault();var val=parseInt(e.submitter.value,10);fetch(f.action,{method:'POST',body:new URLSearchParams({rating:val})});applyRating(val>0?val:0);});btns.forEach(function(btn,i){btn.addEventListener('mouseenter',function(){btns.forEach(function(b,j){b.classList.toggle('preview',j<=i);});});btn.addEventListener('mouseleave',function(){btns.forEach(function(b){b.classList.remove('preview');});});});})();` + convertModule + formatModule;
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

