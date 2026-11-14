import { describe, expect, it } from "vitest";
import type { LovelaceConfig } from "../../../../../src/data/lovelace/config/types";
import {
  applyEntityReplacementReview,
  reviewEntityReplacement,
} from "../../../../../src/panels/lovelace/editor/tools/entity-replacement";

const config = () =>
  ({
    views: [
      {
        cards: [{ type: "tile", entity: "light.old", name: "light.old room" }],
        badges: [{ type: "entity", entity: "light.old" }],
      },
    ],
  }) satisfies LovelaceConfig;

describe("entity replacement review", () => {
  it("counts exact references and preserves names and unrelated properties", () => {
    const original = config();
    const review = reviewEntityReplacement(original, "light.old", "light.new");
    expect(review.count).toBe(2);
    const next = applyEntityReplacementReview(original, review)!;
    expect(next.views[0]).toMatchObject({
      cards: [{ type: "tile", entity: "light.new", name: "light.old room" }],
    });
    expect(original.views[0].cards![0].entity).toBe("light.old");
  });

  it("rejects in-place and immutable changes after review", () => {
    const original = config();
    const review = reviewEntityReplacement(original, "light.old", "light.new");
    const changed = config();
    const changedConfig = { ...changed, title: "Changed" };
    expect(applyEntityReplacementReview(changedConfig, review)).toBeUndefined();
    original.views[0].cards!.push({
      type: "tile",
      entity: "light.old",
      name: "Another",
    });
    expect(applyEntityReplacementReview(original, review)).toBeUndefined();
  });

  it("accepts equivalent reloaded configuration and reports no-op choices", () => {
    const review = reviewEntityReplacement(config(), "light.old", "light.new");
    expect(applyEntityReplacementReview(config(), review)).toBeDefined();
    expect(
      reviewEntityReplacement(config(), "light.old", "light.old").count
    ).toBe(0);
    expect(
      reviewEntityReplacement(config(), "light.absent", "light.new").count
    ).toBe(0);
  });
});
