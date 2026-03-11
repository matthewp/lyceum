# Lyceum

An MCP server for querying and managing a Calibre library via chat. Talks to Calibre's built-in content server over HTTP — no direct database access or CLI tools needed.

## Setup

```bash
npm install
```

Requires a running [Calibre content server](https://manual.calibre-ebook.com/server.html):

```bash
calibre-server /path/to/library
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_PASSWORD` | Yes | — | Password for the OAuth authorization page |
| `CALIBRE_SERVER_URL` | No | `http://localhost:8080` | URL of the Calibre content server |
| `CALIBRE_LIBRARY_ID` | No | — | Library ID (only needed for multi-library setups) |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of this server (used for OAuth redirects and signed URLs) |
| `PORT` | No | `3000` | Port to listen on |

## Running

```bash
AUTH_PASSWORD=your-secret npm run dev
```

For production:

```bash
AUTH_PASSWORD=your-secret \
  CALIBRE_SERVER_URL=http://calibre:8080 \
  BASE_URL=https://lyceum.yourdomain.com \
  npm start
```

## MCP Tools

| Tool | Description |
|---|---|
| `list_books` | List books sorted by most recently added |
| `get_book` | Get full details for a book (authors, tags, series, formats, etc.) |
| `search_books` | Search using Calibre's query syntax (e.g. `author:Asimov`, `tag:sci-fi`) |
| `list_authors` | List all authors with book counts |
| `list_tags` | List all tags with book counts |
| `list_series` | List all series with book counts |
| `get_download_link` | Get a download URL for a book file |
| `get_upload_link` | Get a signed URL to upload a book via browser |
| `set_metadata` | Update metadata fields on a book |
| `convert_book` | Convert a book to a different format |

## Connecting to Claude

Add as a remote MCP server in Claude Code:

```bash
claude mcp add --transport http lyceum http://localhost:3000/mcp
```

Then run `/mcp` to authenticate via the OAuth flow.

For claude.ai, go to Settings > Connectors > Add custom connector and enter your server's `/mcp` URL.
