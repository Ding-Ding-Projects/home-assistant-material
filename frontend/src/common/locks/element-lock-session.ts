import { resolveElementPath } from "../appearance/element-appearance";
import type { LocalizeFunc } from "../translations/localize";
import type { LockDuration } from "./lock-credentials";
import {
  elementLockKey,
  isLocked,
  lockedElementPaths,
  readLocks,
} from "./element-locks";

/**
 * Locks on single elements of the page that is open.
 *
 * A locked element is really disabled: the protected action, typing,
 * dragging and every shortcut inside it are refused before they reach it.
 * It stays an unlock target, so pressing, touching or pressing Enter or
 * Space on it opens that element's own unlock prompt, which is anchored
 * beside the element. One instance per window. An element is found by its
 * path, so a lock follows the element across visits as long as the page is
 * built the same way.
 */

const MARK = "data-ha-locked";
const KEY_ATTRIBUTE = "data-ha-lock-key";

const locked = new Map<
  HTMLElement,
  { outline: string; offset: string; ariaDisabled: string | null }
>();

interface Unlock {
  duration: LockDuration;
  /** Epoch milliseconds, for a lock opened for minutes. */
  until?: number;
  /** The page it was opened on, for a lock opened for this surface only. */
  page?: string;
  timer?: number;
}

/** Unlocked for now. Kept in memory only, so closing the app locks again. */
const unlocks = new Map<string, Unlock>();

let localizeFunc: LocalizeFunc | undefined;

/** Gives the lock surfaces the interface's wording. */
export const setLockLocalize = (localize: LocalizeFunc): void => {
  localizeFunc = localize;
};

export const getLockLocalize = (): LocalizeFunc | undefined => localizeFunc;

const listeners = new Set<() => void>();

