import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  badgeText,
  normalizeMerged,
  paneLayout,
  readMerged,
  withMerged,
  writeMerged,
} from "../../../src/common/tabs/tab-pane";

describe("merged pane choice", () => {
  beforeEach(() => getStorage().setValue("pageTabsMerged", undefined));

  it("is on until turned off, per strip", () => {
    expect(readMerged("main")).toBe(true);
    writeMerged("main", false);
    expect(readMerged("main")).toBe(false);
    expect(readMerged("other")).toBe(true);
    writeMerged("main", true);
    expect(readMerged("main")).toBe(true);
  });

  it("keeps an explicit off, so it is told from never chosen", () => {
    expect(withMerged({}, "main", false)).toEqual({ main: false });
    expect(withMerged({ main: true }, "main", false)).toEqual({ main: false });
    expect(normalizeMerged({ main: false, bad: "x", other: true })).toEqual({
      main: false,
      other: true,
    });
    expect(normalizeMerged(undefined)).toEqual({});
  });

  it("honours a stored off after a reload", () => {
    getStorage().setValue("pageTabsMerged", { main: false });
    expect(readMerged("main")).toBe(false);
  });
});

describe("paneLayout", () => {
  it("changes nothing from today while not merged", () => {
    const left = paneLayout({ edge: "left", collapsed: false, merged: false });
    expect(left.searchField).toBe(false);
    expect(left.sectionLabels).toBe(false);
    expect(left.systemEntries).toBe(false);
    expect(left.profileName).toBe(false);
    expect(left.brand).toBe(false);
    expect(left.railTools).toBe(false);
    const top = paneLayout({ edge: "top", collapsed: false, merged: false });
    expect(top.searchField).toBe(true);
    expect(top.homeButton).toBe(false);
  });

  it("draws the full pane when merged, docked to a side or floating", () => {
    ["left", "right", "float"].forEach((edge) => {
      const layout = paneLayout({
        edge: edge as "left",
        collapsed: false,
        merged: true,
      });
      expect(layout).toMatchObject({
        searchField: true,
        searchAtTop: true,
        sectionLabels: true,
        brand: true,
        railTools: true,
        systemEntries: true,
        systemNames: true,
        profileName: true,
        homeButton: false,
      });
    });
  });

  it("collapses to icons without losing the entries", () => {
    const layout = paneLayout({ edge: "left", collapsed: true, merged: true });
    expect(layout.systemEntries).toBe(true);
    expect(layout.systemNames).toBe(false);
    expect(layout.sectionLabels).toBe(false);
    expect(layout.brand).toBe(false);
    expect(layout.railTools).toBe(true);
    expect(layout.searchField).toBe(false);
    expect(layout.profileName).toBe(false);
  });

  it("leads a top or bottom bar with a home button and keeps its search", () => {
    ["top", "bottom"].forEach((edge) => {
      const layout = paneLayout({
        edge: edge as "top",
        collapsed: false,
        merged: true,
      });
      expect(layout.homeButton).toBe(true);
      expect(layout.searchField).toBe(true);
      expect(layout.searchAtTop).toBe(false);
      expect(layout.systemEntries).toBe(true);
    });
  });
});

describe("badgeText", () => {
  it("is empty for none, exact up to 99 and capped after", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(-2)).toBe("");
    expect(badgeText(Number.NaN)).toBe("");
    expect(badgeText(7)).toBe("7");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
  });
});
