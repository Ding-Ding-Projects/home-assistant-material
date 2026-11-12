import type { DockEdge } from "../../common/tabs/tab-dock";

/** Below this width the menu and the dialogs open as a sheet at the bottom. */
export const SHEET_WIDTH = 600;

/** The space kept between a popup and the edge of the screen. */
export const EDGE_GAP = 8;

export interface PlaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  /** Shown as a sheet over the bottom of the screen. */
  sheet: boolean;
  left: number;
  top: number;
  /** The most height the popup may take, so it never runs off the screen. */
  maxHeight: number;
  maxWidth: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(value, Math.max(low, high)));

/**
 * Where a popup opens beside the tab it belongs to: below a strip docked to
 * the top, above one docked to the bottom, to the right of one docked to the
 * left and to the left of one docked to the right. When the preferred side has
 * no room the opposite side is used, and the popup is moved so it stays inside
 * the screen, which holds at a width of 320 pixels.
 */
export const placeBeside = (
  anchor: PlaceRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  dock: DockEdge,
  rtl = false
): Placement => {
  if (viewport.width < SHEET_WIDTH) {
    return {
      sheet: true,
      left: 0,
      top: 0,
      maxHeight: viewport.height,
      maxWidth: viewport.width,
    };
  }
  const maxWidth = viewport.width - 2 * EDGE_GAP;
  const maxHeight = viewport.height - 2 * EDGE_GAP;
  const width = Math.min(size.width, maxWidth);
  const height = Math.min(size.height, maxHeight);
  const vertical = dock === "left" || dock === "right";
  let left: number;
  let top: number;
  if (vertical) {
    const preferRight = (dock === "left") !== rtl;
    const right = anchor.left + anchor.width + EDGE_GAP;
    const leftSide = anchor.left - width - EDGE_GAP;
    const fitsRight = right + width <= viewport.width - EDGE_GAP;
    const fitsLeft = leftSide >= EDGE_GAP;
    left = preferRight
      ? fitsRight || !fitsLeft
        ? right
        : leftSide
      : fitsLeft || !fitsRight
        ? leftSide
        : right;
    top = anchor.top;
  } else {
    const below = anchor.top + anchor.height + EDGE_GAP;
    const above = anchor.top - height - EDGE_GAP;
    const fitsBelow = below + height <= viewport.height - EDGE_GAP;
    const fitsAbove = above >= EDGE_GAP;
    top =
      dock === "top"
        ? fitsBelow || !fitsAbove
          ? below
          : above
        : fitsAbove || !fitsBelow
          ? above
          : below;
    left = rtl ? anchor.left + anchor.width - width : anchor.left;
  }
  return {
    sheet: false,
    left: clamp(left, EDGE_GAP, viewport.width - width - EDGE_GAP),
    top: clamp(top, EDGE_GAP, viewport.height - height - EDGE_GAP),
    maxHeight,
    maxWidth,
  };
};
