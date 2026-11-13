import {
  mdiChevronDown,
  mdiChevronRight,
  mdiDragHorizontalVariant,
  mdiFolderOutline,
  mdiFolderPlusOutline,
  mdiFolderRemoveOutline,
  mdiPencilOutline,
  mdiPlus,
} from "@mdi/js";
import deepClone from "deep-clone-simple";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { consume } from "../../../../common/decorators/consume";
import { ensureArray } from "../../../../common/array/ensure-array";
import { fireEvent } from "../../../../common/dom/fire_event";
import { stopPropagation } from "../../../../common/dom/stop_propagation";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-icon-button";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import "../../../../components/ha-sortable";
import "../../../../components/ha-svg-icon";
import type { Trigger } from "../../../../data/automation";
import { triggerDescriptionsContext } from "../../../../data/context";
import type { TriggerDescriptions } from "../../../../data/trigger";
import { isTriggerList } from "../../../../data/trigger";
import { createTrigger } from "../automation-element-config";
import { EDITOR_SAVE_FAB_TOAST_BOTTOM_OFFSET } from "../editor-toast";
import {
  getAddAutomationElementTargetFromQuery,
  PASTE_VALUE,
  showAddAutomationElementDialog,
} from "../show-add-automation-element-dialog";
import { AutomationSortableListMixin } from "../ha-automation-sortable-list-mixin";
import { automationRowsStyles } from "../styles";
import {
  cleanGroupName,
  drawnIndexes,
  groupSegments,
  groupSelected,
  realIndex,
  setSegmentGroup,
  suggestGroupName,
  triggerGroupOf,
} from "../tools/trigger-groups";
import type { GroupSegment } from "../tools/trigger-groups";
import { stepTitle } from "../tools/step-model";
import { stripGeneratedTriggerIds } from "./automation-trigger-id";
import "./ha-automation-trigger-row";
import type HaAutomationTriggerRow from "./ha-automation-trigger-row";

