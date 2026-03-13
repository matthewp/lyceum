import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BooxProvider } from "./boox.ts";

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
};

// --- Persistence ---

const DEVICES_FILE = process.env.DEVICES_FILE ?? "/data/devices.json";

function loadDevices(): DeviceInfo[] {
  try {
    return JSON.parse(readFileSync(DEVICES_FILE, "utf-8")) as DeviceInfo[];
  } catch {
    return [];
  }
}

function saveDevices(devices: DeviceInfo[]): void {
  try {
    mkdirSync(dirname(DEVICES_FILE), { recursive: true });
    writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
  } catch (e: any) {
    console.error(`[devices] Failed to save: ${e.message}`);
  }
}

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

  const devices = loadDevices();
  if (devices.some(d => d.name === name)) throw new Error(`Device "${name}" already exists`);

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

  const devices = loadDevices();
  devices.push(device);
  saveDevices(devices);
  pendingAuths.delete(name);

  console.log(`[devices] Added device "${name}" (${pending.type})`);
  return device;
}

export function listDevices(): { id: string; name: string; type: string }[] {
  return loadDevices().map(({ id, name, type }) => ({ id, name, type }));
}

export function removeDevice(name: string): void {
  const devices = loadDevices();
  const idx = devices.findIndex(d => d.name === name);
  if (idx === -1) throw new Error(`Device "${name}" not found`);
  devices.splice(idx, 1);
  saveDevices(devices);
  console.log(`[devices] Removed device "${name}"`);
}

export async function sendToDevice(
  deviceName: string,
  file: Buffer,
  filename: string,
): Promise<void> {
  const devices = loadDevices();
  const device = devices.find(d => d.name === deviceName);
  if (!device) throw new Error(`Device "${deviceName}" not found`);

  const provider = providers[device.type];
  if (!provider) throw new Error(`No provider for device type "${device.type}"`);

  await provider.sendFile(device, file, filename);
  console.log(`[devices] Sent to "${deviceName}"`);
}
