/**
 * Where the dim sum card may sit so it never covers a control that floats
 * over the bottom of the page: the create button, the floating tool pills, a
 * save bar or a bulk bar. The card starts in the toast strip and moves up past
 * every floating box that shares its columns, never off the top of the screen.
 */

export interface ClearanceBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ClearanceInput {
  /** Distance from the bottom of the viewport the card asks for on its own. */
  base: number;
  cardHeight: number;
  cardLeft: number;
  cardRight: number;
  viewportHeight: number;
  /** Boxes of the floating controls currently on screen. */
  floating: readonly ClearanceBox[];
  /** Air left between the card and a control below it. */
  gap?: number;
  /** Room the card always keeps from the top of the viewport. */
  topMargin?: number;
}

/** The air left between the card and a floating control below it. */
export const CLEARANCE_GAP_PX = 8;

/** A box this tall is a page or a sheet, not a control floating over it. */
export const MAX_FLOATING_SHARE = 0.4;

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

/**
 * Whether a box counts as a control floating over the bottom of the page:
 * it has a size, it is not a whole page or sheet, and it is in the lower
 * half of the screen.
 */
export const isFloatingControlBox = (
  box: ClearanceBox,
  viewportHeight: number
): boolean => {
  const height = box.bottom - box.top;
  const width = box.right - box.left;
  return (
    height > 0 &&
    width > 0 &&
    height <= viewportHeight * MAX_FLOATING_SHARE &&
    box.bottom > viewportHeight / 2
  );
};

/**
 * The distance from the bottom of the viewport at which the card covers none
 * of the floating boxes that share its columns. Each box the card would
 * overlap lifts it to just above that box; this repeats until nothing is in
 * the way, so a dock stacked above a create button lifts it past both. The
 * card never rises so far that it leaves the screen.
 */
export const dimSumClearance = (input: ClearanceInput): number => {
  const viewportHeight = finite(input.viewportHeight);
  const cardHeight = Math.max(finite(input.cardHeight), 0);
  const gap = Math.max(finite(input.gap ?? CLEARANCE_GAP_PX), 0);
  const topMargin = Math.max(finite(input.topMargin ?? CLEARANCE_GAP_PX), 0);
  const highest = Math.max(viewportHeight - cardHeight - topMargin, 0);
  let offset = Math.min(Math.max(finite(input.base), 0), highest);
  const boxes = input.floating.filter(
    (box) =>
      isFloatingControlBox(box, viewportHeight) &&
      box.left < input.cardRight &&
      box.right > input.cardLeft
  );
  // Each round moves the card above at least one more box, so the number of
  // boxes bounds the rounds.
  for (let round = 0; round <= boxes.length; round++) {
    const cardBottom = viewportHeight - offset;
    const cardTop = cardBottom - cardHeight;
    const blocking = boxes.filter(
      (box) => box.top < cardBottom && box.bottom > cardTop
    );
    if (blocking.length === 0) {
      return offset;
    }
    const next = Math.max(
      ...blocking.map((box) => viewportHeight - box.top + gap)
    );
    const clamped = Math.min(next, highest);
    if (clamped <= offset) {
      return offset;
    }
    offset = clamped;
  }
  return offset;
};
