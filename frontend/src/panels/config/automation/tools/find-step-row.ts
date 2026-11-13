import { scrollRowIntoView } from "../scroll-row-into-view";
import { asList, configParts, isRec } from "./step-model";

/**
 * The configuration object a step path names, for the paths of the flow graph
 * and of stored traces: `action/2`, `action/2/choose/0`, `action/3/then/0`.
 * A path that ends on a list of steps (`then`, `else`, `default`) names the
 * step that owns the list. Returns undefined when the path leads nowhere.
 */
export const resolveStepPath = (
  config: unknown,
  path: string
): unknown | undefined => {
  const [section, index, ...rest] = path.split("/");
  const parts = configParts(config);
  const list =
    section === "trigger"
      ? parts.triggers
      : section === "condition"
        ? parts.conditions
        : section === "action"
          ? parts.actions
          : undefined;
  if (!list || index === undefined || !/^\d+$/.test(index)) {
    return undefined;
  }
  let current: unknown = list[Number(index)];
  let previous: unknown;
  for (const segment of rest) {
    previous = current;
    if (/^\d+$/.test(segment)) {
      current = asList(current)[Number(segment)];
    } else if (isRec(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
    if (current === undefined) {
      return undefined;
    }
  }
  const last = rest[rest.length - 1];
  return last === undefined || /^\d+$/.test(last) ? current : previous;
};

const ROW_ITEM_KEYS = ["action", "condition", "trigger", "option"] as const;

const isRow = (el: Element) => el.localName.endsWith("-row");

/** Finds the row element that shows the given configuration object. */
export const findRowFor = (
  root: Node,
  item: unknown
): HTMLElement | undefined => {
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node instanceof Element) {
      if (
        isRow(node) &&
        ROW_ITEM_KEYS.some((key) => (node as any)[key] === item)
      ) {
        return node as HTMLElement;
      }
      if (node.shadowRoot) {
        stack.push(node.shadowRoot);
      }
    }
    for (const child of Array.from(node.childNodes)) {
      stack.push(child);
    }
  }
  return undefined;
};

/**
 * Scrolls the editor row of a step into view and marks it for a moment.
 * Returns false when the row is not on screen, for example inside a collapsed
 * parent or in YAML mode.
 */
export const showStepRow = (
  root: Node,
  config: unknown,
  path: string
): boolean => {
  const item = resolveStepPath(config, path);
  if (item === undefined) {
    return false;
  }
  const row = findRowFor(root, item);
  if (!row) {
    return false;
  }
  scrollRowIntoView(row);
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (reduced || !row.animate) {
    const previous = row.style.outline;
    row.style.outline = "3px solid var(--primary-color)";
    window.setTimeout(() => {
      row.style.outline = previous;
    }, 2000);
  } else {
    row.animate(
      [
        { outline: "3px solid var(--primary-color)", outlineOffset: "2px" },
        { outline: "3px solid var(--primary-color)", outlineOffset: "2px" },
        { outline: "3px solid transparent", outlineOffset: "2px" },
      ],
      { duration: 2000, easing: "ease-out" }
    );
  }
  return true;
};
