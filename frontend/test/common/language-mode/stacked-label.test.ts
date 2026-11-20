import { html } from "lit";
import { describe, expect, it } from "vitest";
import {
  isBilingualLabel,
  renderBilingualTitle,
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

  // A page may pass a template as its header; splitting it used to throw and
  // left the whole page blank.
  it("returns a title or label that is not a string unchanged", () => {
    const template = html`<span>Kitchen</span>`;
    expect(splitBilingualLabel(template)).toBeUndefined();
    expect(isBilingualLabel(template)).toBe(false);
    expect(renderBilingualTitle(template)).toBe(template);
    expect(renderStackedLabel(template)).toBe(template);
    expect(renderBilingualTitle(42)).toBe(42);
    expect(() => renderBilingualTitle(null)).not.toThrow();
  });

  it("still splits a both-language page title", () => {
    expect(typeof renderBilingualTitle("Areas · 區域")).toBe("object");
    expect(renderBilingualTitle("Areas")).toBe("Areas");
  });

  it("does not split a label with more than two parts or an empty side", () => {
    expect(splitBilingualLabel("a · b · c")).toBeUndefined();
    expect(splitBilingualLabel("a · ")).toBeUndefined();
  });
});
