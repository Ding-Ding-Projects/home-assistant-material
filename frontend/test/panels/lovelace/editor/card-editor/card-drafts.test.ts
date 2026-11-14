import { describe, expect, it } from "vitest";
import type { LovelaceCardConfig } from "../../../../../src/data/lovelace/config/card";
import {
  canRecoverCardDraft,
  clearEditorCardDraft,
  CARD_DRAFT_SIZE_LIMIT,
  readCardDraft,
  removeCardDraft,
  writeCardDraft,
} from "../../../../../src/panels/lovelace/editor/card-editor/card-drafts";

const scope = {
  userId: "alice",
  urlPath: null,
  path: ["views", 0, "cards", 0],
};
const original = { type: "custom:test", unknown: { preserved: true } };
const changed = { ...original, title: "Edited" };
const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe("card draft recovery", () => {
  it("preserves unknown fields and separates accounts, dashboards, and cards", () => {
    const storage = memory();
    const draft = writeCardDraft(scope, original, changed, storage);
    expect(readCardDraft(scope, storage)).toEqual(draft);
    expect(draft?.config.unknown).toEqual({ preserved: true });
    expect(readCardDraft({ ...scope, userId: "bob" }, storage)).toBeUndefined();
    expect(
      readCardDraft({ ...scope, urlPath: "default" }, storage)
    ).toBeUndefined();
    expect(
      readCardDraft({ ...scope, path: ["views", 0, "cards", 1] }, storage)
    ).toBeUndefined();
    expect(
      writeCardDraft({ ...scope, userId: "" }, original, changed, storage)
    ).toBeUndefined();
  });

  it("allows recovery only against the same original configuration", () => {
    const draft = writeCardDraft(scope, original, changed, memory())!;
    expect(canRecoverCardDraft(draft, structuredClone(original))).toBe(true);
    expect(
      canRecoverCardDraft(draft, { ...original, title: "Someone else's edit" })
    ).toBe(false);
  });

  it("does not remove a newer draft from a different editor", () => {
    const storage = memory();
    const first = writeCardDraft(scope, original, changed, storage)!;
    const newer = writeCardDraft(
      scope,
      original,
      { ...changed, title: "Newer" },
      storage
    )!;
    removeCardDraft(scope, first, storage);
    expect(readCardDraft(scope, storage)).toEqual(newer);
    removeCardDraft(scope, newer, storage);
    expect(readCardDraft(scope, storage)).toBeUndefined();
  });

  it("bounds entries and leaves prior recovery intact when a draft is oversized", () => {
    const storage = memory();
    const first = writeCardDraft(scope, original, changed, storage)!;
    expect(
      writeCardDraft(
        scope,
        original,
        { ...changed, data: "x".repeat(CARD_DRAFT_SIZE_LIMIT) },
        storage
      )
    ).toBeUndefined();
    expect(readCardDraft(scope, storage)).toEqual(first);
    for (let index = 1; index <= 10; index++) {
      writeCardDraft(
        { ...scope, path: ["views", 0, "cards", index] },
        original,
        changed,
        storage
      );
    }
    expect(readCardDraft(scope, storage)).toBeUndefined();
    expect(JSON.parse([...storage.data.values()][0])).toHaveLength(10);
  });

  it("tolerates corrupt or unavailable storage", () => {
    const corrupt = { getItem: () => "invalid JSON", setItem: () => undefined };
    expect(readCardDraft(scope, corrupt)).toBeUndefined();
    const blocked = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    };
    expect(writeCardDraft(scope, original, changed, blocked)).toBeUndefined();
    expect(() =>
      removeCardDraft(
        scope,
        { path: scope.path, at: 0, original, config: changed },
        blocked
      )
    ).not.toThrow();
  });
});

describe("closing a card editor with a pending recovery", () => {
  it.each([original, { ...original, title: "Changed original" }])(
    "preserves an unrecovered pending draft on Cancel, even when conflicted",
    (currentOriginal) => {
      const storage = memory();
      const pending = writeCardDraft(scope, original, changed, storage)!;
      // Recovery may be unavailable because the original card changed. Closing
      // must preserve the download/recovery opportunity on the next opening.
      expect(canRecoverCardDraft(pending, currentOriginal)).toBe(
        !("title" in currentOriginal)
      );
      clearEditorCardDraft(scope, undefined, pending, false, storage);
      expect(readCardDraft(scope, storage)).toEqual(pending);
      // Defensive: stale ownership attribution must not bypass pending status.
      clearEditorCardDraft(scope, pending, pending, false, storage);
      expect(readCardDraft(scope, storage)).toEqual(pending);
    }
  );

  it("removes a pending draft only when explicitly discarded", () => {
    const storage = memory();
    const pending = writeCardDraft(scope, original, changed, storage)!;
    clearEditorCardDraft(scope, undefined, pending, true, storage);
    expect(readCardDraft(scope, storage)).toBeUndefined();
  });

  it("clears a recovered or newly written draft without deleting a newer replacement", () => {
    const storage = memory();
    const owned = writeCardDraft(scope, original, changed, storage)!;
    clearEditorCardDraft(scope, owned, undefined, false, storage);
    expect(readCardDraft(scope, storage)).toBeUndefined();
    const newer = writeCardDraft(
      scope,
      original,
      { ...changed, title: "Newer" },
      storage
    )!;
    clearEditorCardDraft(scope, owned, undefined, false, storage);
    expect(readCardDraft(scope, storage)).toEqual(newer);
  });
});

describe("invalid intermediate editor configurations", () => {
  it.each([{}, { type: null }, { type: 42 }])(
    "retains the previous valid draft instead of replacing it with %j",
    (invalid) => {
      const storage = memory();
      const retained = writeCardDraft(scope, original, changed, storage)!;
      expect(
        writeCardDraft(
          scope,
          original,
          invalid as unknown as LovelaceCardConfig,
          storage
        )
      ).toBeUndefined();
      expect(readCardDraft(scope, storage)).toEqual(retained);
      expect(
        writeCardDraft(
          scope,
          invalid as unknown as LovelaceCardConfig,
          changed,
          storage
        )
      ).toBeUndefined();
      expect(readCardDraft(scope, storage)).toEqual(retained);
    }
  );
});