@customElement("ha-automation-trigger")
export default class HaAutomationTrigger extends AutomationSortableListMixin<Trigger>(
  LitElement
) {
  @property({ attribute: false }) public triggers!: Trigger[];

  @property({ attribute: false }) public highlightedTriggers?: Trigger[];

  @property({ type: Boolean }) public root = false;

  @property({ type: Boolean, attribute: false }) public editorDirty = false;

  @state()
  @consume({ context: triggerDescriptionsContext, subscribe: true })
  private _triggerDescriptions: TriggerDescriptions = {};

  private _openedAddDialogFromQuery = false;

  /** Names of the groups that are folded. Not stored: a view choice only. */
  @state() private _folded: ReadonlySet<string> = new Set();

  @state() private _groupPanelOpen = false;

  @state() private _groupSelection: ReadonlySet<number> = new Set();

  @state() private _groupName = "";

  /** Start index of the group segment that is being renamed. */
  @state() private _renaming?: number;

  protected get items(): Trigger[] {
    return this.triggers;
  }

  protected set items(items: Trigger[]) {
    this.triggers = items;
  }

  protected setHighlightedItems(items: Trigger[]) {
    this.highlightedTriggers = items;
  }

  private get _drawn(): number[] {
    return drawnIndexes(this.triggers, this._folded);
  }

  private _withIndexes(
    ev: CustomEvent,
    detail: Record<string, number>
  ): CustomEvent {
    return new CustomEvent(ev.type, {
      detail: { ...ev.detail, ...detail },
    });
  }

  protected override itemMoved(ev: CustomEvent): void {
    const drawn = this._drawn;
    if (drawn.length === this.triggers.length) {
      super.itemMoved(ev);
      return;
    }
    ev.stopPropagation();
    const length = this.triggers.length;
    super.itemMoved(
      this._withIndexes(ev, {
        oldIndex: realIndex(drawn, ev.detail.oldIndex, length),
        newIndex: realIndex(drawn, ev.detail.newIndex, length),
      })
    );
  }

  protected override async itemAdded(ev: CustomEvent): Promise<void> {
    const drawn = this._drawn;
    if (drawn.length === this.triggers.length) {
      return super.itemAdded(ev);
    }
    ev.stopPropagation();
    return super.itemAdded(
      this._withIndexes(ev, {
        index: realIndex(drawn, ev.detail.index, this.triggers.length),
      })
    );
  }

  protected override async itemRemoved(ev: CustomEvent): Promise<void> {
    const drawn = this._drawn;
    if (drawn.length === this.triggers.length) {
      return super.itemRemoved(ev);
    }
    ev.stopPropagation();
    return super.itemRemoved(
      this._withIndexes(ev, {
        index: realIndex(drawn, ev.detail.index, this.triggers.length),
      })
    );
  }

  private _t(key: string, values?: Record<string, string | number>) {
    return this.hass.localize(
      `ui.panel.config.automation.editor.groups.${key}` as any,
      values as any
    );
  }

  /** A group header before the first trigger of a group, then its row. */
  private _renderEntry(trigger: Trigger, idx: number, row: unknown) {
    const name = triggerGroupOf(trigger);
    const segment = name
      ? groupSegments(this.triggers).find((seg) => seg.start === idx)
      : undefined;
    const folded = !!name && this._folded.has(name);
    return html`${segment ? this._renderGroupHeader(segment) : nothing}${
      folded ? nothing : row
    }`;
  }

  private _renderGroupHeader(segment: GroupSegment) {
    const name = segment.name!;
    const folded = this._folded.has(name);
    const count = segment.end - segment.start;
    return html`<div class="group-header" role="group" aria-label=${name}>
      <ha-svg-icon .path=${mdiFolderOutline}></ha-svg-icon>
      ${
        this._renaming === segment.start
          ? html`<ha-input
                class="group-name-input"
                .label=${this._t("name")}
                .value=${name}
                maxlength="60"
                .segStart=${segment.start}
                @keydown=${this._renameKeydown}
              ></ha-input>
              <ha-button
                size="s"
                .segStart=${segment.start}
                @click=${this._renameSave}
              >
                ${this.hass.localize("ui.common.save")}
              </ha-button>
              <ha-button
                size="s"
                appearance="plain"
                @click=${this._renameCancel}
              >
                ${this.hass.localize("ui.common.cancel")}
              </ha-button>`
          : html`<button
                type="button"
                class="group-toggle"
                aria-expanded=${folded ? "false" : "true"}
                .groupName=${name}
                @click=${this._toggleGroup}
              >
                <ha-svg-icon
                  .path=${folded ? mdiChevronRight : mdiChevronDown}
                ></ha-svg-icon>
                <span class="group-name">${name}</span>
              </button>
              <span class="group-count">${this._t("count", { count })}</span>
              ${
                !this.disabled
                  ? html`<ha-icon-button
                        .label=${this._t("rename")}
                        .path=${mdiPencilOutline}
                        .segStart=${segment.start}
                        @click=${this._startRename}
                      ></ha-icon-button>
                      <ha-icon-button
                        .label=${this._t("ungroup")}
                        .path=${mdiFolderRemoveOutline}
                        .segStart=${segment.start}
                        @click=${this._ungroup}
                      ></ha-icon-button>`
                  : nothing
              }`
      }
    </div>`;
  }

  private _segmentAt(start: number): GroupSegment | undefined {
    return groupSegments(this.triggers).find((seg) => seg.start === start);
  }

  private _toggleGroup(ev: Event) {
    const name = (ev.currentTarget as HTMLElement & { groupName: string })
      .groupName;
    const next = new Set(this._folded);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    this._folded = next;
  }

  private _startRename(ev: Event) {
    this._renaming = (
      ev.currentTarget as HTMLElement & { segStart: number }
    ).segStart;
  }

  private _renameKeydown(ev: KeyboardEvent) {
    const segment = this._segmentAt(
      (ev.currentTarget as HTMLElement & { segStart: number }).segStart
    );
    if (ev.key === "Enter" && segment) {
      ev.preventDefault();
      this._applyRename(segment, (ev.target as HaInput).value ?? "");
    } else if (ev.key === "Escape") {
      ev.stopPropagation();
      this._renaming = undefined;
    }
  }

  private _renameSave(ev: Event) {
    const button = ev.currentTarget as HTMLElement & { segStart: number };
    const segment = this._segmentAt(button.segStart);
    const input = button
      .closest(".group-header")
      ?.querySelector<HaInput>("ha-input");
    if (segment) {
      this._applyRename(segment, input?.value ?? "");
    }
  }

  private _renameCancel() {
    this._renaming = undefined;
  }

  private _applyRename(segment: GroupSegment, value: string) {
    this._renaming = undefined;
    const name = cleanGroupName(value);
    if (!name || name === segment.name) {
      return;
    }
    if (segment.name && this._folded.has(segment.name)) {
      const next = new Set(this._folded);
      next.delete(segment.name);
      this._folded = next;
    }
    fireEvent(this, "value-changed", {
      value: setSegmentGroup(this.triggers, segment, name),
    });
  }

  private _ungroup(ev: Event) {
    const segment = this._segmentAt(
      (ev.currentTarget as HTMLElement & { segStart: number }).segStart
    );
    if (segment) {
      fireEvent(this, "value-changed", {
        value: setSegmentGroup(this.triggers, segment, undefined),
      });
    }
  }

  private _openGroupPanel() {
    this._groupName = suggestGroupName(this.triggers, this._t("default_name"));
    this._groupSelection = new Set();
    this._groupPanelOpen = true;
  }

  private _closeGroupPanel() {
    this._groupPanelOpen = false;
  }

  private _selectionChanged(ev: Event) {
    const box = ev.currentTarget as HTMLInputElement & {
      triggerIndex: number;
    };
    const index = box.triggerIndex;
    const checked = box.checked;
    const next = new Set(this._groupSelection);
    if (checked) {
      next.add(index);
    } else {
      next.delete(index);
    }
    this._groupSelection = next;
  }

  private _applyGroup() {
    const name = cleanGroupName(this._groupName);
    if (!name || !this._groupSelection.size) {
      return;
    }
    this._groupPanelOpen = false;
    fireEvent(this, "value-changed", {
      value: groupSelected(this.triggers, [...this._groupSelection], name),
    });
  }

  private _groupNameInput(ev: Event) {
    this._groupName = (ev.target as HaInput).value ?? "";
  }

  private _renderGroupPanel() {
    return html`<div
      class="group-panel"
      role="group"
      aria-label=${this._t("new_group")}
    >
      <p class="group-hint">${this._t("select_hint")}</p>
      <ul class="group-choices">
        ${this.triggers.map(
          (trigger, index) =>
            html`<li>
              <label>
                <ha-checkbox
                  .checked=${this._groupSelection.has(index)}
                  .triggerIndex=${index}
                  @change=${this._selectionChanged}
                ></ha-checkbox>
                <span
                  >${
                    (trigger as { alias?: string }).alias ||
                    stepTitle({
                      path: `trigger/${index}`,
                      kind: "trigger",
                      section: "trigger",
                      depth: 0,
                      raw: trigger,
                    })
                  }</span
                >
                ${
                  triggerGroupOf(trigger)
                    ? html`<span class="group-count"
                        >${triggerGroupOf(trigger)}</span
                      >`
                    : nothing
                }
              </label>
            </li>`
        )}
      </ul>
      <ha-input
        .label=${this._t("name")}
        .value=${this._groupName}
        maxlength="60"
        @input=${this._groupNameInput}
      ></ha-input>
      <div class="group-actions">
        <ha-button
          size="s"
          .disabled=${
            !this._groupSelection.size || !cleanGroupName(this._groupName)
          }
          @click=${this._applyGroup}
        >
          <ha-svg-icon slot="start" .path=${mdiFolderPlusOutline}></ha-svg-icon>
          ${this._t("group_selected")}
        </ha-button>
        <ha-button size="s" appearance="plain" @click=${this._closeGroupPanel}>
          ${this.hass.localize("ui.common.cancel")}
        </ha-button>
      </div>
    </div>`;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("triggers");
  }

  protected render() {
    return html`
      ${this.renderListSearch()}
      <ha-sortable
        handle-selector=".handle"
        draggable-selector="ha-automation-trigger-row"
        .disabled=${this.disabled || this.reorderLocked}
        group="triggers"
        invert-swap
        @item-moved=${this.itemMoved}
        @item-added=${this.itemAdded}
        @item-removed=${this.itemRemoved}
      >
        <div class="rows ${!this.optionsInSidebar ? "no-sidebar" : ""}">
          ${repeat(
            this.triggers,
            (trigger) => this.getKey(trigger),
            (trg, idx) =>
              this._renderEntry(
                trg,
                idx,
                html`
                  <ha-automation-trigger-row
                    .sortableData=${trg}
                    ?search-hidden=${this.isSearchHidden(trg)}
                    ?search-match=${this.isSearchMatch(trg)}
                    ?search-current=${this.isSearchCurrent(trg)}
                    .index=${idx}
                    .first=${idx === 0 || this.reorderLocked}
                    .last=${idx === this.triggers.length - 1 || this.reorderLocked}
                    .trigger=${trg}
                    .triggerDescriptions=${this._triggerDescriptions}
                    @duplicate=${this.duplicateItem}
                    @paste=${this.pasteItem}
                    @insert-after=${this.insertAfter}
                    @replace-item=${this.replaceItem}
                    @move-down=${this.moveDown}
                    @move-up=${this.moveUp}
                    @value-changed=${this.itemChanged}
                    .hass=${this.hass}
                    .disabled=${this.disabled || trg.editor_locked === true}
                    .narrow=${this.narrow}
                    .highlight=${this.highlightedTriggers?.includes(trg)}
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
                  </ha-automation-trigger-row>
                `
              )
          )}
          ${this._groupPanelOpen ? this._renderGroupPanel() : nothing}
          <div class="buttons">
            <ha-button
              .disabled=${this.disabled}
              @click=${this._addTriggerDialog}
              .appearance=${this.root ? "accent" : "filled"}
              .size=${this.root ? "m" : "s"}
            >
              ${this.hass.localize(
                "ui.panel.config.automation.editor.triggers.add"
              )}
              <ha-svg-icon .path=${mdiPlus} slot="start"></ha-svg-icon>
            </ha-button>
            ${
              this.root && !this.disabled && this.triggers.length > 1
                ? html`<ha-button
                    appearance="plain"
                    size="s"
                    @click=${this._openGroupPanel}
                  >
                    <ha-svg-icon
                      slot="start"
                      .path=${mdiFolderPlusOutline}
                    ></ha-svg-icon>
                    ${this._t("new_group")}
                  </ha-button>`
                : nothing
            }
            ${this.renderListSearchToggle()}
          </div>
        </div>
      </ha-sortable>
    `;
  }

  private _addTriggerDialog() {
    if (this.narrow) {
      fireEvent(this, "request-close-sidebar");
    }
    showAddAutomationElementDialog(this, {
      type: "trigger",
      add: this._addTrigger,
      clipboardItem: !this._clipboard?.trigger
        ? undefined
        : isTriggerList(this._clipboard.trigger)
          ? "list"
          : this._clipboard?.trigger?.trigger,
      clipboardPasteToastBottomOffset: this.editorDirty
        ? EDITOR_SAVE_FAB_TOAST_BOTTOM_OFFSET
        : undefined,
    });
  }

  private _addTrigger = (value: string, target?: HassServiceTarget) => {
    const trigger =
      value === PASTE_VALUE
        ? stripGeneratedTriggerIds(deepClone(this._clipboard!.trigger!))
        : createTrigger(value, target);
    this.focusLastItemOnChange = true;
    fireEvent(this, "value-changed", { value: this.triggers.concat(trigger) });
  };

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);

    if (!this.hass) {
      return;
    }

    const addTriggerTargetFromQuery = getAddAutomationElementTargetFromQuery(
      this.hass.states,
      this.hass.devices,
      this.hass.areas,
      "trigger"
    );

    if (changedProps.has("triggers") && addTriggerTargetFromQuery) {
      this._openedAddDialogFromQuery = false;
    }

    if (
      !this._openedAddDialogFromQuery &&
      this.root &&
      !this.disabled &&
      this.triggers.length === 0 &&
      addTriggerTargetFromQuery
    ) {
      this._openedAddDialogFromQuery = true;
      queueMicrotask(() => this._addTriggerDialog());
    } else if (this._openedAddDialogFromQuery && !addTriggerTargetFromQuery) {
      this._openedAddDialogFromQuery = false;
    }

    if (
      changedProps.has("triggers") &&
      (this.focusLastItemOnChange || this.focusItemIndexOnChange !== undefined)
    ) {
      const row = this.shadowRoot!.querySelector<HaAutomationTriggerRow>(
        `ha-automation-trigger-row:${this.focusLastItemOnChange ? "last-of-type" : `nth-of-type(${this.focusItemIndexOnChange! + 1})`}`
      )!;

      this.focusLastItemOnChange = false;
      this.focusItemIndexOnChange = undefined;

      row.updateComplete.then(() => {
        if (this.optionsInSidebar) {
          row.openSidebar();
        } else {
          row.expand();
          row.focus();
        }
        row.markAsNew();
      });
    }
  }

  public expandAll() {
    const triggerRows =
      this.shadowRoot!.querySelectorAll<HaAutomationTriggerRow>(
        "ha-automation-trigger-row"
      )!;
    triggerRows.forEach((row) => {
      row.expand();
    });
  }

  protected override duplicateItem(ev: CustomEvent) {
    ev.stopPropagation();
    const index = (ev.target as any).index;
    fireEvent(this, "value-changed", {
      // @ts-expect-error Requires library bump to ES2023
      value: this.items.toSpliced(
        index + 1,
        0,
        stripGeneratedTriggerIds(deepClone(this.items[index]))
      ),
    });
  }

  protected override pasteItem(ev: CustomEvent) {
    ev.stopPropagation();
    if (!ev.detail.item) return;

    const index = (ev.target as any).index;
    const clonedItem = stripGeneratedTriggerIds(deepClone(ev.detail.item));

    this.setHighlightedItems(ensureArray(clonedItem));

    fireEvent(this, "value-changed", {
      // @ts-expect-error Requires library bump to ES2023
      value: this.items.toSpliced(index + 1, 0, clonedItem),
    });
  }

  protected override insertAfter(ev: CustomEvent) {
    ev.stopPropagation();
    const index = (ev.target as any).index;
    const inserted = ensureArray(ev.detail.value).map((item) =>
      stripGeneratedTriggerIds(deepClone(item))
    );
    this.setHighlightedItems(inserted);
    fireEvent(this, "value-changed", {
      // @ts-expect-error Requires library bump to ES2023
      value: this.items.toSpliced(index + 1, 0, ...inserted),
    });
  }

  static styles = [
    automationRowsStyles,
    css`
      .group-header {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-border-radius-xl, 16px);
        background: var(
          --ha-color-surface-tone-2,
          var(--secondary-background-color)
        );
        color: var(--primary-text-color);
        margin-top: var(--ha-space-2);
      }
      .group-toggle {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        flex: 1;
        min-height: 44px;
        min-width: 0;
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-weight: var(--ha-font-weight-semibold);
        color: inherit;
        cursor: pointer;
        text-align: start;
      }
      .group-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .group-count {
        flex: none;
        padding: 0 var(--ha-space-2);
        border-radius: var(--ha-border-radius-pill, 999px);
        font-size: var(--ha-font-size-s, 0.875rem);
        line-height: 1.5rem;
        color: var(--secondary-text-color);
        background: var(--card-background-color);
      }
      .group-name-input {
        flex: 1;
        min-width: 0;
      }
      .group-panel {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-4);
        margin-top: var(--ha-space-2);
        border-radius: var(--ha-border-radius-xl, 16px);
        background: var(
          --ha-color-surface-tone-1,
          var(--secondary-background-color)
        );
      }
      .group-hint {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .group-choices {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .group-choices label {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
      }
      .group-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trigger": HaAutomationTrigger;
  }
}
