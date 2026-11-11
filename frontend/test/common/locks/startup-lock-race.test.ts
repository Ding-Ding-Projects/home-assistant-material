import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LockStore } from "../../../src/common/locks/element-locks";
import {
  markFirstInstanceMerge,
  resetFirstInstanceMerge,
} from "../../../src/common/instance-sync/first-merge";

// Protects the cover for a lock that is "locked on start" on a fresh browser:
// the lock only arrives with the copy saved on the instance, after the page
// has opened, so the check must run again after the first merge, show the
// cover at most once, and show nothing when no lock asks for it.

const holder = vi.hoisted(() => ({ store: undefined as unknown }));

vi.mock("../../../src/common/locks/element-locks", async (importOriginal) => {
  const original = await importOriginal<{
    emptyLockStore: () => LockStore;
  }>();
  return {
    ...original,
    readLocks: () => (holder.store ?? original.emptyLockStore()) as LockStore,
  };
});

const { resetStartupLockForTests, runStartupLock } =
  await import("../../../src/common/locks/startup-lock");
const { emptyLockStore, withLock } =
  await import("../../../src/common/locks/element-locks");

const secret = { salt: "a".repeat(32), hash: "b".repeat(64), rounds: 150000 };

const withStartLock = (): LockStore => {
  const base = withLock(emptyLockStore(), "page:/a", true);
  return {
    ...base,
    records: {
      "page:/a": {
        key: "page:/a",
        label: "a",
        policy: "pin",
        pin: secret,
        duration: { kind: "surface" },
        failures: 0,
        blockedUntil: 0,
        created: 1,
        onStart: true,
      },
    },
  } as LockStore;
};

describe("start lock on a fresh browser", () => {
  beforeEach(() => {
    holder.store = undefined;
    resetStartupLockForTests();
    resetFirstInstanceMerge();
  });

  it("covers at once when the lock is already stored", () => {
    holder.store = withStartLock();
    const show = vi.fn();
    runStartupLock(show);
    expect(show).toHaveBeenCalledTimes(1);
    markFirstInstanceMerge();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("covers after the instance copy arrives, once", () => {
    const show = vi.fn();
    runStartupLock(show);
    expect(show).not.toHaveBeenCalled();
    holder.store = withStartLock();
    markFirstInstanceMerge();
    expect(show).toHaveBeenCalledTimes(1);
    markFirstInstanceMerge();
    runStartupLock(show);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when no lock asks for it", () => {
    const show = vi.fn();
    runStartupLock(show);
    markFirstInstanceMerge();
    expect(show).not.toHaveBeenCalled();
  });

  it("does not cover for a lock made later in the same session", () => {
    const show = vi.fn();
    runStartupLock(show);
    markFirstInstanceMerge();
    holder.store = withStartLock();
    markFirstInstanceMerge();
    expect(show).not.toHaveBeenCalled();
  });
});
