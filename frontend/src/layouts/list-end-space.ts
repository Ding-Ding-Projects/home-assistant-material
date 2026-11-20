/**
 * Sizes shared by the list layouts: how much room the end of a list keeps
 * free for the things that float over its bottom edge, and when a phone page
 * folds its large title into the compact bar.
 */

/** The gap between the bottom edge of the list and the floating controls. */
export const FLOATING_OFFSET_PX = 16;

/** The air left between the last row and the top of the floating controls. */
export const END_SPACE_MARGIN_PX = 16;

/** The page folds its large title once the list has scrolled this far. */
export const FOLD_AT_PX = 24;

export interface EndSpaceInput {
  /** Height of the floating pill dock, including a wrapped second row. */
  dock?: number;
  /** Height of the floating create button. */
  fab?: number;
  /** Height a page's own floating bulk bar needs, if it shows one. */
  bulkBar?: number;
  /** Gap between the bottom edge of the list and the floating controls. */
  offset?: number;
  /** Air between the last row and the floating controls. */
  margin?: number;
  /**
   * The dock sits above the create button instead of beside it, as on a
   * narrow phone where both do not fit on one line.
   */
  stacked?: boolean;
  /** Gap between the dock and the create button when stacked. */
  gap?: number;
}

/** The gap between the dock and the create button when they are stacked. */
export const STACK_GAP_PX = 12;

/**
 * Whether the dock must sit above the create button: the pill and the
 * button do not fit side by side in the width the page has.
 */
export const shouldStackDock = (
  pageWidth: number,
  pillWidth: number,
  fabWidth: number,
  sideMargins = 24 + STACK_GAP_PX
): boolean =>
  size(fabWidth) > 0 &&
  size(pillWidth) > 0 &&
  size(pillWidth) + size(fabWidth) + sideMargins > size(pageWidth);

const size = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * The room, in pixels, the end of a list keeps free so its last row can
 * scroll clear of everything floating over the bottom edge. The dock and the
 * create button normally sit side by side on one baseline, so the tallest of
 * them counts, not their sum; stacked, both count. Nothing floating means no
 * extra room. The bottom safe area (and the phone bar inside it) is added on
 * top of this in CSS.
 */
export const listEndSpace = (input: EndSpaceInput): number => {
  const dock = size(input.dock);
  const fab = size(input.fab);
  // Stacked, the dock rides on top of the button, so both heights count.
  const floating =
    input.stacked && dock > 0 && fab > 0
      ? dock + fab + size(input.gap ?? STACK_GAP_PX)
      : Math.max(dock, fab);
  const tallest = Math.max(floating, size(input.bulkBar));
  if (tallest === 0) {
    return 0;
  }
  const offset = size(input.offset ?? FLOATING_OFFSET_PX);
  const margin = size(input.margin ?? END_SPACE_MARGIN_PX);
  return Math.ceil(offset + tallest + margin);
};

/**
 * Whether the large title stays folded after a scroll. It folds once the list
 * has moved past `foldAt` and unfolds only when the list is back at the very
 * top, so a small scroll near the threshold never makes it flicker.
 */
export const nextFolded = (
  folded: boolean,
  scrollTop: number,
  foldAt: number = FOLD_AT_PX
): boolean => {
  const top = Number.isFinite(scrollTop) ? scrollTop : 0;
  if (folded) {
    return top > 0;
  }
  return top > foldAt;
};
