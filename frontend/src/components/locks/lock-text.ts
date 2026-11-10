import { getLockLocalize } from "../../common/locks/element-lock-session";

/** The wording of the lock surfaces. Falls back to the key when no wording is loaded yet. */
export const lockText = (
  key: string,
  values?: Record<string, string | number>
): string => {
  const localize = getLockLocalize() as
    | ((key: string, values?: Record<string, string | number>) => string)
    | undefined;
  return (localize ? localize(`ui.locks.${key}`, values) : "") || key;
};

/** A readable name for what an element is, for the list of locks. */
export const describeElement = (element: Element): string => {
  const named =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    (element as HTMLElement).innerText ||
    element.textContent ||
    "";
  const text = named.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 60) : element.localName;
};

/**
 * Places a floating panel beside an element, inside the window. A narrow
 * window gets the panel at its full width under the element instead.
 */
export const anchorStyle = (
  anchor: Element | undefined,
  width = 360
): Record<string, string> => {
  const margin = 8;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const panelWidth = Math.min(width, viewportWidth - margin * 2);
  const rect = anchor?.getBoundingClientRect();
  let left = rect ? rect.left : (viewportWidth - panelWidth) / 2;
  left = Math.max(margin, Math.min(left, viewportWidth - panelWidth - margin));
  let top = rect ? rect.bottom + margin : margin * 4;
  // When the element is low on the screen, open above it.
  if (rect && top > viewportHeight * 0.55) {
    top = Math.max(margin, rect.top - margin - viewportHeight * 0.5);
  }
  top = Math.max(margin, Math.min(top, viewportHeight * 0.5));
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${panelWidth}px`,
    "max-height": `${Math.max(240, viewportHeight - top - margin)}px`,
  };
};
