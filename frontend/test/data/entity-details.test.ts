import type { HassEntity } from "home-assistant-js-websocket";
import { describe, expect, it, vi } from "vitest";
import {
  areaFacts,
  backupFacts,
  configEntryFacts,
  deviceFacts,
  editorText,
  entityDetailsCopyText,
  factsCopyText,
  formatDetailValue,
  isLongValue,
  isStillSetByHand,
  orderAttributeKeys,
  parseEditedValue,
  runnableFacts,
  setEntityStateByHand,
  updateFacts,
  valueKind,
  withAttribute,
} from "../../src/data/entity-details";

const entity = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
  contextId = "ctx-1"
): HassEntity => ({
  entity_id: entityId,
  state,
  attributes,
  last_changed: "2026-11-20T18:42:07.000Z",
  last_updated: "2026-11-20T19:40:51.000Z",
  context: { id: contextId, parent_id: null, user_id: null },
});

describe("value kinds and the editor they get", () => {
  it("picks the editor from the value's type", () => {
    expect(valueKind(true)).toBe("boolean");
    expect(valueKind(158)).toBe("number");
    expect(valueKind(Number.NaN)).toBe("structured");
    expect(valueKind("on")).toBe("text");
    expect(valueKind(["xy"])).toBe("structured");
    expect(valueKind({ a: 1 })).toBe("structured");
    expect(valueKind(null)).toBe("structured");
  });

  it("reads typed numbers back and refuses what is not a number", () => {
    expect(parseEditedValue("number", " 42.5 ")).toEqual({
      ok: true,
      value: 42.5,
    });
    expect(parseEditedValue("number", "")).toEqual({
      ok: false,
      error: "not_a_number",
    });
    expect(parseEditedValue("number", "12abc")).toEqual({
      ok: false,
      error: "not_a_number",
    });
  });

  it("reads lists and objects back and refuses broken ones", () => {
    expect(parseEditedValue("structured", '["color_temp", "xy"]')).toEqual({
      ok: true,
      value: ["color_temp", "xy"],
    });
    expect(parseEditedValue("structured", "a: 1\nb: [2, 3]")).toEqual({
      ok: true,
      value: { a: 1, b: [2, 3] },
    });
    expect(parseEditedValue("structured", "[1, 2")).toEqual({
      ok: false,
      error: "invalid_structure",
    });
    expect(parseEditedValue("structured", "")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("keeps text exactly and switches as switches", () => {
    expect(parseEditedValue("text", "  on ")).toEqual({
      ok: true,
      value: "  on ",
    });
    expect(parseEditedValue("boolean", false)).toEqual({
      ok: true,
      value: false,
    });
  });

  it("starts the editor with the current value", () => {
    expect(editorText(["xy"], "structured")).toBe('[\n  "xy"\n]');
    expect(editorText(158, "number")).toBe("158");
    expect(editorText(null, "text")).toBe("");
  });

  it("replaces one attribute without changing the original", () => {
    const original = { brightness: 158, color_mode: "xy" };
    const next = withAttribute(original, "brightness", 20);
    expect(next).toEqual({ brightness: 20, color_mode: "xy" });
    expect(original.brightness).toBe(158);
  });
});

describe("writing attributes for reading", () => {
  it("orders attribute names alphabetically regardless of case", () => {
    expect(
      orderAttributeKeys({ supported: 1, Brightness: 2, color_mode: 3 })
    ).toEqual(["Brightness", "color_mode", "supported"]);
  });

  it("writes short lists on one line and long ones indented", () => {
    expect(formatDetailValue(["color_temp", "xy"])).toBe(
      '["color_temp", "xy"]'
    );
    expect(formatDetailValue("on")).toBe("on");
    expect(formatDetailValue(158)).toBe("158");
    const long = formatDetailValue({
      effect_list: ["colorloop", "random", "rainbow", "candle", "fireplace"],
    });
    expect(long.split("\n").length).toBeGreaterThan(1);
  });

  it("folds long values", () => {
    expect(isLongValue("short")).toBe(false);
    expect(isLongValue("x".repeat(200))).toBe(true);
    expect(isLongValue("a\nb\nc\nd\ne")).toBe(true);
  });
});

describe("copy everything", () => {
  it("writes every field and every attribute with raw names", () => {
    const text = entityDetailsCopyText({
      stateObj: entity("light.hallway_light", "on", {
        supported_color_modes: ["color_temp", "xy"],
        brightness: 158,
      }),
      uniqueId: "0x00158d",
      deviceId: "abc",
      platform: "zha",
      labels: [],
    });
    expect(text).toBe(
      [
        "entity_id: light.hallway_light",
        "unique_id: 0x00158d",
        "device_id: abc",
        "platform: zha",
        "state: on",
        "last_changed: 2026-11-20T18:42:07.000Z",
        "last_updated: 2026-11-20T19:40:51.000Z",
        "attributes:",
        "  brightness: 158",
        '  supported_color_modes: ["color_temp", "xy"]',
      ].join("\n")
    );
  });
});

describe("a state set by hand", () => {
  it("stays marked until a report with another context replaces it", () => {
    expect(isStillSetByHand(entity("a.b", "1", {}, "mine"), "mine")).toBe(true);
    expect(isStillSetByHand(entity("a.b", "1", {}, "device"), "mine")).toBe(
      false
    );
    expect(isStillSetByHand(undefined, "mine")).toBe(false);
    expect(isStillSetByHand(entity("a.b", "1"), undefined)).toBe(false);
  });

  it("uses the same REST call as the states tool", async () => {
    const callApi = vi.fn().mockResolvedValue({});
    await setEntityStateByHand({ callApi }, "light.x", "off", {
      brightness: 0,
    });
    expect(callApi).toHaveBeenCalledWith("POST", "states/light.x", {
      state: "off",
      attributes: { brightness: 0 },
    });
  });
});

describe("facts for things that are not entities", () => {
  it("lists a device's identifiers and leaves out what it lacks", () => {
    const facts = deviceFacts({
      id: "dev1",
      identifiers: [["zha", "00:15:8d"]],
      connections: [],
      model: "Lamp",
      sw_version: "1.2",
      via_device_id: "hub",
      config_entries: ["entry1"],
    });
    expect(facts.map((item) => item.key)).toEqual([
      "device_id",
      "identifiers",
      "model",
      "firmware",
      "via_device",
      "config_entries",
    ]);
    expect(facts[1].value).toBe("zha: 00:15:8d");
    expect(facts[4].href).toBe("/config/devices/device/hub");
  });

  it("lists an integration entry", () => {
    expect(
      configEntryFacts({
        entry_id: "e1",
        domain: "hue",
        source: "user",
        state: "loaded",
        disabled_by: null,
      }).map((item) => [item.key, item.value])
    ).toEqual([
      ["entry_id", "e1"],
      ["domain", "hue"],
      ["source", "user"],
      ["entry_state", "loaded"],
    ]);
  });

  it("lists an automation and uses a scene's state as its last run", () => {
    const automation = runnableFacts(
      entity("automation.hall", "on", {
        id: "1700",
        last_triggered: "2026-11-20T10:00:00Z",
        mode: "single",
        current: 0,
      })
    );
    expect(automation.map((item) => item.key)).toEqual([
      "entity_id",
      "unique_id",
      "last_triggered",
      "mode",
      "current_runs",
    ]);
    const scene = runnableFacts(entity("scene.evening", "unknown"));
    expect(scene.map((item) => item.key)).toEqual(["entity_id"]);
  });

  it("lists an area with its floor", () => {
    expect(
      areaFacts({
        area_id: "hall",
        floor_id: "ground",
        floorName: "Ground floor",
        aliases: ["Entry"],
      }).map((item) => item.value)
    ).toEqual(["hall", "Ground floor (ground)", "Entry"]);
  });

  it("lists a backup's size once when every location holds the same file", () => {
    const facts = backupFacts({
      backup_id: "abc123",
      date: "2026-11-20T10:00:00Z",
      agents: {
        "backup.local": { size: 1024, protected: true },
        "cloud.cloud": { size: 1024, protected: true },
      },
    });
    expect(facts.find((item) => item.key === "size")).toEqual({
      key: "size",
      value: "1024",
      kind: "bytes",
    });
    expect(facts.find((item) => item.key === "protected")?.value).toBe("true");
    expect(facts.find((item) => item.key === "locations")?.value).toBe(
      "backup.local\ncloud.cloud"
    );
  });

  it("only links an update's release notes over http", () => {
    const safe = updateFacts(
      entity("update.core", "on", {
        installed_version: "1",
        latest_version: "2",
        release_url: "https://example.com/notes",
      })
    );
    expect(safe.find((item) => item.key === "release_url")?.href).toBe(
      "https://example.com/notes"
    );
    const unsafe = updateFacts(
      entity("update.core", "on", { release_url: "data:text/html,notes" })
    );
    expect(unsafe.find((item) => item.key === "release_url")).toBeUndefined();
  });

  it("copies facts as plain text", () => {
    expect(
      factsCopyText([
        { key: "area_id", value: "hall", kind: "mono" },
        { key: "aliases", value: "a\nb", kind: "text" },
      ])
    ).toBe("area_id: hall\naliases:\n  a\n  b");
  });
});
