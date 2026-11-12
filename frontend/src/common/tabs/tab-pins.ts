import { getStorage } from "../decorators/storage";
import { cleanIds, moveId } from "./tab-validate";

/**
 * Pinned tabs form their own region at the start of the strip, with their own
 * order. The stored key is the one the strip already uses.
 */

export const PINNED_STORAGE_KEY = "pageTabsPinned";
export const ORDER_STORAGE_KEY = "pageTabsOrder";
export const CLOSED_STORAGE_KEY = "pageTabsClosed";

/** Pinned ids in the order of the pinned region. */
export const normalizePinned = (raw: unknown): string[] => cleanIds(raw);

/** The saved page order of the tabs. */
export const normalizeOrder = (raw: unknown): string[] => cleanIds(raw);

/** The ids of tabs the person closed. */
export const normalizeClosed = (raw: unknown): string[] => cleanIds(raw);

/**
 * Pins a tab. It becomes the last tab of the pinned region. Pinning an
 * already pinned tab changes nothing.
 */
export const pinTab = (pinned: readonly string[], id: string): string[] =>
  pinned.includes(id) ? [...pinned] : cleanIds([...pinned, id]);

/** Unpins a tab. */
export const unpinTab = (pinned: readonly string[], id: string): string[] =>
  pinned.filter((item) => item !== id);

export const togglePin = (pinned: readonly string[], id: string): string[] =>
  pinned.includes(id) ? unpinTab(pinned, id) : pinTab(pinned, id);

/**
 * The tabs in strip order: the pinned region first, in its own order, then
 * the rest in the saved page order. A tab that was never placed keeps its
 * natural position after the placed ones. Only ids in `available` appear.
 */
export const orderTabs = (
  available: readonly string[],
  order: readonly string[],
  pinned: readonly string[]
): string[] => {
  const present = new Set(available);
  const pinnedIds = pinned.filter((id) => present.has(id));
  const pinnedSet = new Set(pinnedIds);
  const rank = (id: string, natural: number) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length + natural : index;
  };
  const rest = available
    .map((id, natural) => ({ id, rank: rank(id, natural) }))
    .filter((entry) => !pinnedSet.has(entry.id))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.id);
  return [...pinnedIds, ...rest];
};

/**
 * Moves a tab inside its own region. A move that would carry a tab across
 * the boundary between pinned and unpinned tabs is refused: the result is
 * unchanged and `ok` is false. Pinning is its own action.
 */
export const moveWithinRegion = (
  ordered: readonly string[],
  pinned: readonly string[],
  id: string,
  toIndex: number
): { ids: string[]; ok: boolean } => {
  if (!ordered.includes(id)) {
    return { ids: [...ordered], ok: false };
  }
  const count = ordered.filter((item) => pinned.includes(item)).length;
  const isPinned = pinned.includes(id);
  const low = isPinned ? 0 : count;
  const high = isPinned ? count - 1 : ordered.length - 1;
  if (toIndex < low || toIndex > high) {
    return { ids: [...ordered], ok: false };
  }
  return { ids: moveId(ordered, id, toIndex), ok: true };
};

/** The saved order after moving a tab; refuses to cross the pinned boundary. */
export const moveTab = (
  ordered: readonly string[],
  pinned: readonly string[],
  id: string,
  toIndex: number
): string[] => moveWithinRegion(ordered, pinned, id, toIndex).ids;

export const readPinned = (): string[] =>
  normalizePinned(getStorage().getValue(PINNED_STORAGE_KEY));

export const writePinned = (pinned: readonly string[]): void =>
  getStorage().setValue(PINNED_STORAGE_KEY, normalizePinned([...pinned]));
