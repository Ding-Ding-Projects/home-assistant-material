import { describe, expect, it } from "vitest";
import { isUsableLength } from "../../../src/common/preferences/attention-modes";

describe("isUsableLength", () => {
  it("accepts plain lengths and safe-area expressions", () => {
    expect(isUsableLength("56px")).toBe(true);
    expect(isUsableLength("calc(56px + env(safe-area-inset-bottom))")).toBe(
      true
    );
  });

  it("refuses empty values and anything that needs another property", () => {
    expect(isUsableLength("")).toBe(false);
    expect(isUsableLength("calc(var(--x) + 4px)")).toBe(false);
    expect(isUsableLength("red; background: url(x)")).toBe(false);
  });
});
