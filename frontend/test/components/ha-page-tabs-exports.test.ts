import { describe, expect, it } from "vitest";
import * as shell from "../../src/components/ha-page-tabs";

// The phone bar, the page catalog and the tests import these names from the
// shell. Splitting the shell into modules must not drop or rename one.
describe("ha-page-tabs exports", () => {
  it.each([
    "CLOSED_TABS_STORAGE_KEY",
    "TABS_ORDER_STORAGE_KEY",
    "PINNED_TABS_STORAGE_KEY",
    "applyTabOrder",
    "moveTabId",
    "computePageTabs",
    "HaPageTabs",
  ])("still exports %s", (name) => {
    expect(Object.keys(shell)).toContain(name);
  });

  it("keeps the saved keys unchanged", () => {
    expect(shell.CLOSED_TABS_STORAGE_KEY).toBe("pageTabsClosed");
    expect(shell.TABS_ORDER_STORAGE_KEY).toBe("pageTabsOrder");
    expect(shell.PINNED_TABS_STORAGE_KEY).toBe("pageTabsPinned");
  });
});
