import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceSync } from "../../../src/common/appearance/appearance-sync";
import { settingsBundleSync } from "../../../src/common/instance-sync/settings-bundle";
import { startInstanceSync } from "../../../src/common/instance-sync/start-instance-sync";
import {
  forgetClaimedOwner,
  ownerStillClaimed,
  SYNC_OWNER_KEY,
} from "../../../src/common/instance-sync/sync-owner";
import { SYNC_DEBOUNCE_MS } from "../../../src/common/instance-sync/user-data-sync";
import { wordingSync } from "../../../src/common/vocabulary/wording-sync";

// One browser, two tabs. Tab 1 is signed in as account A. Tab 2 signs in as
// account B, clears A's cache and records B as the owner. Tab 1 is still
// running; from then on it must read nothing and upload nothing, or B's
// locks, tabs and wording would be saved into A's account. All three syncs
// share one base class, so each is checked.

const makeConn = () => {
  const saved: { key: string; value: unknown }[] = [];
  const handlers: Record<string, (msg: { value: unknown }) => void> = {};
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

const SETTLE = SYNC_DEBOUNCE_MS * 4;

describe("a tab that lost its account", () => {
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

  const signInAsA = () => {
    const made = makeConn();
    stop = startInstanceSync(made.conn as never, "user-a");
    made.handlers.settings_bundle({ value: null });
    made.handlers.personal_wording({ value: null });
    made.handlers.appearance({ value: null });
    return made;
  };

  it("knows when the owner changed", () => {
    signInAsA();
    expect(ownerStillClaimed()).toBe(true);
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-b");
    expect(ownerStillClaimed()).toBe(false);
  });

  it("uploads nothing of the other account through the settings bundle", async () => {
    const { saved } = signInAsA();
    await vi.advanceTimersByTimeAsync(SETTLE);
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-b");
    window.localStorage.setItem("elementLocks", '{"locked":["b-lock"]}');
    window.localStorage.setItem("pageTabsPinned", '["b"]');
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "elementLocks",
        newValue: '{"locked":["b-lock"]}',
      })
    );
    // Account A does something in tab 1.
    window.localStorage.setItem("regexLibrary", '["a-pattern"]');
    await vi.advanceTimersByTimeAsync(SETTLE * 3);
    expect(JSON.stringify(saved)).not.toContain("b-lock");
    expect(saved.filter((item) => item.key === "settings_bundle")).toEqual([]);
  });

  it("uploads nothing of the other account through the wording sync", async () => {
    const { saved } = signInAsA();
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-b");
    window.localStorage.setItem(
      "personalVocabulary",
      JSON.stringify({ schemaVersion: 1, entries: { light: "b-word" } })
    );
    wordingSync.push();
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(JSON.stringify(saved)).not.toContain("b-word");
    expect(saved.filter((item) => item.key === "personal_wording")).toEqual([]);
  });

  it("uploads nothing of the other account through the appearance sync", async () => {
    const { saved } = signInAsA();
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-b");
    window.localStorage.setItem(
      "readingOptions",
      JSON.stringify({ fontScale: 1.4 })
    );
    appearanceSync.push();
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(saved.filter((item) => item.key === "appearance")).toEqual([]);
  });

  it("does not send when the settings bundle is asked to push", async () => {
    const { saved } = signInAsA();
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-b");
    settingsBundleSync.push();
    settingsBundleSync.retry();
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(saved).toEqual([]);
  });
});
