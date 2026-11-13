import {
  actionKind,
  asList,
  childLists,
  configParts,
  isRec,
} from "./step-model";

/** Steps in a configuration from which fast mode switches on by default. */
export const FAST_MODE_DEFAULT_THRESHOLD = 200;

/** Fewest nested steps a branch must hold to be shown with a step count. */
export const BRANCH_FOLD_MIN = 12;

/** How many rows of a long top level list are drawn before the next chunk. */
export const ROOT_CHUNK = 40;

/**
 * How many rows a config holds in a list, counting every row of every nested
 * list. A branch condition counts as a row too, as the editor draws it.
 */
export const countRows = (items: unknown): number => {
  let total = 0;
  for (const raw of asList(items)) {
    total += 1;
    if (!isRec(raw)) {
      continue;
    }
    for (const list of childLists(raw, actionKind(raw))) {
      total += asList(list.conditions).length + countRows(list.items);
    }
  }
  return total;
};

/** Steps nested inside one step (not counting the step itself). */
export const countNestedRows = (raw: unknown): number =>
  isRec(raw) ? countRows([raw]) - 1 : 0;

/** True when a step holds enough nested rows to be shown with a count. */
export const isBigBranch = (raw: unknown, min = BRANCH_FOLD_MIN): boolean =>
  countNestedRows(raw) >= min;

export interface FoldedBranch {
  /** The path of the step, as in a stored trace. */
  path: string;
  steps: number;
}

export interface FastPlan {
  /** Every row the configuration holds. */
  total: number;
  /** Rows the editor draws today: all of them, folded or not. */
  drawnToday: number;
  /** Rows fast mode draws: the first chunk of the top level, branches closed. */
  drawnFast: number;
  /** Branches folded by default, with their step counts. */
  folded: FoldedBranch[];
}

export interface FastPlanOptions {
  chunk?: number;
  foldMin?: number;
  /** Paths of branches the person opened; their children are drawn too. */
  open?: readonly string[];
}

/**
 * Works out how many rows the editor would draw for a configuration with and
 * without fast mode. Today a closed branch still builds its inner rows and
 * only hides them. Fast mode builds the rows of a branch once it is opened,
 * and draws a long top level list one chunk at a time.
 */
export const planFastRender = (
  config: unknown,
  options: FastPlanOptions = {}
): FastPlan => {
  const chunk = Math.max(1, options.chunk ?? ROOT_CHUNK);
  const foldMin = options.foldMin ?? BRANCH_FOLD_MIN;
  const open = new Set(options.open ?? []);
  const { triggers, conditions, actions } = configParts(config);
  const total = triggers.length + countRows(conditions) + countRows(actions);

  const folded: FoldedBranch[] = [];
  let drawnFast = triggers.length + Math.min(conditions.length, chunk);

  const walk = (items: unknown[], prefix: string, limit: number) => {
    items.slice(0, limit).forEach((raw, index) => {
      drawnFast += 1;
      if (!isRec(raw)) {
        return;
      }
      const path = `${prefix}/${index}`;
      const lists = childLists(raw, actionKind(raw));
      if (!lists.length) {
        return;
      }
      const nested = countNestedRows(raw);
      if (nested >= foldMin) {
        folded.push({ path, steps: nested });
      }
      if (!open.has(path)) {
        return;
      }
      for (const list of lists) {
        drawnFast += asList(list.conditions).length;
        walk(list.items, `${path}/${list.key}`, Number.POSITIVE_INFINITY);
      }
    });
  };
  walk(actions, "action", chunk);

  return { total, drawnToday: total, drawnFast, folded };
};

/** True when fast mode is on for a configuration of this size. */
export const isFastModeActive = (
  totalRows: number,
  enabled: boolean,
  threshold: number
): boolean => enabled && totalRows >= Math.max(1, threshold);

/** How many rows of a list to draw: all of them unless fast mode limits it. */
export const visibleRowCount = (
  length: number,
  fast: boolean,
  limit: number
): number => (fast ? Math.min(length, Math.max(limit, 0)) : length);

/** The next limit after the person reaches the end of what is drawn. */
export const nextRowLimit = (
  limit: number,
  length: number,
  chunk = ROOT_CHUNK
): number => Math.min(length, limit + chunk);

/** Limit a list needs so that a given index is drawn. */
export const limitToShow = (
  limit: number,
  index: number,
  chunk = ROOT_CHUNK
): number => (index < limit ? limit : Math.ceil((index + 1) / chunk) * chunk);
