import { createContext } from "@lit/context";

/**
 * Expandable detail rows for `ha-data-table`.
 *
 * Table rows have a fixed height, so a row cannot grow to show its details.
 * A page that sets `renderRowDetails` on the table gets a full-width detail
 * row rendered right under any row whose details are open. The rows stay in
 * the virtualizer's list, so variable heights and scrolling keep working the
 * same way they do for group header rows.
 */

/** An item in the table's list that holds the details of the row above it. */
export interface RowDetailsItem {
  detailsFor: string;
}

export const isRowDetailsItem = (item: unknown): item is RowDetailsItem =>
  !!item &&
  typeof item === "object" &&
  typeof (item as Partial<RowDetailsItem>).detailsFor === "string";

/**
 * The open rows after one row's details are opened or closed. Closed by
 * default; at most one open at a time unless `multiple` is set.
 */
export const toggleRowDetails = (
  open: readonly string[],
  rowId: string,
  multiple = false
): string[] => {
  if (open.includes(rowId)) {
    return open.filter((id) => id !== rowId);
  }
  return multiple ? [...open, rowId] : [rowId];
};

/**
 * The table's list with a detail item after every shown row whose details are
 * open. Rows hidden by a collapsed group or a search are not in the list, so
 * their details are not shown either. Returns the same list when nothing is
 * open, so memoized work further on is not repeated.
 */
export const withRowDetails = <T extends Record<string, unknown>>(
  items: readonly T[],
  open: readonly string[],
  idKey: string
): (T | RowDetailsItem)[] => {
  if (!open.length) {
    return items as T[];
  }
  const openSet = new Set(open);
  const result: (T | RowDetailsItem)[] = [];
  for (const item of items) {
    result.push(item);
    const id = item?.[idKey];
    if (
      id !== undefined &&
      id !== null &&
      !item.append &&
      !item.empty &&
      openSet.has(String(id))
    ) {
      result.push({ detailsFor: String(id) });
    }
  }
  return result;
};

/** The open rows that still exist, so a removed row does not stay open. */
export const pruneRowDetails = (
  open: readonly string[],
  existingIds: ReadonlySet<string>
): readonly string[] => {
  const kept = open.filter((id) => existingIds.has(id));
  return kept.length === open.length ? open : kept;
};

/**
 * What a table with detail rows offers the elements inside its rows: which
 * rows are open, and a way to open or close one.
 */
export interface RowDetailsControl {
  open: ReadonlySet<string>;
  toggle: (rowId: string) => void;
}

export const rowDetailsContext = createContext<RowDetailsControl | undefined>(
  "dataTableRowDetails"
);
