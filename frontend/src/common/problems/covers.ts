/**
 * Bars that sit on top of the page content, such as an editor's bottom bar.
 * The problem overlay is drawn in one fixed layer above everything, so it asks
 * here which areas it must stay out of: an outline or badge whose element has
 * scrolled under a registered bar is cut off at the bar's edge.
 */
const covers = new Set<HTMLElement>();

// The outline is drawn a little outside its box; this keeps it off the bar.
const OUTLINE_ROOM = 8;

// Less of an element than this is not worth outlining.
const MIN_VISIBLE = 28;

export const registerProblemCover = (element: HTMLElement): void => {
  covers.add(element);
};

export const releaseProblemCover = (element: HTMLElement): void => {
  covers.delete(element);
};

/**
 * For a bar that is rendered conditionally or re-created by a template: moves
 * the registration from the bar seen last time to the one found now, and
 * returns the one to remember. Pass undefined when there is no bar.
 */
export const syncProblemCover = (
  previous: HTMLElement | undefined,
  current: HTMLElement | undefined | null
): HTMLElement | undefined => {
  const next = current ?? undefined;
  if (previous !== next) {
    if (previous) {
      covers.delete(previous);
    }
    if (next) {
      covers.add(next);
    }
  }
  return next;
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
 * Cuts a box where a cover overlaps it. A cover over the top part moves the
 * top edge (and with it the badge) down to the cover's lower edge; a cover over
 * the bottom part moves the bottom edge up; a cover in the middle of a tall box
 * leaves the larger visible part; a box that is covered completely, or has too
 * little left, is dropped. Every cut keeps the outline's room clear of the
 * cover.
 */
export const clipToCovers = <
  T extends { top: number; left: number; width: number; height: number },
>(
  box: T,
  rects: CoverRect[]
): T | undefined => {
  let top = box.top;
  let bottom = box.top + box.height;
  let cut = false;
  const across = rects.filter(
    (rect) => box.left < rect.right && box.left + box.width > rect.left
  );
  // A cut can bring the box under another cover, so repeat until it is stable.
  for (let pass = 0; pass <= across.length; pass++) {
    let changed = false;
    for (const rect of across) {
      const coverTop = rect.top - OUTLINE_ROOM;
      const coverBottom = rect.bottom + OUTLINE_ROOM;
      if (bottom <= coverTop || top >= coverBottom) {
        continue;
      }
      const topCovered = top >= coverTop;
      const bottomCovered = bottom <= coverBottom;
      if (topCovered && bottomCovered) {
        return undefined;
      }
      if (topCovered) {
        top = coverBottom;
      } else if (bottomCovered) {
        bottom = coverTop;
      } else {
        // The cover is in the middle: keep the larger part.
        const above = coverTop - top;
        const below = bottom - coverBottom;
        if (above >= below) {
          bottom = coverTop;
        } else {
          top = coverBottom;
        }
      }
      changed = true;
      cut = true;
    }
    if (!changed) {
      break;
    }
  }
  // A sliver left by a cut cannot carry a badge that can be read or pressed.
  if (cut && bottom - top < MIN_VISIBLE) {
    return undefined;
  }
  return { ...box, top, height: bottom - top };
};

const parentOf = (node: Element): Element | null => {
  if (node.assignedSlot) {
    return node.assignedSlot;
  }
  if (node.parentElement) {
    return node.parentElement;
  }
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
};

const CLIPPING = new Set(["hidden", "auto", "scroll", "clip"]);

/**
 * The part of the window in which an element can be seen: the window itself,
 * narrowed by every ancestor that scrolls or hides its overflow, across shadow
 * roots. The overlay is drawn above the page, so without this an outline would
 * follow an element that has scrolled out of its container.
 */
export const visibleArea = (element: Element): CoverRect => {
  const area: CoverRect = {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  };
  let node = parentOf(element);
  while (node) {
    const style = getComputedStyle(node);
    const clipsY = CLIPPING.has(style.overflowY);
    const clipsX = CLIPPING.has(style.overflowX);
    if (clipsY || clipsX) {
      const rect = node.getBoundingClientRect();
      if (clipsY) {
        area.top = Math.max(area.top, rect.top);
        area.bottom = Math.min(area.bottom, rect.bottom);
      }
      if (clipsX) {
        area.left = Math.max(area.left, rect.left);
        area.right = Math.min(area.right, rect.right);
      }
    }
    node = parentOf(node);
  }
  return area;
};

/** Cuts a box to an area. Returns undefined when too little of it is left. */
export const clipToArea = <
  T extends { top: number; left: number; width: number; height: number },
>(
  box: T,
  area: CoverRect
): T | undefined => {
  const top = Math.max(box.top, area.top);
  const bottom = Math.min(box.top + box.height, area.bottom);
  const left = Math.max(box.left, area.left);
  const right = Math.min(box.left + box.width, area.right);
  // A sliver cannot carry a badge that can be read or pressed.
  if (bottom - top < MIN_VISIBLE || right - left < MIN_VISIBLE) {
    return undefined;
  }
  return { ...box, top, left, height: bottom - top, width: right - left };
};
