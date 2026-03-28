# Lyceum

<img src="public/logo-readme.png" alt="Lyceum" width="200">

An [MCP](https://modelcontextprotocol.io/) server for querying and managing an ebook library via AI agents. Works with any MCP client — Claude, ChatGPT, Cursor, Claude Code, and others.

Self-contained with SQLite + file storage, no external dependencies. Books are uploaded through the web UI or via the MCP tools.

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_PASSWORD` | Yes | — | Password for the OAuth authorization page |
| `DATA_DIR` | No | `/data` | Directory for the database and book files |
| `CONVERTER_URL` | No | — | URL of an ebook converter API for format conversion |
| `CONVERTER_API_KEY` | No | — | Bearer token for the converter API |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of this server (used for OAuth redirects and signed URLs) |
| `PORT` | No | `3000` | Port to listen on |

## Running

```bash
AUTH_PASSWORD=your-secret DATA_DIR=./data npm run dev
```

For production:

```bash
AUTH_PASSWORD=your-secret \
  DATA_DIR=/var/lib/lyceum \
  BASE_URL=https://lyceum.yourdomain.com \
  npm start
```

### Importing from Calibre

To migrate an existing Calibre library into Lyceum, run the import script once before starting the server:

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

## Format Conversion

The `convert_book` MCP tool converts a book from one format to another (e.g. EPUB to MOBI). This requires [ebook-converter-api](https://github.com/matthewp/ebook-converter-api):

- `CONVERTER_URL` — base URL of the service (e.g. `http://converter:8080`)
- `CONVERTER_API_KEY` — optional Bearer token

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
| `list_books_by_author` | List all books by a specific author |
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
| `get_opds_settings` | Get current OPDS catalog settings |
| `set_opds_settings` | Configure OPDS catalog (enable/disable, set username and password) |
| `get_kosync_settings` | Get current KOSync (reading progress sync) settings |
| `set_kosync_settings` | Configure KOSync (enable/disable, set username and password) |

## Connecting an MCP Client

Lyceum exposes its MCP endpoint at `/mcp` (e.g. `https://lyceum.yourdomain.com/mcp`). Any MCP client that supports HTTP transport with OAuth 2.1 can connect. Here are a few examples:

### claude.ai

Go to **Settings > Connectors > Add custom connector** and enter your `/mcp` URL. You'll be prompted to authenticate via the OAuth flow.

### Claude Code

```bash
claude mcp add --transport http lyceum https://lyceum.yourdomain.com/mcp
```

### ChatGPT

Go to **Settings > Integrations**, add a new MCP server, and enter your `/mcp` URL. ChatGPT will handle the OAuth authentication automatically. See [OpenAI's MCP documentation](https://platform.openai.com/docs/guides/tools-remote-mcp) for current setup details.

### VS Code (Copilot)

Add a remote MCP server to your `.vscode/mcp.json`:

```json
{
  "servers": {
    "lyceum": {
      "type": "http",
      "url": "https://lyceum.yourdomain.com/mcp"
    }
  }
}
```

VS Code handles the OAuth flow when you first connect. See [VS Code's MCP documentation](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for current setup details.

### Other clients

Lyceum works with any MCP client that supports HTTP transport with OAuth 2.1, including Cursor, Windsurf, and others. Point the client at your `/mcp` URL — Lyceum uses dynamic client registration, so clients that support the MCP auth spec will authenticate automatically.

## Send to Device

Lyceum can send books directly to e-reader devices. Currently supported:

### Boox

Send books to [Boox](https://www.boox.com/) e-readers via the Send2Boox cloud service. To set up, ask your agent to add your device — it will walk you through the flow:

1. **Add device**: Provide your Boox account email and region (`us`, `eu`, or `cn`). A verification code is sent to your email.
2. **Verify**: Enter the code to complete setup. The device is saved and ready to use.
3. **Send**: Ask your agent to send any book in your library to the device by name.

### Xteink

Send books to [Xteink](https://www.xteink.com/) e-readers (X3, X4) via the XT Cloud service. The device polls for new files approximately every 30 seconds.

1. **Add device**: Provide your Xteink account email and password. Lyceum logs in and lists your bound devices.
2. **Verify**: Select which device to use (by number if you have multiple).
3. **Send**: Ask your agent to send any book to the device. It appears in the "Pushed Files" folder.

Note: The Xteink cloud API communicates over unencrypted HTTP.

Device credentials are persisted to `lyceum.db` so they survive restarts.

## OPDS Catalog

OPDS (Open Publication Distribution System) is an open standard that lets e-reader apps browse, search, and download books from a server. If you use a reading app on your phone, tablet, or e-reader, OPDS is how you connect it to your Lyceum library — no manual file transfers needed.

Most popular reading apps support OPDS, including [KOReader](https://koreader.rocks/), [Moon+ Reader](https://www.moondownload.com/), [FBReader](https://fbreader.org/), [Aldiko](https://www.aldiko.com/), [Foliate](https://johnfactotum.github.io/foliate/) (Linux), and PocketBook devices (built-in). Kobo and Kindle e-readers do not have native OPDS support, but you can use it if you install KOReader on them.

### Enabling OPDS

OPDS is disabled by default. To enable it, you need to set a username and password that your reader apps will use to authenticate. There are two ways to do this:

**Via MCP:**

If you have Lyceum connected to an MCP client, you can ask your agent to enable OPDS and set the username and password for you. For example: *"Enable OPDS with username reader and password secret123"*. The agent will call the `set_opds_settings` tool on your behalf. You can also check the current configuration by asking *"What are my OPDS settings?"*.

**Via the web UI:**

1. Log into Lyceum and go to **Settings** in the sidebar.
2. Check **Enable OPDS feeds**.
3. Set a **username** and **password**. These are separate from your Lyceum login password — they are only used by reader apps.
4. Click **Save**.

Once enabled, the OPDS catalog URL is shown on the Settings page:

```
https://lyceum.yourdomain.com/opds/
```

### Connecting a Reader App

Every app is slightly different, but the general steps are the same:

1. Open your reader app's **OPDS catalog** or **network library** settings.
2. Add a new catalog with:
   - **URL**: `https://lyceum.yourdomain.com/opds/`
   - **Username**: the OPDS username you configured
   - **Password**: the OPDS password you configured
3. Browse the catalog. You'll see sections for recent additions, authors, series, and tags.
4. Tap a book to download it to your device.

#### Boox

Boox e-readers have built-in OPDS support through the **PushRead** app, which comes preinstalled — no need to install KOReader or any other app.

1. Open **PushRead** and switch to the **OPDS** tab.
2. Go to **Directory > Add subscription > Custom**.
3. Tap **Add Group** and enter a group name (e.g. "Lyceum").
4. Tap the **Add icon** in the upper right corner and enter your OPDS URL.
5. Enter your OPDS username and password when prompted.

Downloaded books will open in NeoReader.

#### Xteink (CrossPoint Reader)

The stock Xteink firmware does not support OPDS. To use OPDS on an Xteink X4, install [CrossPoint Reader](https://github.com/crosspoint-reader/crosspoint-reader), a community-built replacement firmware.

1. In CrossPoint Reader, open the **OPDS Browser**.
2. Enter your OPDS URL (e.g. `https://lyceum.yourdomain.com/opds/`).
3. Enter your OPDS username and password.

Note: CrossPoint Reader only supports **HTTP Basic** authentication, which is what Lyceum uses.

#### KOReader

Works on Kobo, Kindle, PocketBook, Android, and other devices with KOReader sideloaded.

1. Open the file browser and tap the globe icon (or go to **Search > OPDS catalog**).
2. Tap **+** to add a new catalog.
3. Enter the catalog name (e.g. "Lyceum") and the OPDS URL.
4. KOReader will prompt for username and password when you first open the catalog.

#### Moon+ Reader (Android)

1. Go to **Net Library > OPDS Catalogs**.
2. Tap the **+** button.
3. Enter the name, URL, username, and password.

#### Foliate (Linux)

1. Open the **Library** view.
2. Go to **Catalogs** and click **+**.
3. Enter the OPDS URL. Foliate will prompt for credentials.

### What OPDS provides

- **Browse** your library by author, series, tag, or recent additions
- **Search** by title, author, or keyword
- **Download** books in any available format (EPUB, PDF, MOBI, etc.)
- **Cover images** for each book

OPDS is read-only — you cannot add, delete, or edit books through it. All library management is done through the Lyceum web UI or MCP tools.

## KOSync (Reading Progress Sync)

[KOReader](https://koreader.rocks/) is an open-source ebook reader that runs on Kobo, Kindle, PocketBook, and Android devices. KOSync is its built-in reading progress sync feature — it lets you stop reading on one device and pick up where you left off on another.

Lyceum acts as a KOSync server. When you open a book in KOReader, it checks Lyceum for a newer reading position. When you close a book or turn a page, KOReader sends your current position to Lyceum. If you read the same book on multiple KOReader devices, they stay in sync automatically.

KOSync tracks **reading position only** — it does not sync bookmarks, highlights, or annotations.

### Enabling KOSync

KOSync is disabled by default. To enable it, set a username and password that your KOReader devices will use.

**Via MCP:**

If you have Lyceum connected to an MCP client, you can ask your agent to enable KOSync and set the username and password for you. For example: *"Enable KOSync with username reader and password secret123"*. The agent will call the `set_kosync_settings` tool on your behalf. You can also check the current configuration by asking *"What are my KOSync settings?"*.

**Via the web UI:**

1. Log into Lyceum and go to **Settings** in the sidebar.
2. Scroll to the **KOSync** section.
3. Check **Enable KOSync**.
4. Set a **username** and **password**.
5. Click **Save**.

Once enabled, the sync server URL is shown on the Settings page:

```
https://lyceum.yourdomain.com/kosync
```

### Connecting KOReader

1. In KOReader, go to **Top menu > Tools > Progress sync**.
2. Tap **Custom sync server** and enter your Lyceum URL (e.g. `https://lyceum.yourdomain.com/kosync`).
3. Tap **Login** and enter the username and password you configured in Lyceum.
4. Tap **Register** — KOReader will confirm the registration succeeded. (Lyceum validates that your credentials match rather than creating a new account, so only the configured user can register.)
5. Enable **Auto sync now and when KOReader is closed** for seamless syncing.

### Connecting CrossPoint Reader (Xteink)

[CrossPoint Reader](https://github.com/crosspoint-reader/crosspoint-reader) supports KOSync for syncing reading progress between Xteink e-readers and other KOReader devices.

1. Open CrossPoint Reader's settings.
2. Enter your Lyceum KOSync URL (e.g. `https://lyceum.yourdomain.com/kosync`), username, and password.
3. Use **Sync Progress** in the chapters menu to sync manually, or enable automatic syncing.

Note: CrossPoint's KOSync currently syncs to chapter-level accuracy rather than exact position. A [pull request](https://github.com/crosspoint-reader/crosspoint-reader/pull/1217) is in progress to improve this to precise position sync.

### How it works

KOSync identifies books by the MD5 hash of the file. This means:

- The same file on different devices syncs correctly.
- Different formats of the same book (e.g. EPUB vs PDF) are treated as separate books and have independent reading positions.
- Books must be the exact same file — if you modify or re-download a book, it gets a new hash and previous progress won't carry over.

### Security

KOReader sends an MD5-hashed password in request headers on every sync call. Only the username and password configured in Lyceum are accepted — there is no open registration. Over HTTPS this is secure for self-hosted use.

## Authentication

Lyceum uses OAuth 2.1 with dynamic client registration. When a client connects, it registers automatically, then the user authenticates with the `AUTH_PASSWORD`. Sessions are persisted to disk so they survive server restarts.

Download and upload links use HMAC-SHA256 signed URLs so they can be opened in a browser without additional authentication.
