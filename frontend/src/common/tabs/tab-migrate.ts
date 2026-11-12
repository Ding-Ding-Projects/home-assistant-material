import { getStorage } from "../decorators/storage";
import { ungroupTabs } from "./tab-groups";
import type { TabGroup } from "./tab-groups";
import {
  CLOSED_STORAGE_KEY,
  normalizeClosed,
  normalizeOrder,
  normalizePinned,
  ORDER_STORAGE_KEY,
  PINNED_STORAGE_KEY,
} from "./tab-pins";
import { reconcileSeen } from "./tab-seen";

/**
 * Reads the tab state stored by earlier versions and brings it into the
 * current model without losing anything.
 *
 * Earlier versions stored three lists of page paths: `pageTabsClosed`,
 * `pageTabsOrder` and `pageTabsPinned`. They keep their keys and shape.
 * Page ids stay bare URL paths, so nothing is rewritten. What the migration
 * adds is the memory of tabs already offered (so an existing installation
 * does not see every page as new) and a clean-up that keeps the pinned
 * region free of group members.
 */

export interface TabState {
  closed: string[];
  order: string[];
  pinned: string[];
}

export const readLegacyTabState = (): TabState => {
  const storage = getStorage();
  return {
    closed: normalizeClosed(storage.getValue(CLOSED_STORAGE_KEY)),
    order: normalizeOrder(storage.getValue(ORDER_STORAGE_KEY)),
    pinned: normalizePinned(storage.getValue(PINNED_STORAGE_KEY)),
  };
};

export interface MigratedTabs extends TabState {
  /** The memory of tabs offered, to save. */
  seen: string[];
  /** Tabs offered for the first time, to open once. */
  newlyOffered: string[];
  /** Groups with pinned tabs taken out, to save when it differs. */
  groups: TabGroup[];
  /** True when the memory was empty: an existing installation or a fresh one. */
  firstRun: boolean;
}

/**
 * Brings stored state and the tabs on offer together.
 *
 * Existing closed, order and pinned lists load unchanged (after validation).
 * On the first run every tab on offer is remembered as already offered, so
 * the strip looks exactly as before the update.
 */
export const migrateTabState = (input: {
  stored: Partial<Record<keyof TabState, unknown>>;
  available: readonly string[];
  seen: readonly string[];
  groups?: readonly TabGroup[];
}): MigratedTabs => {
  const state: TabState = {
    closed: normalizeClosed(input.stored.closed),
    order: normalizeOrder(input.stored.order),
    pinned: normalizePinned(input.stored.pinned),
  };
  const { seen, newlyOffered, firstRun } = reconcileSeen(
    input.available,
    input.seen
  );
  return {
    ...state,
    seen,
    newlyOffered,
    firstRun,
    groups: ungroupTabs(input.groups ?? [], state.pinned),
  };
};
