import { describe, expect, it } from "vitest";
import {
  EMPTY_PICTURES,
  emptyStatePicture,
  normalizePicture,
  pictureForTone,
} from "../../../src/components/graphics/empty-pictures";
import {
  normalizeShape,
  normalizeTone,
  SCALLOP_DASH,
  SHAPED_ICON_SHAPES,
} from "../../../src/components/graphics/shaped-icon-shapes";

// Protects the fallbacks of the shared graphics: an unknown shape, tone or
// picture name from a page never renders nothing, and each empty-state tone
// keeps a picture that fits it.

describe("shaped icon", () => {
  it("offers every shape on the boards", () => {
    expect(SHAPED_ICON_SHAPES).toEqual(
      expect.arrayContaining([
        "scallop",
        "tilted-square",
        "pill",
        "ring",
        "diamond",
        "warning",
      ])
    );
  });

  it("falls back to a circle and the primary tone", () => {
    expect(normalizeShape("star")).toBe("circle");
    expect(normalizeShape("pill")).toBe("pill");
    expect(normalizeTone(undefined)).toBe("primary");
    expect(normalizeTone("error")).toBe("error");
  });

  it("divides the scallop into ten even bumps", () => {
    expect(SCALLOP_DASH * 10).toBeCloseTo(2 * Math.PI * 17, 5);
  });
});

describe("empty pictures", () => {
  it("has five pictures", () => {
    expect(EMPTY_PICTURES).toHaveLength(5);
  });

  it("picks a picture for each tone", () => {
    expect(pictureForTone("start")).toBe("shelf");
    expect(pictureForTone("filtered")).toBe("search");
    expect(pictureForTone("missing")).toBe("offline");
  });

  it("ignores names it does not know", () => {
    expect(normalizePicture("none")).toBeUndefined();
    expect(normalizePicture("repair")).toBe("repair");
  });
});

// An empty page is not an action, so it shows no picture unless the caller
// opts in; this keeps resting pages free of decorative pictures.
describe("emptyStatePicture", () => {
  it("shows no picture by default", () => {
    expect(emptyStatePicture(undefined, "start")).toBeUndefined();
    expect(emptyStatePicture(undefined, "filtered")).toBeUndefined();
    expect(emptyStatePicture("none", "missing")).toBeUndefined();
    expect(emptyStatePicture("star", "start")).toBeUndefined();
  });

  it("shows the picture a caller asks for", () => {
    expect(emptyStatePicture("repair", "start")).toBe("repair");
  });

  it("lets the tone choose when the caller asks for auto", () => {
    expect(emptyStatePicture("auto", "start")).toBe("shelf");
    expect(emptyStatePicture("auto", "filtered")).toBe("search");
    expect(emptyStatePicture("auto", "missing")).toBe("offline");
  });
});
