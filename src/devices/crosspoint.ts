import { createSocket } from "node:dgram";
import { logger as root } from "../logger.ts";
import type { DeviceInfo, DeviceProvider } from "./index.ts";

const log = root.child({ module: "crosspoint" });

const DISCOVERY_PORTS = [8134, 54982, 48123, 39001, 44044, 59678];
const DEFAULT_PORT = 81;
const CHUNK_SIZE = 4096;

export class CrossPointConnectionError extends Error {
  readonly ip: string;
  readonly port: number;
  constructor(ip: string, port: number) {
    super(`Could not connect to CrossPoint device at ${ip}:${port}`);
    this.name = "CrossPointConnectionError";
    this.ip = ip;
    this.port = port;
  }
}

export async function discoverCrossPointDevices(
  timeoutMs = 2000,
): Promise<Array<{ ip: string; port: number }>> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const found = new Map<string, number>(); // ip -> port

    socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      if (text.startsWith("crosspoint")) {
        const match = text.match(/crosspoint;(\d+)/);
        const port = match ? parseInt(match[1], 10) : DEFAULT_PORT;
        if (!found.has(rinfo.address)) {
          log.info({ ip: rinfo.address, port }, "Discovered CrossPoint device");
          found.set(rinfo.address, port);
        }
      }
    });

    socket.on("error", (err) => {
      log.warn({ err }, "UDP socket error during discovery");
      socket.close();
      resolve([...found.entries()].map(([ip, port]) => ({ ip, port })));
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      const hello = Buffer.from("hello");
      for (const port of DISCOVERY_PORTS) {
        socket.send(hello, port, "255.255.255.255", (err) => {
          if (err) log.warn({ port, err }, "Failed to send discovery broadcast");
        });
      }
    });

    setTimeout(() => {
      socket.close();
      resolve([...found.entries()].map(([ip, port]) => ({ ip, port })));
    }, timeoutMs);
  });
}

export async function sendViaWebSocket(
  ip: string,
  port: number,
  filename: string,
  file: Buffer,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `ws://${ip}:${port}/`;
    log.info({ url, filename, bytes: file.length }, "Connecting to CrossPoint device");

    const ws = new WebSocket(url);
    let transferComplete = false;

    ws.addEventListener("open", () => {
      ws.send(`START:${filename}:${file.length}:/`);
    });

    ws.addEventListener("message", (event) => {
      const msg = typeof event.data === "string"
        ? event.data
        : new TextDecoder().decode(event.data as ArrayBuffer);

      if (msg === "READY") {
        log.info("Device ready, sending file");
        let offset = 0;
        function sendNextChunk() {
          if (offset >= file.length) return;
          const chunk = file.subarray(offset, offset + CHUNK_SIZE);
          ws.send(chunk);
          offset += chunk.length;
          if (offset < file.length) setImmediate(sendNextChunk);
        }
        sendNextChunk();
      } else if (msg.startsWith("PROGRESS:")) {
        const [, received, total] = msg.split(":");
        log.info({ received, total }, "Transfer progress");
      } else if (msg === "DONE") {
        transferComplete = true;
        log.info("Transfer complete");
        ws.close();
        resolve();
      } else if (msg.startsWith("ERROR:")) {
        const detail = msg.slice(6);
        ws.close();
        reject(new Error(`CrossPoint device error: ${detail}`));
      }
    });

    ws.addEventListener("error", () => {
      reject(new CrossPointConnectionError(ip, port));
    });

    ws.addEventListener("close", () => {
      if (!transferComplete) {
        reject(new Error("WebSocket closed before transfer completed"));
      }
    });
  });
}

export class CrossPointProvider implements DeviceProvider {
  private pendingDiscovery: Array<{ ip: string; port: number }> | null = null;

  async startAuth(params: Record<string, string>): Promise<{ message: string; devices?: Array<{ ip: string; port: number }> }> {
    if (params.ip) {
      const port = params.port ? parseInt(params.port, 10) : DEFAULT_PORT;
      this.pendingDiscovery = [{ ip: params.ip, port }];
      return {
        message: `CrossPoint device at ${params.ip}:${port} ready. Select it below to confirm.`,
        devices: [{ ip: params.ip, port }],
      };
    }

    log.info("Starting CrossPoint UDP discovery");
    const found = await discoverCrossPointDevices();
    this.pendingDiscovery = found;

    if (found.length === 0) {
      return {
        message:
          "No CrossPoint devices found. Make sure your device is in File Transfer → Connect to Calibre mode and on the same network as Lyceum. Alternatively, provide {ip, port} params to add a device manually.",
      };
    }

    if (found.length === 1) {
      return {
        message: `Found 1 CrossPoint device. Select it below to confirm.`,
        devices: found,
      };
    }

    return {
      message: `Found ${found.length} CrossPoint devices. Select the one you want to add.`,
      devices: found,
    };
  }

  async completeAuth(params: Record<string, string>): Promise<DeviceInfo> {
    if (!this.pendingDiscovery || this.pendingDiscovery.length === 0) {
      throw new Error("No pending CrossPoint discovery. Call add_device first.");
    }

    const selection = parseInt(params.selection ?? "1", 10) - 1;
    if (selection < 0 || selection >= this.pendingDiscovery.length) {
      throw new Error(
        `Invalid selection. Choose 1–${this.pendingDiscovery.length}.`,
      );
    }

    const { ip, port } = this.pendingDiscovery[selection];
    this.pendingDiscovery = null;

    return {
      id: "",
      name: "",
      type: "crosspoint",
      credentials: { ip, port: String(port) },
    };
  }

  async sendFile(
    device: DeviceInfo,
    file: Buffer,
    filename: string,
  ): Promise<void> {
    const ip = device.credentials.ip;
    const port = parseInt(device.credentials.port, 10);
    if (!ip || !port) throw new Error("CrossPoint device missing ip/port credentials");
    await sendViaWebSocket(ip, port, filename, file);
  }
}
