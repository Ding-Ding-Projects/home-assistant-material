import { isLocked, readLocks } from "./element-locks";
import type { LockStore } from "./element-locks";

/**
 * Locked on start: a lock can ask for the interface to be covered when the
 * app starts, until that lock is opened. It covers the interface in this
 * browser only; nobody is signed out and nothing on the server changes. Like
 * every lock it is a speed bump for fun, not security.
 *
 * Which locks are cleared is kept in memory only, so every start covers the
 * interface again.
 */

const cleared = new Set<string>();

/** The keys of the locks that still cover the interface, oldest first. */
export const startupLockKeys = (
  store: LockStore,
  clearedKeys: ReadonlySet<string> = cleared
): string[] =>
  Object.values(store.records ?? {})
    .filter(
      (record) =>
        record.onStart === true &&
        isLocked(store, record.key) &&
        !clearedKeys.has(record.key)
    )
    .sort((a, b) => a.created - b.created)
    .map((record) => record.key);

export const clearStartupLock = (key: string): void => {
  cleared.add(key);
};

export const pendingStartupLocks = (): string[] => startupLockKeys(readLocks());

let started = false;

/** Covers the interface once per window start, when a lock asks for it. */
export const runStartupLock = (): void => {
  if (started) {
    return;
  }
  started = true;
  if (!pendingStartupLocks().length) {
    return;
  }
  void import("../../components/locks/ha-lock-start").then((module) =>
    module.showStartupLock()
  );
};
