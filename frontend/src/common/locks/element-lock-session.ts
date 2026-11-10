import { resolveElementPath } from "../appearance/element-appearance";
import { lockedElementPaths, readLocks } from "./element-locks";

/**
 * Locks on single elements of the page that is open: a locked element
 * takes no input and is drawn with a dashed outline. One instance per
 * window. An element is found by its path, so a lock follows the element
 * across visits as long as the page is built the same way.
 */

const MARK = "data-ha-locked";

const locked = new Map<HTMLElement, { outline: string; offset: string }>();

const release = (element: HTMLElement): void => {
  const before = locked.get(element);
  locked.delete(element);
  if (!before) {
    return;
  }
  element.removeAttribute("inert");
  element.removeAttribute(MARK);
  element.style.outline = before.outline;
  element.style.outlineOffset = before.offset;
};

/** Applies the stored locks to the page as it is now. */
export const applyElementLocks = (): void => {
  const wanted = new Set<HTMLElement>();
  lockedElementPaths(readLocks(), window.location.pathname).forEach((path) => {
    const element = resolveElementPath(path);
    if (element) {
      wanted.add(element);
    }
  });
  locked.forEach((_before, element) => {
    if (!wanted.has(element) || !element.isConnected) {
      release(element);
    }
  });
  wanted.forEach((element) => {
    if (locked.has(element)) {
      return;
    }
    locked.set(element, {
      outline: element.style.outline,
      offset: element.style.outlineOffset,
    });
    element.setAttribute("inert", "");
    element.setAttribute(MARK, "");
    element.style.outline = "2px dashed var(--primary-color)";
    element.style.outlineOffset = "2px";
  });
};

/** Whether an element, or something it is inside, is locked. */
export const isElementLocked = (element: Element): boolean =>
  !!element.closest(`[${MARK}]`);

/** How many elements are locked on the page that is open and still there. */
export const lockedElementCount = (): number => locked.size;
