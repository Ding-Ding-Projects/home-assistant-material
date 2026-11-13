import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";

/** How many pop-ups may be open on top of each other. */
export const MAX_POPUP_DEPTH = 3;

/** The most cards one pop-up renders. */
export const MAX_POPUP_CARDS = 24;

export const POPUP_SIZES = ["small", "medium", "large"] as const;

export type PopupSize = (typeof POPUP_SIZES)[number];

/**
 * A pop-up opened from inside another pop-up covers it, and closing the top
 * one shows the previous one again. The stack holds every covered pop-up.
 * Returns the stack with `current` added, or undefined when one more level
 * would pass the depth limit, so a pop-up that opens itself stops after a
 * few levels.
 */
export const pushPopup = <T>(
  stack: readonly T[],
  current: T
): T[] | undefined =>
  stack.length + 2 > MAX_POPUP_DEPTH ? undefined : [...stack, current];

export const normalizePopupSize = (value: unknown): PopupSize =>
  POPUP_SIZES.includes(value as PopupSize) ? (value as PopupSize) : "medium";

/** The cards of a pop-up configuration: only objects with a type, capped in number. */
export const sanitizePopupCards = (cards: unknown): LovelaceCardConfig[] => {
  if (!Array.isArray(cards)) {
    return [];
  }
  return cards
    .filter(
      (card): card is LovelaceCardConfig =>
        !!card &&
        typeof card === "object" &&
        typeof (card as LovelaceCardConfig).type === "string" &&
        (card as LovelaceCardConfig).type.length > 0
    )
    .slice(0, MAX_POPUP_CARDS);
};

/** Moves one card in a list; out-of-range moves return the list unchanged. */
export const moveCard = <T>(list: T[], from: number, to: number): T[] => {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
