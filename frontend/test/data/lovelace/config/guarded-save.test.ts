import { describe, expect, it, vi } from "vitest";
import { saveConfig } from "../../../../src/data/lovelace/config/types";
import type { HomeAssistant } from "../../../../src/types";

describe("guarded dashboard save contract", () => {
  it("preserves legacy requests and sends the exact expected raw config when supplied", async () => {
    const callWS = vi.fn().mockResolvedValue(undefined);
    const hass = { callWS } as unknown as HomeAssistant;
    const config = { views: [] };
    const expected = { strategy: { type: "custom:test", opaque: 42 } };
    await saveConfig(hass, null, config);
    expect(callWS).toHaveBeenLastCalledWith({
      type: "lovelace/config/save",
      url_path: null,
      config,
    });
    await saveConfig(hass, "rooms", config, expected);
    expect(callWS).toHaveBeenLastCalledWith({
      type: "lovelace/config/save",
      url_path: "rooms",
      config,
      expected_config: expected,
    });
  });

  it("propagates unsupported or stale rejection without an unguarded retry", async () => {
    const callWS = vi.fn().mockRejectedValue({ code: "invalid_format" });
    const hass = { callWS } as unknown as HomeAssistant;
    await expect(
      saveConfig(hass, null, { views: [] }, { views: [] })
    ).rejects.toEqual({ code: "invalid_format" });
    expect(callWS).toHaveBeenCalledOnce();
  });
});
