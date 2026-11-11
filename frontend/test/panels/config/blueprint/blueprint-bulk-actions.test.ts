import { describe, expect, it, vi } from "vitest";
import type { BulkBlueprintItem } from "../../../../src/panels/config/blueprint/blueprint-bulk-actions";
import {
  blueprintDeletePreview,
  blueprintReImportPreview,
  blueprintResultLine,
  planBlueprintDelete,
  planBlueprintReImport,
  reImportBlueprints,
  summarizeBlueprintResults,
} from "../../../../src/panels/config/blueprint/blueprint-bulk-actions";

const item = (
  name: string,
  extra: Partial<BulkBlueprintItem> = {}
): BulkBlueprintItem => ({
  fullpath: `automation/${name}.yaml`,
  type: "automation",
  path: `${name}.yaml`,
  name,
  error: false,
  sourceUrl: `https://example.com/${name}.yaml`,
  usageAutomations: 0,
  usageScripts: 0,
  ...extra,
});

// Echoes the key and values so a test can read what was asked for
const localize = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

describe("blueprint bulk delete", () => {
  it("skips a blueprint that automations or scripts still use", () => {
    const plan = planBlueprintDelete([
      item("free"),
      item("used", { usageAutomations: 2, usageScripts: 1 }),
    ]);
    expect(plan.run.map((i) => i.name)).toEqual(["free"]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toMatchObject({ reason: "in_use", users: 3 });
  });

  it("previews the skip with the number of users and blocks an all-in-use run", () => {
    const preview = blueprintDeletePreview(localize, [
      item("used", { usageScripts: 4 }),
    ]);
    expect(preview.changeCount).toBe(0);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].kind).toBe("skip");
    expect(preview.items[0].text).toContain('"count":4');
    expect(preview.items[0].text).toContain('"name":"used"');
  });

  it("previews a mixed selection with one change line and one skip line", () => {
    const preview = blueprintDeletePreview(
      localize,
      [item("a"), item("b"), item("c", { usageAutomations: 1 })],
      2
    );
    expect(preview.changeCount).toBe(2);
    expect(preview.items.map((i) => i.kind)).toEqual([
      "change",
      "skip",
      "same",
    ]);
    expect(preview.items[0].text).toContain("a, b");
  });
});

describe("blueprint bulk re-import", () => {
  it("skips a blueprint without a source address, and one that failed to load", () => {
    const plan = planBlueprintReImport([
      item("ok"),
      item("none", { sourceUrl: undefined }),
      item("blank", { sourceUrl: "   " }),
      item("broken", { error: true }),
    ]);
    expect(plan.run.map((i) => i.name)).toEqual(["ok"]);
    expect(plan.skipped.map((s) => [s.item.name, s.reason])).toEqual([
      ["none", "no_source"],
      ["blank", "no_source"],
      ["broken", "error"],
    ]);
  });

  it("names the address each blueprint is fetched from", () => {
    const preview = blueprintReImportPreview(localize, [
      item("ok"),
      item("none", { sourceUrl: undefined }),
    ]);
    expect(preview.changeCount).toBe(1);
    expect(preview.items[0].text).toContain("https://example.com/ok.yaml");
    expect(preview.items[1].kind).toBe("skip");
  });

  it("fetches only from the saved address of each blueprint", async () => {
    const plan = planBlueprintReImport([
      item("a"),
      item("b", { sourceUrl: " https://example.com/other.yaml " }),
      item("none", { sourceUrl: undefined }),
    ]);
    const importFn = vi.fn(async (_url: string) => ({ raw_data: "yaml" }));
    const saveFn = vi.fn(
      async (_item: BulkBlueprintItem, _raw: string, _url: string) => undefined
    );
    await reImportBlueprints(plan, { importFn, saveFn });
    expect(importFn.mock.calls.map((call) => call[0])).toEqual([
      "https://example.com/a.yaml",
      "https://example.com/other.yaml",
    ]);
    expect(saveFn).toHaveBeenCalledTimes(2);
  });
});

describe("blueprint bulk result summary", () => {
  it("pairs each request with its outcome and counts skips", async () => {
    const plan = planBlueprintDelete([
      item("a"),
      item("b"),
      item("c", { usageAutomations: 1 }),
    ]);
    const summary = summarizeBlueprintResults(plan, [
      { status: "fulfilled", value: undefined },
      { status: "rejected", reason: new Error("boom") },
    ]);
    expect(summary.succeeded.map((i) => i.name)).toEqual(["a"]);
    expect(summary.failed).toEqual([
      { item: expect.objectContaining({ name: "b" }), message: "boom" },
    ]);
    expect(summary.skipped).toHaveLength(1);
    const line = blueprintResultLine(localize, summary, "delete");
    expect(line).toContain("bulk_delete_done");
    expect(line).toContain("bulk_result_skipped");
    expect(line).toContain("bulk_result_failed");
  });
});
