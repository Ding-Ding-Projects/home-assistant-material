import { describe, expect, it } from "vitest";
import {
  isDiscardEnabled,
  isSaveBarVisible,
  isSaveEnabled,
  saveBarAnnouncement,
  saveBarState,
  type SaveBarInput,
} from "../../../src/components/editor/save-bar-logic";

// These rules decide when an editor offers Save. A read-only item must never
// show an enabled Save, and a clean editor must not show the bar.

const input = (over: Partial<SaveBarInput> = {}): SaveBarInput => ({
  dirty: false,
  saving: false,
  readOnly: false,
  errorCount: 0,
  ...over,
});

describe("isSaveBarVisible", () => {
  it("hides a clean editor when asked to", () => {
    expect(isSaveBarVisible(input(), true)).toBe(false);
  });
  it("shows unsaved changes, a running save and problems", () => {
    expect(isSaveBarVisible(input({ dirty: true }), true)).toBe(true);
    expect(isSaveBarVisible(input({ saving: true }), true)).toBe(true);
    expect(isSaveBarVisible(input({ errorCount: 2 }), true)).toBe(true);
  });
  it("never shows the bar for a read-only item that hides when clean", () => {
    expect(isSaveBarVisible(input({ readOnly: true, dirty: true }), true)).toBe(
      false
    );
  });
  it("stays always visible when hiding is not requested", () => {
    expect(isSaveBarVisible(input(), false)).toBe(true);
  });
});

describe("isSaveEnabled", () => {
  it("is off for read-only items and while saving", () => {
    expect(isSaveEnabled(input({ readOnly: true, dirty: true }))).toBe(false);
    expect(isSaveEnabled(input({ saving: true, dirty: true }))).toBe(false);
  });
  it("is on otherwise", () => {
    expect(isSaveEnabled(input({ dirty: true }))).toBe(true);
  });
});

describe("isDiscardEnabled", () => {
  it("needs changes, no running save and an editable item", () => {
    expect(isDiscardEnabled(input({ dirty: true }))).toBe(true);
    expect(isDiscardEnabled(input())).toBe(false);
    expect(isDiscardEnabled(input({ dirty: true, saving: true }))).toBe(false);
    expect(isDiscardEnabled(input({ dirty: true, readOnly: true }))).toBe(
      false
    );
  });
});

describe("saveBarState", () => {
  it("ranks saving over problems over unsaved over saved", () => {
    expect(saveBarState(input({ saving: true, errorCount: 1 }))).toBe("saving");
    expect(saveBarState(input({ errorCount: 1, dirty: true }))).toBe("errors");
    expect(saveBarState(input({ dirty: true }))).toBe("unsaved");
    expect(saveBarState(input())).toBe("saved");
  });
});

describe("saveBarAnnouncement", () => {
  it("announces success when a save ends clean", () => {
    expect(saveBarAnnouncement({ saving: true }, input(), false)).toBe("saved");
  });
  it("announces failure when a save ends with an error", () => {
    expect(saveBarAnnouncement({ saving: true }, input(), true)).toBe("error");
  });
  it("is silent when nothing finished saving", () => {
    expect(saveBarAnnouncement({ saving: false }, input(), false)).toBe(
      undefined
    );
    expect(
      saveBarAnnouncement({ saving: true }, input({ saving: true }), false)
    ).toBe(undefined);
  });
  it("does not claim success while changes are still unsaved", () => {
    expect(
      saveBarAnnouncement({ saving: true }, input({ dirty: true }), false)
    ).toBe(undefined);
  });
});
