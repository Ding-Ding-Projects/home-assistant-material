import {
  mdiArrowDown,
  mdiArrowUp,
  mdiCommentEditOutline,
  mdiCommentTextOutline,
  mdiDelete,
  mdiDotsVertical,
  mdiFlask,
  mdiPlay,
  mdiPlaylistEdit,
  mdiPlusCircleMultipleOutline,
  mdiRenameBox,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { assert } from "superstruct";
import { ensureArray } from "../../../../common/array/ensure-array";
import { consume } from "../../../../common/decorators/consume";
import { fireEvent } from "../../../../common/dom/fire_event";
import { preventDefaultStopPropagation } from "../../../../common/dom/prevent_default_stop_propagation";
import { stopPropagation } from "../../../../common/dom/stop_propagation";
import { renderCtrlOrCmd } from "../../../../common/keyboard/ctrl-or-cmd";
import { capitalizeFirstLetter } from "../../../../common/string/capitalize-first-letter";
import { truncateWithEllipsis } from "../../../../common/string/truncate-with-ellipsis";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import "../../../../components/automation/ha-automation-row";
import type { HaAutomationRow } from "../../../../components/automation/ha-automation-row";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import "../../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../../components/ha-dropdown";
import "../../../../components/automation/ha-automation-row-event-chip";
import "../../../../components/ha-dropdown-item";
import "../../../../components/ha-expansion-panel";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-yaml-editor";
import type { HaYamlEditor } from "../../../../components/ha-yaml-editor";
import type {
  Condition,
  OptionSidebarConfig,
  TriggerCondition,
} from "../../../../data/automation";
import { getRowNote } from "../../../../data/automation";
import { describeCondition } from "../../../../data/automation_i18n";
import { fullEntitiesContext } from "../../../../data/context";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import type { Action, Option } from "../../../../data/script";
import { migrateAutomationAction } from "../../../../data/script";
import {
  showAlertDialog,
  showPromptDialog,
} from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import { isMac } from "../../../../util/is_mac";
import "../action/ha-automation-action";
import type HaAutomationAction from "../action/ha-automation-action";
import "../condition/ha-automation-condition";
import type HaAutomationCondition from "../condition/ha-automation-condition";
import { showEditorToast } from "../editor-toast";
import "../ha-automation-editor-warning";
import { scrollRowIntoView } from "../scroll-row-into-view";
import { optionStruct } from "../structs";
import {
  editorStyles,
  indentStyle,
  overflowStyles,
  rowStyles,
} from "../styles";
import "../trigger/ha-automation-trigger-references";
import { getUiSupportWarnings, isConfigObject } from "../ui-support";
import { runActions, testOption } from "./choose-run";

@customElement("ha-automation-option-row")
export default class HaAutomationOptionRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public option?: Option;

  @property({ attribute: false }) public defaultActions?: Action[];

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Number }) public index!: number;

  @property({ type: Boolean }) public first = false;

  @property({ type: Boolean }) public last = false;

  @property({ type: Boolean, attribute: "sidebar" })
  public optionsInSidebar = false;

  @property({ type: Boolean, attribute: "sort-selected" })
  public sortSelected = false;

  @state() private _expanded = false;

  @state() private _selected = false;

  @state() private _collapsed = true;

  @state() private _yamlMode = false;

  @state() private _warnings?: string[];

  @state() private _testing = false;

  @state() private _testingResult?: boolean;

  private _testingTimeout?: number;

  @state() private _running = false;

  @state() private _runResult?: {
    variant: "success" | "danger";
    text: string;
  };

  @state() private _testingNow = false;

  /** Runs this option's actions now, without evaluating its conditions. */
  private _runSequence = async () => {
    if (this._running) {
      return;
    }
    const actions = (
      this.option
        ? ensureArray(this.option.sequence)
        : ensureArray(this.defaultActions)
    ) as Action[];
    const localize = this.hass.localize;
    if (!actions.length) {
      this._runResult = {
        variant: "danger",
        text: localize(
          "ui.panel.config.automation.editor.actions.type.choose.run_no_actions"
        ),
      };
      return;
    }
    this._running = true;
    this._runResult = undefined;
    const result = await runActions(this.hass, actions);
    this._running = false;
    this._runResult =
      result.status === "success"
        ? {
            variant: "success",
            text: localize(
              "ui.panel.config.automation.editor.actions.type.choose.run_success"
            ),
          }
        : {
            variant: "danger",
            text: `${localize(
              result.status === "invalid"
                ? "ui.panel.config.automation.editor.actions.invalid_action"
                : "ui.panel.config.automation.editor.actions.run_action_error"
            )}: ${result.message}`,
          };
  };

  private _testFromToolbar = async () => {
    if (this._testingNow) {
      return;
    }
    this._testingNow = true;
    await this._testOption();
    this._testingNow = false;
  };

  private _renderRunToolbar() {
    const localize = this.hass.localize;
    return html`<div class="run-toolbar">
      ${
        this.option
          ? html`<ha-button
              appearance="plain"
              size="s"
              .disabled=${this._testingNow}
              @click=${this._testFromToolbar}
            >
              <ha-svg-icon slot="start" .path=${mdiFlask}></ha-svg-icon>
              ${localize(
                "ui.panel.config.automation.editor.actions.type.choose.test_option_button"
              )}
            </ha-button>`
          : nothing
      }
      <ha-button
        appearance="plain"
        size="s"
        .disabled=${this._running}
        @click=${this._runSequence}
      >
        <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
        ${localize(
          this._running
            ? "ui.panel.config.automation.editor.actions.type.choose.running"
            : this.option
              ? "ui.panel.config.automation.editor.actions.type.choose.run_option"
              : "ui.panel.config.automation.editor.actions.type.choose.run_default"
        )}
      </ha-button>
      <span
        class="run-result ${this._runResult?.variant ?? ""}"
        role="status"
        aria-live="polite"
        >${this._runResult?.text ?? ""}</span
      >
    </div>`;
  }

  @query("ha-yaml-editor") private _yamlEditor?: HaYamlEditor;

  // Unknown because sidebar YAML may not be a valid option
  private _sidebarOption?: unknown;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  @query("ha-automation-condition")
  private _conditionElement?: HaAutomationCondition;

  @query("ha-automation-action")
  private _actionElement?: HaAutomationAction;

  @query("ha-automation-row")
  private _automationRowElement?: HaAutomationRow;

  get selected() {
    return this._selected;
  }

  public static checkUiSupport(
    _localize: LocalizeFunc,
    option: Option
  ): Error | undefined {
    try {
      assert(option, optionStruct);
    } catch (err: any) {
      return err;
    }
    return undefined;
  }

  protected willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has("option") || changedProperties.has("_yamlMode")) {
      this._warnings =
        this._yamlMode && isConfigObject(this.option)
          ? getUiSupportWarnings(
              this.hass.localize,
              "ha-automation-option-row",
              this.option
            )
          : undefined;
    }
  }

  protected updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    // Sync the sidebar with inline edits, skip its own saves to keep focus
    if (
      changedProperties.has("option") &&
      this._selected &&
      this.optionsInSidebar &&
      this.option !== this._sidebarOption
    ) {
      this.openSidebar();
    }
  }

  // The test button sits in the row header, which expands on a click.
  private _runTestClicked = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    this._testOption();
  };

  /**
   * Checks right now whether this option would be chosen: every one of its
   * conditions must pass. An option without conditions always passes.
   * Nothing is run and nothing is saved.
   */
  private async _testOption() {
    const option = this.option;
    if (!option) {
      return;
    }
    window.clearTimeout(this._testingTimeout);

    const result = await testOption(this.hass, option);
    if (this.option !== option) {
      return;
    }
    if (result.status === "invalid") {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.automation.editor.conditions.invalid_condition"
        ),
        text: result.message,
      });
      return;
    }
    if (result.status === "error") {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.automation.editor.conditions.test_failed"
        ),
        text: result.message,
      });
      return;
    }
    this._testingResult = result.status === "pass";
    this._testing = true;
    this._testingTimeout = window.setTimeout(() => {
      this._testing = false;
    }, 2500);
  }

  private _expandedChanged(ev) {
    if (ev.currentTarget.id !== "option") {
      return;
    }
    this._expanded = ev.detail.expanded;
  }

  private _getDescription(withTriggerReferences = false) {
    const conditions = ensureArray<Condition | string>(this.option!.conditions);
    if (!conditions || conditions.length === 0) {
      return this.hass.localize(
        "ui.panel.config.automation.editor.actions.type.choose.no_conditions"
      );
    }
    let str = "";
    if (typeof conditions[0] === "string") {
      str += conditions[0];
    } else {
      str += describeCondition(conditions[0], this.hass, this._entityReg);
    }
    // When chips are rendered, the additional-condition count follows them.
    if (conditions.length > 1 && !withTriggerReferences) {
      str += this.hass.localize(
        "ui.panel.config.automation.editor.actions.type.choose.option_description_additional",
        { numberOfAdditionalConditions: conditions.length - 1 }
      );
    }
    return str;
  }

  private _renderOverflowLabel(label: string, shortcut?: TemplateResult) {
    return html`
      <div class="overflow-label">
        ${label}
        ${
          this.optionsInSidebar && !this.narrow
            ? shortcut ||
              html`<span
                class="shortcut-placeholder ${isMac ? "mac" : ""}"
              ></span>`
            : nothing
        }
      </div>
    `;
  }
  private _renderRow() {
    const conditions = ensureArray<Condition | string>(
      this.option?.conditions ?? []
    );
    const firstCondition = conditions[0];
    const triggerCondition =
      !this.option?.alias &&
      !this._expanded &&
      typeof firstCondition === "object" &&
      firstCondition?.condition === "trigger"
        ? (firstCondition as TriggerCondition)
        : undefined;
    const note = getRowNote(this.option?.note);

    return html`
      <h3 slot="header">
        ${
          this.option
            ? html`<span class="option-chip option-chip-${this.index % 3}"
                  >${this.hass.localize(
                    "ui.panel.config.automation.editor.actions.type.choose.option",
                    { number: this.index + 1 }
                  )}</span
                >
                ${
                  this.option.alias ||
                  (this._expanded
                    ? ""
                    : this._getDescription(!!triggerCondition))
                }`
            : this.hass.localize(
                "ui.panel.config.automation.editor.actions.type.choose.default"
              )
        }
        ${
          triggerCondition
            ? html`<ha-automation-trigger-references
                .condition=${triggerCondition}
                .hass=${this.hass}
              ></ha-automation-trigger-references>`
            : nothing
        }
        ${
          triggerCondition && conditions.length > 1
            ? this.hass.localize(
                "ui.panel.config.automation.editor.actions.type.choose.option_description_additional",
                { numberOfAdditionalConditions: conditions.length - 1 }
              )
            : nothing
        }
        ${
          note
            ? html`
                <ha-svg-icon
                  id="note-icon"
                  tabindex="0"
                  .path=${mdiCommentTextOutline}
                  .label=${this.hass.localize(
                    "ui.panel.config.automation.editor.note.label"
                  )}
                  class="note-indicator"
                ></ha-svg-icon>
                <ha-tooltip for="note-icon"
                  ><p>${truncateWithEllipsis(note, 250)}</p></ha-tooltip
                >
              `
            : nothing
        }
      </h3>

      <ha-automation-row-event-chip
        .show=${this._testing}
        .variant=${this._testingResult ? "success" : "warning"}
        slot="event"
        class="event-chip"
        aria-live="polite"
      >
        ${this.hass.localize(
          `ui.panel.config.automation.editor.actions.type.choose.testing_${
            this._testingResult ? "pass" : "error"
          }`
        )}
      </ha-automation-row-event-chip>

      <slot name="icons" slot="icons"></slot>

      ${
        this.option
          ? html`
              <ha-icon-button
                slot="icons"
                class="run-test"
                .label=${this.hass.localize(
                  "ui.panel.config.automation.editor.actions.type.choose.test_option"
                )}
                .path=${mdiFlask}
                @click=${this._runTestClicked}
                @keydown=${stopPropagation}
              ></ha-icon-button>
              <ha-dropdown
                slot="icons"
                @click=${preventDefaultStopPropagation}
                @keydown=${stopPropagation}
                @wa-select=${this._handleDropdownSelect}
                placement="bottom-end"
              >
                <ha-icon-button
                  slot="trigger"
                  .label=${this.hass.localize("ui.common.menu")}
                  .path=${mdiDotsVertical}
                ></ha-icon-button>

                <ha-dropdown-item value="rename" .disabled=${this.disabled}>
                  <ha-svg-icon slot="icon" .path=${mdiRenameBox}></ha-svg-icon>
                  ${this._renderOverflowLabel(
                    this.hass.localize(
                      "ui.panel.config.automation.editor.triggers.rename"
                    )
                  )}
                </ha-dropdown-item>
                <ha-dropdown-item value="edit_note">
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiCommentEditOutline}
                  ></ha-svg-icon>
                  ${this._renderOverflowLabel(
                    this.hass.localize(
                      `ui.panel.config.automation.editor.note.${this.option?.note ? "edit" : "add"}`
                    )
                  )}
                </ha-dropdown-item>

                <ha-dropdown-item value="duplicate" .disabled=${this.disabled}>
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiPlusCircleMultipleOutline}
                  ></ha-svg-icon>

                  ${this._renderOverflowLabel(
                    this.hass.localize(
                      "ui.panel.config.automation.editor.actions.duplicate"
                    )
                  )}
                </ha-dropdown-item>

                <ha-dropdown-item
                  value="toggle_yaml_mode"
                  .disabled=${!!this._warnings}
                >
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiPlaylistEdit}
                  ></ha-svg-icon>
                  ${this._renderOverflowLabel(
                    this.hass.localize(
                      `ui.panel.config.automation.editor.edit_${!this._yamlMode ? "yaml" : "ui"}`
                    )
                  )}
                </ha-dropdown-item>

                ${
                  !this.optionsInSidebar
                    ? html`
                        <ha-dropdown-item
                          value="move_up"
                          .disabled=${this.disabled || !!this.first}
                        >
                          ${this.hass.localize(
                            "ui.panel.config.automation.editor.move_up"
                          )}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiArrowUp}
                          ></ha-svg-icon
                        ></ha-dropdown-item>
                        <ha-dropdown-item
                          value="move_down"
                          .disabled=${this.disabled || !!this.last}
                        >
                          ${this.hass.localize(
                            "ui.panel.config.automation.editor.move_down"
                          )}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiArrowDown}
                          ></ha-svg-icon
                        ></ha-dropdown-item>
                      `
                    : nothing
                }

                <ha-dropdown-item
                  value="delete"
                  variant="danger"
                  .disabled=${this.disabled}
                >
                  <ha-svg-icon
                    class="warning"
                    slot="icon"
                    .path=${mdiDelete}
                  ></ha-svg-icon>
                  ${this._renderOverflowLabel(
                    this.hass.localize(
                      "ui.panel.config.automation.editor.actions.type.choose.remove_option"
                    ),
                    html`<span class="shortcut">
                      <span>${renderCtrlOrCmd(this.hass.localize)}</span>
                      <span>+</span>
                      <span
                        >${this.hass.localize(
                          "ui.panel.config.automation.editor.del"
                        )}</span
                      >
                    </span>`
                  )}
                </ha-dropdown-item>
              </ha-dropdown>
            `
          : nothing
      }
      ${!this.optionsInSidebar ? this._renderContent() : nothing}
    `;
  }

  private _renderContent() {
    // In sidebar layout, YAML is edited in the sidebar
    if (this._yamlMode && this.option && !this.optionsInSidebar) {
      return html`<div class="card-content card">
        ${
          this._warnings
            ? html`<ha-automation-editor-warning
                .localize=${this.hass.localize}
                .warnings=${this._warnings}
              ></ha-automation-editor-warning>`
            : nothing
        }
        <ha-yaml-editor
          .defaultValue=${this.option}
          .readOnly=${this.disabled}
          @value-changed=${this._onYamlChange}
        ></ha-yaml-editor>
      </div>`;
    }

    // The visual editors can't render options that aren't UI-supported
    if (this._warnings) {
      return nothing;
    }

    return html`<div
      class=${classMap({
        "card-content": true,
        card: !this.optionsInSidebar,
        indent: this.optionsInSidebar,
        selected: this._selected,
        hidden: this.optionsInSidebar && this._collapsed,
      })}
    >
      ${this._renderRunToolbar()}
      ${
        this.option
          ? html`
              <h4>
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.actions.type.choose.conditions_heading"
                )}
              </h4>
              <ha-automation-condition
                .conditions=${ensureArray<string | Condition>(
                  this.option.conditions
                )}
                .disabled=${this.disabled}
                .hass=${this.hass}
                .narrow=${this.narrow}
                @value-changed=${this._conditionChanged}
                .optionsInSidebar=${this.optionsInSidebar}
              ></ha-automation-condition>
            `
          : nothing
      }
      <h4>
        ${this.hass.localize(
          "ui.panel.config.automation.editor.actions.type.choose.sequence_heading"
        )}
      </h4>
      <ha-automation-action
        .actions=${
          (this.option
            ? ensureArray(this.option.sequence) || []
            : this.defaultActions
              ? ensureArray(this.defaultActions) || []
              : []) as Action[]
        }
        .disabled=${this.disabled}
        .hass=${this.hass}
        .narrow=${this.narrow}
        @value-changed=${this._actionChanged}
        .optionsInSidebar=${this.optionsInSidebar}
      ></ha-automation-action>
    </div>`;
  }

  protected render() {
    if (!this.option && !this.defaultActions) return nothing;

    return html`
      <ha-card outlined class=${this._selected ? "selected" : ""}>
        ${
          this.optionsInSidebar
            ? html`<ha-automation-row
                left-chevron
                .collapsed=${this._collapsed}
                .selected=${this._selected}
                .sortSelected=${this.sortSelected}
                @click=${this._toggleSidebar}
                @toggle-collapsed=${this._toggleCollapse}
                @delete-row=${this._removeOption}
                >${this._renderRow()}</ha-automation-row
              >`
            : html`
                <ha-expansion-panel
                  left-chevron
                  @expanded-changed=${this._expandedChanged}
                  id="option"
                >
                  ${this._renderRow()}
                </ha-expansion-panel>
              `
        }
      </ha-card>

      ${this.optionsInSidebar ? this._renderContent() : nothing}
    `;
  }

  private _duplicateOption = () => {
    fireEvent(this, "duplicate");
  };

  private _toggleYamlMode = () => {
    this._yamlMode = !this._yamlMode;
    if (this.optionsInSidebar) {
      // YAML is edited in the sidebar, so open (or refresh) it
      this.openSidebar();
    } else {
      this.expand();
    }
  };

  private _onYamlChange(ev: CustomEvent) {
    ev.stopPropagation();
    if (!ev.detail.isValid) {
      return;
    }
    this._saveYamlOption(ev.detail.value);
  }

  private _saveYamlOption(value: unknown) {
    // YAML can parse to scalars or lists, which are never valid options
    if (!isConfigObject(value)) {
      return;
    }
    const option = value.sequence
      ? {
          ...value,
          sequence: migrateAutomationAction(value.sequence as Action[]),
        }
      : value;
    this._sidebarOption = option;
    fireEvent(this, "value-changed", { value: option });
  }

  private _moveUp() {
    fireEvent(this, "move-up");
  }

  private _moveDown() {
    fireEvent(this, "move-down");
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    ev.stopPropagation();
    const action = ev.detail?.item?.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "rename":
        this._renameOption();
        break;
      case "edit_note":
        this._editNoteOption();
        break;
      case "delete":
        this._removeOption();
        break;
      case "duplicate":
        this._duplicateOption();
        break;
      case "toggle_yaml_mode":
        this._toggleYamlMode();
        break;
      case "move_up":
        this._moveUp();
        break;
      case "move_down":
        this._moveDown();
        break;
    }
  }

  private _removeOption = () => {
    if (this.option) {
      fireEvent(this, "value-changed", {
        value: null,
      });
      if (this._selected) {
        fireEvent(this, "close-sidebar");
      }

      showEditorToast(this, {
        message: this.hass.localize("ui.common.successfully_deleted"),
        duration: 4000,
        action: {
          text: this.hass.localize("ui.common.undo"),
          action: () => {
            fireEvent(window, "undo-change");
          },
        },
      });
    }
  };

  private _renameOption = async () => {
    const alias = await showPromptDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.automation.editor.actions.type.choose.change_alias"
      ),
      inputLabel: this.hass.localize(
        "ui.panel.config.automation.editor.actions.type.choose.alias"
      ),
      inputType: "string",
      placeholder: capitalizeFirstLetter(this._getDescription()),
      defaultValue: this.option!.alias,
      confirmText: this.hass.localize("ui.common.submit"),
    });
    if (alias !== null) {
      const value: Option = { ...this.option! };
      if (alias === "") {
        delete value.alias;
      } else {
        value.alias = alias;
      }
      fireEvent(this, "value-changed", {
        value,
      });

      if (this._selected) {
        this.openSidebar(value); // refresh sidebar
      } else if (this._yamlMode) {
        this._yamlEditor?.setValue(value);
      }
    }
  };

  private _editNoteOption = async (): Promise<void> => {
    if (!this.option) {
      return;
    }
    const note = await showPromptDialog(this, {
      title: this.hass.localize(
        `ui.panel.config.automation.editor.note.${this.option.note ? "edit" : "add"}`
      ),
      inputLabel: this.hass.localize(
        "ui.panel.config.automation.editor.note.label"
      ),
      inputType: "string",
      defaultValue: this.option.note,
      confirmText: this.hass.localize("ui.common.submit"),
      multiline: true,
    });
    if (note !== null) {
      const value: Option = { ...this.option };
      if (note === "") {
        delete value.note;
      } else {
        value.note = note;
      }
      fireEvent(this, "value-changed", {
        value,
      });

      if (this._selected) {
        this.openSidebar(value); // refresh sidebar
      } else if (this._yamlMode) {
        this._yamlEditor?.setValue(value);
      }
    }
  };

  private _conditionChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const conditions = ev.detail.value as Condition[];
    const value = { ...this.option, conditions: conditions };
    fireEvent(this, "value-changed", {
      value,
    });
  }

  private _actionChanged(ev: CustomEvent) {
    if (this.defaultActions) {
      return;
    }
    ev.stopPropagation();
    const actions = ev.detail.value as Action[];
    const value = { ...this.option, sequence: actions };
    fireEvent(this, "value-changed", {
      value,
    });
  }

  private _toggleSidebar(ev: Event) {
    ev?.stopPropagation();

    if (this._selected) {
      fireEvent(this, "request-close-sidebar");
      return;
    }
    this.openSidebar();
  }

  public openSidebar(option?: Option): void {
    const sidebarOption = option ?? this.option;
    this._sidebarOption = sidebarOption;
    fireEvent(this, "open-sidebar", {
      save: (value) => {
        this._saveYamlOption(value);
      },
      close: (focus?: boolean) => {
        this._selected = false;
        fireEvent(this, "close-sidebar");
        if (focus) {
          this.focus();
        }
      },
      rename: () => {
        this._renameOption();
      },
      editNote: this._editNoteOption,
      delete: this._removeOption,
      duplicate: this._duplicateOption,
      toggleYamlMode: (yamlMode?: boolean) => {
        if (yamlMode === undefined || yamlMode !== this._yamlMode) {
          this._toggleYamlMode();
        }
      },
      yamlMode: this._yamlMode,
      config: {
        option: sidebarOption,
      },
      defaultOption: !!this.defaultActions,
      note: sidebarOption?.note,
    } satisfies OptionSidebarConfig);
    this._selected = true;
    this._collapsed = false;

    if (this.narrow) {
      window.setTimeout(() => {
        scrollRowIntoView(this);
      }, 180); // duration of transition of added padding for bottom sheet
    }
  }

  public expand() {
    if (this.optionsInSidebar) {
      this._collapsed = false;
      return;
    }

    this.updateComplete.then(() => {
      this.shadowRoot!.querySelector("ha-expansion-panel")!.expanded = true;
    });
  }

  public collapse() {
    this._collapsed = true;
  }

  public expandAll() {
    this.expand();

    this._conditionElement?.expandAll();
    this._actionElement?.expandAll();
  }

  public collapseAll() {
    this.collapse();

    this._conditionElement?.collapseAll();
    this._actionElement?.collapseAll();
  }

  private _toggleCollapse() {
    this._collapsed = !this._collapsed;
  }

  public focus() {
    this._automationRowElement?.focus();
  }

  static get styles(): CSSResultGroup {
    return [
      rowStyles,
      editorStyles,
      overflowStyles,
      indentStyle,
      css`
        h4 {
          color: var(--ha-color-text-secondary);
        }
        h4 {
          margin-bottom: 8px;
        }
        .run-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .run-result {
          font-size: var(--ha-font-size-s, 0.875rem);
          overflow-wrap: anywhere;
          min-width: 0;
        }
        .run-result.success {
          color: var(--ha-color-on-success-normal, var(--success-color));
        }
        .run-result.danger {
          color: var(--ha-color-on-danger-normal, var(--error-color));
        }
        .option-chip {
          display: inline-block;
          margin-inline-end: var(--ha-space-2);
          padding: 0 var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          font-size: var(--ha-font-size-s, 0.875rem);
          font-weight: var(--ha-font-weight-medium);
          background: var(--ha-color-fill-primary-quiet-resting);
          color: var(--primary-text-color);
        }
        .option-chip-1 {
          background: var(--ha-color-fill-success-quiet-resting);
        }
        .option-chip-2 {
          background: var(--ha-color-fill-warning-quiet-resting);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-option-row": HaAutomationOptionRow;
  }
}
