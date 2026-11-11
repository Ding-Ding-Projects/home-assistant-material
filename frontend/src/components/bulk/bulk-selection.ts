/**
 * The selection rules behind the bulk bar, kept free of any element so they
 * can be checked on their own.
 */

export type BulkPreviewKind = "change" | "same" | "skip";

export interface BulkPreviewItem {
  kind: BulkPreviewKind;
  /** One line that names what happens and to which items. */
  text: string;
}

export interface BulkAction {
  id: string;
  label: string;
  /** Icon path shown before the label. */
  path?: string;
  /** Destroys or removes something: needs a preview and a second click. */
  destructive?: boolean;
  /** Shows what will change and waits for a confirmation. */
  preview?: boolean;
  disabled?: boolean;
}

export interface BulkPreview {
  title: string;
  items: BulkPreviewItem[];
  /** How many items the action will really change; 0 disables confirming. */
  changeCount: number;
  confirmLabel: string;
  /** A line about what happens after, for example that Undo is possible. */
  note?: string;
}

/** Adds the id when it is not selected and removes it when it is. */
export const toggleSelected = (selected: string[], id: string): string[] =>
  selected.includes(id)
    ? selected.filter((item) => item !== id)
    : [...selected, id];

/**
 * Click with Shift held: selects every item between the one clicked last and
 * this one, in the order the list shows them. With no earlier click it
 * behaves like a plain click.
 */
export const selectRange = (
  orderedIds: string[],
  selected: string[],
  anchor: string | undefined,
  target: string
): string[] => {
  const from = anchor === undefined ? -1 : orderedIds.indexOf(anchor);
  const to = orderedIds.indexOf(target);
  if (from === -1 || to === -1) {
    return toggleSelected(selected, target);
  }
  const [start, end] = from < to ? [from, to] : [to, from];
  return [...new Set([...selected, ...orderedIds.slice(start, end + 1)])];
};

/** Everything that is not selected becomes selected, and the other way round. */
export const invertSelection = (
  allIds: string[],
  selected: string[]
): string[] => {
  const current = new Set(selected);
  return allIds.filter((id) => !current.has(id));
};

/** Keeps only the selected ids that still exist. */
export const pruneSelection = (
  selected: string[],
  existingIds: string[]
): string[] => {
  const existing = new Set(existingIds);
  return selected.filter((id) => existing.has(id));
};

/** How many items of each kind a preview holds. */
export const countPreview = (
  items: BulkPreviewItem[]
): Record<BulkPreviewKind, number> => {
  const counts: Record<BulkPreviewKind, number> = {
    change: 0,
    same: 0,
    skip: 0,
  };
  items.forEach((item) => {
    counts[item.kind] += 1;
  });
  return counts;
};

/**
 * What a click on the confirm button of a preview does. A destructive action
 * asks once more before it runs; any other runs at once. Nothing runs when
 * the preview changes nothing.
 */
export type BulkConfirmStep = "ask-again" | "run" | "blocked";

export const nextConfirmStep = (
  destructive: boolean,
  armed: boolean,
  changeCount: number
): BulkConfirmStep => {
  if (changeCount <= 0) {
    return "blocked";
  }
  return destructive && !armed ? "ask-again" : "run";
};
