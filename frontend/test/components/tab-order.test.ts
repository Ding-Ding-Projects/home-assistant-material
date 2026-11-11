import { describe, expect, it } from "vitest";
import { applyTabOrder, moveTabId } from "../../src/components/tab-order";

const tabs = ["a", "b", "c", "d"].map((urlPath) => ({ urlPath }));
const ids = (list: { urlPath: string }[]) => list.map((tab) => tab.urlPath);

describe("applyTabOrder", () => {
  it("keeps the natural order with no saved order and no pins", () => {
    expect(ids(applyTabOrder(tabs, [], []))).toEqual(["a", "b", "c", "d"]);
  });

  it("follows the saved order", () => {
    expect(ids(applyTabOrder(tabs, ["d", "b", "a", "c"], []))).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
  });

  it("puts a tab that was never placed after the placed ones", () => {
    expect(ids(applyTabOrder(tabs, ["c", "a"], []))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("puts pinned tabs first, each group in its saved order", () => {
    expect(ids(applyTabOrder(tabs, ["a", "b", "c", "d"], ["d", "b"]))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("ignores saved ids that no longer exist and does not change its input", () => {
    const before = ids(tabs);
    expect(ids(applyTabOrder(tabs, ["gone", "b"], ["missing"]))).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(ids(tabs)).toEqual(before);
  });
});

describe("moveTabId", () => {
  const list = ["a", "b", "c", "d"];

  it("moves before a target", () => {
    expect(moveTabId(list, "d", "b", false)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves after a target", () => {
    expect(moveTabId(list, "a", "c", true)).toEqual(["b", "c", "a", "d"]);
  });

  it("returns a copy unchanged when an id is missing or both are the same", () => {
    expect(moveTabId(list, "x", "b", true)).toEqual(list);
    expect(moveTabId(list, "a", "x", true)).toEqual(list);
    const same = moveTabId(list, "b", "b", true);
    expect(same).toEqual(list);
    expect(same).not.toBe(list);
  });
});
