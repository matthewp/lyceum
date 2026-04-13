import { randomUUID } from "node:crypto";
import { logger as root } from "../logger.ts";
import { stateDb } from "../state.ts";
import { BooxProvider } from "./boox.ts";
import { CrossPointProvider } from "./crosspoint.ts";
import { XteinkProvider } from "./xteink.ts";

const log = root.child({ module: "devices" });

// --- Interfaces ---

export interface DeviceProvider {
  startAuth(params: Record<string, string>): Promise<{ message: string }>;
  completeAuth(params: Record<string, string>): Promise<DeviceInfo>;
  sendFile(device: DeviceInfo, file: Buffer, filename: string): Promise<void>;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  credentials: Record<string, string>;
}

interface PendingAuth {
  type: string;
  params: Record<string, string>;
}

// --- Provider registry ---

const providers: Record<string, DeviceProvider> = {
  boox: new BooxProvider(),
  crosspoint: new CrossPointProvider(),
  xteink: new XteinkProvider(),
};

// --- Pending auth state (in-memory only) ---

const pendingAuths = new Map<string, PendingAuth>();

// --- Public API ---

export async function addDevice(
  type: string,
  name: string,
  params: Record<string, string>,
): Promise<{ message: string }> {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown device type: ${type}. Supported: ${Object.keys(providers).join(", ")}`);

  const existing = stateDb.prepare("SELECT 1 FROM devices WHERE name = ?").get(name);
  if (existing) throw new Error(`Device "${name}" already exists`);

  const result = await provider.startAuth(params);
  pendingAuths.set(name, { type, params });
  return result;
}

export async function verifyDevice(
  name: string,
  params: Record<string, string>,
): Promise<DeviceInfo> {
  const pending = pendingAuths.get(name);
  if (!pending) throw new Error(`No pending auth for device "${name}". Call add_device first.`);

  const provider = providers[pending.type];
  const merged = { ...pending.params, ...params };
  const info = await provider.completeAuth(merged);

  const device: DeviceInfo = {
    id: randomUUID(),
    name,
    type: pending.type,
    credentials: info.credentials,
  };

  stateDb.prepare("INSERT INTO devices (id, name, type, credentials) VALUES (?, ?, ?, ?)").run(device.id, device.name, device.type, JSON.stringify(device.credentials));
  pendingAuths.delete(name);

  log.info({ name, type: pending.type }, "Device added");
  return device;
}

export function listDevices(): { id: string; name: string; type: string }[] {
  return stateDb.prepare("SELECT id, name, type FROM devices").all() as { id: string; name: string; type: string }[];
}

export function removeDevice(name: string): void {
  const result = stateDb.prepare("DELETE FROM devices WHERE name = ?").run(name);
  if (result.changes === 0) throw new Error(`Device "${name}" not found`);
  log.info({ name }, "Device removed");
}

export async function sendToDevice(
  deviceName: string,
  file: Buffer,
  filename: string,
): Promise<void> {
  const row = stateDb.prepare("SELECT id, name, type, credentials FROM devices WHERE name = ?").get(deviceName) as { id: string; name: string; type: string; credentials: string } | undefined;
  if (!row) throw new Error(`Device "${deviceName}" not found`);
  const device: DeviceInfo = { id: row.id, name: row.name, type: row.type, credentials: JSON.parse(row.credentials) };

  const provider = providers[device.type];
  if (!provider) throw new Error(`No provider for device type "${device.type}"`);

  await provider.sendFile(device, file, filename);
  log.info({ device: deviceName }, "Sent to device");
}
