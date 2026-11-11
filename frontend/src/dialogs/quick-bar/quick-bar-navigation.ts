import {
  mdiEyeSettingsOutline,
  mdiTextBoxEditOutline,
  mdiTranslate,
} from "@mdi/js";
import type { PickerComboBoxItem } from "../../components/ha-picker-combo-box";

/**
 * Row navigation for the search of everything. The list itself is the shared
 * picker list; this module holds the rules the quick bar adds on top: wrapping
 * at both ends, skipping rows that cannot be chosen, forgetting the active row
 * when the query changes, and when Space toggles a live switch.
 */

// The same placeholder ids the picker list uses for its "nothing found" and
// padding rows. They are shown in the list but can never be active.
const NO_ITEMS_AVAILABLE_ID = "___no_items_available___";
const PADDING_ID = "___padding___";

export const NO_ACTIVE_INDEX = -1;

export type NavigableEntry =
  string | { id: string; disabled?: boolean } | undefined;

export type MoveDirection = "next" | "previous" | "first" | "last";

/** Section titles, placeholders and disabled rows are skipped by navigation. */
export const isNavigableEntry = (entry: NavigableEntry): boolean =>
  !!entry &&
  typeof entry !== "string" &&
  !entry.disabled &&
  entry.id !== NO_ITEMS_AVAILABLE_ID &&
  entry.id !== PADDING_ID;

const navigableIndexes = (entries: readonly NavigableEntry[]): number[] => {
  const indexes: number[] = [];
  entries.forEach((entry, index) => {
    if (isNavigableEntry(entry)) {
      indexes.push(index);
    }
  });
  return indexes;
};

/**
 * Where the active row goes after a move. Returns NO_ACTIVE_INDEX when no row
 * can be active. With wrap, moving past either end continues at the other end;
 * without it the active row stays where it is.
 */
export const moveActiveIndex = (
  entries: readonly NavigableEntry[],
  current: number,
  direction: MoveDirection,
  wrap = true
): number => {
  const indexes = navigableIndexes(entries);
  if (!indexes.length) {
    return NO_ACTIVE_INDEX;
  }
  const first = indexes[0];
  const last = indexes[indexes.length - 1];
  if (direction === "first") {
    return first;
  }
  if (direction === "last") {
    return last;
  }
  if (direction === "next") {
    const next = indexes.find((index) => index > current);
    if (next !== undefined) {
      return next;
    }
    return wrap || current === NO_ACTIVE_INDEX ? first : current;
  }
  let previous: number | undefined;
  for (const index of indexes) {
    if (index < current) {
      previous = index;
    }
  }
  if (previous !== undefined) {
    return previous;
  }
  if (current === NO_ACTIVE_INDEX) {
    return wrap ? last : NO_ACTIVE_INDEX;
  }
  return wrap ? last : current;
};

/**
 * True when a move only happens because of wrapping. The shared list does not
 * wrap, so the quick bar handles exactly these moves itself and leaves every
 * other move to the list.
 */
export const isWrappingMove = (
  entries: readonly NavigableEntry[],
  current: number,
  direction: MoveDirection
): boolean =>
  (direction === "next" || direction === "previous") &&
  moveActiveIndex(entries, current, direction, true) !==
    moveActiveIndex(entries, current, direction, false);

export interface NavigationState {
  /** Index of the active row in the list, or NO_ACTIVE_INDEX. */
  index: number;
  /** The query the active row belongs to. */
  query: string;
}

export const createNavigationState = (query = ""): NavigationState => ({
  index: NO_ACTIVE_INDEX,
  query,
});

/** Typing changes the rows, so the active row is forgotten with the old query. */
export const navigationAfterQuery = (
  state: NavigationState,
  query: string
): NavigationState =>
  state.query === query ? state : { index: NO_ACTIVE_INDEX, query };

export const navigationWithIndex = (
  state: NavigationState,
  index: number
): NavigationState => (state.index === index ? state : { ...state, index });

/** "3 of 12": the place of an active row among the rows that can be chosen. */
export const optionPosition = (
  entries: readonly NavigableEntry[],
  index: number
): { position: number; total: number } | undefined => {
  const indexes = navigableIndexes(entries);
  const at = indexes.indexOf(index);
  return at === -1 ? undefined : { position: at + 1, total: indexes.length };
};

/**
 * Space belongs to the search field while a query is typed, because a query can
 * have several words. It toggles the live switch of the active row when the
 * field is empty, and always with Ctrl or Cmd held.
 */
export const spaceTogglesRow = (options: {
  query: string;
  hasLiveControl: boolean;
  modifier: boolean;
}): boolean =>
  options.hasLiveControl && (options.modifier || options.query === "");

// #region places

export type QuickBarPlaceId =
  "personal_wording" | "accessibility_tools" | "language_mode";

export interface PlaceComboBoxItem extends PickerComboBoxItem {
  placeId: QuickBarPlaceId;
  /** Extra words the search matches, shown nowhere. */
  description: string;
  /** Where the place lives. Missing for the accessibility tools panel. */
  path?: string;
}

export const QUICK_BAR_PLACE_PREFIX = "place________";

const PLACE_ICONS: Record<QuickBarPlaceId, string> = {
  personal_wording: mdiTextBoxEditOutline,
  accessibility_tools: mdiEyeSettingsOutline,
  language_mode: mdiTranslate,
};

/**
 * Entries that open places which already exist. Each is found by plain words
 * from its label, description or keywords, and by a pattern over the same text.
 * Language mode only lives in the settings panel, so it is offered to the
 * people who can open that panel.
 */
export const generatePlaceItems = (
  t: (key: string) => string,
  isAdmin: boolean
): PlaceComboBoxItem[] => {
  const caption = t("ui.dialogs.quick-bar.places.caption");
  const place = (
    placeId: QuickBarPlaceId,
    path: string | undefined
  ): PlaceComboBoxItem => {
    const primary = t(`ui.dialogs.quick-bar.places.${placeId}.label`);
    return {
      id: `${QUICK_BAR_PLACE_PREFIX}${placeId}`,
      placeId,
      primary,
      secondary: caption,
      description: t(`ui.dialogs.quick-bar.places.${placeId}.description`),
      sorting_label: primary,
      icon_path: PLACE_ICONS[placeId],
      path,
    };
  };
  return [
    place("personal_wording", "/profile/localization"),
    place("accessibility_tools", undefined),
    ...(isAdmin
      ? [place("language_mode", "/config/personal#language_mode")]
      : []),
  ];
};

// #endregion places
