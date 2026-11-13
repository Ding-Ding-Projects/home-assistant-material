import { mdiClose, mdiMagnify, mdiPlus } from "@mdi/js";
import deepClone from "deep-clone-simple";
import type { LitElement, PropertyValues, TemplateResult } from "lit";
import { html, nothing } from "lit";
import { property, state } from "lit/decorators";
import { ensureArray } from "../../../common/array/ensure-array";
import { consume } from "../../../common/decorators/consume";
import { storage } from "../../../common/decorators/storage";
import { fireEvent } from "../../../common/dom/fire_event";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import { regexQuery } from "../../../common/regex/filter";
import { nextRender } from "../../../common/util/render-status";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { AutomationClipboard } from "../../../data/automation";
import type { Constructor, HomeAssistant } from "../../../types";
import {
  animateRowMoves,
  markEnteringRows,
  measureRows,
} from "./motion-helpers";
import { scrollRowIntoView } from "./scroll-row-into-view";
import type { AutomationSearchSnapshot } from "./search/automation-search-context";
import {
  automationSearchContext,
  isRevealRow,
  LIST_SEARCH_THRESHOLD,
} from "./search/automation-search-context";

const SEARCH_KEY = "ui.panel.config.automation.editor.search.";

const rowKeys = new WeakMap<object, string>();

const getAutomationRowKey = (item: object): string => {
  if (!rowKeys.has(item)) {
    rowKeys.set(item, Math.random().toString());
  }
  return rowKeys.get(item)!;
};

// Keep the selected row and its sidebar callbacks alive across immutable edits.
// Keys stay out of the automation YAML and the objects stored for undo.
export const preserveAutomationRowKey = <T>(original: T, updated: T): T => {
  if (
    original &&
    updated &&
    typeof original === "object" &&
    typeof updated === "object"
  ) {
    const key = rowKeys.get(original);
    if (key !== undefined) {
      rowKeys.set(updated, key);
    }
  }
  return updated;
};

/**
 * Reconcile rows after a transformation that keeps their paths and list order.
 * Matching object keys and array indices represent the same logical row, so Lit's
 * repeat directive can reuse its element, selection state, and sidebar callbacks.
 * Do not use this to reconcile insertions, removals, or reordering between the two
 * inputs: matching indices would then associate keys with different rows.
 */
export const preserveAutomationRowKeys = (
  original: unknown,
  updated: unknown
): void => {
  if (
    original === updated ||
    !original ||
    !updated ||
    typeof original !== "object" ||
    typeof updated !== "object"
  ) {
    return;
  }
  preserveAutomationRowKey(original, updated);
  const before = original as Record<string, unknown>;
  const after = updated as Record<string, unknown>;
  for (const key of Object.keys(before)) {
    preserveAutomationRowKeys(before[key], after[key]);
  }
};

