import { describe, expect, it } from "vitest";
import {
  describeComboOption,
  optionPosition,
} from "../../../src/common/a11y/combobox-announcement";

describe("describeComboOption", () => {
  it("joins the name and the details that exist", () => {
    expect(
      describeComboOption([
        "Kitchen light",
        undefined,
        "Kitchen",
        "  ",
        "Light",
      ])
    ).toBe("Kitchen light, Kitchen, Light");
  });

  it("is empty when nothing is given", () => {
    expect(describeComboOption([])).toBe("");
  });
});

describe("optionPosition", () => {
  const items = ["Lights", "a", "b", "Sensors", "c"];
  const isOption = (item: string) => item.length === 1;

  it("counts only options", () => {
    expect(optionPosition(items, 2, isOption)).toEqual({
      position: 2,
      total: 3,
    });
    expect(optionPosition(items, 4, isOption)).toEqual({
      position: 3,
      total: 3,
    });
  });

  it("returns nothing for a title or an index out of range", () => {
    expect(optionPosition(items, 0, isOption)).toBeUndefined();
    expect(optionPosition(items, -1, isOption)).toBeUndefined();
    expect(optionPosition(items, 9, isOption)).toBeUndefined();
  });
});
