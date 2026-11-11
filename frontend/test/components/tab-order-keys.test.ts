import { describe, expect, it } from "vitest";
import {
  isMoveAcrossBlocked,
  isReorderKeydown,
} from "../../src/components/tab-order";

const key = (over: Partial<Parameters<typeof isReorderKeydown>[0]>) => ({
  key: "ArrowRight",
  ctrlKey: false,
  altKey: false,
  shiftKey: true,
  ...over,
});

describe("isReorderKeydown", () => {
  it("accepts Control+Shift and Alt+Shift with a horizontal arrow", () => {
    expect(isReorderKeydown(key({ ctrlKey: true }))).toBe(true);
    expect(isReorderKeydown(key({ altKey: true, key: "ArrowLeft" }))).toBe(
      true
    );
  });

  it("rejects missing Shift, no modifier, both modifiers, Meta and other keys", () => {
    expect(isReorderKeydown(key({ ctrlKey: true, shiftKey: false }))).toBe(
      false
    );
    expect(isReorderKeydown(key({}))).toBe(false);
    expect(isReorderKeydown(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isReorderKeydown(key({ ctrlKey: true, metaKey: true }))).toBe(false);
    expect(isReorderKeydown(key({ ctrlKey: true, key: "Home" }))).toBe(false);
  });
});

describe("isMoveAcrossBlocked", () => {
  it("blocks moves between pinned and unpinned tabs only", () => {
    expect(isMoveAcrossBlocked(["a"], "a", "b")).toBe(true);
    expect(isMoveAcrossBlocked(["a"], "b", "a")).toBe(true);
    expect(isMoveAcrossBlocked(["a", "b"], "a", "b")).toBe(false);
    expect(isMoveAcrossBlocked(["a"], "b", "c")).toBe(false);
  });
});
