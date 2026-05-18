import type { Loader } from "./types.ts";
import { listDevices } from "../devices/index.ts";

export interface DeviceItem {
  id: string;
  name: string;
  type: string;
}

export interface DevicesData {
  devices: DeviceItem[];
}

export const loadDevices: Loader<DevicesData> = async () => {
  return { devices: listDevices() };
};
