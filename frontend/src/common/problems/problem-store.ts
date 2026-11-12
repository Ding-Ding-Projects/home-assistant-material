/**
 * The problem detector's store.
 *
 * Any part of the interface that notices something wrong with the thing it
 * shows (a card naming an entity that no longer exists, an automation step
 * aimed at a missing device) reports it here with a stable id, and binds the
 * element that shows it. The overlay outlines bound elements and shows a
 * badge with the details; the Repairs page lists every problem and can
 * teleport to the element.
 *
 * Problems live for this session in this browser. Ignored ids are kept
 * locally so an ignored problem stays quiet after a reload.
 */

export type ProblemSeverity = "error" | "warning";

export interface Problem {
  /** Stable id: the same problem on the same element always gets the same id. */
  id: string;
  /** Which detector reported it, such as "dashboard-card". */
  source: string;
  severity: ProblemSeverity;
  /** One line naming what is wrong. Already localized. */
  title: string;
  /** Where it is, such as "Home › Kitchen card". Already localized. */
  location: string;
  /** Why it matters. Already localized. */
  why?: string;
  /** The page path that shows the element, used by Teleport. */
  path: string;
  /** Steps to fix it by hand when Fix cannot. Already localized. */
  manualSteps?: string[];
  /** Fixes the problem when it can be fixed automatically. */
  fix?: () => Promise<void> | void;
  /** What Fix does, when "Fix" alone would not say. Already localized. */
  fixLabel?: string;
}

export const PROBLEMS_CHANGED_EVENT = "ha-problems-changed";

const IGNORED_KEY = "problemDetectorIgnored";

/** Problems found on other pages are kept so Repairs can list them after a reload. */
const SAVED_KEY = "problemDetectorFound";
const SAVED_LIMIT = 200;

type Listener = () => void;

const problems = new Map<string, Problem>();
const targets = new Map<string, Set<Element>>();
const listeners = new Set<Listener>();
const waiters = new Map<string, Set<(el: Element) => void>>();

const readIgnored = (): Set<string> => {
  try {
    const raw = window.localStorage.getItem(IGNORED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list) ? list.filter((x) => typeof x === "string") : []
    );
  } catch (_err) {
    return new Set();
  }
};

let ignored = readIgnored();

const writeIgnored = () => {
  try {
    window.localStorage.setItem(IGNORED_KEY, JSON.stringify([...ignored]));
  } catch (_err) {
    // Storage can be full or blocked; ignoring then only lasts this session.
  }
};

type SavedProblem = Omit<Problem, "fix">;

const readSaved = (): void => {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) {
      return;
    }
    for (const item of list as SavedProblem[]) {
      if (
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.location === "string" &&
        typeof item.path === "string" &&
        (item.severity === "error" || item.severity === "warning")
      ) {
        // A saved problem has no Fix until the page that found it runs again.
        problems.set(item.id, { ...item, fixLabel: undefined });
      }
    }
  } catch (_err) {
    // A damaged list is dropped; pages report their problems again.
  }
};

readSaved();

const writeSaved = () => {
  try {
    const list: SavedProblem[] = [...problems.values()]
      .slice(-SAVED_LIMIT)
      .map(({ fix: _fix, ...rest }) => rest);
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch (_err) {
    // Storage full or blocked: the list only lasts this session.
  }
};

let scheduled = false;
const notify = () => {
  if (scheduled) {
    return;
  }
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    writeSaved();
    listeners.forEach((listener) => listener());
    window.dispatchEvent(new CustomEvent(PROBLEMS_CHANGED_EVENT));
  });
};

const sameProblem = (a: Problem, b: Problem) =>
  a.title === b.title &&
  a.location === b.location &&
  a.why === b.why &&
  a.path === b.path &&
  a.severity === b.severity &&
  a.fix === b.fix &&
  a.fixLabel === b.fixLabel &&
  (a.manualSteps || []).join("\n") === (b.manualSteps || []).join("\n");

/** Reports or updates a problem. */
export const setProblem = (problem: Problem): void => {
  const old = problems.get(problem.id);
  if (old && sameProblem(old, problem)) {
    return;
  }
  problems.set(problem.id, problem);
  notify();
};

/** Clears a problem once it is gone. */
export const clearProblem = (id: string): void => {
  if (problems.delete(id)) {
    notify();
  }
};

/** Every problem that is not ignored, errors first. */
export const activeProblems = (): Problem[] =>
  [...problems.values()]
    .filter((problem) => !ignored.has(problem.id))
    .sort((a, b) =>
      a.severity === b.severity
        ? a.location.localeCompare(b.location)
        : a.severity === "error"
          ? -1
          : 1
    );

export const getProblem = (id: string): Problem | undefined => problems.get(id);

export const isIgnored = (id: string): boolean => ignored.has(id);

export const ignoreProblem = (id: string): void => {
  ignored.add(id);
  writeIgnored();
  notify();
};

export const unignoreAll = (): void => {
  ignored = new Set();
  writeIgnored();
  notify();
};

/** Ties an element on screen to a problem id, so it can be outlined. */
export const bindTarget = (id: string, element: Element): void => {
  let set = targets.get(id);
  if (!set) {
    set = new Set();
    targets.set(id, set);
  }
  if (set.has(element)) {
    return;
  }
  set.add(element);
  waiters.get(id)?.forEach((resolve) => resolve(element));
  waiters.delete(id);
  notify();
};

export const unbindTarget = (id: string, element: Element): void => {
  const set = targets.get(id);
  if (set?.delete(element)) {
    if (!set.size) {
      targets.delete(id);
    }
    notify();
  }
};

/** The connected elements that show a problem right now. */
export const targetsFor = (id: string): Element[] =>
  [...(targets.get(id) || [])].filter((element) => element.isConnected);

/**
 * Resolves with the first connected element bound to the id, waiting for one
 * to appear (after a navigation, say). Resolves undefined after the timeout.
 */
export const whenTarget = (
  id: string,
  timeout = 8000
): Promise<Element | undefined> => {
  const now = targetsFor(id)[0];
  if (now) {
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    let set = waiters.get(id);
    if (!set) {
      set = new Set();
      waiters.set(id, set);
    }
    const done = (element?: Element) => {
      clearTimeout(timer);
      waiters.get(id)?.delete(done);
      resolve(element);
    };
    const timer = window.setTimeout(() => done(undefined), timeout);
    set.add(done);
  });
};

export const subscribeProblems = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** For tests: forget everything. */
export const resetProblemStore = (): void => {
  problems.clear();
  window.localStorage.removeItem(SAVED_KEY);
  targets.clear();
  waiters.clear();
  ignored = new Set();
};
