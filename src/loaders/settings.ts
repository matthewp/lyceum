import type { Loader } from "./types.ts";
import { getOpdsSettings } from "../opds.ts";
import { getKosyncSettings } from "../kosync.ts";

export interface SettingsData {
  opdsEnabled: boolean;
  opdsUsername: string | null;
  opdsUrl: string;
  kosyncEnabled: boolean;
  kosyncUsername: string | null;
  kosyncUrl: string;
  flash: { kind: "success" | "error"; message: string } | null;
}

export const loadSettings: Loader<SettingsData> = async ({ url, baseUrl }) => {
  const opds = getOpdsSettings();
  const kosync = getKosyncSettings();
  const success = url.searchParams.get("success");
  const error = url.searchParams.get("error");
  const flash = success
    ? { kind: "success" as const, message: success }
    : error
      ? { kind: "error" as const, message: error }
      : null;
  return {
    opdsEnabled: opds.enabled,
    opdsUsername: opds.username,
    opdsUrl: `${baseUrl}/opds/`,
    kosyncEnabled: kosync.enabled,
    kosyncUsername: kosync.username,
    kosyncUrl: `${baseUrl}/kosync`,
    flash,
  };
};