export const AutomationSortableListMixin = <T extends object>(
  superClass: Constructor<LitElement>
) => {
  class AutomationSortableListClass extends superClass {
    @property({ attribute: false }) public hass!: HomeAssistant;

    @property({ type: Boolean }) public disabled = false;

    @property({ type: Boolean }) public narrow = false;

    @property({ type: Boolean, attribute: "sidebar" }) public optionsInSidebar =
      false;

    @state() protected rowSortSelected?: number;

    @state()
    @storage({
      key: "automationClipboard",
      state: true,
      subscribe: true,
      storage: "sessionStorage",
    })
    public _clipboard?: AutomationClipboard;

    /**
     * What the editor search shows. A list reads it to mark, hide and open its
     * rows; it never changes it.
     */
    @state()
    @consume({ context: automationSearchContext, subscribe: true })
    protected searchContext?: AutomationSearchSnapshot;

    /** The text of the search field of this list. Independent of the editor. */
    @state() private _listQuery = "";

    @state() private _listSearchOpen = false;

    private _lang = new LanguageModeController(this);

    // Rows this list opened to show a match, so clearing the search can close
    // exactly those and leave every row the person opened alone.
    private _autoExpanded = new Set<object>();

    private _lastSearchToken?: number;

    protected focusLastItemOnChange = false;

    protected focusItemIndexOnChange?: number;

    /** With focusItemIndexOnChange: the row at that index was just added. */
    protected focusItemIsNew = false;

    private _knownRowKeys?: Set<string>;

    protected get items(): T[] {
      throw new Error("Not implemented");
    }

    protected set items(_items: T[]) {
      throw new Error("Not implemented");
    }

    protected getKey(item: T): string {
      return getAutomationRowKey(item);
    }

    private _searchText(
      key: string,
      values?: Record<string, string | number>
    ): string {
      return this._lang.text(this.hass.localize, `${SEARCH_KEY}${key}`, values);
    }

    // True for the lists the editor search already covers as a whole.
    private get _isRootList(): boolean {
      return !!(this as unknown as { root?: boolean }).root;
    }

    private get _rowItems(): object[] {
      const items = this.items as unknown;
      return Array.isArray(items)
        ? items.filter((item) => !!item && typeof item === "object")
        : [];
    }

    private get _listSearchShown(): boolean {
      return (
        !!this.searchContext &&
        !this._isRootList &&
        (this._listSearchOpen ||
          this._listQuery !== "" ||
          this._rowItems.length >= LIST_SEARCH_THRESHOLD)
      );
    }

    /** True while a search hides rows, so a move would act on hidden rows. */
    protected get reorderLocked(): boolean {
      const search = this.searchContext;
      return (
        !!(search?.active && search.onlyMatching) ||
        this._listQuery.trim() !== ""
      );
    }

    protected get reorderLockedText(): string | undefined {
      if (!this.reorderLocked) {
        return undefined;
      }
      return this._listQuery.trim() !== ""
        ? this._searchText("list_reorder_locked")
        : this._searchText("reorder_locked");
    }

    protected isSearchHidden(item: object): boolean {
      const search = this.searchContext;
      if (!search) {
        return false;
      }
      if (
        search.active &&
        search.onlyMatching &&
        !search.visibleSet.has(item)
      ) {
        return true;
      }
      return (
        this._listQuery.trim() !== "" &&
        !search.subtreeMatches(item, this._listQuery)
      );
    }

    protected isSearchMatch(item: object): boolean {
      const search = this.searchContext;
      return !!search?.active && search.matchSet.has(item);
    }

    protected isSearchCurrent(item: object): boolean {
      return this.searchContext?.current?.item === item;
    }

    /** The search field of the list, shown when the list has enough rows. */
    protected renderListSearch(): TemplateResult | typeof nothing {
      if (!this._listSearchShown) {
        return nothing;
      }
      const items = this._rowItems;
      const shown = items.filter((item) => !this.isSearchHidden(item)).length;
      const filtering = this._listQuery.trim() !== "";
      const error = filtering ? regexQuery(this._listQuery)?.error : undefined;
      return html`<div class="list-search">
        <div class="list-search-row">
          <ha-input-search
            appearance="outlined"
            .placeholder=${this._searchText("list_search_placeholder")}
            .accessibleLabel=${this._searchText("list_search_label")}
            .value=${this._listQuery}
            @input=${this._listQueryChanged}
            @keydown=${this._listSearchKeydown}
          ></ha-input-search>
          ${
            this._listSearchOpen && items.length < LIST_SEARCH_THRESHOLD
              ? html`<ha-icon-button
                  .label=${this._searchText("list_search_close")}
                  .path=${mdiClose}
                  @click=${this._closeListSearch}
                ></ha-icon-button>`
              : nothing
          }
        </div>
        ${
          error
            ? html`<p class="list-search-note error" role="status">
                ${this.hass.localize(`ui.regex.filter_error.${error}` as any)}
              </p>`
            : filtering
              ? html`<p
                  class="list-search-note"
                  role="status"
                  aria-live="polite"
                >
                  ${
                    shown
                      ? this._searchText("list_count", {
                          shown,
                          total: items.length,
                        })
                      : this._searchText("list_no_matches")
                  }
                </p>`
              : nothing
        }
      </div>`;
    }

    /** Opens the add dialog so the new step is inserted at this index. */
    protected openAddDialogAt(_index: number): void {
      throw new Error("Not implemented");
    }

    /**
     * A slim control for the gap before the step at this index. It opens the
     * add dialog and the new step is inserted there. Nothing is drawn while
     * the list is read-only or a search hides rows.
     */
    protected renderInsertSlot(index: number): TemplateResult | typeof nothing {
      if (this.disabled || this.reorderLocked) {
        return nothing;
      }
      const label = this.hass.localize(
        "ui.panel.config.automation.editor.quick_add_here" as any
      );
      return html`<div class="insert-slot">
        <button
          type="button"
          class="insert-button"
          aria-label=${label}
          .insertIndex=${index}
          @click=${this._insertSlotClicked}
        >
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
          <span class="insert-text">${label}</span>
        </button>
      </div>`;
    }

    private _insertSlotClicked(ev: Event) {
      this.openAddDialogAt(
        (ev.currentTarget as HTMLElement & { insertIndex: number }).insertIndex
      );
    }

    /** A button for the buttons row that opens the search of the list. */
    protected renderListSearchToggle(): TemplateResult | typeof nothing {
      if (!this.searchContext || this._isRootList || this._listSearchShown) {
        return nothing;
      }
      return html`<ha-icon-button
        .label=${this._searchText("list_search_toggle")}
        .path=${mdiMagnify}
        @click=${this._openListSearch}
      ></ha-icon-button>`;
    }

    private _listQueryChanged(ev: Event) {
      this._listQuery = (ev.target as HaInputSearch).value ?? "";
    }

    private _listSearchKeydown(ev: KeyboardEvent) {
      if (ev.key === "Escape" && (this._listQuery || this._listSearchOpen)) {
        ev.stopPropagation();
        this._closeListSearch();
      }
    }

    private _openListSearch = () => {
      this._listSearchOpen = true;
      this.updateComplete.then(() => {
        this.renderRoot
          .querySelector<HaInputSearch>("ha-input-search")
          ?.focus();
      });
    };

    private _closeListSearch = () => {
      this._listQuery = "";
      this._listSearchOpen = false;
    };

    // Opens the rows that hold the current match and brings it into view.
    private _syncSearchReveal(changedProps: PropertyValues) {
      if (!changedProps.has("searchContext")) {
        return;
      }
      const search = this.searchContext;
      if (!search?.active) {
        this._lastSearchToken = search?.navigationToken;
        if (this._autoExpanded.size) {
          for (const row of this._getRows()) {
            const item = (row as { sortableData?: object }).sortableData;
            if (item && this._autoExpanded.has(item) && isRevealRow(row)) {
              row.collapse();
            }
          }
          this._autoExpanded.clear();
        }
        return;
      }
      if (search.navigationToken === this._lastSearchToken) {
        return;
      }
      this._lastSearchToken = search.navigationToken;
      let currentRow: HTMLElement | undefined;
      for (const row of this._getRows()) {
        const item = (row as { sortableData?: object }).sortableData;
        if (!item) {
          continue;
        }
        if (
          search.revealSet.has(item) &&
          isRevealRow(row) &&
          !row.isExpanded()
        ) {
          row.expand();
          this._autoExpanded.add(item);
        }
        if (search.current?.item === item) {
          currentRow = row;
        }
      }
      if (currentRow) {
        const row = currentRow;
        // Wait for the rows above it to open before measuring.
        requestAnimationFrame(() =>
          window.setTimeout(() => scrollRowIntoView(row), 150)
        );
      }
    }

    private _getRows(): HTMLElement[] {
      return Array.from(
        this.renderRoot.querySelectorAll<HTMLElement>(
          ".rows > *:not(.buttons):not(.insert-slot)"
        )
      );
    }

    protected updated(changedProps: PropertyValues<this>) {
      super.updated(changedProps);
      const items = this.items;
      if (!Array.isArray(items)) {
        return;
      }
      this._knownRowKeys = markEnteringRows(
        this._getRows(),
        items.map((item) => this.getKey(item)),
        this._knownRowKeys
      );
      this._syncSearchReveal(changedProps);
    }

    // Moves a row by keyboard and plays the move, since no drag animates it.
    private _moveWithMotion(oldIndex: number, newIndex: number) {
      const rows = this._getRows();
      const before = measureRows(
        rows.slice(
          Math.max(0, Math.min(oldIndex, newIndex) - 1),
          Math.max(oldIndex, newIndex) + 2
        )
      );
      this.move(oldIndex, newIndex);
      this.updateComplete.then(() => {
        animateRowMoves(this._getRows(), before);
      });
    }

    protected moveUp(ev) {
      ev.stopPropagation();
      if (this.reorderLocked) {
        return;
      }
      const index = (ev.target as any).index;
      if (!(ev.target as any).first) {
        const newIndex = index - 1;
        this._moveWithMotion(index, newIndex);
        if (this.rowSortSelected === index) {
          this.rowSortSelected = newIndex;
        }
        ev.target.focus();
      }
    }

    protected moveDown(ev) {
      ev.stopPropagation();
      if (this.reorderLocked) {
        return;
      }
      const index = (ev.target as any).index;
      if (!(ev.target as any).last) {
        const newIndex = index + 1;
        this._moveWithMotion(index, newIndex);
        if (this.rowSortSelected === index) {
          this.rowSortSelected = newIndex;
        }
        ev.target.focus();
      }
    }

    protected move(oldIndex: number, newIndex: number) {
      const items = this.items.concat();
      const item = items.splice(oldIndex, 1)[0];
      items.splice(newIndex, 0, item);
      this.items = items;
      fireEvent(this, "value-changed", { value: items });
    }

    protected itemMoved(ev: CustomEvent): void {
      ev.stopPropagation();
      if (this.reorderLocked) {
        return;
      }
      const { oldIndex, newIndex } = ev.detail;
      this.move(oldIndex, newIndex);
    }

    protected async itemAdded(ev: CustomEvent): Promise<void> {
      ev.stopPropagation();
      const { index, data } = ev.detail;
      const selected = (ev.detail.item as any).selected;

      let items = [
        ...this.items.slice(0, index),
        data,
        ...this.items.slice(index),
      ];
      // Add item locally to avoid UI jump
      this.items = items;
      if (selected) {
        this.focusItemIndexOnChange = items.length === 1 ? 0 : index;
      }
      await nextRender();
      if (this.items !== items) {
        // Ensure item is added even after update
        items = [
          ...this.items.slice(0, index),
          data,
          ...this.items.slice(index),
        ];
        if (selected) {
          this.focusItemIndexOnChange = items.length === 1 ? 0 : index;
        }
      }
      fireEvent(this, "value-changed", { value: items });
    }

    protected async itemRemoved(ev: CustomEvent): Promise<void> {
      ev.stopPropagation();
      const { index } = ev.detail;
      const item = this.items[index];
      // Remove item locally to avoid UI jump
      this.items = this.items.filter((i) => i !== item);
      await nextRender();
      // Ensure item is removed even after update
      const items = this.items.filter((i) => i !== item);
      fireEvent(this, "value-changed", { value: items });
    }

    protected itemChanged(ev: CustomEvent) {
      ev.stopPropagation();
      const items = [...this.items];
      const newValue = ev.detail.value;
      const index = (ev.target as any).index;

      if (newValue === null) {
        items.splice(index, 1);
      } else {
        // Store key on new value.
        items[index] = preserveAutomationRowKey(items[index], newValue);
      }

      this.items = items;
      fireEvent(this, "value-changed", { value: items });
    }

    protected replaceItem(ev: CustomEvent) {
      ev.stopPropagation();
      const index = (ev.target as any).index;
      // Unlike itemChanged, don't keep the row key: the new item gets a new
      // row, so no state of the replaced row carries over.
      this.focusItemIndexOnChange = index;
      fireEvent(this, "value-changed", {
        // @ts-expect-error Requires library bump to ES2023
        value: this.items.toSpliced(index, 1, ev.detail.value),
      });
    }

    protected duplicateItem(ev: CustomEvent) {
      ev.stopPropagation();
      const index = (ev.target as any).index;
      fireEvent(this, "value-changed", {
        // @ts-expect-error Requires library bump to ES2023
        value: this.items.toSpliced(index + 1, 0, deepClone(this.items[index])),
      });
    }

    protected pasteItem(ev: CustomEvent) {
      ev.stopPropagation();
      if (!ev.detail.item) return;

      const index = (ev.target as any).index;
      const clonedItem = deepClone(ev.detail.item);

      this.setHighlightedItems(ensureArray(clonedItem));

      fireEvent(this, "value-changed", {
        // @ts-expect-error Requires library bump to ES2023
        value: this.items.toSpliced(index + 1, 0, clonedItem),
      });
    }

    protected insertAfter(ev: CustomEvent) {
      ev.stopPropagation();
      const index = (ev.target as any).index;
      const inserted = ensureArray(ev.detail.value);
      this.setHighlightedItems(inserted);
      fireEvent(this, "value-changed", {
        // @ts-expect-error Requires library bump to ES2023
        value: this.items.toSpliced(index + 1, 0, ...inserted),
      });
    }

    protected setHighlightedItems(_items: T[]) {
      throw new Error("Not implemented");
    }

    protected handleDragKeydown(ev: KeyboardEvent) {
      if (this.reorderLocked) {
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        ev.stopPropagation();
        this.rowSortSelected =
          this.rowSortSelected === undefined
            ? (ev.target as any).index
            : undefined;
      }
    }

    protected stopSortSelection() {
      this.rowSortSelected = undefined;
    }
  }
  return AutomationSortableListClass;
};
