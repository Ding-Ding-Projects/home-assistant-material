import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_KEY_PREFIX,
  DRAFT_MAX_AGE_MS,
  DRAFT_MAX_BYTES,
  discardDraft,
  getDraft,
  hashDraftText,
  listDrafts,
  registerDraftKind,
  saveDraft,
  utf8Size,
} from "../../../src/common/drafts/draft-store";

const NOW = 1_800_000_000_000;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveDraft and getDraft", () => {
  it("stores and returns a draft with its base version", () => {
    expect(saveDraft("template", "a", "hello", "v1", NOW)).toBe("saved");
    expect(getDraft("template", "a", "v1", NOW)).toEqual({
      content: "hello",
      savedAt: NOW,
      baseVersion: "v1",
      baseMismatch: false,
    });
  });

  it("keeps one entry per kind and item id", () => {
    saveDraft("template", "a", "one", null, NOW);
    saveDraft("template", "b", "two", null, NOW);
    expect(getDraft("template", "a", null, NOW)?.content).toBe("one");
    expect(getDraft("template", "b", null, NOW)?.content).toBe("two");
    expect(getDraft("template", "c", null, NOW)).toBeUndefined();
  });

  it("reports a base version mismatch instead of hiding the draft", () => {
    saveDraft("template", "a", "text", "old", NOW);
    expect(getDraft("template", "a", "new", NOW)?.baseMismatch).toBe(true);
    expect(getDraft("template", "a", null, NOW)?.baseMismatch).toBe(true);
  });

  it("refuses a kind that was never declared", () => {
    expect(saveDraft("nobody-declared-this", "a", "text", null, NOW)).toBe(
      "unknown_kind"
    );
    expect(window.localStorage.length).toBe(0);
  });
});

describe("size cap", () => {
  it("stores a draft exactly at the cap", () => {
    const text = "a".repeat(DRAFT_MAX_BYTES);
    expect(saveDraft("template", "a", text, null, NOW)).toBe("saved");
  });

  it("refuses a draft over the cap and stores nothing", () => {
    const text = "a".repeat(DRAFT_MAX_BYTES + 1);
    expect(saveDraft("template", "a", text, null, NOW)).toBe("too_large");
    expect(window.localStorage.length).toBe(0);
  });

  it("checks the size before scanning an oversized text for secrets", () => {
    const text = `password: x\n${"a".repeat(DRAFT_MAX_BYTES)}`;
    expect(saveDraft("template", "a", text, null, NOW)).toBe("too_large");
    expect(window.localStorage.length).toBe(0);
  });

  it("measures bytes, not characters", () => {
    // 3 bytes per character in UTF-8
    const text = "字".repeat(Math.floor(DRAFT_MAX_BYTES / 3) + 1);
    expect(text.length).toBeLessThan(DRAFT_MAX_BYTES);
    expect(saveDraft("template", "a", text, null, NOW)).toBe("too_large");
  });

  it("counts surrogate pairs as four bytes", () => {
    expect(utf8Size("😀")).toBe(4);
    expect(utf8Size("aé字")).toBe(6);
  });

  it("keeps the earlier draft when a bigger text is refused", () => {
    saveDraft("template", "a", "small", null, NOW);
    saveDraft("template", "a", "a".repeat(DRAFT_MAX_BYTES + 1), null, NOW);
    expect(getDraft("template", "a", null, NOW)?.content).toBe("small");
  });
});

describe("expiry", () => {
  it("returns a draft up to 30 days old", () => {
    saveDraft("template", "a", "text", null, NOW);
    expect(
      getDraft("template", "a", null, NOW + DRAFT_MAX_AGE_MS)?.content
    ).toBe("text");
  });

  it("deletes a draft older than 30 days when it is looked up", () => {
    saveDraft("template", "a", "text", null, NOW);
    expect(
      getDraft("template", "a", null, NOW + DRAFT_MAX_AGE_MS + 1)
    ).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
  });

  it("deletes expired drafts when listing", () => {
    saveDraft("template", "old", "x", null, NOW);
    saveDraft("template", "new", "y", null, NOW + DRAFT_MAX_AGE_MS);
    const listed = listDrafts(NOW + DRAFT_MAX_AGE_MS + 1);
    expect(listed.map((draft) => draft.itemId)).toEqual(["new"]);
    expect(window.localStorage.length).toBe(1);
  });
});

