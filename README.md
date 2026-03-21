# Lyceum

<img src="public/logo-readme.png" alt="Lyceum" width="200">

An MCP server for querying and managing an ebook library via chat. Works with [claude.ai](https://claude.ai) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Two storage backends are supported:

- **Local** — self-contained SQLite + file storage, no external dependencies. Books are uploaded through the web UI.
- **Calibre** — talks to a running [Calibre content server](https://manual.calibre-ebook.com/server.html) over HTTP. No direct database access or CLI tools needed.

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_PASSWORD` | Yes | — | Password for the OAuth authorization page |
| `STORAGE_MODE` | No | `calibre` | Storage backend: `calibre` or `local` |
| `DATA_DIR` | No | `/data` | Directory for local storage database and book files (`local` mode only) |
| `CONVERTER_URL` | No | — | URL of an ebook converter API for format conversion (`local` mode only) |
| `CONVERTER_API_KEY` | No | — | Bearer token for the converter API (`local` mode only) |
| `CALIBRE_SERVER_URL` | No | `http://localhost:8080` | URL of the Calibre content server (`calibre` mode only) |
| `CALIBRE_LIBRARY_ID` | No | — | Library ID for multi-library Calibre setups (`calibre` mode only) |
| `CALIBRE_USERNAME` | No | — | Username for Calibre content server Digest auth (`calibre` mode only) |
| `CALIBRE_PASSWORD` | No | — | Password for Calibre content server Digest auth (`calibre` mode only) |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of this server (used for OAuth redirects and signed URLs) |
| `PORT` | No | `3000` | Port to listen on |

## Running

### Local mode

```bash
AUTH_PASSWORD=your-secret STORAGE_MODE=local DATA_DIR=./data npm run dev
```

For production:

```bash
AUTH_PASSWORD=your-secret \
  STORAGE_MODE=local \
  DATA_DIR=/var/lib/lyceum \
  BASE_URL=https://lyceum.yourdomain.com \
  npm start
```

### Calibre mode

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

### Importing from Calibre

To migrate an existing Calibre library into local storage, run the import script once before starting the server:

```bash
CALIBRE_SERVER_URL=http://calibre:8080 \
  DATA_DIR=./data \
  npm run import
```

This downloads all books and covers from the Calibre content server and stores them in the local SQLite database and file store.

## Container

Pre-built images are available from GitHub Container Registry:

```bash
podman pull ghcr.io/matthewp/lyceum:latest
```

The container exposes port 3000. Mount a volume at `/data` to persist state across restarts:

```bash
podman run -d \
  -p 3009:3000 \
  -v lyceum-data:/data \
  -e AUTH_PASSWORD=your-secret \
  -e STORAGE_MODE=local \
  -e BASE_URL=https://lyceum.yourdomain.com \
  ghcr.io/matthewp/lyceum:latest
```

To use Calibre mode instead, swap `STORAGE_MODE=local` for `CALIBRE_SERVER_URL=http://calibre:8080`.

To build from source instead, the included `Containerfile` uses `node:24-slim`. Node 24 supports native TypeScript type stripping, so no build step is needed — the source runs directly with `--experimental-strip-types`.

```bash
podman build -t lyceum .
```

For sensitive values, use podman secrets:

```bash
printf 'your-secret' | podman secret create lyceum_auth_password -
```

Then reference them in a [quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) `.container` file:

```ini
Secret=lyceum_auth_password,type=env,target=AUTH_PASSWORD
```

## Format Conversion

The `convert_book` MCP tool converts a book from one format to another (e.g. EPUB to MOBI). In **local mode**, this requires an external converter service:

- `CONVERTER_URL` — base URL of the service (e.g. `http://converter:8080`)
- `CONVERTER_API_KEY` — optional Bearer token

The converter must accept `POST /convert` with a multipart form body containing a `file` field (the source file) and a `format` field (the target extension, e.g. `mobi`), and return the converted file as the response body.

In **Calibre mode**, conversion is handled by the Calibre content server directly.

## MCP Tools

| Tool | Description |
|---|---|
| `list_books` | List books sorted by most recently added |
| `get_book` | Get full details for a book (authors, tags, series, formats, etc.) |
| `search_books` | Search books by title, author, tag, or series name |
| `list_authors` | List all authors with book counts |
| `list_tags` | List all tags with book counts |
| `list_series` | List all series with book counts |
| `list_books_by_series` | List all books in a series, ordered by series index |
| `get_view_link` | Get a signed URL to view a book's details page with cover and metadata (expires in 10 minutes) |
| `get_download_link` | Get a signed download URL for a book file (expires in 5 minutes) |
| `get_upload_link` | Get a signed URL to upload a book via browser (expires in 10 minutes) |
| `get_add_format_link` | Get a signed URL to upload an additional format to an existing book (expires in 10 minutes) |
| `set_metadata` | Update metadata fields on a book (title, authors, tags, series, etc.) |
| `set_cover` | Set a book's cover image from a URL |
| `fetch_metadata` | Search Google Books for metadata by title, author, or ISBN |
| `remove_book` | Permanently remove one or more books from the library |
| `remove_format` | Remove specific file formats from a book (e.g. remove MOBI but keep EPUB) |
| `convert_book` | Convert a book to a different format (e.g. EPUB to MOBI) |
| `add_device` | Start adding an e-reader device (sends a verification code) |
| `verify_device` | Complete device setup with the verification code |
| `list_devices` | List all configured e-reader devices |
| `remove_device` | Remove a configured device |
| `send_to_device` | Send a book to an e-reader device |

## Connecting to Claude

### claude.ai

Go to **Settings > Connectors > Add custom connector** and enter your server's `/mcp` URL (e.g. `https://lyceum.yourdomain.com/mcp`). You'll be prompted to authenticate via the OAuth flow.

### Claude Code

```bash
claude mcp add --transport http lyceum https://lyceum.yourdomain.com/mcp
```

## Send to Device

Lyceum can send books directly to e-reader devices. Currently supported:

### Boox

Send books to [Boox](https://www.boox.com/) e-readers via the Send2Boox cloud service. To set up, ask Claude to add your device — it will walk you through the flow:

1. **Add device**: Provide your Boox account email and region (`us`, `eu`, or `cn`). A verification code is sent to your email.
2. **Verify**: Enter the code to complete setup. The device is saved and ready to use.
3. **Send**: Ask Claude to send any book in your library to the device by name.

### Xteink

Send books to [Xteink](https://www.xteink.com/) e-readers (X3, X4) via the XT Cloud service. The device polls for new files approximately every 30 seconds.

1. **Add device**: Provide your Xteink account email and password. Lyceum logs in and lists your bound devices.
2. **Verify**: Select which device to use (by number if you have multiple).
3. **Send**: Ask Claude to send any book to the device. It appears in the "Pushed Files" folder.

Note: The Xteink cloud API communicates over unencrypted HTTP.

Device credentials are persisted to `lyceum.db` so they survive restarts.

## Authentication

Lyceum uses OAuth 2.1 with dynamic client registration. When a client connects, it registers automatically, then the user authenticates with the `AUTH_PASSWORD`. Sessions are persisted to disk so they survive server restarts.

Download and upload links use HMAC-SHA256 signed URLs so they can be opened in a browser without additional authentication.

In Calibre mode, communication with the content server uses HTTP Digest authentication when `CALIBRE_USERNAME` and `CALIBRE_PASSWORD` are set.
