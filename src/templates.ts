import { html, unsafeHTML, SafeHTML } from "./html.ts";

const HEADER_STYLES = `
    .header { background: #162238; padding: 16px 24px; }
    .header a { color: #fff; text-decoration: none; font-size: 1.1em; font-weight: 600; display: inline-flex; align-items: center; gap: 10px; }
    .header img { height: 28px; }`;

function header(): SafeHTML {
  return html`<div class="header"><a href="/"><img src="/public/logo.webp" alt="">Lyceum</a></div>`;
}

function layout(title: SafeHTML | string, styles: string, body: SafeHTML): SafeHTML {
  return html`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${typeof title === "string" ? title : title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/public/favicon.png">
  <style>${unsafeHTML(styles)}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}

const APP_STYLES = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #1a1a1a; min-height: 100vh; }
    ${HEADER_STYLES}
    .container { max-width: 720px; margin: 32px auto; padding: 0 20px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; padding: 28px; }`;

function appLayout(title: SafeHTML | string, extraStyles: string, card: SafeHTML): SafeHTML {
  const styles = APP_STYLES + extraStyles;
  const body = html`
  ${header()}
  <div class="container">
    <div class="card">
      ${card}
    </div>
  </div>`;
  return layout(title, styles, body);
}

export function landingPage(baseUrl: string): SafeHTML {
  const styles = `
    body { font-family: system-ui; max-width: 520px; margin: 80px auto; padding: 0 20px; color: #1a1a1a; }
    .logo { display: block; width: 120px; height: auto; margin-bottom: 16px; background: #162238; padding: 12px; border-radius: 8px; }
    h1 { font-size: 1.6em; margin-bottom: 0.2em; }
    .tagline { color: #555; margin-top: 0; }
    .features { list-style: none; padding: 0; }
    .features li { padding: 6px 0; }
    .features li::before { content: "\\2022"; color: #2563eb; font-weight: bold; margin-right: 8px; }
    .mcp-badge { display: inline-block; background: #f0f4ff; border: 1px solid #c7d6f5; border-radius: 4px; padding: 2px 8px; font-size: 0.85em; color: #2563eb; }
    h2 { font-size: 1.1em; margin-top: 32px; }
    pre { background: #f5f5f5; padding: 12px 16px; border-radius: 4px; overflow-x: auto; }
    code { font-size: 0.95em; }
    footer { margin-top: 40px; font-size: 0.85em; color: #888; }
    footer a { color: #1a1a1a; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    footer svg { vertical-align: middle; }
    a { color: #2563eb; }
    @media (max-width: 560px) {
      body { margin-top: 40px; }
      pre { font-size: 0.85em; }
    }`;

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

  return layout("Lyceum", styles, body);
}

const FORM_STYLES = `
    h1 { font-size: 1.4em; margin-bottom: 8px; }
    p { margin-bottom: 16px; }
    input, button { display: block; width: 100%; padding: 10px; margin: 8px 0; box-sizing: border-box; font-size: 1em; }
    button { background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .success { color: #16a34a; }
    .error { color: #dc2626; }`;

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

  return appLayout("Lyceum - Authorize", FORM_STYLES, card);
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

  return appLayout("Lyceum - Upload Book", FORM_STYLES, card);
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
    ? html`<img class="cover" src="${coverDataUrl}" alt="Cover">`
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

  const extraStyles = `
    .card { padding: 0; }
    .book-layout { display: flex; gap: 28px; padding: 28px; }
    .cover { width: 180px; min-width: 180px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); object-fit: contain; align-self: flex-start; }
    .no-cover { height: 260px; display: flex; align-items: center; justify-content: center; background: #e5e7eb; color: #9ca3af; font-size: 0.9em; }
    .details { flex: 1; min-width: 0; }
    .title { font-size: 1.5em; font-weight: 700; line-height: 1.3; margin-bottom: 4px; }
    .authors { font-size: 1.1em; color: #4b5563; margin-bottom: 20px; }
    .meta-row { display: flex; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 0.92em; }
    .meta-row:last-child { border-bottom: none; }
    .label { color: #6b7280; width: 90px; min-width: 90px; font-weight: 500; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { background: #f0f4ff; color: #2563eb; border-radius: 3px; padding: 2px 8px; font-size: 0.85em; }
    .format { background: #f0fdf4; color: #16a34a; border-radius: 3px; padding: 2px 8px; font-size: 0.85em; font-weight: 500; }
    .description { padding: 24px 28px; border-top: 1px solid #e5e7eb; font-size: 0.95em; line-height: 1.6; color: #374151; }
    .description h3 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 12px; }
    .description :is(p, ul, ol) { margin-bottom: 12px; }
    @media (max-width: 560px) {
      .book-layout { flex-direction: column; align-items: center; text-align: center; padding: 20px; }
      .cover { width: 160px; min-width: 160px; align-self: center; }
      .meta-row { justify-content: center; }
      .tags { justify-content: center; }
    }`;

  const card = html`
      <div class="book-layout">
        ${coverImg}
        <div class="details">
          <div class="title">${book.title}</div>
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

  return appLayout(html`${book.title} - Lyceum`, extraStyles, card);
}
