import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "./ha-data-table";

/** Most rows read and most values offered. */
const MAX_ROWS = 300;
const MAX_VALUES = 500;

/**
 * Values from a table's searchable columns, offered to the pattern workbench
 * as test text so a pattern can be tried against what the table really holds.
 */
export const tablePatternSamples = (
  data: DataTableRowData[] | undefined,
  columns: DataTableColumnContainer | undefined
): string[] => {
  if (!data?.length || !columns) {
    return [];
  }
  const keys = Object.entries(columns)
    .filter(([, column]) => column.filterable)
    .map(([key, column]) => ({
      key: column.valueColumn || key,
      filterKey: column.filterKey,
    }));
  const values = new Set<string>();
  for (const row of data.slice(0, MAX_ROWS)) {
    for (const { key, filterKey } of keys) {
      let value = row[key];
      if (filterKey && value && typeof value === "object") {
        value = value[filterKey];
      }
      if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        if (text) {
          values.add(text);
        }
      }
      if (values.size >= MAX_VALUES) {
        return [...values];
      }
    }
  }
  return [...values];
};
