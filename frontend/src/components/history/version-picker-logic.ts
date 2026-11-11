/** Pure rules of the version picker and of the pages that use it. */

/**
 * A short signature of a list of versions: its length and its first and last
 * id. The picker resets "Show more" only when this changes, not whenever a
 * caller hands over a new array holding the same versions.
 */
export const versionListSignature = (
  items: readonly { id: string }[]
): string =>
  items.length
    ? `${items.length}|${items[0].id}|${items[items.length - 1].id}`
    : "0";

/**
 * How many versions to draw after the list was given again. The limit goes
 * back to one page only when the list really changed.
 */
export const limitAfterItems = (
  previousSignature: string | undefined,
  signature: string,
  limit: number,
  page: number
): number => (previousSignature === signature ? limit : page);

/**
 * Tells a slower, older answer from the newest one. Take a token before an
 * asynchronous request, and apply the answer only while the token is current.
 * `cancel` makes every token taken so far stale.
 */
export class RequestToken {
  private _value = 0;

  public begin(): number {
    this._value += 1;
    return this._value;
  }

  public cancel(): void {
    this._value += 1;
  }

  public isCurrent(token: number): boolean {
    return token === this._value;
  }
}

export interface SheetPlacementInput {
  /** The height of the layout viewport (`window.innerHeight`). */
  layoutHeight: number;
  /** The visible height (`visualViewport.height`). */
  viewportHeight: number;
  /** `visualViewport.offsetTop`. */
  viewportOffsetTop: number;
  /** The height of the bottom bar while it is shown, 0 while hidden. */
  barHeight: number;
  /** Space kept around the sheet. */
  margin: number;
}

export interface SheetPlacement {
  /** How far the visible area ends above the bottom of the layout viewport. */
  overlap: number;
  /** The tallest the sheet may be, in pixels. */
  maxHeight: number;
}

/** The keyboard is up when the visible area is this much shorter. */
export const KEYBOARD_OVERLAP_PX = 150;

const MIN_SHEET_HEIGHT = 120;

/**
 * Where a bottom sheet goes on a phone. The sheet is positioned against the
 * layout viewport, which the on-screen keyboard may cover: `overlap` lifts the
 * sheet to the visible area, and `maxHeight` keeps it inside what is left
 * after the bottom bar (when shown) and the margins.
 */
export const placeSheet = (input: SheetPlacementInput): SheetPlacement => {
  const overlap = Math.max(
    0,
    input.layoutHeight - input.viewportOffsetTop - input.viewportHeight
  );
  const bar = overlap > KEYBOARD_OVERLAP_PX ? 0 : Math.max(0, input.barHeight);
  const room = input.viewportHeight - bar - input.margin * 3;
  const floor = Math.min(
    MIN_SHEET_HEIGHT,
    input.viewportHeight - input.margin * 2
  );
  return { overlap, maxHeight: Math.max(room, floor, 0) };
};

/**
 * After the panel closes, focus returns to its button only when it was inside
 * the panel or on the page itself, never when the person moved on to another
 * control.
 */
export const shouldRestoreFocus = (
  activeInsidePanel: boolean,
  activeIsPage: boolean
): boolean => activeInsidePanel || activeIsPage;

/** The visible height of the phone bar, from its published custom property. */
export const parseBarHeight = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
