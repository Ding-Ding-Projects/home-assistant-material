/**
 * Bars that sit on top of the page content, such as an editor's bottom bar.
 * The problem overlay is drawn in one fixed layer above everything, so it asks
 * here which areas it must stay out of: an outline or badge whose element has
 * scrolled under a registered bar is cut off at the bar's edge.
 */
const covers = new Set<HTMLElement>();

// The outline is drawn a little outside its box; this keeps it off the bar.
const OUTLINE_ROOM = 8;

export const registerProblemCover = (element: HTMLElement): void => {
  covers.add(element);
};

export const releaseProblemCover = (element: HTMLElement): void => {
  covers.delete(element);
};

export interface CoverRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const problemCoverRects = (): CoverRect[] => {
  const rects: CoverRect[] = [];
  for (const element of covers) {
    const rect = element.getBoundingClientRect();
    if (rect.width && rect.height) {
      rects.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      });
    }
  }
  return rects;
};

/**
 * Cuts a box where a cover overlaps it from below or above. Returns undefined
 * when its top edge, where the badge sits, is under a cover.
 */
export const clipToCovers = <
  T extends { top: number; left: number; width: number; height: number },
>(
  box: T,
  rects: CoverRect[]
): T | undefined => {
  const top = box.top;
  let bottom = box.top + box.height;
  for (const rect of rects) {
    const overlapsAcross =
      box.left < rect.right && box.left + box.width > rect.left;
    if (!overlapsAcross || bottom <= rect.top || top >= rect.bottom) {
      continue;
    }
    if (top >= rect.top - OUTLINE_ROOM) {
      // The top edge is under the bar.
      return undefined;
    }
    bottom = Math.min(bottom, rect.top - OUTLINE_ROOM);
  }
  if (bottom - top < 1) {
    return undefined;
  }
  return { ...box, top, height: bottom - top };
};
