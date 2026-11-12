import { describe, expect, it } from "vitest";
import type { PlanTab } from "../../../src/common/tabs/tab-close-plans";
import {
  planEdgeClose,
  planTextClose,
  protectionOf,
  reportClose,
} from "../../../src/common/tabs/tab-close-plans";

// Bulk closing removes many tabs, so these protect the guards: label-only
// matching, nothing closes on an empty or broken search, pinned, locked and
// current tabs are protected and the preview says why.

const tab = (
  id: string,
  label: string,
  extra: Partial<PlanTab> = {}
): PlanTab => ({
  id,
  label,
  open: true,
  current: false,
  ...extra,
});

const tabs = [
  tab("p", "Pinned lights", { pinned: true }),
  tab("overview", "Overview", { current: true }),
  tab("light", "Lights", { address: "light-panel" }),
  tab("lock", "Locked lights", { locked: true }),
  tab("climate", "Climate", { address: "lights-climate" }),
  tab("map", "Map", { open: false }),
];

describe("planTextClose", () => {
  it("closes tabs containing the text and reports what it protects", () => {
    const plan = planTextClose(tabs, "light", "containing");
    expect(plan.ids).toEqual(["light"]);
    expect(plan.protected).toEqual([
      { id: "p", reasons: ["pinned"] },
      { id: "lock", reasons: ["locked"] },
    ]);
    expect(plan.matchMode).toBe("text");
    expect(protectionOf(plan, "lock")).toEqual(["locked"]);
    expect(protectionOf(plan, "light")).toEqual([]);
  });

  it("matches the visible label only, never the address", () => {
    expect(planTextClose(tabs, "light-panel", "containing").ids).toEqual([]);
    expect(
      planTextClose(tabs, "light-panel", "containing", { includeAddress: true })
        .ids
    ).toEqual(["light"]);
  });

  it("closes tabs not containing the text, and never the current one", () => {
    const plan = planTextClose(tabs, "light", "not_containing");
    expect(plan.ids).toEqual(["climate"]);
    expect(plan.protected).toEqual([{ id: "overview", reasons: ["current"] }]);
  });

  it("closes pinned or locked tabs only when asked", () => {
    const plan = planTextClose(tabs, "light", "containing", {
      includePinned: true,
      includeLocked: true,
    });
    expect(plan.ids).toEqual(["p", "light", "lock"]);
    expect(plan.protected).toEqual([]);
  });

  it("never closes the current tab even when everything is included", () => {
    const plan = planTextClose(tabs, "over", "containing", {
      includePinned: true,
      includeLocked: true,
    });
    expect(plan.ids).toEqual([]);
    expect(plan.protected).toEqual([{ id: "overview", reasons: ["current"] }]);
  });

  it("closes nothing for an empty query or an invalid pattern", () => {
    expect(planTextClose(tabs, "  ", "not_containing")).toMatchObject({
      ids: [],
      blocked: "empty",
    });
    expect(planTextClose(tabs, "/(/", "containing")).toMatchObject({
      ids: [],
      blocked: "invalid",
    });
  });

  it("reads a pattern as a pattern", () => {
    const plan = planTextClose(tabs, "/^cl/i", "containing");
    expect(plan.ids).toEqual(["climate"]);
    expect(plan.matchMode).toBe("pattern");
  });

  it("skips closed tabs", () => {
    expect(planTextClose(tabs, "map", "containing").ids).toEqual([]);
  });
});

describe("planEdgeClose", () => {
  it("closes the others except pinned, locked and current", () => {
    const plan = planEdgeClose(tabs, "light", "others");
    expect(plan.ids).toEqual(["climate"]);
    expect(plan.protected.map((item) => item.id)).toEqual([
      "p",
      "overview",
      "lock",
    ]);
  });

  it("closes to the start and to the end of the target", () => {
    expect(planEdgeClose(tabs, "lock", "to_start").ids).toEqual(["light"]);
    expect(planEdgeClose(tabs, "lock", "to_end").ids).toEqual(["climate"]);
    expect(planEdgeClose(tabs, "p", "to_start")).toMatchObject({
      ids: [],
      protected: [],
    });
  });

  it("includes pinned tabs when asked", () => {
    expect(
      planEdgeClose(tabs, "climate", "to_start", { includePinned: true }).ids
    ).toEqual(["p", "light"]);
  });

  it("blocks an unknown target", () => {
    expect(planEdgeClose(tabs, "nope", "others")).toMatchObject({
      ids: [],
      blocked: "unknown_tab",
    });
  });
});

describe("reportClose", () => {
  it("reports tabs that did not close", () => {
    expect(reportClose({ ids: ["a", "b", "c"] }, ["b"])).toEqual({
      closed: ["a", "c"],
      failed: ["b"],
    });
  });
});
