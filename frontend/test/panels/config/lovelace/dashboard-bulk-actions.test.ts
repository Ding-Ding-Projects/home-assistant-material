import { describe, expect, it } from "vitest";
import type { BulkDashboardRow } from "../../../../src/panels/config/lovelace/dashboards/dashboard-bulk-actions";
import {
  buildDashboardBulkPreview,
  planDashboardBulkAction,
  runBulkRequests,
} from "../../../../src/panels/config/lovelace/dashboards/dashboard-bulk-actions";

const row = (
  urlPath: string,
  overrides: Partial<BulkDashboardRow> = {}
): BulkDashboardRow => ({
  url_path: urlPath,
  title: urlPath.toUpperCase(),
  show_in_sidebar: true,
  mode: "storage",
  type: "user_created",
  default: false,
  id: `id_${urlPath}`,
  ...overrides,
});

// Echoes the key and values so the tests can read what was asked for.
const localize = (key: string, values?: Record<string, string | number>) =>
  `${key.split(".").pop()}${values ? JSON.stringify(values) : ""}`;

describe("planDashboardBulkAction", () => {
  it("splits a mixed selection into change, same and skipped", () => {
    const rows = [
      row("a"),
      row("b", { show_in_sidebar: false }),
      row("c", { default: true }),
      row("d", { type: "built_in", id: undefined }),
      row("e", { mode: "yaml" }),
    ];
    const plan = planDashboardBulkAction(
      "hide",
      rows,
      rows.map((r) => r.url_path)
    );
    expect(plan.change.map((r) => r.url_path)).toEqual(["a"]);
    expect(plan.same.map((r) => r.url_path)).toEqual(["b"]);
    expect(plan.skipped.map((s) => [s.row.url_path, s.reason])).toEqual([
      ["c", "default"],
      ["d", "built_in"],
      ["e", "not_editable"],
    ]);
  });

  it("changes hidden rows when showing", () => {
    const rows = [row("a", { show_in_sidebar: false }), row("b")];
    const plan = planDashboardBulkAction("show", rows, ["a", "b"]);
    expect(plan.change.map((r) => r.url_path)).toEqual(["a"]);
    expect(plan.same.map((r) => r.url_path)).toEqual(["b"]);
  });

  it("skips everything when no row can be changed", () => {
    const rows = [row("a", { default: true }), row("b", { mode: "yaml" })];
    const plan = planDashboardBulkAction("delete", rows, ["a", "b"]);
    expect(plan.change).toEqual([]);
    expect(plan.skipped).toHaveLength(2);
    const preview = buildDashboardBulkPreview(plan, localize, true);
    expect(preview.changeCount).toBe(0);
    expect(preview.items.every((item) => item.kind === "skip")).toBe(true);
  });

  it("leaves ticked rows that a filter hides out of the plan", () => {
    const rows = [row("a"), row("b"), row("c")];
    const plan = planDashboardBulkAction("delete", rows, ["a"]);
    expect(plan.change.map((r) => r.url_path)).toEqual(["a"]);
    expect(plan.hiddenCount).toBe(2);
    const preview = buildDashboardBulkPreview(plan, localize, false);
    expect(preview.note).toContain('hidden_left{"count":2}');
  });
});

describe("buildDashboardBulkPreview", () => {
  it("names each dashboard and notes that history is kept on delete", () => {
    const plan = planDashboardBulkAction(
      "delete",
      [row("a"), row("b")],
      ["a", "b"]
    );
    const preview = buildDashboardBulkPreview(plan, localize, true);
    expect(preview.changeCount).toBe(2);
    expect(preview.items[0].text).toContain('"title":"A"');
    expect(preview.items[0].text).toContain('"path":"a"');
    expect(preview.note).toContain("history_kept");
  });

  it("does not promise history when the history feature is not loaded", () => {
    const plan = planDashboardBulkAction("delete", [row("a")], ["a"]);
    expect(buildDashboardBulkPreview(plan, localize, false).note).toBe(
      undefined
    );
  });

  it("only mentions history for delete", () => {
    const plan = planDashboardBulkAction("hide", [row("a")], ["a"]);
    expect(buildDashboardBulkPreview(plan, localize, true).note).toBe(
      undefined
    );
  });
});

describe("runBulkRequests", () => {
  it("carries on after one failure and lists it", async () => {
    const items = [row("a"), row("b"), row("c")];
    const ran: string[] = [];
    const result = await runBulkRequests(items, async (item) => {
      ran.push(item.url_path);
      if (item.url_path === "b") {
        throw new Error("nope");
      }
    });
    expect(ran).toEqual(["a", "b", "c"]);
    expect(result.succeeded.map((r) => r.url_path)).toEqual(["a", "c"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].item.url_path).toBe("b");
    expect(result.failed[0].message).toBe("nope");
  });

  it("reads the code of a websocket error", async () => {
    const result = await runBulkRequests([1], () =>
      Promise.reject({ code: "not_found" })
    );
    expect(result.failed[0].message).toBe("not_found");
  });
});
