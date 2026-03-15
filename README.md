# Lyceum

<img src="public/logo-readme.png" alt="Lyceum" width="200">

An MCP server for querying and managing a [Calibre](https://calibre-ebook.com/) ebook library via chat. Works with [claude.ai](https://claude.ai) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Talks to Calibre's built-in content server over HTTP — no direct database access or CLI tools needed.

## Setup

```bash
npm install
```

Requires a running [Calibre content server](https://manual.calibre-ebook.com/server.html). You can start one from the Calibre GUI (Preferences > Sharing over the net) or from the command line:

```bash
calibre-server /path/to/library
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_PASSWORD` | Yes | — | Password for the OAuth authorization page |
| `CALIBRE_SERVER_URL` | No | `http://localhost:8080` | URL of the Calibre content server |
| `CALIBRE_LIBRARY_ID` | No | — | Library ID (only needed for multi-library setups) |
| `CALIBRE_USERNAME` | No | — | Username for Calibre content server (Digest auth) |
| `CALIBRE_PASSWORD` | No | — | Password for Calibre content server (Digest auth) |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of this server (used for OAuth redirects and signed URLs) |
| `AUTH_STATE_FILE` | No | `/data/auth-state.json` | Path to persist OAuth state (clients, tokens) across restarts |
| `DEVICES_FILE` | No | `/data/devices.json` | Path to persist configured e-reader devices |
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

## Container

Pre-built images are available from GitHub Container Registry:

```bash
podman pull ghcr.io/matthewp/lyceum:latest
```

The container exposes port 3000. Mount a volume at `/data` to persist OAuth state across restarts:

```bash
podman run -d \
  -p 3009:3000 \
  -v lyceum-data:/data \
  -e AUTH_PASSWORD=your-secret \
  -e CALIBRE_SERVER_URL=http://calibre:8080 \
  -e BASE_URL=https://lyceum.yourdomain.com \
  ghcr.io/matthewp/lyceum:latest
```

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

## MCP Tools

| Tool | Description |
|---|---|
| `list_books` | List books sorted by most recently added |
| `get_book` | Get full details for a book (authors, tags, series, formats, custom columns, etc.) |
| `search_books` | Search using Calibre's query syntax (e.g. `author:Asimov`, `tag:sci-fi`) |
| `list_authors` | List all authors with book counts |
| `list_tags` | List all tags with book counts |
| `list_series` | List all series with book counts |
| `get_view_link` | Get a signed URL to view a book's details page with cover and metadata (expires in 10 minutes) |
| `get_download_link` | Get a signed download URL for a book file (expires in 5 minutes) |
| `get_upload_link` | Get a signed URL to upload a book via browser (expires in 10 minutes) |
| `set_metadata` | Update metadata fields on a book (title, authors, tags, custom columns, etc.) |
| `set_cover` | Set a book's cover image from a URL |
| `fetch_metadata` | Search Google Books for metadata by title, author, or ISBN |
| `remove_book` | Permanently remove one or more books from the library |
| `remove_format` | Remove specific file formats from a book (e.g. remove MOBI but keep EPUB) |
| `convert_book` | Convert a book to a different format (e.g. EPUB to PDF) |
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

Device credentials are persisted to `DEVICES_FILE` so they survive restarts.

## Authentication

Lyceum uses OAuth 2.1 with dynamic client registration. When a client connects, it registers automatically, then the user authenticates with the `AUTH_PASSWORD`. Sessions are persisted to disk so they survive server restarts.

Download and upload links use HMAC-SHA256 signed URLs so they can be opened in a browser without additional authentication.

Communication with the Calibre content server uses HTTP Digest authentication when `CALIBRE_USERNAME` and `CALIBRE_PASSWORD` are set.
