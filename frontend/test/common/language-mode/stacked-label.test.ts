import { describe, expect, it } from "vitest";
import {
  isBilingualLabel,
  renderStackedLabel,
  splitBilingualLabel,
} from "../../../src/common/language-mode/stacked-label";

describe("stacked control labels", () => {
  it("splits an English and Cantonese label", () => {
    expect(splitBilingualLabel("Medium · 中速")).toEqual(["Medium", "中速"]);
    expect(isBilingualLabel("24 h · 24 小時")).toBe(true);
  });

  it("leaves a one-language label alone", () => {
    expect(splitBilingualLabel("Medium")).toBeUndefined();
    expect(isBilingualLabel("Medium")).toBe(false);
    expect(isBilingualLabel(undefined)).toBe(false);
    expect(renderStackedLabel("Medium")).toBe("Medium");
  });

  it("does not split a label with more than two parts or an empty side", () => {
    expect(splitBilingualLabel("a · b · c")).toBeUndefined();
    expect(splitBilingualLabel("a · ")).toBeUndefined();
  });
});
