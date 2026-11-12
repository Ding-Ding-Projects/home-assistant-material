import type { LockStore } from "../locks/element-locks";
import { cleanIds, cleanSurface } from "./tab-validate";
import type { TabGroup } from "./tab-groups";

/**
 * Tab and group locks are ordinary lock records of the existing lock store
 * (`elementLocks`, see `common/locks/element-locks.ts`), kept under a stable
 * key for the tab or group. This module only builds those keys and reads the
 * lock state. Creating, checking and removing a lock, and every credential,
 * stay with the lock code: use `withLockRecord`, `withLock` and the lock
 * prompt with the keys below.
 */

const TAB_PREFIX = "tab:";
const GROUP_PREFIX = "tabgroup:";

/** The key of the lock on one tab. */
export const tabLockKey = (
  surface: string | undefined,
  tabId: string
): string => `${TAB_PREFIX}${cleanSurface(surface)}:${tabId}`;

/** The key of the lock on a whole group. */
export const groupLockKey = (
  surface: string | undefined,
  groupId: string
): string => `${GROUP_PREFIX}${cleanSurface(surface)}:${groupId}`;

export type TabLockReason = "tab" | "group";

export interface TabLockState {
  locked: boolean;
  /** Why: its own lock, or the lock of its group. */
  reasons: TabLockReason[];
}

/** Whether a tab is locked: by its own lock or by the lock of its group. */
export const tabLockState = (
  store: Pick<LockStore, "locked">,
  surface: string | undefined,
  tabId: string,
  groups: readonly TabGroup[] = []
): TabLockState => {
  const reasons: TabLockReason[] = [];
  if (store.locked.includes(tabLockKey(surface, tabId))) {
    reasons.push("tab");
  }
  const group = groups.find((item) => item.members.includes(tabId));
  if (group && store.locked.includes(groupLockKey(surface, group.id))) {
    reasons.push("group");
  }
  return { locked: reasons.length > 0, reasons };
};

export const isTabLocked = (
  store: Pick<LockStore, "locked">,
  surface: string | undefined,
  tabId: string,
  groups: readonly TabGroup[] = []
): boolean => tabLockState(store, surface, tabId, groups).locked;

export const isGroupLocked = (
  store: Pick<LockStore, "locked">,
  surface: string | undefined,
  groupId: string
): boolean => store.locked.includes(groupLockKey(surface, groupId));

/** The ids of the locked tabs among `tabIds`. */
export const lockedTabIds = (
  store: Pick<LockStore, "locked">,
  surface: string | undefined,
  tabIds: readonly string[],
  groups: readonly TabGroup[] = []
): string[] =>
  cleanIds([...tabIds]).filter((id) => isTabLocked(store, surface, id, groups));

/**
 * The lock keys to remove when tabs or a group disappear for good. Remove
 * each with `withLock(store, key, false)` so the credentials go with them.
 */
export const staleLockKeys = (
  store: Pick<LockStore, "locked">,
  surface: string | undefined,
  gone: { tabIds?: readonly string[]; groupIds?: readonly string[] }
): string[] => {
  const keys = new Set<string>([
    ...(gone.tabIds ?? []).map((id) => tabLockKey(surface, id)),
    ...(gone.groupIds ?? []).map((id) => groupLockKey(surface, id)),
  ]);
  return store.locked.filter((key) => keys.has(key));
};
