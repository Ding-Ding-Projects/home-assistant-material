import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import { readDock, writeDock } from "../../../src/common/tabs/tab-dock";
import { writeSeen } from "../../../src/common/tabs/tab-seen";
import { ensureInitialDock } from "../../../src/components/tabs/tab-store-controller";
import {
  densityScale,
  hiddenByRange,
  initialDockDecision,
  moveKeyIntent,
  navIntent,
  navTarget,
  nextCompact,
  pendingLockKey,
  tabStyle,
} from "../../../src/components/tabs/tab-strip-layout";

const key = (init: Partial<Parameters<typeof moveKeyIntent>[0]>) => ({
  key: "ArrowRight",
  ctrlKey: true,
  altKey: false,
  shiftKey: true,
  ...init,
});

describe("initialDockDecision", () => {
  it("leaves a new installation on the default edge", () => {
    expect(
      initialDockDecision({
        legacyPresent: false,
        seenPresent: false,
        dockChosen: false,
      })
    ).toBeUndefined();
  });

  it("keeps the top edge for an installation that already had tab state", () => {
    expect(
      initialDockDecision({
        legacyPresent: true,
        seenPresent: false,
        dockChosen: false,
      })
    ).toBe("top");
  });

  it("never overrides a chosen edge or acts after the first run", () => {
    expect(
      initialDockDecision({
        legacyPresent: true,
        seenPresent: false,
        dockChosen: true,
      })
    ).toBeUndefined();
    expect(
      initialDockDecision({
        legacyPresent: true,
        seenPresent: true,
        dockChosen: false,
      })
    ).toBeUndefined();
  });
});

describe("ensureInitialDock", () => {
  beforeEach(() => {
    const storage = getStorage();
    [
      "pageTabsClosed",
      "pageTabsOrder",
      "pageTabsPinned",
      "pageTabsSeen",
      "pageTabsDock",
    ].forEach((name) => storage.setValue(name, undefined));
  });

  it("gives a fresh installation the left edge", () => {
    ensureInitialDock("main");
    expect(readDock("main")).toBe("left");
  });

  it("does not take empty lists for an earlier version", () => {
    const storage = getStorage();
    storage.setValue("pageTabsClosed", []);
    storage.setValue("pageTabsOrder", []);
    storage.setValue("pageTabsPinned", []);
    storage.setValue("pageTabsSeen", {});
    ensureInitialDock("main");
    expect(readDock("main")).toBe("left");
  });

  it("keeps an existing installation at the top, and stays there after the first run", () => {
    getStorage().setValue("pageTabsClosed", ["map"]);
    ensureInitialDock("main");
    expect(readDock("main")).toBe("top");
    writeSeen("main", ["lovelace"]);
    // The person then picks the default edge: it must not flip back to the top.
    writeDock("main", "left");
    ensureInitialDock("main");
    expect(readDock("main")).toBe("left");
  });
});

describe("keys", () => {
  it("maps arrows to the strip's axis", () => {
    expect(navIntent("ArrowRight", "horizontal", false)).toBe("next");
    expect(navIntent("ArrowRight", "horizontal", true)).toBe("previous");
    expect(navIntent("ArrowDown", "horizontal", false)).toBeUndefined();
    expect(navIntent("ArrowDown", "vertical", false)).toBe("next");
    expect(navIntent("ArrowUp", "vertical", true)).toBe("previous");
    expect(navIntent("ArrowRight", "vertical", false)).toBeUndefined();
    expect(navIntent("Home", "vertical", false)).toBe("start");
    expect(navIntent("End", "horizontal", false)).toBe("end");
  });

  it("wraps navigation at both ends", () => {
    expect(navTarget("next", 2, 3)).toBe(0);
    expect(navTarget("previous", 0, 3)).toBe(2);
    expect(navTarget("start", 2, 3)).toBe(0);
    expect(navTarget("end", 0, 3)).toBe(2);
    expect(navTarget("next", 0, 0)).toBe(-1);
  });

  it("moves along the axis with Control or Alt and Shift", () => {
    expect(moveKeyIntent(key({}), "horizontal", false)).toEqual({
      type: "reorder",
      forward: true,
    });
    expect(
      moveKeyIntent(
        key({ key: "ArrowDown", ctrlKey: false, altKey: true }),
        "vertical",
        false
      )
    ).toEqual({ type: "reorder", forward: true });
  });

  it("moves into the next or previous group across the axis", () => {
    expect(
      moveKeyIntent(key({ key: "ArrowDown" }), "horizontal", false)
    ).toEqual({ type: "group", forward: true });
    expect(moveKeyIntent(key({ key: "ArrowUp" }), "horizontal", false)).toEqual(
      { type: "group", forward: false }
    );
    expect(
      moveKeyIntent(key({ key: "ArrowRight" }), "vertical", false)
    ).toEqual({ type: "group", forward: true });
    expect(moveKeyIntent(key({ key: "ArrowRight" }), "vertical", true)).toEqual(
      { type: "group", forward: false }
    );
  });

  it("ignores plain arrows and ambiguous modifiers", () => {
    expect(
      moveKeyIntent(key({ shiftKey: false }), "horizontal", false)
    ).toBeUndefined();
    expect(
      moveKeyIntent(key({ altKey: true }), "horizontal", false)
    ).toBeUndefined();
    expect(
      moveKeyIntent(key({ metaKey: true }), "horizontal", false)
    ).toBeUndefined();
  });
});

