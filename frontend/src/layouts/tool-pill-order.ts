import { mdiDotsVertical } from "@mdi/js";

/**
 * Order values inside the floating tool pill of a page header: the page's own
 * actions first (0), then the shared page tools, the divider and help (set by
 * `ha-page-tools`), and the page's overflow menu last.
 */
export const TOOL_PILL_MENU_ORDER = "4";

const MENU_TAGS = new Set([
  "ha-dropdown",
  "ha-button-menu",
  "ha-md-button-menu",
  "ha-icon-overflow-menu",
  "ha-integration-overflow-menu",
  "cloud-signed-out-menu",
]);

const WRAPPER_TAGS = new Set(["DIV", "SPAN"]);

/** Whether an element a page puts in the toolbar is its overflow menu. */
export const isToolPillMenu = (element: Element): boolean => {
  const tag = element.localName;
  if (MENU_TAGS.has(tag) || tag.endsWith("-overflow-menu")) {
    return true;
  }
  if ((element as { path?: string }).path === mdiDotsVertical) {
    return true;
  }
  // A plain wrapper around a page's buttons ends with its menu.
  if (WRAPPER_TAGS.has(element.tagName)) {
    const last = element.lastElementChild;
    return !!last && isToolPillMenu(last);
  }
  return false;
};

const marked = new WeakSet<HTMLElement>();

/**
 * Puts the page's overflow menu last in the tool pill, whatever order and
 * wrapping the page uses. CSS alone cannot tell the menu from the other
 * buttons, so the menu gets an inline `order` and any element that stopped
 * being the menu gets it cleared again.
 */
export const orderToolPillItems = (slot: HTMLSlotElement | null): void => {
  if (!slot) {
    return;
  }
  for (const item of slot.assignedElements({ flatten: true })) {
    if (!(item instanceof HTMLElement)) {
      continue;
    }
    if (isToolPillMenu(item)) {
      item.style.order = TOOL_PILL_MENU_ORDER;
      marked.add(item);
    } else if (marked.has(item)) {
      item.style.removeProperty("order");
      marked.delete(item);
    }
  }
};
