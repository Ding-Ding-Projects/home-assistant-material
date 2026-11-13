/**
 * Trigger groups: named folders of triggers in the editor.
 *
 * The stored list stays flat. A trigger belongs to a group when it carries the
 * frontend-only key `editor_group` (the server accepts and drops it, as it
 * does for `note`). A group is a run of neighbouring triggers with the same
 * name, so the order of the list is never changed by showing groups.
 */

export const TRIGGER_GROUP_KEY = "editor_group";

export const GROUP_NAME_MAX = 60;

type Item = Record<string, unknown>;

/** Trims, removes control characters and limits the length of a group name. */
export const cleanGroupName = (name: unknown): string | undefined => {
  if (typeof name !== "string") {
    return undefined;
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, GROUP_NAME_MAX) : undefined;
};

export const triggerGroupOf = (trigger: unknown): string | undefined =>
  trigger && typeof trigger === "object"
    ? cleanGroupName((trigger as Item)[TRIGGER_GROUP_KEY])
    : undefined;

export interface GroupSegment {
  /** The group name, or undefined for triggers that are in no group. */
  name?: string;
  /** Index of the first trigger. */
  start: number;
  /** Index after the last trigger. */
  end: number;
}

/** Splits the trigger list into runs of the same group (or no group). */
export const groupSegments = (triggers: readonly unknown[]): GroupSegment[] => {
  const segments: GroupSegment[] = [];
  triggers.forEach((trigger, index) => {
    const name = triggerGroupOf(trigger);
    const last = segments[segments.length - 1];
    if (last && last.name === name) {
      last.end = index + 1;
    } else {
      segments.push({ name, start: index, end: index + 1 });
    }
  });
  return segments;
};

/** True when at least one trigger is in a group. */
export const hasGroups = (triggers: readonly unknown[]): boolean =>
  triggers.some((trigger) => triggerGroupOf(trigger) !== undefined);

const withGroup = <T>(trigger: T, name: string | undefined): T => {
  if (!trigger || typeof trigger !== "object") {
    return trigger;
  }
  const copy = { ...(trigger as Item) };
  if (name === undefined) {
    delete copy[TRIGGER_GROUP_KEY];
  } else {
    copy[TRIGGER_GROUP_KEY] = name;
  }
  return copy as T;
};

/**
 * Puts the selected triggers into one group. They become neighbours, placed
 * where the first selected trigger was; every other trigger keeps its place.
 */
export const groupSelected = <T>(
  triggers: readonly T[],
  selected: readonly number[],
  name: string
): T[] => {
  const clean = cleanGroupName(name);
  const chosen = [
    ...new Set(selected.filter((i) => i >= 0 && i < triggers.length)),
  ].sort((a, b) => a - b);
  if (!clean || !chosen.length) {
    return [...triggers];
  }
  const picked = new Set(chosen);
  const moved = chosen.map((i) => withGroup(triggers[i], clean));
  const result: T[] = [];
  triggers.forEach((trigger, index) => {
    if (index === chosen[0]) {
      result.push(...moved);
    }
    if (!picked.has(index)) {
      result.push(trigger);
    }
  });
  return result;
};

/** Renames the group of one segment, or removes it when the name is empty. */
export const setSegmentGroup = <T>(
  triggers: readonly T[],
  segment: Pick<GroupSegment, "start" | "end">,
  name: string | undefined
): T[] => {
  const clean = cleanGroupName(name);
  return triggers.map((trigger, index) =>
    index >= segment.start && index < segment.end
      ? withGroup(trigger, clean)
      : trigger
  );
};

/** A name for a new group that no existing group uses. */
export const suggestGroupName = (
  triggers: readonly unknown[],
  base: string
): string => {
  const used = new Set(
    triggers.map(triggerGroupOf).filter((n): n is string => !!n)
  );
  if (!used.has(base)) {
    return base;
  }
  let n = 2;
  while (used.has(`${base} ${n}`)) {
    n++;
  }
  return `${base} ${n}`;
};

/**
 * The real index of every trigger that is drawn, in drawing order. Triggers of
 * a folded group are not drawn. The sortable list counts only drawn rows, so
 * its indexes are turned back into real ones with this list.
 */
export const drawnIndexes = (
  triggers: readonly unknown[],
  folded: ReadonlySet<string>
): number[] => {
  const out: number[] = [];
  triggers.forEach((trigger, index) => {
    const name = triggerGroupOf(trigger);
    if (!name || !folded.has(name)) {
      out.push(index);
    }
  });
  return out;
};

/** Turns an index among drawn rows into an index of the whole list. */
export const realIndex = (
  drawn: readonly number[],
  index: number,
  length: number
): number => (index < drawn.length ? drawn[Math.max(index, 0)] : length);
