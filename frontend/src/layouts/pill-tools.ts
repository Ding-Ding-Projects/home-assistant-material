/**
 * Which tools a list page puts in its floating pill and which wait in the
 * pill's "More tools" menu. It keeps every tool the old toolbar row offered,
 * at the same number of presses or fewer:
 *
 * - Wide window: search, filters, select, group, sort, columns and export are
 *   each one press. When the window is too narrow for all of them (`compact`),
 *   group, sort, columns and export move into More, as the old row did.
 * - Phone: filters stay one press; select, sort, group, columns and export are
 *   in More, as they were. Search stays in the top bar.
 * - A list with no rows at all, and nothing searched or filtered, has nothing
 *   to sort, group, arrange or export, so those are left out, as before.
 */

export type PillToolId =
  | "search"
  | "filter"
  | "select"
  | "group"
  | "sort"
  | "columns"
  | "export"
  | "more";

export type MoreToolId = "select" | "sort" | "group" | "columns" | "export";

export interface PillToolInput {
  narrow: boolean;
  /** The wide pill does not fit and folds its table tools into More. */
  compact: boolean;
  /** The top bar offers a search for this page. */
  searchable: boolean;
  hasFilters: boolean;
  selectable: boolean;
  alwaysShowCheckboxes: boolean;
  /** The selection is shown, so entering selection mode is not offered. */
  selecting: boolean;
  sortable: boolean;
  groupable: boolean;
  /** No rows at all, and nothing searched or filtered. */
  noData: boolean;
}

export interface PillToolModel {
  /** The pill's own items, in order. */
  pill: PillToolId[];
  /** The entries of the More tools menu, in order. Empty: no More item. */
  more: MoreToolId[];
}

export const pillTools = (input: PillToolInput): PillToolModel => {
  const pill: PillToolId[] = [];
  const more: MoreToolId[] = [];
  if (!input.narrow && input.searchable) {
    pill.push("search");
  }
  if (input.hasFilters) {
    pill.push("filter");
  }
  const canSelect = input.selectable && !input.selecting;
  if (!input.narrow && canSelect && !input.alwaysShowCheckboxes) {
    pill.push("select");
  }
  if (input.narrow && canSelect && !input.noData) {
    more.push("select");
  }
  if (!input.noData) {
    const tableTools: MoreToolId[] = [];
    if (input.narrow || input.compact) {
      if (input.sortable) {
        tableTools.push("sort");
      }
      if (input.groupable) {
        tableTools.push("group");
      }
      tableTools.push("columns", "export");
      more.push(...tableTools);
    } else {
      if (input.groupable) {
        pill.push("group");
      }
      if (input.sortable) {
        pill.push("sort");
      }
      pill.push("columns", "export");
    }
  }
  if (more.length) {
    pill.push("more");
  }
  return { pill, more };
};

/** How long a menu opened by hovering waits before it closes, in ms. */
export const HOVER_CLOSE_DELAY_MS = 250;

type Schedule = (callback: () => void, delay: number) => unknown;
type Cancel = (handle: unknown) => void;

/**
 * Opens a menu while a mouse rests on its pill item and closes it a moment
 * after the mouse leaves both the item and the menu. The delay is the bridge
 * across the gap between them, so the menu never flickers. Touch and pen
 * never open on hover: a tap opens the menu as before. A click while the menu
 * is open from hovering keeps it open (pinned) instead of closing it, and a
 * pinned menu stays until it is closed by a choice, Escape or a click away.
 */
export class HoverMenuIntent {
  private _hoverOpen = false;

  private _pinned = false;

  private _timer?: unknown;

  constructor(
    private readonly _open: () => void,
    private readonly _close: () => void,
    private readonly _delay: number = HOVER_CLOSE_DELAY_MS,
    private readonly _schedule: Schedule = (callback, delay) =>
      setTimeout(callback, delay),
    private readonly _cancel: Cancel = (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>)
  ) {}

  /** The pointer entered the item or its menu. */
  public enter(pointerType: string, isOpen: boolean): void {
    if (pointerType !== "mouse") {
      return;
    }
    this._clearTimer();
    if (!isOpen) {
      this._hoverOpen = true;
      this._pinned = false;
      this._open();
    }
  }

  /** The pointer left the item and its menu. */
  public leave(pointerType: string): void {
    if (pointerType !== "mouse" || !this._hoverOpen || this._pinned) {
      return;
    }
    this._clearTimer();
    this._timer = this._schedule(() => {
      this._timer = undefined;
      this._hoverOpen = false;
      this._close();
    }, this._delay);
  }

  /**
   * A click on the item. Returns true when the click should not reach the
   * menu's own toggle, because the menu is already open from hovering and the
   * click pins it open instead.
   */
  public click(isOpen: boolean): boolean {
    if (isOpen && this._hoverOpen && !this._pinned) {
      this._clearTimer();
      this._pinned = true;
      return true;
    }
    return false;
  }

  /** The menu closed by any route. */
  public closed(): void {
    this._clearTimer();
    this._hoverOpen = false;
    this._pinned = false;
  }

  public get pinned(): boolean {
    return this._pinned;
  }

  private _clearTimer(): void {
    if (this._timer !== undefined) {
      this._cancel(this._timer);
      this._timer = undefined;
    }
  }
}