describe("hiddenByRange", () => {
  // 40 tabs of 100 px side by side; a strip 1,000 px wide shows 10 of them.
  const tabs = Array.from({ length: 40 }, (_v, i) => ({
    id: `t${i}`,
    from: i * 100 - 250,
    to: i * 100 - 150,
  }));

  it("lists every tab that is not fully in view", () => {
    const hidden = hiddenByRange(tabs, 0, 1000);
    // t0 and t1 sit before the window, t2 is cut at the start.
    expect(hidden.slice(0, 3)).toEqual(["t0", "t1", "t2"]);
    expect(hidden).toContain("t39");
    // 40 tabs, 9 fully in view (t3 to t11).
    expect(40 - hidden.length).toBe(9);
  });

  it("counts a partly visible tab as out of view", () => {
    expect(hiddenByRange([{ id: "a", from: 950, to: 1050 }], 0, 1000)).toEqual([
      "a",
    ]);
    expect(hiddenByRange([{ id: "a", from: 900, to: 1000 }], 0, 1000)).toEqual(
      []
    );
  });

  it("respects a window narrowed by a pinned region", () => {
    expect(hiddenByRange([{ id: "a", from: 40, to: 140 }], 80, 1000)).toEqual([
      "a",
    ]);
  });

  it("handles the longest labels in a vertical strip", () => {
    const rows = Array.from({ length: 5 }, (_v, i) => ({
      id: `r${i}`,
      from: i * 48,
      to: i * 48 + 40,
    }));
    expect(hiddenByRange(rows, 0, 130)).toEqual(["r2", "r3", "r4"]);
  });
});

describe("nextCompact", () => {
  it("turns compact on overflow and stays compact until the strip grows clearly", () => {
    let state = nextCompact({ compact: false, at: 0 }, true, 600);
    expect(state).toEqual({ compact: true, at: 600 });
    state = nextCompact(state, false, 650);
    expect(state.compact).toBe(true);
    state = nextCompact(state, false, 800);
    expect(state.compact).toBe(false);
  });

  it("stays compact while it still overflows", () => {
    const state = nextCompact({ compact: true, at: 600 }, true, 900);
    expect(state.compact).toBe(true);
  });
});

describe("pendingLockKey", () => {
  const groups = [
    { id: "g1", name: "", colour: "blue", collapsed: false, members: ["a"] },
  ] as never;

  it("is undefined for a tab with no lock", () => {
    expect(
      pendingLockKey({ locked: [] }, "main", "a", groups, () => false)
    ).toBeUndefined();
  });

  it("asks the tab's own lock first, then its group's", () => {
    const store = { locked: ["tabgroup:main:g1", "tab:main:a"] };
    expect(pendingLockKey(store, "main", "a", groups, () => false)).toBe(
      "tab:main:a"
    );
    expect(
      pendingLockKey(store, "main", "a", groups, (k) => k === "tab:main:a")
    ).toBe("tabgroup:main:g1");
    expect(pendingLockKey(store, "main", "a", groups, () => true)).toBe(
      undefined
    );
  });

  it("does not lock a tab that belongs to nothing locked", () => {
    expect(
      pendingLockKey(
        { locked: ["tab:main:b"] },
        "main",
        "a",
        groups,
        () => false
      )
    ).toBeUndefined();
  });
});

describe("tabStyle", () => {
  it("turns a stored look into style properties", () => {
    expect(
      tabStyle({
        color: "#fff",
        radius: "8",
        fontWeight: "700",
        density: "compact",
      })
    ).toMatchObject({
      "--tab-color": "#fff",
      "--tab-radius": "8px",
      "--tab-weight": "700",
      "--tab-density": "0.8",
    });
  });

  it("is empty for a tab with no look", () => {
    expect(tabStyle({})).toEqual({});
  });

  it("reads density words, numbers and percentages within bounds", () => {
    expect(densityScale("spacious")).toBe(1.2);
    expect(densityScale("90%")).toBe(0.9);
    expect(densityScale("9")).toBe(1.6);
    expect(densityScale("nonsense")).toBe(1);
    expect(densityScale(undefined)).toBe(1);
  });
});
