import { onFirstInstanceMerge } from "../instance-sync/first-merge";
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
let covered = false;

const showCover = (): void => {
  void import("../../components/locks/ha-lock-start").then((module) =>
    module.showStartupLock()
  );
};

/**
 * Covers the interface once per window start, when a lock asks for it.
 *
 * On a fresh browser the locks only arrive with the copy of the settings saved
 * on the instance, which is merged after the page opens. So the check runs
 * now and once more after that first merge. The cover is shown at most once
 * per window start, and nothing is shown when no lock asks for it.
 */
export const runStartupLock = (show: () => void = showCover): void => {
  if (started) {
    return;
  }
  started = true;
  const check = (): void => {
    if (covered || !pendingStartupLocks().length) {
      return;
    }
    covered = true;
    show();
  };
  check();
  if (!covered) {
    onFirstInstanceMerge(check);
  }
};

/** For tests: lets the cover run again as on a new window start. */
export const resetStartupLockForTests = (): void => {
  started = false;
  covered = false;
  cleared.clear();
};
