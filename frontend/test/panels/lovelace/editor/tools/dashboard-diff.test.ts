import { describe, expect, it } from "vitest";
import {
  diffDashboards,
  summarizeDiff,
} from "../../../../../src/panels/lovelace/editor/tools/dashboard-diff";
import type { LovelaceConfig } from "../../../../../src/data/lovelace/config/types";

const cfg = (cards: unknown[], title = "Home") =>
  ({ views: [{ title, path: "home", cards }] }) as unknown as LovelaceConfig;

describe("diffDashboards", () => {
  it("reports no change for equal dashboards", () => {
    const a = cfg([{ type: "tile", entity: "light.a" }]);
    const diff = diffDashboards(a, structuredClone(a));
    expect(diff[0].kind).toBe("same");
    expect(summarizeDiff(diff)).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      same: 1,
    });
  });

  it("finds added, edited and removed cards", () => {
    const before = cfg([
      { type: "tile", entity: "light.a" },
      { type: "tile", entity: "light.b" },
      { type: "gauge", entity: "sensor.x" },
    ]);
    const after = cfg([
      { type: "tile", entity: "light.a" },
      { type: "tile", entity: "light.c" },
      { type: "button", entity: "switch.fan" },
    ]);
    const summary = summarizeDiff(diffDashboards(before, after));
    expect(summary.same).toBe(1);
    expect(summary.changed).toBe(1);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
  });

  it("reports added and removed views", () => {
    const before = cfg([{ type: "tile", entity: "light.a" }]);
    const after = {
      views: [{ title: "Other", path: "other", cards: [{ type: "tile" }] }],
    } as unknown as LovelaceConfig;
    const diff = diffDashboards(before, after);
    expect(diff.map((v) => v.kind).sort()).toEqual(["added", "removed"]);
  });
});
