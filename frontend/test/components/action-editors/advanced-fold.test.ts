import { describe, expect, it } from "vitest";
import { splitAdvancedControls } from "../../../src/components/action-editors/descriptors";
import type { QuickControl } from "../../../src/components/action-editors/quick-types";

const control = (key: string): QuickControl => ({
  kind: "switch",
  key,
  labelKey: `label.${key}`,
});

const keys = (list: QuickControl[]) => list.map((item) => item.key);

describe("folding optional fields of a long action form", () => {
  const many = ["a", "b", "c", "d", "e", "f", "g", "h"].map(control);

  it("keeps a short form whole", () => {
    const short = many.slice(0, 5);
    const split = splitAdvancedControls(short, {}, {});
    expect(keys(split.main)).toEqual(keys(short));
    expect(split.advanced).toEqual([]);
  });

  it("keeps required fields and fields holding a value in the main list", () => {
    const split = splitAdvancedControls(
      many,
      { a: { required: false }, h: { required: true } },
      { g: true }
    );
    expect(keys(split.main)).toEqual(["a", "b", "c", "d", "g", "h"]);
    expect(keys(split.advanced)).toEqual(["e", "f"]);
  });

  it("keeps the first controls visible when every field is optional", () => {
    const split = splitAdvancedControls(many, {}, {});
    expect(keys(split.main)).toEqual(["a", "b", "c", "d"]);
    expect(keys(split.advanced)).toEqual(["e", "f", "g", "h"]);
  });

  it("never folds the action tiles, cautions or a lone leftover", () => {
    const tiles: QuickControl = {
      kind: "services",
      key: "$action",
      labelKey: "x",
      options: [],
      value: "a.b",
    };
    const split = splitAdvancedControls([tiles, ...many.slice(0, 7)], {}, {});
    expect(split.main[0]).toBe(tiles);
    // Seven data controls: four stay, three fold.
    expect(keys(split.advanced)).toEqual(["e", "f", "g"]);
    const lone = splitAdvancedControls(
      many.slice(0, 5).concat(control("z")),
      {},
      {}
    );
    expect(lone.advanced).toEqual([]);
  });
});
