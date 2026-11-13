import { mdiDragHorizontalVariant, mdiPlus } from "@mdi/js";
import deepClone from "deep-clone-simple";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { fireEvent } from "../../../../common/dom/fire_event";
import { stopPropagation } from "../../../../common/dom/stop_propagation";
import "../../../../components/ha-button";
import "../../../../components/ha-sortable";
import "../../../../components/ha-svg-icon";
import {
  EditorPrefsController,
  isFastActive,
} from "../tools/automation-editor-prefs";
import {
  nextRowLimit,
  ROOT_CHUNK,
  visibleRowCount,
} from "../tools/automation-fast";
import {
  ACTION_BUILDING_BLOCKS,
  getAutomationActionType,
} from "../../../../data/action";
import type { Action } from "../../../../data/script";
import { createAction } from "../automation-element-config";
import { EDITOR_SAVE_FAB_TOAST_BOTTOM_OFFSET } from "../editor-toast";
import {
  getAddAutomationElementTargetFromQuery,
  PASTE_VALUE,
  showAddAutomationElementDialog,
} from "../show-add-automation-element-dialog";
import { AutomationSortableListMixin } from "../ha-automation-sortable-list-mixin";
import { automationRowsStyles } from "../styles";
import type HaAutomationActionRow from "./ha-automation-action-row";
import "./ha-automation-action-row";

