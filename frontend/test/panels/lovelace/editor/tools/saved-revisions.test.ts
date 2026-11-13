import { describe, expect, it, vi } from "vitest";
import {
  readSavedRevisions,
  recordSavedRevision,
  saveWithRevision,
  SAVED_REVISION_LIMIT,
  SAVED_REVISION_SIZE_LIMIT,
} from "../../../../../src/panels/lovelace/editor/tools/saved-revisions";

const scope = { userId: "user", urlPath: null };
const before = { views: [], custom: { preserved: true } };
const after = { strategy: { type: "custom:test", settings: { opaque: 42 } } };
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

describe("local saved dashboard revisions", () => {
  it("preserves raw strategy and unknown fields and isolates accounts and paths", () => {
    const storage = memory();
    recordSavedRevision(scope, before, after, 10, storage);
    expect(readSavedRevisions(scope, storage)).toEqual([
      { at: 10, before, after },
    ]);
    expect(readSavedRevisions({ ...scope, userId: "other" }, storage)).toEqual(
      []
    );
    expect(
      readSavedRevisions({ ...scope, urlPath: "default" }, storage)
    ).toEqual([]);
    expect(
      recordSavedRevision({ ...scope, userId: "" }, before, after, 10, storage)
    ).toBe(false);
  });

  it("bounds count and total size without overwriting on an oversized entry", () => {
    const storage = memory();
    for (let i = 0; i < SAVED_REVISION_LIMIT + 4; i++) {
      recordSavedRevision(scope, before, after, i, storage);
    }
    expect(readSavedRevisions(scope, storage)).toHaveLength(
      SAVED_REVISION_LIMIT
    );
    const oversized = {
      views: [],
      data: "x".repeat(SAVED_REVISION_SIZE_LIMIT),
    };
    expect(recordSavedRevision(scope, before, oversized, 99, storage)).toBe(
      false
    );
    expect(readSavedRevisions(scope, storage)).toHaveLength(
      SAVED_REVISION_LIMIT
    );
    const large = {
      views: [],
      data: "x".repeat(SAVED_REVISION_SIZE_LIMIT / 3),
    };
    for (let i = 0; i < 5; i++)
      recordSavedRevision(scope, before, large, i, storage);
    expect([...storage.data.values()][0].length).toBeLessThanOrEqual(
      SAVED_REVISION_SIZE_LIMIT
    );
  });

  it("ignores corrupt data and tolerates blocked storage", () => {
    const storage = memory();
    recordSavedRevision(scope, before, after, 10, storage);
    const key = [...storage.data.keys()][0];
    storage.data.set(key, "not JSON");
    expect(readSavedRevisions(scope, storage)).toEqual([]);
    storage.data.set(key, JSON.stringify([{ at: 1, before: {}, after: null }]));
    expect(readSavedRevisions(scope, storage)).toEqual([]);
    const blocked = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("quota");
      },
    };
    expect(recordSavedRevision(scope, before, after, 10, blocked)).toBe(false);
    expect(readSavedRevisions(scope, blocked)).toEqual([]);
  });

  it("only journals after successful backend completion and snapshots inputs", async () => {
    const storage = memory();
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const edited = structuredClone(after);
    const identity = { ...scope };
    const saved = saveWithRevision(
      () => pending,
      identity,
      before,
      edited,
      storage
    );
    edited.strategy.settings.opaque = 0;
    identity.userId = "other";
    expect(storage.data.size).toBe(0);
    resolve();
    await saved;
    expect(readSavedRevisions(scope, storage)[0].after).toEqual(after);
    expect(readSavedRevisions(identity, storage)).toEqual([]);
  });

  it("does not record failed saves or fail successful saves when journaling fails", async () => {
    const storage = memory();
    await expect(
      saveWithRevision(
        () => Promise.reject(Error("save failed")),
        scope,
        before,
        after,
        storage
      )
    ).rejects.toThrow("save failed");
    expect(storage.data.size).toBe(0);
    const save = vi.fn().mockResolvedValue(undefined);
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    };
    await expect(
      saveWithRevision(save, scope, before, after, blocked)
    ).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledOnce();
  });
});
