import type { Loader } from "./types.ts";

export interface LoginData {
  error: string | null;
}

export const loadLogin: Loader<LoginData> = async ({ url }) => {
  return { error: url.searchParams.get("error") };
};
