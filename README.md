# Lyceum

An MCP server for querying a Calibre library. Connect it to Claude (or any MCP client) to search books, browse metadata, and download files via chat.

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_PASSWORD` | Yes | — | Password for the OAuth authorization page |
| `CALIBRE_DB_PATH` | No | `~/calibre-library/metadata.db` | Path to Calibre's `metadata.db` file |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of the server (used for OAuth redirects and download links) |
| `PORT` | No | `3000` | Port to listen on |

## Running

```bash
AUTH_PASSWORD=your-secret npm run dev
```

For production:

```bash
AUTH_PASSWORD=your-secret BASE_URL=https://lyceum.yourdomain.com npm start
```

## MCP Tools

| Tool | Description |
|---|---|
| `list_books` | List books sorted by most recently added |
| `get_book` | Get full details for a book (authors, tags, series, formats, read date, etc.) |
| `search_books` | Search by title, author, tag, or series |
| `list_authors` | List all authors with book counts |
| `list_tags` | List all tags with book counts |
| `list_series` | List all series with book counts |
| `list_read_books` | List books marked as read, sorted by read date |
| `list_unread_books` | List books not yet read |
| `get_download_link` | Get a signed, expiring download URL for a book file |

## Connecting to Claude

Add as a remote MCP server in Claude Code:

```bash
claude mcp add --transport http lyceum http://localhost:3000/mcp
```

Then run `/mcp` to authenticate via the OAuth flow.

For claude.ai, go to Settings > Connectors > Add custom connector and enter your server's `/mcp` URL.
