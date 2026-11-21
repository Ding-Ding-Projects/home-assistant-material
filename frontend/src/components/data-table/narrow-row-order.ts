import type {
  DataTableColumnContainer,
  DataTableColumnData,
} from "./ha-data-table";

/** A column of a row as it is drawn, and whether it was moved after the name. */
export type NarrowRowEntry = [
  key: string,
  column: DataTableColumnData,
  movedAfterName: boolean,
];

/**
 * The order in which a row's cells are drawn. On a phone in selection mode
 * the checkbox takes room at the start of the row, so the columns marked
 * `narrowSelectAfterName` that stand before the name move to just after it.
 * They are then placed like the row controls: at the end of the first line
 * when there is room, otherwise on a line of their own under the name, and
 * the name keeps the first line beside the checkbox. Nothing is left out.
 */
export const narrowRowEntries = (
  columns: DataTableColumnContainer,
  narrowSelecting: boolean
): NarrowRowEntry[] => {
  const entries = Object.entries(columns);
  const mainIndex = entries.findIndex(([, column]) => column.main);
  if (!narrowSelecting || mainIndex === -1) {
    return entries.map(([key, column]) => [key, column, false]);
  }
  const moved: NarrowRowEntry[] = [];
  const before: NarrowRowEntry[] = [];
  entries.slice(0, mainIndex).forEach(([key, column]) => {
    if (column.narrowSelectAfterName) {
      moved.push([key, column, true]);
    } else {
      before.push([key, column, false]);
    }
  });
  return [
    ...before,
    [entries[mainIndex][0], entries[mainIndex][1], false],
    ...moved,
    ...entries
      .slice(mainIndex + 1)
      .map(([key, column]): NarrowRowEntry => [key, column, false]),
  ];
};
