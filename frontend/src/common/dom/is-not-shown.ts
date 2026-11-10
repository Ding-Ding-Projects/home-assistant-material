/**
 * Whether an element and everything in it is not shown.
 *
 * `checkVisibility` says no for an element that has no box of its own, which
 * includes `display: contents`: a slot, or a wrapper that only groups. Those
 * still show their children, so they count as shown here.
 */
export const isNotShown = (element: Element): boolean => {
  if (
    !(element instanceof HTMLElement) ||
    typeof element.checkVisibility !== "function"
  ) {
    return false;
  }
  if (element.checkVisibility({ visibilityProperty: true })) {
    return false;
  }
  return getComputedStyle(element).display !== "contents";
};
