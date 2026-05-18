import type { Loader } from "./types.ts";
import { getDevice } from "../devices/index.ts";

export interface DeviceDetailData {
  name: string;
  type: string;
  ip: string | null;
  port: string | null;
  bookmarkletHref: string;
}

export const loadDeviceDetail: Loader<DeviceDetailData> = async ({ params, baseUrl }) => {
  const name = decodeURIComponent(params.name);
  const device = getDevice(name);
  if (!device) throw new Error("Device not found");
  const deviceParam = encodeURIComponent(name);
  // The bookmarklet href is a `javascript:` URL the user drags to their
  // browser bookmarks bar. We assemble it server-side so the user just sees
  // a static link.
  const bookmarkletHref = `javascript:location.href='${baseUrl}/app/bookmarklet?device=${deviceParam}&url='+encodeURIComponent(location.href)`;
  const isCp = device.type === "crosspoint" && device.credentials?.ip;
  return {
    name,
    type: device.type,
    ip: isCp ? device.credentials!.ip : null,
    port: isCp ? (device.credentials!.port ?? "81") : null,
    bookmarkletHref,
  };
};
