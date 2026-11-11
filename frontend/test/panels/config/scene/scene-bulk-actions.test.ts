import { describe, expect, it } from "vitest";
import type { BulkScene } from "../../../../src/panels/config/scene/scene-bulk-actions";
import {
  buildSceneBulkPreview,
  failureLines,
  hiddenSceneSelection,
  planSceneBulkAction,
  selectionAfterBulk,
  summarizeBulkResults,
} from "../../../../src/panels/config/scene/scene-bulk-actions";

const scenes: BulkScene[] = [
  { entityId: "scene.movie", name: "Movie", editable: true },
  { entityId: "scene.yaml", name: "From YAML", editable: false },
  {
    entityId: "scene.gone",
    name: "Offline",
    editable: true,
    unavailable: true,
  },
];

// Echoes the key and values so a test can see which message was chosen
const localize = (key: string, values?: Record<string, string | number>) =>
  `${key.replace("ui.panel.config.scene.picker.bulk.", "")}|${JSON.stringify(values ?? {})}`;

describe("planSceneBulkAction", () => {
  it("skips YAML scenes on delete, with a reason", () => {
    const plan = planSceneBulkAction("delete", scenes, [
      "scene.movie",
      "scene.yaml",
    ]);
    expect(plan.actionable.map((s) => s.entityId)).toEqual(["scene.movie"]);
    expect(plan.skipped).toEqual([
      { entityId: "scene.yaml", name: "From YAML", reason: "yaml" },
    ]);
  });

  it("still applies a YAML scene, but skips an unavailable one", () => {
    const plan = planSceneBulkAction("apply", scenes, [
      "scene.yaml",
      "scene.gone",
    ]);
    expect(plan.actionable.map((s) => s.entityId)).toEqual(["scene.yaml"]);
    expect(plan.skipped[0]).toMatchObject({
      entityId: "scene.gone",
      reason: "unavailable",
    });
  });

  it("reports a selected scene that no longer exists", () => {
    const plan = planSceneBulkAction("apply", scenes, ["scene.deleted"]);
    expect(plan.actionable).toEqual([]);
    expect(plan.skipped).toEqual([
      { entityId: "scene.deleted", name: "scene.deleted", reason: "not_found" },
    ]);
  });
});

describe("buildSceneBulkPreview", () => {
  it("lists every selected scene and warns about real devices on apply", () => {
    const preview = buildSceneBulkPreview(
      "apply",
      scenes,
      ["scene.movie", "scene.gone"],
      localize
    );
    expect(preview.changeCount).toBe(1);
    expect(preview.items.map((i) => i.kind)).toEqual(["change", "skip"]);
    expect(preview.items[0].text).toContain("preview_apply_item");
    expect(preview.items[1].text).toContain("skip_unavailable");
    expect(preview.note).toContain("note_apply");
  });

  it("cannot be confirmed when everything is skipped", () => {
    const preview = buildSceneBulkPreview(
      "delete",
      scenes,
      ["scene.yaml"],
      localize
    );
    expect(preview.changeCount).toBe(0);
    expect(preview.items).toHaveLength(1);
  });
});

describe("hiddenSceneSelection", () => {
  it("counts selected scenes the search or filters hide", () => {
    expect(
      hiddenSceneSelection(
        ["scene.movie"],
        ["scene.movie", "scene.yaml", "scene.gone"]
      )
    ).toBe(2);
    expect(hiddenSceneSelection(["scene.movie"], [])).toBe(0);
  });
});

describe("partial failure", () => {
  const targets = scenes.slice(0, 2);
  const results: PromiseSettledResult<unknown>[] = [
    { status: "fulfilled", value: undefined },
    { status: "rejected", reason: { code: "not_found", message: "Gone" } },
  ];

  it("reports each failure by scene name", () => {
    const outcome = summarizeBulkResults(targets, results);
    expect(outcome.succeeded).toEqual(["scene.movie"]);
    expect(outcome.failed).toEqual([
      { entityId: "scene.yaml", name: "From YAML", message: "Gone" },
    ]);
    expect(failureLines(outcome.failed, localize)[0]).toContain(
      '"name":"From YAML"'
    );
  });

  it("keeps failed rows selected and releases the ones that worked", () => {
    const outcome = summarizeBulkResults(targets, results);
    expect(
      selectionAfterBulk(["scene.movie", "scene.yaml", "scene.gone"], outcome)
    ).toEqual(["scene.yaml", "scene.gone"]);
  });

  it("says so when a failure gives no reason", () => {
    const outcome = summarizeBulkResults(targets.slice(0, 1), [
      { status: "rejected", reason: undefined },
    ]);
    expect(failureLines(outcome.failed, localize)[0]).toContain(
      "failed_line_unknown"
    );
  });
});
