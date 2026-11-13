/**
 * Reads and sets the "continue on error" option on every action of a list at
 * once, nested actions included.
 *
 * Only script actions carry the option. The server schema adds it through the
 * shared base of every action type (events, services, delays, waits, variables,
 * stop, scenes, device actions, repeat, choose, if, parallel and sequence). A
 * condition used as a step does not accept it, so conditions are skipped, in
 * every spelling: the `condition` key, the shorthand `and`, `or` and `not`
 * forms, and a bare template string. Anything that is not a plain object is
 * left as it is.
 */

import { transferObjectDrafts } from "../../../../common/object-editor/object-model";

export type ContinueOnErrorState = "all" | "none" | "mixed";

const KEY = "continue_on_error";

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const CONDITION_SHORTHAND_KEYS = ["condition", "and", "or", "not"] as const;

/** True when the step is an action that can carry the option. */
export const canContinueOnError = (step: unknown): step is Rec =>
  isRec(step) && !CONDITION_SHORTHAND_KEYS.some((key) => key in step);

/** Applies the function to a value that is one action or a list of them. */
const mapList = (
  value: unknown,
  fn: (item: unknown) => unknown
): { value: unknown; changed: boolean } => {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const out = fn(item);
      if (out !== item) {
        changed = true;
      }
      return out;
    });
    return { value: changed ? next : value, changed };
  }
  if (isRec(value)) {
    const out = fn(value);
    return { value: out, changed: out !== value };
  }
  return { value, changed: false };
};

/** Applies the function to each key of the step that holds nested actions. */
const mapNested = (step: Rec, fn: (item: unknown) => unknown): Rec => {
  let next: Rec | undefined;
  const set = (key: string, value: unknown) => {
    next ??= { ...step };
    next[key] = value;
  };
  const visit = (key: string, source: Rec = step) => {
    if (!(key in source)) {
      return undefined;
    }
    return mapList(source[key], fn);
  };

  for (const key of ["then", "else", "default", "sequence", "parallel"]) {
    const result = visit(key);
    if (result?.changed) {
      set(key, result.value);
    }
  }

  // choose: a list of options (or one option), each with its own sequence.
  if ("choose" in step) {
    const choose = mapList(step.choose, (option) => {
      if (!isRec(option) || !("sequence" in option)) {
        return option;
      }
      const result = mapList(option.sequence, fn);
      return result.changed ? { ...option, sequence: result.value } : option;
    });
    if (choose.changed) {
      set("choose", choose.value);
    }
  }

  // repeat: one object with the sequence inside.
  if (isRec(step.repeat) && "sequence" in step.repeat) {
    const result = mapList(step.repeat.sequence, fn);
    if (result.changed) {
      set("repeat", { ...step.repeat, sequence: result.value });
    }
  }

  return next ?? step;
};

const nestedActions = (step: Rec): unknown[] => {
  const out: unknown[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      out.push(...value);
    } else if (value !== undefined && value !== null) {
      out.push(value);
    }
  };
  push(step.then);
  push(step.else);
  push(step.default);
  push(step.sequence);
  push(step.parallel);
  if (step.choose !== undefined && step.choose !== null) {
    const options = Array.isArray(step.choose) ? step.choose : [step.choose];
    for (const option of options) {
      if (isRec(option)) {
        push(option.sequence);
      }
    }
  }
  if (isRec(step.repeat)) {
    push(step.repeat.sequence);
  }
  return out;
};

const collect = (value: unknown, flags: boolean[]): void => {
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    if (!isRec(item)) {
      continue;
    }
    if (canContinueOnError(item)) {
      flags.push(item[KEY] === true);
    }
    // A condition step has no nested actions.
    if (canContinueOnError(item)) {
      collect(nestedActions(item), flags);
    }
  }
};

/**
 * Whether every eligible action, nested ones included, continues on error
 * (`all`), none does (`none`), or it is a mix (`mixed`). A list with no
 * eligible action reads `none`.
 */
export const continueOnErrorState = (
  actions: unknown
): ContinueOnErrorState => {
  const flags: boolean[] = [];
  collect(actions, flags);
  if (flags.length === 0 || flags.every((flag) => !flag)) {
    return "none";
  }
  return flags.every((flag) => flag) ? "all" : "mixed";
};

/** How many actions, nested ones included, can carry the option. */
export const countContinueOnErrorActions = (actions: unknown): number => {
  const flags: boolean[] = [];
  collect(actions, flags);
  return flags.length;
};

const applyToStep =
  (on: boolean) =>
  (item: unknown): unknown => {
    if (!canContinueOnError(item)) {
      return item;
    }
    const withNested = mapNested(item, applyToStep(on));
    let result = withNested;
    if (on && withNested[KEY] !== true) {
      result = { ...withNested, [KEY]: true };
    } else if (!on && KEY in withNested) {
      const { [KEY]: _removed, ...rest } = withNested;
      result = rest;
    }
    if (result !== item) transferObjectDrafts(item, result);
    return result;
  };

/**
 * Returns a new list with the option set to true on every eligible action
 * (`on`) or removed from it (`!on`), nested actions included. The given list
 * is never changed.
 */
export const setContinueOnErrorAll = <T>(actions: T, on: boolean): T => {
  const result = mapList(actions, applyToStep(on));
  return result.value as T;
};

/** New actions inherit the all-actions setting. Explicit per-step edits can still turn it off. */
export const inheritContinueOnError = <T>(previous: unknown, next: T): T =>
  continueOnErrorState(previous) === "all" &&
  countContinueOnErrorActions(next) > countContinueOnErrorActions(previous)
    ? setContinueOnErrorAll(next, true)
    : next;