@customElement("ha-automation-action")
export default class HaAutomationAction extends AutomationSortableListMixin<Action>(
  LitElement
) {
  @property({ type: Boolean }) public root = false;

  @property({ type: Boolean, attribute: false }) public editorDirty = false;

  @property({ attribute: false }) public actions!: Action[];

  @property({ attribute: false }) public highlightedActions?: Action[];

  @queryAll("ha-automation-action-row")
  private _actionRowElements?: HaAutomationActionRow[];

  private _openedAddDialogFromQuery = false;

  protected _editorPrefs = new EditorPrefsController(this);

  /** How many rows of a long top level list are drawn in fast mode. */
  @state() private _rowLimit = ROOT_CHUNK;

  private _moreObserver?: IntersectionObserver;

  private _observedMore?: Element | null;

  @query(".more-rows") private _moreRows?: HTMLElement;

  protected get items(): Action[] {
    return this.actions;
  }

  protected set items(items: Action[]) {
    this.actions = items;
  }

  protected setHighlightedItems(items: Action[]) {
    this.highlightedActions = items;
  }

  /** How many rows to draw: all unless fast mode limits a long root list. */
  private get _drawnCount(): number {
    const limited = this.root && isFastActive() && !this.searchContext?.active;
    return visibleRowCount(this.actions.length, limited, this._rowLimit);
  }

  protected render() {
    const drawn = this._drawnCount;
    return html`
      ${this.renderListSearch()}
      <ha-sortable
        handle-selector=".handle"
        draggable-selector="ha-automation-action-row"
        .disabled=${this.disabled || this.reorderLocked}
        group="actions"
        invert-swap
        @item-moved=${this.itemMoved}
        @item-added=${this.itemAdded}
        @item-removed=${this.itemRemoved}
      >
        <div class="rows ${!this.optionsInSidebar ? "no-sidebar" : ""}">
          ${repeat(
            drawn < this.actions.length
              ? this.actions.slice(0, drawn)
              : this.actions,
            (action) => this.getKey(action),
            (action, idx) => html`
              <ha-automation-action-row
                .root=${this.root}
                .sortableData=${action}
                ?search-hidden=${this.isSearchHidden(action)}
                ?search-match=${this.isSearchMatch(action)}
                ?search-current=${this.isSearchCurrent(action)}
                .index=${idx}
                .first=${idx === 0 || this.reorderLocked}
                .last=${idx === this.actions.length - 1 || this.reorderLocked}
                .action=${action}
                .narrow=${this.narrow}
                .disabled=${this.disabled || action.editor_locked === true}
                @duplicate=${this.duplicateItem}
                @paste=${this.pasteItem}
                @insert-after=${this.insertAfter}
                @replace-item=${this.replaceItem}
                @move-down=${this.moveDown}
                @move-up=${this.moveUp}
                @value-changed=${this.itemChanged}
                .hass=${this.hass}
                .highlight=${this.highlightedActions?.includes(action)}
                .optionsInSidebar=${this.optionsInSidebar}
                .sortSelected=${this.rowSortSelected === idx}
                @stop-sort-selection=${this.stopSortSelection}
              >
                ${
                  !this.disabled
                    ? html`
                        <div
                          tabindex="0"
                          class="handle ${
                            this.rowSortSelected === idx ? "active" : ""
                          }"
                          slot="icons"
                          title=${this.reorderLockedText ?? nothing}
                          @keydown=${this.handleDragKeydown}
                          @click=${stopPropagation}
                          .index=${idx}
                        >
                          <ha-svg-icon
                            .path=${mdiDragHorizontalVariant}
                          ></ha-svg-icon>
                        </div>
                      `
                    : nothing
                }
              </ha-automation-action-row>
            `
          )}
          ${
            drawn < this.actions.length
              ? html`<div class="more-rows" role="status">
                  <span
                    >${this.hass.localize(
                      "ui.panel.config.automation.editor.fast.more_steps" as any,
                      { count: this.actions.length - drawn }
                    )}</span
                  >
                  <ha-button size="s" @click=${this._showMoreRows}>
                    ${this.hass.localize(
                      "ui.panel.config.automation.editor.fast.show_more" as any
                    )}
                  </ha-button>
                </div>`
              : nothing
          }
          <div class="buttons">
            <ha-button
              .disabled=${this.disabled}
              @click=${this._addActionDialog}
              .appearance=${this.root ? "accent" : "filled"}
              .size=${this.root ? "m" : "s"}
            >
              <ha-svg-icon .path=${mdiPlus} slot="start"></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.automation.editor.actions.add"
              )}
            </ha-button>
            ${this.renderListSearchToggle()}
          </div>
        </div>
      </ha-sortable>
    `;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._moreObserver?.disconnect();
    this._moreObserver = undefined;
    this._observedMore = undefined;
  }

  private _showMoreRows = () => {
    this._rowLimit = nextRowLimit(this._rowLimit, this.actions.length);
  };

  /** Draws the next chunk when the end of the drawn rows scrolls into view. */
  private _observeMoreRows() {
    const more = this._moreRows;
    if (more === this._observedMore) {
      return;
    }
    this._moreObserver?.disconnect();
    this._observedMore = more;
    if (!more || typeof IntersectionObserver === "undefined") {
      return;
    }
    this._moreObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this._showMoreRows();
      }
    });
    this._moreObserver.observe(more);
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    this._observeMoreRows();

    if (!this.hass) {
      return;
    }

    const addActionTargetFromQuery = getAddAutomationElementTargetFromQuery(
      this.hass.states,
      this.hass.devices,
      this.hass.areas,
      "action"
    );

    if (changedProps.has("actions") && addActionTargetFromQuery) {
      this._openedAddDialogFromQuery = false;
    }

    if (
      !this._openedAddDialogFromQuery &&
      this.root &&
      !this.disabled &&
      this.actions.length === 0 &&
      addActionTargetFromQuery
    ) {
      this._openedAddDialogFromQuery = true;
      queueMicrotask(() => this._addActionDialog());
    } else if (this._openedAddDialogFromQuery && !addActionTargetFromQuery) {
      this._openedAddDialogFromQuery = false;
    }

    if (
      changedProps.has("actions") &&
      (this.focusLastItemOnChange || this.focusItemIndexOnChange !== undefined)
    ) {
      const mode = this.focusLastItemOnChange ? "new" : "moved";

      const row = this.shadowRoot!.querySelector<HaAutomationActionRow>(
        `ha-automation-action-row:${mode === "new" ? "last-of-type" : `nth-of-type(${this.focusItemIndexOnChange! + 1})`}`
      )!;

      this.focusLastItemOnChange = false;
      this.focusItemIndexOnChange = undefined;

      row.updateComplete.then(() => {
        // on new condition open the settings in the sidebar, except for building blocks
        const type = getAutomationActionType(row.action);
        if (
          type &&
          this.optionsInSidebar &&
          (!ACTION_BUILDING_BLOCKS.includes(type) || mode === "moved")
        ) {
          row.openSidebar();
        }

        if (mode === "new") {
          row.expand();
          row.markAsNew();
        }

        if (!this.optionsInSidebar) {
          row.focus();
        }
      });
    }
  }

  public async expandAll() {
    if (this._drawnCount < this.actions.length) {
      this._rowLimit = this.actions.length;
      await this.updateComplete;
    }
    this._actionRowElements?.forEach((row) => {
      row.expandAll();
    });
  }

  public collapseAll() {
    this._actionRowElements?.forEach((row) => {
      row.collapseAll();
    });
  }

  /** Opens the add action dialog, as the Add action button does. */
  public openAddDialog(): void {
    this._addActionDialog();
  }

  private _addActionDialog() {
    if (this.narrow) {
      fireEvent(this, "request-close-sidebar");
    }

    showAddAutomationElementDialog(this, {
      type: "action",
      add: this._addAction,
      clipboardItem: getAutomationActionType(this._clipboard?.action),
      clipboardPasteToastBottomOffset: this.editorDirty
        ? EDITOR_SAVE_FAB_TOAST_BOTTOM_OFFSET
        : undefined,
    });
  }

  private _addAction = (action: string, target?: HassServiceTarget) => {
    const newAction =
      action === PASTE_VALUE
        ? deepClone(this._clipboard!.action!)
        : createAction(action, target);
    this.focusLastItemOnChange = true;
    this._rowLimit = Math.max(this._rowLimit, this.actions.length + 1);
    fireEvent(this, "value-changed", { value: this.actions.concat(newAction) });
  };

  static styles = [
    automationRowsStyles,
    css`
      .more-rows {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3);
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-action": HaAutomationAction;
  }
}
