import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  DESTINATIONS_LIMIT,
  DESTINATIONS_STORAGE_KEY,
  isDestinationTabId,
  normalizeDestinationList,
  normalizeDestinationStore,
  readDestinations,
  withDestination,
  writeDestinations,
} from "../../../src/common/tabs/tab-destination-list";

// The destinations opened as tabs come back from storage, and from the
// instance through the settings sync, so nothing in them is trusted.

describe("destination list", () => {
  beforeEach(() => getStorage().setValue(DESTINATIONS_STORAGE_KEY, undefined));

  it("starts empty, so an installation without the key opens no destination", () => {
    expect(readDestinations("main")).toEqual([]);
  });

  it("accepts only settings and tool ids", () => {
    expect(isDestinationTabId("settings:config/automation")).toBe(true);
    expect(isDestinationTabId("tool:config/tools/yaml")).toBe(true);
    // A page id belongs to the page tabs, an empty path has nowhere to go.
    expect(isDestinationTabId("map")).toBe(false);
    expect(isDestinationTabId("settings:")).toBe(false);
    expect(isDestinationTabId("settings:/config")).toBe(false);
    expect(isDestinationTabId("__proto__")).toBe(false);
    expect(isDestinationTabId(42)).toBe(false);
  });

  it("drops what is not valid and repeats", () => {
    expect(
      normalizeDestinationList([
        "settings:config/a",
        "settings:config/a",
        "map",
        7,
        "tool:config/tools/b",
      ])
    ).toEqual(["settings:config/a", "tool:config/tools/b"]);
    expect(normalizeDestinationList("not a list")).toEqual([]);
    expect(
      normalizeDestinationStore(
        JSON.parse(
          '{"main":["settings:config/a"],"__proto__":["settings:config/x"],"empty":[],"bad":"text"}'
        )
      )
    ).toEqual({ main: ["settings:config/a"] });
  });

  it("never holds more than the limit", () => {
    const many = Array.from(
      { length: DESTINATIONS_LIMIT + 50 },
      (_, index) => `settings:config/p${index}`
    );
    expect(normalizeDestinationList(many)).toHaveLength(DESTINATIONS_LIMIT);
    const full = normalizeDestinationList(many);
    expect(withDestination(full, "settings:config/new")).toEqual({
      list: full,
      added: false,
      full: true,
    });
  });

  it("adds a destination once, never a second tab for it", () => {
    const first = withDestination([], "settings:config/a");
    expect(first).toEqual({
      list: ["settings:config/a"],
      added: true,
      full: false,
    });
    const again = withDestination(first.list, "settings:config/a");
    expect(again.added).toBe(false);
    expect(again.list).toEqual(["settings:config/a"]);
    expect(withDestination([], "map").added).toBe(false);
  });

  it("saves per strip and restores after a reload", () => {
    writeDestinations("main", ["settings:config/a", "tool:config/tools/b"]);
    writeDestinations("side", ["settings:config/c"]);
    expect(readDestinations("main")).toEqual([
      "settings:config/a",
      "tool:config/tools/b",
    ]);
    expect(readDestinations("side")).toEqual(["settings:config/c"]);
    writeDestinations("main", []);
    expect(readDestinations("main")).toEqual([]);
    expect(getStorage().getValue(DESTINATIONS_STORAGE_KEY)).toEqual({
      side: ["settings:config/c"],
    });
  });
});
