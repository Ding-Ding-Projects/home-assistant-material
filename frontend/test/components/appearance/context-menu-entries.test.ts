import { describe, expect, it } from "vitest";
import {
  findTarget,
  internalPath,
  readTarget,
  resolveContextEntries,
  type ReadableElement,
} from "../../../src/components/appearance/context-menu-entries";

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

describe("resolveContextEntries", () => {
  it("gives no extra entries when nothing identifies the target", () => {
    expect(resolveContextEntries(undefined, { isAdmin: true })).toEqual([]);
    expect(resolveContextEntries({}, { isAdmin: true })).toEqual([]);
  });

  it("offers nothing for an entity the home does not know", () => {
    expect(
      resolveContextEntries({ entityId: "light.gone" }, { isAdmin: true })
    ).toEqual([]);
  });

  it("offers turn off for an entity that is on, and never turn on", () => {
    const entries = resolveContextEntries(
      { entityId: "light.kitchen" },
      { state: { state: "on" }, canToggle: true, entityName: "Kitchen" }
    );
    expect(ids(entries)).toContain("turn_off");
    expect(ids(entries)).not.toContain("turn_on");
    expect(entries.find((e) => e.id === "turn_off")?.name).toBe("Kitchen");
  });

  it("offers turn on for an entity that is off, and never turn off", () => {
    const entries = resolveContextEntries(
      { entityId: "light.kitchen" },
      { state: { state: "off" }, canToggle: true }
    );
    expect(ids(entries)).toContain("turn_on");
    expect(ids(entries)).not.toContain("turn_off");
  });

  it.each(["unavailable", "unknown", "open", "heat", "locked"])(
    "offers no switch when the state is %s",
    (state) => {
      const entries = resolveContextEntries(
        { entityId: "cover.garage" },
        { state: { state }, canToggle: true }
      );
      expect(ids(entries)).not.toContain("turn_on");
      expect(ids(entries)).not.toContain("turn_off");
    }
  );

  it("offers no switch for a read-only entity but still offers details", () => {
    const entries = resolveContextEntries(
      { entityId: "sensor.temperature" },
      { state: { state: "on" }, canToggle: false }
    );
    expect(ids(entries)).toEqual(["open_details", "copy_entity_id"]);
  });

  it("offers rename and hide only to an administrator with a registry entry", () => {
    const target = { entityId: "light.kitchen" };
    const state = { state: "on" };
    expect(
      ids(
        resolveContextEntries(target, {
          state,
          registry: {},
          isAdmin: true,
        })
      )
    ).toEqual(expect.arrayContaining(["rename", "hide"]));
    expect(
      ids(
        resolveContextEntries(target, { state, registry: {}, isAdmin: false })
      )
    ).not.toContain("rename");
    expect(
      ids(resolveContextEntries(target, { state, isAdmin: true }))
    ).not.toContain("hide");
  });

  it("does not offer to hide what is already hidden", () => {
    const entries = resolveContextEntries(
      { entityId: "light.kitchen" },
      { state: { state: "on" }, registry: { hidden: true }, isAdmin: true }
    );
    expect(ids(entries)).toContain("rename");
    expect(ids(entries)).not.toContain("hide");
  });

  it("names the target in every entry that acts on the home", () => {
    const entries = resolveContextEntries(
      { entityId: "light.kitchen" },
      {
        state: { state: "on" },
        canToggle: true,
        registry: {},
        isAdmin: true,
        entityName: "Kitchen",
      }
    );
    ["turn_off", "rename", "hide"].forEach((id) => {
      expect(entries.find((e) => e.id === id)?.name).toBe("Kitchen");
    });
  });

  it("offers device and area entries from their ids", () => {
    const entries = resolveContextEntries(
      { deviceId: "abc", areaId: "kitchen" },
      { deviceName: "Hub", areaName: "Kitchen" }
    );
    expect(ids(entries)).toEqual([
      "open_device",
      "copy_device_id",
      "open_area",
      "copy_area_id",
    ]);
  });

  it("offers a new tab only for a link that stays inside the interface", () => {
    const facts = { origin: "http://ha.local:8123" };
    expect(
      ids(resolveContextEntries({ href: "/config/devices/dashboard" }, facts))
    ).toEqual(["open_new_tab"]);
    expect(
      ids(resolveContextEntries({ href: "https://example.com/x" }, facts))
    ).toEqual([]);
  });
});

describe("internalPath", () => {
  const origin = "http://ha.local:8123";
  it("keeps the path, query and hash of an internal link", () => {
    expect(internalPath("/a/b?c=1#d", origin)).toBe("/a/b?c=1#d");
    expect(internalPath("http://ha.local:8123/x", origin)).toBe("/x");
  });
  it("refuses another origin, an empty link and a bare hash", () => {
    expect(internalPath("http://other.local/x", origin)).toBeUndefined();
    expect(internalPath("", origin)).toBeUndefined();
    expect(internalPath("#top", origin)).toBeUndefined();
  });
});

describe("readTarget and findTarget", () => {
  it("reads the attributes and properties the elements already carry", () => {
    expect(readTarget({ dataset: { entityId: "light.a" } })).toEqual({
      entityId: "light.a",
    });
    expect(readTarget({ dataset: { entity: "light.a" } })?.entityId).toBe(
      "light.a"
    );
    expect(readTarget({ stateObj: { entity_id: "switch.b" } })?.entityId).toBe(
      "switch.b"
    );
    expect(readTarget({ config: { entity: "fan.c" } })?.entityId).toBe("fan.c");
    expect(readTarget({ dataset: { deviceId: "d1", areaId: "a1" } })).toEqual({
      deviceId: "d1",
      areaId: "a1",
    });
  });

  it("ignores values that are not an entity id", () => {
    expect(readTarget({ dataset: { entity: "not an id" } })).toBeUndefined();
    expect(readTarget({ config: { entity: ["light.a"] } })).toBeUndefined();
    expect(readTarget({})).toBeUndefined();
  });

  type Node = ReadableElement & { parent?: Node; boundary?: boolean };
  const parentOf = (node: Node) => node.parent;
  const isBoundary = (node: Node) => !!node.boundary;

  it("takes the closest ancestor that has a target", () => {
    const outer: Node = { dataset: { entityId: "light.outer" } };
    const inner: Node = { dataset: { entityId: "light.inner" }, parent: outer };
    const leaf: Node = { parent: inner };
    expect(findTarget(leaf, parentOf, isBoundary)).toEqual({
      entityId: "light.inner",
    });
  });

  it("stops at a boundary, so a page's own id is not what was clicked", () => {
    const page: Node = { dataset: { entityId: "light.page" }, boundary: true };
    const leaf: Node = { parent: page };
    expect(findTarget(leaf, parentOf, isBoundary)).toBeUndefined();
  });

  it("gives up after the depth limit", () => {
    const top: Node = { dataset: { entityId: "light.top" } };
    let node: Node = top;
    for (let i = 0; i < 5; i++) {
      node = { parent: node };
    }
    expect(findTarget(node, parentOf, isBoundary, 3)).toBeUndefined();
    expect(findTarget(node, parentOf, isBoundary, 10)).toEqual({
      entityId: "light.top",
    });
  });
});
