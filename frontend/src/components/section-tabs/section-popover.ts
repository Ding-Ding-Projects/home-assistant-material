/**
 * Safe use of the popover API for the menus and dialogs of the section tabs.
 * A browser without it, or a test browser, only stays without the top layer:
 * nothing throws.
 */

/** Whether a popover element is open now. */
export const popoverOpen = (
  element: HTMLElement | null | undefined
): boolean => {
  try {
    return Boolean(element?.matches(":popover-open"));
  } catch (_err) {
    return false;
  }
};

/** Shows a popover element; a no-op where the popover API is missing. */
export const showPopover = (element: HTMLElement | null | undefined): void => {
  try {
    element?.showPopover?.();
  } catch (_err) {
    // The element stays where it is in the page.
  }
};

/** Hides a popover element; a no-op where the popover API is missing. */
export const hidePopover = (element: HTMLElement | null | undefined): void => {
  try {
    element?.hidePopover?.();
  } catch (_err) {
    // Already hidden.
  }
};
