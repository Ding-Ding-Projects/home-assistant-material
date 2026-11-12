import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  sectionMenuState,
  sectionMenuStore,
  sectionSurface,
} from "../../../src/components/section-tabs/section-surface";
import type { SectionTabsState } from "../../../src/components/section-tabs/section-tabs-model";
import {
  closeTabsAction,
  moveAction,
  openEveryAction,
  togglePinAction,
  undoCloseAction,
} from "../../../src/components/tabs/tab-menu-actions";

// The shared tab menu actions take the lists of a surface as a parameter. A
// settings surface keeps its lists in its own entry of the section store, so
// none of its actions may write the wide strip's keys.

const MAIN_KEYS = ["pageTabsClosed", "pageTabsOrder", "pageTabsPinned"];
const paths = ["a", "b", "c", "d"];
const surface = sectionSurface("/config/devices");

const snapshot = (state: SectionTabsState) => ({
  surface,
  paths,
  labels: { a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta" },
  state,
  groups: [],
  activePath: "a",
  locks: { locked: [] },
  appearance: {},
});

const setup = (initial: SectionTabsState) => {
  let state = initial;
  const store = sectionMenuStore(
    () => state,
    (next) => {
      state = next;
    }
  );
  return { store, read: () => state };
};

describe("shared tab menu actions on a settings surface", () => {
  beforeEach(() =>
    MAIN_KEYS.forEach((key) => getStorage().setValue(key, undefined))
  );

  const untouched = () =>
    MAIN_KEYS.forEach((key) =>
      expect(getStorage().getValue(key)).toBeUndefined()
    );

  it("hides and restores sections in the surface entry only", () => {
    const { store, read } = setup({ order: [], pinned: [], hidden: ["d"] });
    const menu = sectionMenuState(snapshot(read()));
    closeTabsAction(menu, ["b", "c"], store);
    expect(read().hidden).toEqual(["d", "b", "c"]);
    undoCloseAction(["b", "c"], store);
    expect(read().hidden).toEqual(["d"]);
    untouched();
  });

  it("pins in the surface entry and saves the shown order there", () => {
    const { store, read } = setup({ order: [], pinned: [], hidden: [] });
    togglePinAction(sectionMenuState(snapshot(read())), "c", store);
    expect(read().pinned).toEqual(["c"]);
    expect(read().order).toEqual(["a", "b", "c", "d"]);
    untouched();
  });

  it("shows every hidden section without touching order or pins", () => {
    const { store, read } = setup({
      order: ["b"],
      pinned: ["a"],
      hidden: ["c", "gone"],
    });
    const result = openEveryAction(sectionMenuState(snapshot(read())), store);
    expect(result.reopened).toEqual(["c"]);
    expect(read().hidden).toEqual([]);
    expect(read().pinned).toEqual(["a"]);
    expect(read().order).toEqual(["b"]);
    untouched();
  });

  it("moves a section in the surface entry only", () => {
    const { store, read } = setup({ order: [], pinned: [], hidden: [] });
    const moved = moveAction(
      sectionMenuState(snapshot(read())),
      "c",
      "earlier",
      store
    );
    expect(moved).toBeDefined();
    expect(read().order).toEqual(["a", "c", "b", "d"]);
    untouched();
  });
});
