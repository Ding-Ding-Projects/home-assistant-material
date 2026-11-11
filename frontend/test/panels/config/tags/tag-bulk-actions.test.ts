import { describe, expect, it } from "vitest";
import type { Tag } from "../../../../src/data/tag";
import {
  buildTagDeletePreview,
  shortNameList,
  splitTagSelection,
  summarizeTagDelete,
  tagIdsInAutomationConfig,
  tagUsageById,
} from "../../../../src/panels/config/tags/tag-bulk-actions";

// Protects what the Tags bulk delete tells the person before it runs, and what
// stays selected afterwards: a tag that is still used by an automation must be
// warned about, a hidden selection must be counted, and a failed deletion must
// never be reported as done.

const tags: Tag[] = [
  { id: "a", name: "Door" },
  { id: "b", name: "Desk" },
  { id: "c" },
];

describe("tagIdsInAutomationConfig", () => {
  it("reads tag triggers in both spellings and list forms", () => {
    expect(
      tagIdsInAutomationConfig({
        triggers: [
          { trigger: "tag", tag_id: "a" },
          { platform: "tag", tag_id: ["b", "c"] },
          { trigger: "state", entity_id: "light.x" },
        ],
      })
    ).toEqual(["a", "b", "c"]);
  });

  it("copes with a single trigger and with junk", () => {
    expect(
      tagIdsInAutomationConfig({ trigger: { trigger: "tag", tag_id: "a" } })
    ).toEqual(["a"]);
    expect(tagIdsInAutomationConfig(undefined)).toEqual([]);
    expect(tagIdsInAutomationConfig({ trigger: [null, 3, "x"] })).toEqual([]);
  });
});

describe("tagUsageById", () => {
  it("lists each automation once per tag", () => {
    expect(
      tagUsageById([
        { name: "Lights", tagIds: ["a"] },
        { name: "Lights", tagIds: ["a"] },
        { name: "Alarm", tagIds: ["a", "b"] },
      ])
    ).toEqual({ a: ["Lights", "Alarm"], b: ["Alarm"] });
  });
});

describe("splitTagSelection", () => {
  it("separates tags that exist from ids that no longer do", () => {
    const result = splitTagSelection(tags, ["c", "gone", "a"]);
    expect(result.deletable.map((tag) => tag.id)).toEqual(["a", "c"]);
    expect(result.skipped).toEqual(["gone"]);
  });

  it("returns nothing for an empty selection", () => {
    expect(splitTagSelection(tags, [])).toEqual({ deletable: [], skipped: [] });
  });
});

describe("buildTagDeletePreview", () => {
  it("warns about used tags but keeps them deletable", () => {
    const preview = buildTagDeletePreview(
      tags,
      ["a", "b"],
      { a: ["Lights", "Alarm"] },
      0
    );
    expect(preview.deletable).toHaveLength(2);
    expect(preview.warnings).toEqual([
      { tag: tags[0], automations: ["Lights", "Alarm"] },
    ]);
  });

  it("carries the number of selected tags the filter hides", () => {
    expect(buildTagDeletePreview(tags, ["a", "b"], {}, 1).hiddenCount).toBe(1);
    expect(buildTagDeletePreview(tags, ["a"], {}, -2).hiddenCount).toBe(0);
  });

  it("has nothing to delete for an empty selection", () => {
    const preview = buildTagDeletePreview(tags, [], { a: ["Lights"] }, 0);
    expect(preview.deletable).toEqual([]);
    expect(preview.warnings).toEqual([]);
  });
});

describe("summarizeTagDelete", () => {
  it("reports partial failure and keeps failed ids", () => {
    const outcome = summarizeTagDelete(
      ["a", "b", "c"],
      [
        { status: "fulfilled", value: undefined },
        { status: "rejected", reason: new Error("no") },
        { status: "fulfilled", value: undefined },
      ]
    );
    expect(outcome).toEqual({ deletedIds: ["a", "c"], failedIds: ["b"] });
  });

  it("treats a missing result as a failure", () => {
    expect(summarizeTagDelete(["a"], [])).toEqual({
      deletedIds: [],
      failedIds: ["a"],
    });
  });
});

describe("shortNameList", () => {
  it("shortens long lists", () => {
    expect(shortNameList(["a", "b", "c", "d"])).toBe("a, b, c…");
    expect(shortNameList(["a", "b"])).toBe("a, b");
  });
});
