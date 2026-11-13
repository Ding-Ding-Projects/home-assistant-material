/**
 * Maths for resizing a card on the sections grid by dragging or with the
 * keyboard. A card spans whole columns and whole rows, so every pointer
 * movement is snapped to the nearest column and row step.
 */

export interface GridResizeInput {
  /** Columns the card spans when the drag starts. */
  startColumns: number;
  /** Rows the card spans when the drag starts. */
  startRows: number;
  /** Horizontal pointer movement in pixels since the drag started. */
  dx: number;
  /** Vertical pointer movement in pixels since the drag started. */
  dy: number;
  /** Width of one column plus the gap, in pixels. */
  columnStep: number;
  /** Height of one row plus the gap, in pixels. */
  rowStep: number;
  /** Columns in the grid; a card cannot span more. */
  columnCount: number;
  minColumns?: number;
  maxColumns?: number;
  minRows?: number;
  maxRows?: number;
  /** True in a right-to-left layout, where dragging left makes the card wider. */
  rtl?: boolean;
}

export interface GridSize {
  columns: number;
  rows: number;
}

export const MAX_RESIZE_ROWS = 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The snapped size of a card for a pointer movement. */
export const snapGridResize = (input: GridResizeInput): GridSize => {
  const columnStep = input.columnStep > 0 ? input.columnStep : 1;
  const rowStep = input.rowStep > 0 ? input.rowStep : 1;
  const dx = input.rtl ? -input.dx : input.dx;
  const maxColumns = Math.max(
    1,
    Math.min(input.columnCount, input.maxColumns ?? input.columnCount)
  );
  const minColumns = Math.min(maxColumns, Math.max(1, input.minColumns ?? 1));
  const maxRows = Math.max(1, Math.min(MAX_RESIZE_ROWS, input.maxRows ?? 100));
  const minRows = Math.min(maxRows, Math.max(1, input.minRows ?? 1));
  return {
    columns: clamp(
      input.startColumns + Math.round(dx / columnStep),
      minColumns,
      maxColumns
    ),
    rows: clamp(
      input.startRows + Math.round(input.dy / rowStep),
      minRows,
      maxRows
    ),
  };
};

/**
 * The column and row change for an arrow key, or undefined for any other key.
 * Right and left change the width, down and up change the height; in a
 * right-to-left layout left and right swap.
 */
export const resizeKeyDelta = (
  key: string,
  rtl = false
): { columns: number; rows: number } | undefined => {
  switch (key) {
    case "ArrowRight":
      return { columns: rtl ? -1 : 1, rows: 0 };
    case "ArrowLeft":
      return { columns: rtl ? 1 : -1, rows: 0 };
    case "ArrowDown":
      return { columns: 0, rows: 1 };
    case "ArrowUp":
      return { columns: 0, rows: -1 };
    default:
      return undefined;
  }
};

/** The number of rows a rendered height covers, for a card whose rows are automatic. */
export const rowsFromHeight = (
  height: number,
  rowHeight: number,
  rowGap: number
): number =>
  Math.max(
    1,
    Math.min(
      MAX_RESIZE_ROWS,
      Math.round((height + rowGap) / (rowHeight + rowGap))
    )
  );
