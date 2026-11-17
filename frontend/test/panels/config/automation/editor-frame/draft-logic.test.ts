import { describe, expect, test } from "vitest";
import {
  configHash,
  decideDraftOffer,
  draftDiffText,
  formatDraftTime,
  isNewDraftId,
  newDraftId,
} from "../../../../../src/panels/config/automation/editor-frame/draft-logic";

describe("configHash", () => {
  test("does not depend on key order or undefined values", () => {
    expect(configHash({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(
      configHash({ b: { d: "x", c: [1, 2] }, a: 1, gone: undefined })
    );
  });

  test("changes when the content changes", () => {
    expect(configHash({ a: 1 })).not.toBe(configHash({ a: 2 }));
    expect(configHash({ a: [1, 2] })).not.toBe(configHash({ a: [2, 1] }));
  });
});

describe("formatDraftTime", () => {
  test("uses 24-hour hours and minutes", () => {
    const date = new Date(2026, 10, 17, 16, 5, 30);
    expect(formatDraftTime(date.toISOString())).toBe("16:05");
    expect(formatDraftTime(new Date(2026, 10, 17, 0, 9).toISOString())).toBe(
      "00:09"
    );
  });

  test("gives nothing for a missing or broken time", () => {
    expect(formatDraftTime(null)).toBe("");
    expect(formatDraftTime("not a time")).toBe("");
  });
});

describe("decideDraftOffer", () => {
  const live = { alias: "A", actions: [] };

  test("a draft equal to the live item is not offered", () => {
    expect(decideDraftOffer({ ...live }, configHash(live), live)).toEqual({
      offer: false,
      liveChanged: false,
    });
  });

  test("a different draft is offered, and flags a changed live item", () => {
    const draft = { ...live, alias: "B" };
    expect(decideDraftOffer(draft, configHash(live), live)).toEqual({
      offer: true,
      liveChanged: false,
    });
    expect(decideDraftOffer(draft, "other-hash", live)).toEqual({
      offer: true,
      liveChanged: true,
    });
  });

  test("a draft of a new item is always offered", () => {
    expect(decideDraftOffer({ alias: "N" }, null, undefined)).toEqual({
      offer: true,
      liveChanged: false,
    });
  });
});

describe("new draft ids", () => {
  test("are unique and recognised", () => {
    const a = newDraftId();
    expect(a).not.toBe(newDraftId());
    expect(isNewDraftId(a)).toBe(true);
    expect(isNewDraftId("1700000000")).toBe(false);
    expect(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(a)).toBe(true);
  });
});

describe("draftDiffText", () => {
  test("marks removed and added lines and keeps short context", () => {
    const text = draftDiffText(
      { alias: "A", mode: "single" },
      { alias: "B", mode: "single" }
    );
    expect(text).toContain('-  "alias": "A",');
    expect(text).toContain('+  "alias": "B",');
    expect(text).toContain('  "mode": "single"');
  });

  test("is empty when nothing differs", () => {
    expect(draftDiffText({ a: 1 }, { a: 1 })).toBe("");
  });
});
