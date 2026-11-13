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

/** A button of a page's own toolbar, as one row of the phone More sheet. */
export interface FoldedToolbarAction {
  label: string;
  path: string;
  disabled: boolean;
  element: HTMLElement;
}

interface ToolbarIconButton extends HTMLElement {
  label?: string;
  path?: string;
  disabled?: boolean;
}

/**
 * What a page puts in its toolbar, as the phone page header needs it. A page
 * with an overflow menu keeps its own buttons and menu and offers the shared
 * page tools through the tools panel. A page without one folds the shared tools
 * and its icon buttons into one More sheet, but only when every icon button has
 * a name and an icon to list, so no control is ever left without a home.
 * Elements that are not icon buttons stay where they are.
 */
export const inspectToolbarItems = (
  items: readonly Element[]
): { hasMenu: boolean; foldable: boolean; actions: FoldedToolbarAction[] } => {
  const hasMenu = items.some((item) => isToolPillMenu(item));
  const buttons = items.filter(
    (item): item is ToolbarIconButton => item.localName === "ha-icon-button"
  );
  const actions: FoldedToolbarAction[] = [];
  let foldable = !hasMenu;
  for (const button of buttons) {
    if (!button.label || !button.path) {
      foldable = false;
      continue;
    }
    actions.push({
      label: button.label,
      path: button.path,
      disabled: Boolean(button.disabled),
      element: button,
    });
  }
  return { hasMenu, foldable, actions: foldable ? actions : [] };
};

/** `inspectToolbarItems` for the elements assigned to a slot. */
export const inspectToolbarSlot = (slot: HTMLSlotElement | null) =>
  inspectToolbarItems(slot ? slot.assignedElements({ flatten: true }) : []);

const foldedButtons = new WeakSet<HTMLElement>();

/**
 * Hides the icon buttons that the More sheet lists, or shows them again. The
 * buttons can reach a layout through several forwarded slots, which CSS in the
 * layout cannot select, so the buttons themselves are hidden and any button
 * that stopped being folded gets its display back.
 */
export const setToolbarFolded = (
  slot: HTMLSlotElement | null,
  fold: boolean
): void => {
  if (!slot) {
    return;
  }
  const { actions } = inspectToolbarSlot(slot);
  const listed = new Set<HTMLElement>(
    fold ? actions.map((action) => action.element) : []
  );
  for (const item of slot.assignedElements({ flatten: true })) {
    if (!(item instanceof HTMLElement)) {
      continue;
    }
    if (listed.has(item)) {
      item.style.display = "none";
      foldedButtons.add(item);
    } else if (foldedButtons.has(item)) {
      item.style.removeProperty("display");
      foldedButtons.delete(item);
    }
  }
};
