import { modeText } from "../../common/language-mode/language-mode";
import { getLockLocalize } from "../../common/locks/element-lock-session";

/**
 * The wording of the lock surfaces, in the chosen language mode. Falls back to
 * the key when no wording is loaded yet. A host that calls this should hold a
 * `LanguageModeController` so it draws again when the mode changes.
 */
export const lockText = (
  key: string,
  values?: Record<string, string | number>
): string => {
  const localize = getLockLocalize() as
    | ((key: string, values?: Record<string, string | number>) => string)
    | undefined;
  return (localize ? modeText(localize, `ui.locks.${key}`, values) : "") || key;
};

const NAME_LIMIT = 40;

/** Cuts a name at a word, with an ellipsis, so it never ends mid-word. */
const shortName = (text: string): string => {
  if (text.length <= NAME_LIMIT) {
    return text;
  }
  const cut = text.slice(0, NAME_LIMIT);
  const space = cut.lastIndexOf(" ");
  return `${(space > NAME_LIMIT / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

const clean = (text: string | null | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim();

/**
 * A readable name for what an element is, for the list of locks. A card is
 * named by its own label or heading, or by its first line of text: joining
 * everything it shows made names like "Status Recording Entries today 14
 * Entries kept 14 Days 1 Siz".
 */
export const describeElement = (element: Element): string => {
  const labelled = clean(
    element.getAttribute("aria-label") || element.getAttribute("title")
  );
  if (labelled) {
    return shortName(labelled);
  }
  const heading = clean(
    element.querySelector("h1, h2, h3, h4, [role='heading'], .title, .header")
      ?.textContent
  );
  if (heading) {
    return shortName(heading);
  }
  const shown = (element as HTMLElement).innerText || element.textContent || "";
  const firstLine = clean(shown.split("\n").find((line) => clean(line)));
  return firstLine ? shortName(firstLine) : element.localName;
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

/** The width up to which the lock surfaces become full-width sheets. */
export const NARROW_QUERY = "(max-width: 600px)";

export const isNarrow = (): boolean => window.matchMedia(NARROW_QUERY).matches;

/** Calls back when the window crosses the narrow width; returns the way to stop. */
export const onNarrowChange = (callback: (narrow: boolean) => void) => {
  const query = window.matchMedia(NARROW_QUERY);
  const listener = (ev: MediaQueryListEvent) => callback(ev.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

/** Whether the main pointer is a finger. */
export const isTouch = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Places a panel on the side of an element that has more room, with a short
 * line joining the two. Falls back to under the element when neither side
 * has room.
 */
export const besideStyle = (
  anchor: Element | undefined,
  width = 560
): { panel: Record<string, string>; line?: Record<string, string> } => {
  const margin = 8;
  const gap = 24;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const rect = anchor?.getBoundingClientRect();
  if (!rect) {
    return { panel: anchorStyle(anchor, width) };
  }
  const right = viewportWidth - rect.right - margin;
  const left = rect.left - margin;
  const needed = width + gap;
  if (right < needed && left < needed) {
    return { panel: anchorStyle(anchor, width) };
  }
  const onRight = right >= left ? right >= needed : false;
  const panelLeft = onRight ? rect.right + gap : rect.left - gap - width;
  const top = Math.max(margin, Math.min(rect.top, viewportHeight * 0.4));
  const lineTop = Math.min(rect.top + rect.height / 2, top + 40);
  return {
    panel: {
      left: `${panelLeft}px`,
      top: `${top}px`,
      width: `${width}px`,
      "max-height": `${Math.max(240, viewportHeight - top - margin)}px`,
    },
    line: {
      left: `${onRight ? rect.right : panelLeft + width}px`,
      top: `${lineTop}px`,
      width: `${gap}px`,
    },
  };
};
