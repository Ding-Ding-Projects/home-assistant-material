import { beforeEach, describe, expect, it } from "vitest";
import { createGroup } from "../../../src/common/tabs/tab-groups";
import {
  migrateTabState,
  readLegacyTabState,
} from "../../../src/common/tabs/tab-migrate";
import { getStorage } from "../../../src/common/decorators/storage";

// The stored tabs of today's shape (three lists of page paths under three
// keys) must load unchanged, and an existing installation must not see every
// page as new after the update.

describe("legacy tab state", () => {
  beforeEach(() => {
    ["pageTabsClosed", "pageTabsOrder", "pageTabsPinned"].forEach((key) =>
      getStorage().setValue(key, undefined)
    );
  });

  it("reads today's three stored lists unchanged", () => {
    getStorage().setValue("pageTabsClosed", ["map"]);
    getStorage().setValue("pageTabsOrder", ["energy", "lovelace", "map"]);
    getStorage().setValue("pageTabsPinned", ["lovelace"]);
    expect(readLegacyTabState()).toEqual({
      closed: ["map"],
      order: ["energy", "lovelace", "map"],
      pinned: ["lovelace"],
    });
  });

  it("starts empty on a fresh browser", () => {
    expect(readLegacyTabState()).toEqual({ closed: [], order: [], pinned: [] });
  });

  it("survives broken stored values", () => {
    getStorage().setValue("pageTabsClosed", { not: "a list" });
    getStorage().setValue("pageTabsOrder", ["a", 1, "a", "__proto__"]);
    getStorage().setValue("pageTabsPinned", "text");
    expect(readLegacyTabState()).toEqual({
      closed: [],
      order: ["a"],
      pinned: [],
    });
  });
});

describe("migrateTabState", () => {
  const stored = {
    closed: ["map"],
    order: ["energy", "lovelace", "map"],
    pinned: ["lovelace"],
  };

  it("keeps every stored list and remembers all tabs on the first run", () => {
    const result = migrateTabState({
      stored,
      available: ["lovelace", "energy", "map"],
      seen: [],
    });
    expect(result).toMatchObject({ ...stored, firstRun: true });
    expect(result.seen).toEqual(["lovelace", "energy", "map"]);
    expect(result.newlyOffered).toEqual([]);
  });

  it("opens only a page the update added, once", () => {
    const first = migrateTabState({
      stored,
      available: ["lovelace", "energy", "map", "logbook"],
      seen: ["lovelace", "energy", "map"],
    });
    expect(first.newlyOffered).toEqual(["logbook"]);
    expect(first.closed).toEqual(["map"]);
    const again = migrateTabState({
      stored,
      available: ["lovelace", "energy", "map", "logbook"],
      seen: first.seen,
    });
    expect(again.newlyOffered).toEqual([]);
  });

  it("takes pinned tabs out of groups", () => {
    const { groups } = createGroup([], { members: ["lovelace", "energy"] });
    const result = migrateTabState({
      stored,
      available: ["lovelace", "energy"],
      seen: ["lovelace"],
      groups,
    });
    expect(result.groups[0].members).toEqual(["energy"]);
  });

  it("validates stored input handed to it", () => {
    const result = migrateTabState({
      stored: { closed: "x", order: null, pinned: [1, "a"] },
      available: [],
      seen: [],
    });
    expect(result).toMatchObject({ closed: [], order: [], pinned: ["a"] });
  });
});
