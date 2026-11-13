/**
 * Where a step goes when it is added from the gap between two drawn rows, and
 * which key adds which kind of step.
 *
 * A list does not always draw every row: the rows of a folded trigger group
 * are not drawn, and fast mode draws a long list one chunk at a time. The
 * gap between two drawn rows therefore has to be turned back into an index of
 * the whole list before a step is inserted.
 */

import { triggerGroupOf } from "./trigger-groups";

export type AddStepKind = "trigger" | "condition" | "action";

/**
 * True when a gap is drawn after the drawn row at this position. The last
 * drawn row has no gap after it: the Add button sits there.
 */
export const hasGapAfter = (
  drawnPosition: number,
  drawnCount: number
): boolean => drawnPosition >= 0 && drawnPosition < drawnCount - 1;

/**
 * The index of the whole list a step added in the gap after a drawn row is
 * inserted at. `drawn` holds the real index of every drawn row in drawing
 * order. A folded group right after the row stays in front of the new step's
 * neighbour, so the new step never lands inside a folded group.
 */
export const gapInsertIndex = (
  drawn: readonly number[],
  drawnPosition: number
): number => {
  const real = drawn[drawnPosition];
  return real === undefined ? drawn.length : real + 1;
};

/** A copy of a list with a step inserted. The index is kept inside the list. */
export const insertAt = <T>(
  items: readonly T[],
  index: number,
  item: T
): T[] => {
  const at = Math.min(Math.max(Math.trunc(index), 0), items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
};

/** A copy of a list with several steps inserted, in order. */
export const insertManyAt = <T>(
  items: readonly T[],
  index: number,
  added: readonly T[]
): T[] => {
  const at = Math.min(Math.max(Math.trunc(index), 0), items.length);
  return [...items.slice(0, at), ...added, ...items.slice(at)];
};

/**
 * The trigger group a step inserted at this index joins: the group of both
 * neighbours when they share one, otherwise none. A step added between two
 * triggers of one group becomes part of that group; at the edge of a group, or
 * between two groups, it stays outside.
 */
export const groupAtGap = (
  triggers: readonly unknown[],
  index: number
): string | undefined => {
  if (index <= 0 || index >= triggers.length) {
    return undefined;
  }
  const before = triggerGroupOf(triggers[index - 1]);
  return before !== undefined && before === triggerGroupOf(triggers[index])
    ? before
    : undefined;
};

/**
 * The position among the drawn rows of the row that was inserted at a real
 * index, when it is drawn. The rows before it that are not drawn are skipped.
 */
export const drawnPositionOfInserted = (
  drawnBefore: readonly number[],
  index: number
): number => drawnBefore.filter((real) => real < index).length;

export interface AddKeyEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

const LETTERS: Record<string, AddStepKind> = {
  t: "trigger",
  c: "condition",
  a: "action",
};

const CODES: Record<string, AddStepKind> = {
  KeyT: "trigger",
  KeyC: "condition",
  KeyA: "action",
};

/**
 * Which kind of step a key press adds: T a trigger, C a condition, A an
 * action. Only a plain key counts, never with Ctrl, Alt, Meta or Shift, and
 * not while a key is held or an input method is composing. Keyboards without
 * these letters use the physical key.
 */
export const addKindForKey = (event: AddKeyEvent): AddStepKind | undefined => {
  if (
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing
  ) {
    return undefined;
  }
  const key = event.key ?? "";
  if (/^[a-z]$/i.test(key)) {
    return LETTERS[key.toLowerCase()];
  }
  return event.code ? CODES[event.code] : undefined;
};
