import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readStripState,
  registerTabSearchSurface,
} from "../../../src/components/tabs/tab-group-state";
import { makeHass, resetTabStorage, stubMatchMedia } from "./tab-test-helpers";

// The group picker and the group menu are given only a strip name. A strip of
// a settings section is on screen while they open, so it can say what its tabs
// are called; one that is not on screen is known by its saved addresses only.

const SURFACE = "section:/config/integrations/dashboard";

describe("readStripState for a section strip", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetTabStorage();
  });

  afterEach(() => {
    resetTabStorage();
  });

  it("uses the labels the strip on screen reports", () => {
    const stop = registerTabSearchSurface(SURFACE, () => ({
      surface: SURFACE,
      tabs: [
        { id: "/config/integrations", label: "Integrations", open: true },
        { id: "/config/devices", label: "Devices", open: true },
      ],
      pinned: [],
      groups: [],
    }));
    const state = readStripState(makeHass(), SURFACE);
    expect(state.tabs.map((tab) => [tab.id, tab.label])).toEqual([
      ["/config/integrations", "Integrations"],
      ["/config/devices", "Devices"],
    ]);
    stop();
  });

  it("falls back to the saved addresses once the strip is gone", () => {
    const stop = registerTabSearchSurface(SURFACE, () => ({
      surface: SURFACE,
      tabs: [{ id: "/config/devices", label: "Devices", open: true }],
      pinned: [],
      groups: [],
    }));
    stop();
    const state = readStripState(makeHass(), SURFACE);
    expect(state.tabs).toEqual([]);
  });
});
