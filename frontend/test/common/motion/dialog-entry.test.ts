import { describe, expect, it } from "vitest";
import {
  dialogMotionMode,
  shouldCloseSheet,
} from "../../../src/common/motion/dialog-entry";

// Protects how a dialog arrives for each drama level and when a swipe on the
// sheet handle closes it: a short slow drag must snap back, so a slip of the
// thumb never dismisses a form.

describe("dialog motion mode", () => {
  it("does not move when drama is off", () => {
    expect(dialogMotionMode("off")).toBe("none");
  });

  it("only fades on calm", () => {
    expect(dialogMotionMode("calm")).toBe("fade");
  });

  it("rises on standard", () => {
    expect(dialogMotionMode("standard")).toBe("rise");
  });

  it("rises and grows on dramatic", () => {
    expect(dialogMotionMode("dramatic")).toBe("rise-scale");
  });

  it("never moves under reduced motion", () => {
    expect(dialogMotionMode("dramatic", true)).toBe("none");
  });
});

describe("sheet swipe close", () => {
  it("snaps back after a short drag", () => {
    expect(shouldCloseSheet(40, 0.1)).toBe(false);
  });

  it("closes after a long drag", () => {
    expect(shouldCloseSheet(140, 0.1)).toBe(true);
  });

  it("closes after a quick flick", () => {
    expect(shouldCloseSheet(40, 1)).toBe(true);
  });

  it("ignores a tiny quick twitch", () => {
    expect(shouldCloseSheet(10, 2)).toBe(false);
  });
});
