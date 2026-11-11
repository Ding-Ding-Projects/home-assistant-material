import { describe, expect, it } from "vitest";
import {
  buildDeviceItems,
  itemsToSetUp,
  sourceKey,
  syncChoice,
} from "../../src/onboarding/onboarding-devices-logic";
import type {
  DeviceStatus,
  DiscoveredFlow,
} from "../../src/onboarding/onboarding-devices-logic";

const compare = (a: string, b: string) => a.localeCompare(b);

const flow = (id: string, handler: string, title: string): DiscoveredFlow => ({
  flow_id: id,
  handler,
  title,
  source: "zeroconf",
});

describe("buildDeviceItems", () => {
  it("lists discovered flows and configured integrations without a flow", () => {
    const items = buildDeviceItems(
      [flow("f1", "hue", "Bridge"), flow("f2", "cast", "Speaker")],
      new Set(["hue", "sonos"]),
      new Map<string, DeviceStatus>(),
      (domain) => domain.toUpperCase(),
      compare
    );
    expect(items.map((item) => item.id)).toEqual(["f1", "entry:sonos", "f2"]);
    // hue is configured but also has a flow, so only the flow row remains
    expect(items.find((item) => item.id === "entry:sonos")).toMatchObject({
      status: "added",
      selectable: false,
    });
  });

  it("only lets items that still wait be chosen", () => {
    const progress = new Map<string, DeviceStatus>([
      ["f1", "running"],
      ["f2", "added"],
      ["f3", "unfinished"],
    ]);
    const items = buildDeviceItems(
      [
        flow("f1", "a", "A"),
        flow("f2", "b", "B"),
        flow("f3", "c", "C"),
        flow("f4", "d", "D"),
      ],
      new Set(),
      progress,
      (d) => d,
      compare
    );
    expect(items.map((item) => item.selectable)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});

describe("itemsToSetUp", () => {
  it("returns chosen waiting flows in list order", () => {
    const items = buildDeviceItems(
      [flow("f2", "b", "B"), flow("f1", "a", "A")],
      new Set(["x"]),
      new Map(),
      (d) => d,
      compare
    );
    expect(itemsToSetUp(items, new Set(["f1", "f2", "entry:x"]))).toEqual([
      "f1",
      "f2",
    ]);
    expect(itemsToSetUp(items, new Set(["f2"]))).toEqual(["f2"]);
  });
});

describe("syncChoice", () => {
  it("chooses new items and keeps an earlier skip", () => {
    const items = buildDeviceItems(
      [flow("f1", "a", "A"), flow("f2", "b", "B")],
      new Set(),
      new Map(),
      (d) => d,
      compare
    );
    const first = syncChoice(new Set(), new Set(), items);
    expect([...first.chosen]).toEqual(["f1", "f2"]);
    const skipped = new Set(["f2"]);
    const second = syncChoice(skipped, first.known, items);
    expect([...second.chosen]).toEqual(["f2"]);
  });

  it("drops items that are gone", () => {
    const items = buildDeviceItems(
      [flow("f2", "b", "B")],
      new Set(),
      new Map(),
      (d) => d,
      compare
    );
    const result = syncChoice(
      new Set(["f1", "f2"]),
      new Set(["f1", "f2"]),
      items
    );
    expect([...result.chosen]).toEqual(["f2"]);
  });
});

describe("sourceKey", () => {
  it("maps unknown sources to other", () => {
    expect(sourceKey("usb")).toBe("usb");
    expect(sourceKey("something")).toBe("other");
    expect(sourceKey(undefined)).toBe("other");
  });
});
