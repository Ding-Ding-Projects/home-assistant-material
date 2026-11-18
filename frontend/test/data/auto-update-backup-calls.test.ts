import { describe, expect, it, vi } from "vitest";
import {
  setAutoUpdateBackup,
  setAutoUpdateBackupApps,
  setAutoUpdateBackupChoice,
  setAutoUpdateBackupKind,
} from "../../src/data/auto-update";
import type { HomeAssistant } from "../../src/types";

// These protect the names and fields the backup choice sends. A typo here is
// rejected by the server as an invalid message and the choice silently stays.

const hassWith = () => {
  const callWS = vi.fn().mockResolvedValue(undefined);
  return { hass: { callWS } as unknown as HomeAssistant, callWS };
};

describe("backup choice calls", () => {
  it.each(["system", "all", "none"] as const)(
    "sends the %s preset",
    async (choice) => {
      const { hass, callWS } = hassWith();
      await setAutoUpdateBackupChoice(hass, choice);
      expect(callWS).toHaveBeenCalledWith({
        type: "auto_update/set_backup_choice",
        choice,
      });
    }
  );

  it("sends one kind with its switch value", async () => {
    const { hass, callWS } = hassWith();
    await setAutoUpdateBackupKind(hass, "os", false);
    expect(callWS).toHaveBeenCalledWith({
      type: "auto_update/set_backup_kind",
      kind: "os",
      enabled: false,
    });
  });

  it("sends the chosen apps with the installed ones and the later choice", async () => {
    const { hass, callWS } = hassWith();
    await setAutoUpdateBackupApps(hass, ["a"], ["a", "b"], false);
    expect(callWS).toHaveBeenCalledWith({
      type: "auto_update/set_backup_apps",
      apps: ["a"],
      installed: ["a", "b"],
      later: false,
    });
  });

  it("keeps the older single switch working", async () => {
    const { hass, callWS } = hassWith();
    await setAutoUpdateBackup(hass, true);
    expect(callWS).toHaveBeenCalledWith({
      type: "auto_update/set_backup",
      enabled: true,
    });
  });
});
