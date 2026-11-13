import { describe, expect, it } from "vitest";
import {
  MAX_POPUP_CARDS,
  MAX_POPUP_DEPTH,
  moveCard,
  normalizePopupSize,
  pushPopup,
  sanitizePopupCards,
} from "../../../../src/panels/lovelace/common/popup-action";

describe("pushPopup", () => {
  it("stops a pop-up that keeps opening itself at the depth limit", () => {
    let stack: string[] | undefined = [];
    let opened = 1;
    // Every pass is a pop-up opening another one on top of the current one.
    for (let i = 0; i < 20 && stack; i++) {
      stack = pushPopup(stack, `level-${i}`);
      if (stack) {
        opened++;
      }
    }
    expect(opened).toBe(MAX_POPUP_DEPTH);
  });

  it("does not change the stack it was given", () => {
    const stack = ["a"];
    const next = pushPopup(stack, "b");
    expect(next).toEqual(["a", "b"]);
    expect(stack).toEqual(["a"]);
  });
});

describe("sanitizePopupCards", () => {
  it("keeps only objects with a type and caps the number", () => {
    expect(sanitizePopupCards(undefined)).toEqual([]);
    expect(
      sanitizePopupCards([null, 3, {}, { type: "" }, { type: "tile" }])
    ).toEqual([{ type: "tile" }]);
    const many = Array.from({ length: MAX_POPUP_CARDS + 5 }, () => ({
      type: "tile",
    }));
    expect(sanitizePopupCards(many)).toHaveLength(MAX_POPUP_CARDS);
  });
});

describe("normalizePopupSize", () => {
  it("falls back to medium", () => {
    expect(normalizePopupSize("large")).toBe("large");
    expect(normalizePopupSize("huge")).toBe("medium");
    expect(normalizePopupSize(undefined)).toBe("medium");
  });
});

describe("moveCard", () => {
  it("moves within range and ignores moves outside it", () => {
    expect(moveCard([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveCard([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    const list = [1, 2, 3];
    expect(moveCard(list, 0, -1)).toBe(list);
    expect(moveCard(list, 1, 3)).toBe(list);
  });
});
