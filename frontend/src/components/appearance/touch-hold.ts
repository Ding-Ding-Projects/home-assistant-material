/**
 * When a finger held on an element may open the element menu.
 *
 * Dashboard cards and tiles have a hold action of their own (it opens the
 * more-info dialog by default, and a person can set it to toggle, navigate,
 * call a service and so on). That hold must never be taken away. The menu is
 * therefore offered on an element with a hold action only when that action is
 * known to be harmless to replace, and then only after a longer hold than the
 * action's own (the action handler fires at 500 ms, the menu at 900 ms), so a
 * normal hold still does what it always did.
 *
 * Nothing here reads the page: the page code collects the facts and these
 * rules decide, so the decision can be tested on its own.
 */

/** A hold on an element without any hold action opens the menu after this. */
export const TOUCH_HOLD_MS = 600;

/**
 * A hold on an element whose hold action is the default one opens the menu
 * after this, which is clearly longer than the action handler's 500 ms.
 */
export const TOUCH_HOLD_OVER_ACTION_MS = 900;

/** Hold actions that the menu may stand in front of. */
const REPLACEABLE_HOLD_ACTIONS = new Set(["none", "more-info"]);

/** What a hold on an element leads to. */
export type TouchHoldDecision =
  { open: false } | { open: true; delayMs: number };

/** What is known about one element on the path that has an action handler. */
export interface HoldHandlerFacts {
  /** Whether the handler has a hold action. */
  hasHold: boolean;
}

/** How deep into a card's configuration hold actions are looked for. */
const MAX_CONFIG_DEPTH = 5;

/** The most objects looked at in one scan, so a big object cannot stall a touch. */
const MAX_CONFIG_NODES = 2000;

/**
 * Every hold action named anywhere in a card's configuration: the value of
 * each key that ends in `hold_action`, in the card itself and in what it
 * contains (the entities of a glance card each have their own). An action is
 * its `action` name; a value that is not a usable action is reported as
 * `"unknown"`, which is never replaceable.
 */
export const collectHoldActions = (config: unknown): string[] => {
  const found: string[] = [];
  let looked = 0;
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > MAX_CONFIG_DEPTH) {
      return;
    }
    looked += 1;
    if (looked > MAX_CONFIG_NODES) {
      // Too big to read in full: what was not read cannot be called safe.
      if (looked === MAX_CONFIG_NODES + 1) {
        found.push("unknown");
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (key.endsWith("hold_action")) {
        const name = (item as { action?: unknown } | undefined)?.action;
        found.push(typeof name === "string" ? name : "unknown");
      } else {
        visit(item, depth + 1);
      }
    });
  };
  visit(config, 0);
  return found;
};

/**
 * Whether a hold may open the menu, and after how long.
 *
 * - No element on the path has a hold action: the menu opens as it does on any
 *   other element.
 * - Some element has a hold action: the menu opens, after the longer hold,
 *   only when the configuration was read, names at least one hold action, and
 *   every one of them is `more-info` (the default) or `none`. A hold action
 *   that is anything else, or that could not be read, keeps its hold and gets
 *   no menu from a touch (the right-click and keyboard routes are unchanged).
 */
export const decideTouchHold = (
  handlers: HoldHandlerFacts[],
  holdActions: string[]
): TouchHoldDecision => {
  if (!handlers.some((handler) => handler.hasHold)) {
    return { open: true, delayMs: TOUCH_HOLD_MS };
  }
  const replaceable =
    holdActions.length > 0 &&
    holdActions.every((action) => REPLACEABLE_HOLD_ACTIONS.has(action));
  return replaceable
    ? { open: true, delayMs: TOUCH_HOLD_OVER_ACTION_MS }
    : { open: false };
};
