import { describe, expect, it } from "vitest";
import { splitAdvancedControls } from "../../../src/components/action-editors/descriptors";
import type { QuickControl } from "../../../src/components/action-editors/quick-types";

const control = (key: string): QuickControl => ({
  kind: "switch",
  key,
  labelKey: `label.${key}`,
});

const slider = (key: string): QuickControl => ({
  kind: "slider",
  key,
  labelKey: `label.${key}`,
  min: 0,
  max: 10,
  step: 1,
  value: undefined,
});

const keys = (list: QuickControl[]) => list.map((item) => item.key);

describe("folding optional fields of a long action form", () => {
  const many = ["a", "b", "c", "d", "e", "f", "g", "h"].map(control);

  it("keeps a short form whole", () => {
    const short = ["a", "b", "c", "d", "e"].map(slider);
    const split = splitAdvancedControls(short, {}, {});
    expect(keys(split.main)).toEqual(keys(short));
    expect(split.advanced).toEqual([]);
  });

  it("folds the optional switches of a short form while another field stays", () => {
    const purge = [
      slider("keep_days"),
      control("repack"),
      control("apply_filter"),
    ];
    const split = splitAdvancedControls(purge, {}, {});
    expect(keys(split.main)).toEqual(["keep_days"]);
    expect(keys(split.advanced)).toEqual(["repack", "apply_filter"]);
  });

  it("keeps a switch that is required or already set, and a form of only switches", () => {
    const purge = [
      slider("keep_days"),
      control("repack"),
      control("apply_filter"),
    ];
    const required = splitAdvancedControls(
      purge,
      { repack: { required: true } },
      {}
    );
    expect(required.advanced).toEqual([]);
    const set = splitAdvancedControls(purge, {}, { apply_filter: true });
    expect(set.advanced).toEqual([]);
    const onlySwitches = splitAdvancedControls(many.slice(0, 3), {}, {});
    expect(onlySwitches.advanced).toEqual([]);
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
