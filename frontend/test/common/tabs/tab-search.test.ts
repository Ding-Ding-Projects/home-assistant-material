import { describe, expect, it } from "vitest";
import {
  emptyLockStore,
  withLock,
} from "../../../src/common/locks/element-locks";
import {
  createGroup,
  setGroupCollapsed,
} from "../../../src/common/tabs/tab-groups";
import { groupLockKey, tabLockKey } from "../../../src/common/tabs/tab-locks";
import {
  buildSearchRows,
  searchGroup,
  searchGroupNames,
  searchMaster,
  searchStrip,
} from "../../../src/common/tabs/tab-search";

// The four searches have their own queries and each result carries strip,
// group, pinned and locked state.

const groups = setGroupCollapsed(
  createGroup([], { name: "Rooms", members: ["bedroom", "kitchen"] }).groups,
  "g1",
  true
);

const locks = withLock(
  withLock(emptyLockStore(), tabLockKey("main", "bedroom"), true),
  groupLockKey("other", "x"),
  true
);

const rows = buildSearchRows(
  [
    {
      surface: "main",
      surfaceLabel: "Main",
      tabs: [
        { id: "p", label: "Pinned map", open: true },
        { id: "bedroom", label: "Bedroom", open: true },
        { id: "kitchen", label: "Kitchen", open: true },
        { id: "old", label: "Old kitchen log", open: false },
      ],
      pinned: ["p"],
      groups,
    },
    {
      surface: "settings",
      tabs: [{ id: "areas", label: "Areas and kitchen", open: true }],
      pinned: [],
      groups: [],
    },
  ],
  locks
);

describe("search rows", () => {
  it("carry strip, group, pinned and locked state", () => {
    expect(rows.find((r) => r.id === "bedroom")).toMatchObject({
      surface: "main",
      surfaceLabel: "Main",
      groupId: "g1",
      groupName: "Rooms",
      pinned: false,
      locked: true,
    });
    expect(rows.find((r) => r.id === "p")).toMatchObject({
      pinned: true,
      locked: false,
    });
    expect(rows.find((r) => r.id === "areas")?.surfaceLabel).toBe("settings");
  });
});

describe("the four searches", () => {
  it("search this strip", () => {
    expect(searchStrip(rows, "main", "kitchen").items.map((r) => r.id)).toEqual(
      ["kitchen"]
    );
    expect(
      searchStrip(rows, "main", "kitchen", { includeClosed: true }).items.map(
        (r) => r.id
      )
    ).toEqual(["kitchen", "old"]);
  });

  it("search inside a group", () => {
    expect(
      searchGroup(rows, "main", "g1", "bed").items.map((r) => r.id)
    ).toEqual(["bedroom"]);
    expect(searchGroup(rows, "main", "g1", "").items).toHaveLength(2);
  });

  it("search groups by name", () => {
    const result = searchGroupNames(groups, "room", (id) => id !== "kitchen");
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "g1",
        name: "Rooms",
        memberCount: 2,
        openCount: 1,
        collapsed: true,
      }),
    ]);
    expect(searchGroupNames(groups, "zzz").items).toEqual([]);
  });

  it("search every open tab everywhere", () => {
    const result = searchMaster(rows, "kitchen");
    expect(result.items.map((r) => `${r.surface}:${r.id}`)).toEqual([
      "main:kitchen",
      "settings:areas",
    ]);
  });

  it("keep their query states independent", () => {
    const a = searchStrip(rows, "main", "map");
    const b = searchMaster(rows, "kitchen");
    expect(a.items.map((r) => r.id)).toEqual(["p"]);
    expect(b.items).toHaveLength(2);
  });

  it("do not match the surface or group name, only the label", () => {
    expect(searchMaster(rows, "rooms").items).toEqual([]);
  });

  it("list everything and flag an invalid pattern instead of an empty list", () => {
    const result = searchMaster(rows, "/(/");
    expect(result.invalid).toBe(true);
    expect(result.items).toHaveLength(4);
    expect(searchMaster(rows, "").invalid).toBe(false);
  });

  it("read a usable pattern", () => {
    expect(searchMaster(rows, "/^kitchen$/i").items.map((r) => r.id)).toEqual([
      "kitchen",
    ]);
  });
});