/** Calls back when something is unlocked, locked again or expires. */
export const subscribeUnlocks = (callback: () => void): (() => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const changed = (): void => {
  applyElementLocks();
  listeners.forEach((callback) => callback());
};

/** Whether a lock is open right now. Expired and moved-away openings are dropped. */
export const isUnlocked = (key: string, now = Date.now()): boolean => {
  const unlock = unlocks.get(key);
  if (!unlock) {
    return false;
  }
  if (
    (unlock.until !== undefined && unlock.until <= now) ||
    (unlock.page !== undefined && unlock.page !== window.location.pathname)
  ) {
    window.clearTimeout(unlock.timer);
    unlocks.delete(key);
    return false;
  }
  return true;
};

/** Opens a lock for the length of time its owner chose. */
export const grantUnlock = (key: string, duration: LockDuration): void => {
  const previous = unlocks.get(key);
  window.clearTimeout(previous?.timer);
  const unlock: Unlock = { duration };
  if (duration.kind === "minutes") {
    unlock.until = Date.now() + duration.minutes * 60000;
    unlock.timer = window.setTimeout(
      () => {
        unlocks.delete(key);
        changed();
      },
      Math.min(duration.minutes * 60000, 2 ** 31 - 1)
    );
  } else if (duration.kind === "surface") {
    unlock.page = window.location.pathname;
  }
  unlocks.set(key, unlock);
  changed();
};

/** Locks again a lock that was opened for a while. */
export const lockAgain = (key: string): void => {
  const unlock = unlocks.get(key);
  window.clearTimeout(unlock?.timer);
  unlocks.delete(key);
  changed();
};

/** Locks every lock that was opened. */
export const lockEverythingAgain = (): void => {
  unlocks.forEach((unlock) => window.clearTimeout(unlock.timer));
  unlocks.clear();
  changed();
};

const release = (element: HTMLElement): void => {
  const before = locked.get(element);
  locked.delete(element);
  if (!before) {
    return;
  }
  element.removeAttribute(MARK);
  element.removeAttribute(KEY_ATTRIBUTE);
  if (before.ariaDisabled === null) {
    element.removeAttribute("aria-disabled");
  } else {
    element.setAttribute("aria-disabled", before.ariaDisabled);
  }
  element.style.outline = before.outline;
  element.style.outlineOffset = before.offset;
};

/** Applies the stored locks to the page as it is now. */
export const applyElementLocks = (): void => {
  const wanted = new Map<HTMLElement, string>();
  const store = readLocks();
  const page = window.location.pathname;
  lockedElementPaths(store, page).forEach((path) => {
    const key = elementLockKey(page, path);
    if (isUnlocked(key)) {
      return;
    }
    const element = resolveElementPath(path);
    if (element) {
      wanted.set(element, key);
    }
  });
  locked.forEach((_before, element) => {
    if (!wanted.has(element) || !element.isConnected) {
      release(element);
    }
  });
  wanted.forEach((key, element) => {
    if (!locked.has(element)) {
      locked.set(element, {
        outline: element.style.outline,
        offset: element.style.outlineOffset,
        ariaDisabled: element.getAttribute("aria-disabled"),
      });
      element.setAttribute(MARK, "");
      element.setAttribute("aria-disabled", "true");
      element.style.outline = "2px dashed var(--primary-color)";
      element.style.outlineOffset = "2px";
    }
    element.setAttribute(KEY_ATTRIBUTE, key);
  });
  if (locked.size) {
    guard(true);
  } else {
    guard(false);
  }
};

/** Whether an element, or something it is inside, is locked. */
export const isElementLocked = (element: Element): boolean =>
  !!element.closest(`[${MARK}]`);

/** How many elements are locked on the page that is open and still there. */
export const lockedElementCount = (): number => locked.size;

/** The key of the lock on an element that is locked, when it is. */
export const lockKeyOf = (element: Element): string | undefined =>
  element.closest(`[${KEY_ATTRIBUTE}]`)?.getAttribute(KEY_ATTRIBUTE) ??
  undefined;

/**
 * Everything that can run a protected action, refused before it arrives.
 * Pressing, touching or keyboard activation also opens the prompt.
 */
const REFUSED = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "touchstart",
  "touchend",
  "keyup",
  "keypress",
  "input",
  "beforeinput",
  "change",
  "submit",
  "dragstart",
  "drop",
  "paste",
  "cut",
  "dblclick",
  "wheel",
] as const;

const PASS_KEYS = new Set([
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "Escape",
  "ContextMenu",
]);

const lockedInPath = (event: Event): HTMLElement | undefined =>
  event
    .composedPath()
    .find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute(MARK)
    );

const refuse = (event: Event): void => {
  event.preventDefault();
  event.stopImmediatePropagation();
};

const onRefused = (event: Event): void => {
  if (lockedInPath(event)) {
    refuse(event);
  }
};

const onClick = (event: Event): void => {
  const element = lockedInPath(event);
  if (!element) {
    return;
  }
  refuse(event);
  askToUnlock(element);
};

const onKeydown = (event: KeyboardEvent): void => {
  const element = lockedInPath(event);
  if (!element || PASS_KEYS.has(event.key)) {
    return;
  }
  // Shortcuts held with Ctrl or Alt are refused too, except the page's own
  // menu keys above.
  refuse(event);
  if (event.key === "Enter" || event.key === " ") {
    askToUnlock(element);
  }
};

let guarding = false;

const guard = (on: boolean): void => {
  if (on === guarding) {
    return;
  }
  guarding = on;
  const method = on ? "addEventListener" : "removeEventListener";
  REFUSED.forEach((name) => window[method](name, onRefused, true));
  window[method]("click", onClick, true);
  window[method]("keydown", onKeydown as EventListener, true);
};

/** Opens the unlock prompt of a locked element, beside the element. */
export const askToUnlock = (element: HTMLElement): void => {
  const key = lockKeyOf(element);
  if (!key || !isLocked(readLocks(), key)) {
    return;
  }
  void import("../../components/locks/ha-lock-prompt").then((module) =>
    module.openLockPrompt(key, element)
  );
};
