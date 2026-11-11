import {
  MOTION_ENTERING_ATTRIBUTE,
  MOTION_STANDARD_EASING,
} from "./motion-styles";

/** Most rows that animate at once, so a long automation never janks. */
const MAX_ANIMATED_ROWS = 3;
const MOVE_DURATION_MS = 200;

/** True when the system or the product's own setting asks for reduced motion. */
export const prefersReducedMotion = (): boolean =>
  document.documentElement.hasAttribute("data-a11y-reduce-motion") ||
  (typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * Marks rows that were just added so the entry animation in the row styles
 * plays once. Returns the keys now present, to compare on the next update.
 */
export const markEnteringRows = (
  rows: HTMLElement[],
  keys: string[],
  previousKeys: Set<string> | undefined
): Set<string> => {
  const current = new Set(keys);
  if (!previousKeys) {
    return current;
  }
  if (rows.length !== keys.length) {
    // Rows and keys are not paired yet; keep the last good baseline so the
    // next update still compares against what was really shown.
    return previousKeys;
  }
  const entering = rows.filter((_row, idx) => !previousKeys.has(keys[idx]));
  if (entering.length === 0 || entering.length > MAX_ANIMATED_ROWS) {
    return current;
  }
  for (const row of entering) {
    row.setAttribute(MOTION_ENTERING_ATTRIBUTE, "");
    const done = (ev: AnimationEvent) => {
      if (ev.target !== row || ev.animationName !== "ha-automation-enter") {
        return;
      }
      row.removeAttribute(MOTION_ENTERING_ATTRIBUTE);
      row.removeEventListener("animationend", done);
      row.removeEventListener("animationcancel", done);
    };
    row.addEventListener("animationend", done);
    row.addEventListener("animationcancel", done);
  }
  return current;
};

/** The vertical position of each row element, read before a reorder. */
export const measureRows = (rows: HTMLElement[]): Map<HTMLElement, number> =>
  new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));

/**
 * Plays the move of rows that changed position, from where they were to where
 * they are now (a FLIP animation using `transform` only). Used for keyboard
 * reordering, where no drag library animates the move.
 */
export const animateRowMoves = (
  rows: HTMLElement[],
  before: Map<HTMLElement, number>
) => {
  if (prefersReducedMotion()) {
    return;
  }
  let animated = 0;
  for (const row of rows) {
    const previous = before.get(row);
    if (previous === undefined || typeof row.animate !== "function") {
      continue;
    }
    const delta = previous - row.getBoundingClientRect().top;
    if (!delta) {
      continue;
    }
    row.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
      { duration: MOVE_DURATION_MS, easing: MOTION_STANDARD_EASING }
    );
    animated++;
    if (animated >= MAX_ANIMATED_ROWS) {
      return;
    }
  }
};
