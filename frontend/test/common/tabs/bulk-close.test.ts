import { describe, expect, it } from "vitest";
import type { BulkCloseTab } from "../../../src/common/tabs/bulk-close";
import { planBulkClose } from "../../../src/common/tabs/bulk-close";

// Bulk close removes many tabs at once, so these protect its guards: an
// empty or broken search closes nothing, and the tab in use always stays.

const tab = (
  id: string,
  title: string,
  extra: Partial<BulkCloseTab> = {}
): BulkCloseTab => ({
  id,
  texts: [title, id],
  open: true,
  current: false,
  ...extra,
});

const tabs = [
  tab("lovelace", "Overview", { current: true }),
  tab("light", "Lights"),
  tab("climate", "Climate"),
  tab("map", "Map", { open: false }),
  tab("energy", "Energy"),
];

describe("planBulkClose", () => {
  it("closes open tabs that contain the text", () => {
    expect(planBulkClose(tabs, "li", "matching")).toEqual({
      ids: ["light", "climate"],
    });
  });

  it("closes open tabs that do not contain the text", () => {
    expect(planBulkClose(tabs, "li", "not_matching")).toEqual({
      ids: ["energy"],
    });
  });

  it("never closes the current tab, even when it matches", () => {
    expect(planBulkClose(tabs, "overview", "matching").ids).toEqual([]);
    expect(planBulkClose(tabs, "zzz", "not_matching").ids).not.toContain(
      "lovelace"
    );
  });

  it("leaves closed tabs out of the count", () => {
    expect(planBulkClose(tabs, "map", "matching").ids).toEqual([]);
  });

  it("closes nothing for an empty search", () => {
    expect(planBulkClose(tabs, "", "not_matching")).toEqual({
      ids: [],
      blocked: "empty",
    });
    expect(planBulkClose(tabs, "   ", "matching").blocked).toBe("empty");
  });

  it("closes nothing for a pattern that cannot be used", () => {
    expect(planBulkClose(tabs, "/(/", "not_matching")).toEqual({
      ids: [],
      blocked: "invalid",
    });
    expect(planBulkClose(tabs, "/(a+)+$/", "not_matching").blocked).toBe(
      "invalid"
    );
  });

  it("uses a regular expression with the same test as the search", () => {
    expect(planBulkClose(tabs, "/^(Lights|Energy)$/", "matching").ids).toEqual([
      "light",
      "energy",
    ]);
    expect(
      planBulkClose(tabs, "/^(Lights|Energy)$/", "not_matching").ids
    ).toEqual(["climate"]);
  });
});
