import { logger as root } from "../logger.ts";
import type { DeviceProvider, DeviceInfo } from "./index.ts";

const log = root.child({ module: "xteink" });

const API_BASE = "http://8.130.157.48:8000";

const HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  "User-Agent": "okhttp/4.12.0",
};

interface TokenSet {
  access_token: string;
  refresh_token: string;
}

async function xteinkFetch(
  path: string,
  opts: RequestInit = {},
  tokens?: TokenSet,
): Promise<any> {
  const headers: Record<string, string> = {
    ...HEADERS,
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (tokens) headers["Authorization"] = `Bearer ${tokens.access_token}`;

  let res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  // Auto-refresh on 401
  if (res.status === 401 && tokens?.refresh_token) {
    log.info("Access token expired, refreshing");
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { ...HEADERS, Authorization: `Bearer ${tokens.refresh_token}` },
    });
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json() as any;
      if (refreshData.access_token) {
        tokens.access_token = refreshData.access_token;
        headers["Authorization"] = `Bearer ${tokens.access_token}`;
        res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      }
    }
  }

  if (!res.ok) {
    const body = await res.text();
    log.error({ path, status: res.status }, "Request failed");
    throw new Error(`Xteink API error (${res.status}): ${body}`);
  }
  return res.json();
}

export class XteinkProvider implements DeviceProvider {
  // In-memory storage for tokens between startAuth and completeAuth
  private pendingTokens = new Map<string, { tokens: TokenSet; devices: any[] }>();

  async startAuth(params: Record<string, string>): Promise<{ message: string }> {
    const email = params.email;
    const password = params.password;
    if (!email || !password) throw new Error("email and password are required");

    // Login
    const loginResult = await xteinkFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!loginResult.access_token) {
      throw new Error("Login failed: no access token returned");
    }

    const tokens: TokenSet = {
      access_token: loginResult.access_token,
      refresh_token: loginResult.refresh_token ?? "",
    };

    // List bound devices
    const bindingResult = await xteinkFetch("/api/v1/device/binding", {}, tokens);
    const devices = bindingResult.data ?? [];

    // Store for completeAuth
    this.pendingTokens.set(email, { tokens, devices });

    if (devices.length === 0) {
      return {
        message: `Logged in successfully but no devices are bound to this account. Bind your device in the Xteink app first, then try again.`,
      };
    }

    if (devices.length === 1) {
      return {
        message: `Logged in. Found 1 device: "${devices[0].device_id}" (${devices[0].version}). Use verify_device with the code "1" to confirm.`,
      };
    }

    const deviceList = devices
      .map((d: any, i: number) => `${i + 1}. ${d.device_id} (${d.version})`)
      .join("\n");
    return {
      message: `Logged in. Found ${devices.length} devices:\n${deviceList}\nUse verify_device with the number of the device you want to use.`,
    };
  }

  async completeAuth(params: Record<string, string>): Promise<DeviceInfo> {
    const email = params.email;
    if (!email) throw new Error("email is required");

    const pending = this.pendingTokens.get(email);
    if (!pending) throw new Error("No pending auth. Call add_device first.");

    const { tokens, devices } = pending;
    if (devices.length === 0) {
      throw new Error("No devices bound to this account");
    }

    const selection = parseInt(params.code ?? "1", 10) - 1;
    if (selection < 0 || selection >= devices.length) {
      throw new Error(`Invalid selection. Choose 1-${devices.length}.`);
    }

    const device = devices[selection];
    this.pendingTokens.delete(email);

    return {
      id: "",
      name: "",
      type: "xteink",
      credentials: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        device_id: device.device_id,
        email,
      },
    };
  }

  async sendFile(device: DeviceInfo, file: Buffer, filename: string): Promise<void> {
    const tokens: TokenSet = {
      access_token: device.credentials.access_token,
      refresh_token: device.credentials.refresh_token,
    };
    const deviceId = device.credentials.device_id;

    // Step 1: Upload file via multipart form
    const boundary = `----NodeFormBoundary${crypto.randomUUID().replace(/-/g, "")}`;
    const parts: Buffer[] = [];

    // device_id field
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="device_id"\r\n\r\n${deviceId}\r\n`
    ));

    // file field
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ));
    parts.push(file);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    log.info({ bytes: file.length }, "Uploading to Xteink");
    const uploadResult = await xteinkFetch("/api/v1/upload", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    }, tokens);

    if (!uploadResult.download_url) {
      throw new Error("Upload failed: no download URL returned");
    }

    // Step 2: Create device task
    const now = new Date();
    const datePath = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}`;
    const savePath = `/Pushed Files/${datePath}/${filename}`;

    log.info("Creating device task");
    await xteinkFetch("/api/v1/device/tasks", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceId,
        file_url: uploadResult.download_url,
        save_path: savePath,
        size: file.length,
        type: "file_transfer",
      }),
    }, tokens);

    // Update stored tokens in case they were refreshed
    device.credentials.access_token = tokens.access_token;

    log.info("Send complete");
  }
}