describe("storage failure", () => {
  it("reports unavailable when writing throws, for example a full store", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveDraft("template", "a", "text", null, NOW)).toBe("unavailable");
  });

  it("returns nothing when reading throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getDraft("template", "a", null, NOW)).toBeUndefined();
  });

  it("lists nothing when the storage cannot be enumerated", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new Error("blocked");
    });
    saveDraft("template", "a", "text", null, NOW);
    expect(listDrafts(NOW)).toEqual([]);
  });

  it("does not throw when removing fails", () => {
    saveDraft("template", "a", "text", null, NOW);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => discardDraft("template", "a")).not.toThrow();
  });

  it("handles storage that cannot be reached at all", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(saveDraft("template", "a", "text", null, NOW)).toBe("unavailable");
    expect(getDraft("template", "a", null, NOW)).toBeUndefined();
    expect(listDrafts(NOW)).toEqual([]);
    expect(() => discardDraft("template", "a")).not.toThrow();
  });

  it("deletes and ignores an entry that is not valid", () => {
    const key = `${DRAFT_KEY_PREFIX}template:a`;
    window.localStorage.setItem(key, "{not json");
    expect(getDraft("template", "a", null, NOW)).toBeUndefined();
    expect(window.localStorage.getItem(key)).toBeNull();
    window.localStorage.setItem(key, JSON.stringify({ content: 5 }));
    expect(getDraft("template", "a", null, NOW)).toBeUndefined();
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});

describe("secret fields", () => {
  it("never stores anything for a kind that declares a secret field", () => {
    registerDraftKind("login-form", { secretField: true });
    expect(saveDraft("login-form", "a", "harmless text", null, NOW)).toBe(
      "secret"
    );
    expect(window.localStorage.length).toBe(0);
    expect(getDraft("login-form", "a", null, NOW)).toBeUndefined();
  });

  it("refuses a text that holds a secret key, even in a safe kind", () => {
    const yaml = "name: lamp\npassword: hunter2\n";
    expect(saveDraft("template", "a", yaml, null, NOW)).toBe("secret");
    expect(window.localStorage.length).toBe(0);
  });

  it("does not leave the secret in any storage entry", () => {
    saveDraft("template", "a", "api_key: abc123", null, NOW);
    const all = Array.from(
      { length: window.localStorage.length },
      (_unused, index) =>
        window.localStorage.getItem(window.localStorage.key(index)!)
    ).join("");
    expect(all).not.toContain("abc123");
  });

  it("allows a kind to be declared safe again", () => {
    registerDraftKind("note", { secretField: false });
    expect(saveDraft("note", "a", "plain", null, NOW)).toBe("saved");
  });
});

describe("listDrafts and discardDraft", () => {
  it("lists drafts newest first with their size", () => {
    saveDraft("template", "a", "one", null, NOW);
    saveDraft("template", "b", "字字", "v", NOW + 10);
    const listed = listDrafts(NOW + 10);
    expect(listed.map((draft) => draft.itemId)).toEqual(["b", "a"]);
    expect(listed[0]).toMatchObject({
      kind: "template",
      itemId: "b",
      size: 6,
      baseVersion: "v",
    });
  });

  it("round-trips ids with separators", () => {
    saveDraft("template", "folder:item/1", "x", null, NOW);
    expect(listDrafts(NOW)[0].itemId).toBe("folder:item/1");
  });

  it("ignores storage entries that are not drafts", () => {
    window.localStorage.setItem("something-else", "keep");
    saveDraft("template", "a", "x", null, NOW);
    expect(listDrafts(NOW)).toHaveLength(1);
    expect(window.localStorage.getItem("something-else")).toBe("keep");
  });

  it("discards one draft and nothing else", () => {
    saveDraft("template", "a", "one", null, NOW);
    saveDraft("template", "b", "two", null, NOW);
    discardDraft("template", "a");
    expect(getDraft("template", "a", null, NOW)).toBeUndefined();
    expect(getDraft("template", "b", null, NOW)?.content).toBe("two");
    expect(() => discardDraft("template", "missing")).not.toThrow();
  });
});

describe("hashDraftText", () => {
  it("is stable and differs for different text", () => {
    expect(hashDraftText("abc")).toBe(hashDraftText("abc"));
    expect(hashDraftText("abc")).not.toBe(hashDraftText("abd"));
    expect(hashDraftText("")).not.toBe(hashDraftText(" "));
  });
});
