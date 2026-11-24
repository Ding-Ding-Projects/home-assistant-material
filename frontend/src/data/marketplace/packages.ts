import type { HomeAssistant } from "../../types";

type CallWS = Pick<HomeAssistant, "callWS">;

export type InstalledPackageState = "idle" | "updating" | "restart" | "failed";

// A package that was installed from a file and names where its updates are
export interface InstalledPackage {
  key: string;
  kind: string;
  name: string;
  title: string;
  version: string;
  // Set when a newer version is on offer
  latest_version: string | null;
  notes: string | null;
  auto_update: boolean;
  state: InstalledPackageState;
  error: string | null;
  update_url: string;
}

export const fetchInstalledPackages = (hass: CallWS) =>
  hass.callWS<InstalledPackage[]>({ type: "marketplace/packages/list" });

export const setPackageAutoUpdate = (
  hass: CallWS,
  key: string,
  enabled: boolean
) =>
  hass.callWS<unknown>({
    type: "marketplace/packages/auto_update",
    key,
    enabled,
  });

export const checkPackageUpdate = (hass: CallWS, key: string) =>
  hass.callWS<InstalledPackage>({ type: "marketplace/packages/check", key });

export const installPackageUpdate = (hass: CallWS, key: string) =>
  hass.callWS<InstalledPackage>({ type: "marketplace/packages/update", key });
