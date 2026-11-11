import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InstanceSyncStarter,
  startInstanceSync,
} from "../../../src/common/instance-sync/start-instance-sync";
import {
  forgetClaimedOwner,
  SYNC_OWNER_KEY,
  syncCacheUsable,
} from "../../../src/common/instance-sync/sync-owner";
import { SYNC_DEBOUNCE_MS } from "../../../src/common/instance-sync/user-data-sync";
import {
  activeVocabularyCount,
  applyPersonalVocabulary,
  VOCABULARY_STORAGE_KEY,
} from "../../../src/common/vocabulary/personal-vocabulary";
import {
  APPEARANCE_STORAGE_KEY,
  readAppearanceStore,
} from "../../../src/common/appearance/element-appearance";

// One browser, two people. A session that ends without a clean sign-out
// leaves the first person's cached wording and appearance behind. These
// protect the promise that the next person to sign in is never shown it and
// never has it uploaded into their own account. The wording and choices are
// neutral placeholders.

const WORDING = JSON.stringify({
  schemaVersion: 1,
  entries: { light: "lamp" },
});
const APPEARANCE = JSON.stringify({
  kinds: { "ha-card": { radius: 8 } },
  elements: {},
});

const makeConn = () => {
  const handlers: Record<string, (msg: { value: unknown }) => void> = {};
  const saved: { key: string; value: unknown }[] = [];
  const conn = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    subscribeMessage: vi.fn(
      async (cb: (msg: { value: unknown }) => void, msg: { key: string }) => {
        handlers[msg.key] = cb;
        return () => undefined;
      }
    ),
    sendMessagePromise: vi.fn(async (msg: { key: string; value: unknown }) => {
      saved.push({ key: msg.key, value: msg.value });
    }),
  };
  return { conn, handlers, saved };
};

const leaveFirstPersonsCache = () => {
  window.localStorage.setItem(VOCABULARY_STORAGE_KEY, WORDING);
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, APPEARANCE);
  window.localStorage.setItem("readingOptions", '{"fontScale":1.2}');
  window.localStorage.setItem("accessibilityTools", '{"contrast":true}');
  window.localStorage.setItem(
    "instanceSync.personal_wording",
    JSON.stringify({ updated: 5 })
  );
  window.localStorage.setItem(
    "instanceSync.appearance",
    JSON.stringify({ updated: 5 })
  );
};

describe("a second account on the same browser", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    forgetClaimedOwner();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it("is shown nothing and uploads nothing from the first account's cache", async () => {
    leaveFirstPersonsCache();
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-a");
    const { conn, handlers, saved } = makeConn();

    stop = startInstanceSync(conn as never, "user-b");
    // The second person's instance holds nothing yet.
    handlers.personal_wording({ value: null });
    handlers.appearance({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);

    expect(saved).toEqual([]);
    expect(conn.sendMessagePromise).not.toHaveBeenCalled();
    expect(activeVocabularyCount()).toBe(0);
    expect(applyPersonalVocabulary("light")).toBe("light");
    for (const key of [
      VOCABULARY_STORAGE_KEY,
      APPEARANCE_STORAGE_KEY,
      "readingOptions",
      "accessibilityTools",
      "instanceSync.personal_wording",
      "instanceSync.appearance",
    ]) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
    expect(window.localStorage.getItem(SYNC_OWNER_KEY)).toBe("user-b");
  });

  it("clears a synced cache that has ages but no recorded owner", async () => {
    leaveFirstPersonsCache();
    const { conn, handlers, saved } = makeConn();

    stop = startInstanceSync(conn as never, "user-b");
    handlers.personal_wording({ value: null });
    handlers.appearance({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);

    expect(saved).toEqual([]);
    expect(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)).toBeNull();
  });

  // A cache from before this feature was never synced: no owner, no ages.
  // The first account to sign in claims it once, so nobody loses settings on
  // the update.
  it("claims a legacy cache once and uploads it as before", async () => {
    window.localStorage.setItem(VOCABULARY_STORAGE_KEY, WORDING);
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, APPEARANCE);
    const { conn, handlers, saved } = makeConn();

    stop = startInstanceSync(conn as never, "user-b");
    expect(window.localStorage.getItem(SYNC_OWNER_KEY)).toBe("user-b");
    expect(applyPersonalVocabulary("light")).toBe("lamp");
    handlers.personal_wording({ value: null });
    handlers.appearance({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);

    expect(saved.map((entry) => entry.key).sort()).toEqual([
      "appearance",
      "personal_wording",
    ]);
    stop();
    stop = undefined;

    // A different account on the same browser now gets none of it.
    forgetClaimedOwner();
    const second = makeConn();
    stop = startInstanceSync(second.conn as never, "user-c");
    second.handlers.personal_wording({ value: null });
    second.handlers.appearance({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);
    expect(second.saved).toEqual([]);
    expect(applyPersonalVocabulary("light")).toBe("light");
  });

  it("does not use a cache with a recorded owner before that owner is confirmed", () => {
    expect(syncCacheUsable()).toBe(true);
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, APPEARANCE);
    expect(readAppearanceStore().kinds["ha-card"]).toBeDefined();

    window.localStorage.setItem(SYNC_OWNER_KEY, "user-a");
    expect(syncCacheUsable()).toBe(false);
    expect(Object.keys(readAppearanceStore().kinds)).toEqual([]);

    const { conn } = makeConn();
    stop = startInstanceSync(conn as never, "user-a");
    expect(syncCacheUsable()).toBe(true);
    expect(readAppearanceStore().kinds["ha-card"]).toBeDefined();
  });

  it("un-applies wording that was already on screen", () => {
    window.localStorage.setItem(VOCABULARY_STORAGE_KEY, WORDING);
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-a");
    const first = makeConn();
    stop = startInstanceSync(first.conn as never, "user-a");
    expect(applyPersonalVocabulary("light")).toBe("lamp");
    stop();
    stop = undefined;

    // The same page signs in as someone else.
    const second = makeConn();
    stop = startInstanceSync(second.conn as never, "user-b");
    expect(applyPersonalVocabulary("light")).toBe("light");
  });

  it("keeps and uploads the cache for the account that owns it", async () => {
    leaveFirstPersonsCache();
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-a");
    const { conn, handlers, saved } = makeConn();

    stop = startInstanceSync(conn as never, "user-a");
    expect(applyPersonalVocabulary("light")).toBe("lamp");
    handlers.personal_wording({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);

    expect(saved.map((entry) => entry.key)).toContain("personal_wording");
    expect(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)).not.toBeNull();
  });

  it("starts once when the user arrives after the first try", () => {
    const { conn } = makeConn();
    const starter = new InstanceSyncStarter();
    starter.ensure(conn as never, undefined);
    expect(conn.subscribeMessage).not.toHaveBeenCalled();

    starter.ensure(conn as never, "user-a");
    starter.ensure(conn as never, "user-a");
    // One subscription for each of the three settings, and no more.
    expect(conn.subscribeMessage).toHaveBeenCalledTimes(3);

    starter.release();
    starter.release();
  });

  it("starts nothing until the account is known", () => {
    leaveFirstPersonsCache();
    const { conn } = makeConn();
    stop = startInstanceSync(conn as never, undefined);
    expect(conn.subscribeMessage).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)).not.toBeNull();
  });
});
