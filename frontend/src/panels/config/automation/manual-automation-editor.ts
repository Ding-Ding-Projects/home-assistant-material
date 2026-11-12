import type { HassEntity } from "home-assistant-js-websocket";
import { load, YAML11_SCHEMA } from "js-yaml";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import {
  any,
  array,
  assert,
  assign,
  object,
  optional,
  string,
  union,
} from "superstruct";
import { ensureArray } from "../../../common/array/ensure-array";
import { canOverrideAlphanumericInput } from "../../../common/dom/can-override-input";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-markdown";
import "../../../components/starting-points/ha-starting-points";
import type { StartingPointSelectedDetail } from "../../../components/starting-points/ha-starting-points";
import {
  automationConfigForStartingPoint,
  automationStartingPoints,
  AUTOMATION_STARTING_POINT_HEADING_KEY,
} from "../../../components/starting-points/automation-starting-points";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import type {
  AutomationConfig,
  Condition,
  ManualAutomationConfig,
  SidebarConfig,
  Trigger,
} from "../../../data/automation";
import {
  isCondition,
  isTrigger,
  normalizeAutomationConfig,
} from "../../../data/automation";
import { getActionType, type Action } from "../../../data/script";
import { showEditorToast } from "./editor-toast";
import "./ha-automation-status-bar";
import "./search/ha-automation-search-bar";
import "./action/ha-automation-action";
import type HaAutomationAction from "./action/ha-automation-action";
import "./condition/ha-automation-condition";
import type HaAutomationCondition from "./condition/ha-automation-condition";
import {
  ManualEditorMixin,
  PASTED_CONFIG_TOAST_ID,
} from "./ha-manual-editor-mixin";
import { showPasteReplaceDialog } from "./paste-replace-dialog/show-dialog-paste-replace";
import { getErrorMessage } from "./run-helpers";
import { manualEditorStyles } from "./styles";
import "./trigger/ha-automation-trigger";
import {
  cleanupRemovedGeneratedTriggerReferences,
  getExplicitTriggerIds,
  isGeneratedTriggerId,
  stripGeneratedTriggerIds,
} from "./trigger/automation-trigger-id";

const baseConfigStruct = object({
  alias: optional(string()),
  description: optional(string()),
  triggers: optional(array(any())),
  conditions: optional(array(any())),
  actions: optional(array(any())),
  mode: optional(string()),
  max_exceeded: optional(string()),
  id: optional(string()),
  variables: optional(object()),
  trigger_variables: optional(object()),
});

const automationConfigStruct = union([
  assign(baseConfigStruct, object({ triggers: array(any()) })),
  assign(baseConfigStruct, object({ conditions: array(any()) })),
  assign(baseConfigStruct, object({ actions: array(any()) })),
]);

@customElement("manual-automation-editor")
export class HaManualAutomationEditor extends ManualEditorMixin<ManualAutomationConfig>(
  LitElement
) {
  @property({ attribute: false }) public stateObj?: HassEntity;

  @queryAll("ha-automation-action, ha-automation-condition")
  protected collapsableElements?: NodeListOf<
    HaAutomationAction | HaAutomationCondition
  >;

  @state() private _toggleError?: string;

  @state() private _toggling = false;

  private async _toggleEnabled(ev: Event) {
    const toggle = ev.currentTarget as HaSwitch;
    const checked = toggle.checked;
    if (!this.stateObj || this._toggling) {
      return;
    }
    this._toggleError = undefined;
    this._toggling = true;
    try {
      await this.hass.callService(
        "automation",
        checked ? "turn_on" : "turn_off",
        { entity_id: this.stateObj.entity_id }
      );
    } catch (err: unknown) {
      // The switch moved before the call; put it back to the real state.
      toggle.checked = !checked;
      this._toggleError = this.hass.localize(
        "ui.panel.config.automation.editor.status_bar.enabled_changed_failed",
        { message: getErrorMessage(err) }
      );
    } finally {
      this._toggling = false;
    }
  }

  protected renderContent() {
    const showSwitch = !!this.stateObj && this.stateObj.state !== "unavailable";
    return html`
      <div class="title-row">
        ${
          this.config.alias
            ? html`<h1 class="page-title">${this.config.alias}</h1>`
            : nothing
        }
        ${
          showSwitch
            ? html`<ha-switch
                class="enabled-switch"
                .checked=${this.stateObj!.state === "on"}
                .disabled=${this.disabled || this._toggling}
                aria-label=${this.hass.localize(
                  "ui.panel.config.automation.editor.status_bar.enabled_switch"
                )}
                @change=${this._toggleEnabled}
              ></ha-switch>`
            : nothing
        }
      </div>
      ${
        this._toggleError
          ? html`<p class="toggle-error" role="alert">${this._toggleError}</p>`
          : nothing
      }
      ${
        this.config.description
          ? html`<ha-markdown
              class="description"
              breaks
              .content=${this.config.description}
            ></ha-markdown>`
          : nothing
      }
      ${
        this._isEmpty()
          ? html`<ha-starting-points
              class="starting-points"
              .heading=${this.hass.localize(
                AUTOMATION_STARTING_POINT_HEADING_KEY as any
              )}
              .items=${automationStartingPoints(this.hass.localize)}
              @starting-point-selected=${this._startingPointSelected}
            ></ha-starting-points>`
          : nothing
      }
      <ha-automation-search-bar .hass=${this.hass}></ha-automation-search-bar>
      <section class="section">
        <div class="header">
          <h2 id="triggers-heading" class="name">
            <span class="chip chip-when"
              >${this.hass.localize(
                "ui.panel.config.automation.editor.triggers.header"
              )}</span
            >
            <span class="section-title"
              >${this.hass.localize(
                "ui.panel.config.automation.editor.triggers.section_title"
              )}</span
            >
          </h2>
        </div>
        ${
          !ensureArray(this.config.triggers)?.length
            ? html`<p>
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.triggers.description"
                )}
              </p>`
            : nothing
        }

        <ha-automation-trigger
          role="region"
          aria-labelledby="triggers-heading"
          .triggers=${this.config.triggers || []}
          .highlightedTriggers=${this.pastedConfig?.triggers}
          @value-changed=${this._triggerChanged}
          .hass=${this.hass}
          .editorDirty=${this.dirty}
          .disabled=${this.disabled || this.saving}
          .narrow=${this.narrow}
          @open-sidebar=${this.openSidebar}
          @request-close-sidebar=${this.triggerCloseSidebar}
          @close-sidebar=${this.handleCloseSidebar}
          root
          sidebar
        ></ha-automation-trigger>
      </section>

      <section class="section">
        <div class="header">
          <h2 id="conditions-heading" class="name">
            <span class="chip chip-if"
              >${this.hass.localize(
                "ui.panel.config.automation.editor.conditions.header"
              )}</span
            >
            <span class="section-title"
              >${this.hass.localize(
                "ui.panel.config.automation.editor.conditions.section_title"
              )}</span
            >
            <span class="small"
              >(${this.hass.localize("ui.common.optional")})</span
            >
          </h2>
        </div>
        ${
          !ensureArray(this.config.conditions)?.length
            ? html`<p>
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.conditions.description",
                  { user: this.hass.user?.name || "Alice" }
                )}
              </p>`
            : nothing
        }

        <ha-automation-condition
          role="region"
          aria-labelledby="conditions-heading"
          .conditions=${this.config.conditions || []}
          .highlightedConditions=${this.pastedConfig?.conditions}
          @value-changed=${this._conditionChanged}
          .hass=${this.hass}
          .editorDirty=${this.dirty}
          .disabled=${this.disabled || this.saving}
          .narrow=${this.narrow}
          @open-sidebar=${this.openSidebar}
          @request-close-sidebar=${this.triggerCloseSidebar}
          @close-sidebar=${this.handleCloseSidebar}
          root
          sidebar
        ></ha-automation-condition>
      </section>

      <section class="section">
        <div class="header">
          <h2 id="actions-heading" class="name">
            <span class="chip chip-do"
              >${this.hass.localize(
                "ui.panel.config.automation.editor.actions.header"
              )}</span
            >
            <span class="section-title"
              >${this.hass.localize(
                "ui.panel.config.automation.editor.actions.section_title"
              )}</span
            >
          </h2>
        </div>
        ${
          !ensureArray(this.config.actions)?.length
            ? html`<p>
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.actions.description"
                )}
              </p>`
            : nothing
        }

        <ha-automation-action
          role="region"
          aria-labelledby="actions-heading"
          .actions=${this.config.actions || []}
          .highlightedActions=${this.pastedConfig?.actions}
          @value-changed=${this._actionChanged}
          @open-sidebar=${this.openSidebar}
          @request-close-sidebar=${this.triggerCloseSidebar}
          @close-sidebar=${this.handleCloseSidebar}
          .hass=${this.hass}
          .editorDirty=${this.dirty}
          .narrow=${this.narrow}
          .disabled=${this.disabled || this.saving}
          root
          sidebar
        ></ha-automation-action>
      </section>
      <ha-automation-status-bar
        .hass=${this.hass}
        .config=${this.config}
        .dirty=${this.dirty}
      ></ha-automation-status-bar>
    `;
  }

  protected saveConfig() {
    fireEvent(this, "save-automation");
  }

  /** True only when nothing has been added yet and the editor can be edited. */
  private _isEmpty(): boolean {
    return (
      !this.disabled &&
      !this.saving &&
      !ensureArray(this.config.triggers)?.length &&
      !ensureArray(this.config.conditions)?.length &&
      !ensureArray(this.config.actions)?.length
    );
  }

  private _startingPointSelected(ev: CustomEvent<StartingPointSelectedDetail>) {
    ev.stopPropagation();
    // Never overwrite content: choosing does nothing once anything exists.
    if (!this._isEmpty()) {
      return;
    }
    const chosen = automationConfigForStartingPoint(
      ev.detail.id,
      this.hass.localize
    );
    if (!chosen) {
      return;
    }
    this.resetPastedConfig();
    fireEvent(this, "value-changed", {
      value: {
        ...this.config!,
        alias: this.config.alias || chosen.alias,
        triggers: chosen.triggers as unknown as Trigger[],
        actions: chosen.actions as unknown as Action[],
      },
    });
  }

  private _triggerChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this.resetPastedConfig();
    fireEvent(this, "value-changed", {
      value: { ...this.config!, triggers: ev.detail.value as Trigger[] },
    });
  }

  private _conditionChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this.resetPastedConfig();
    fireEvent(this, "value-changed", {
      value: {
        ...this.config!,
        conditions: ev.detail.value as Condition[],
      },
    });
  }

  private _actionChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this.resetPastedConfig();
    fireEvent(this, "value-changed", {
      value: { ...this.config!, actions: ev.detail.value as Action[] },
    });
  }

  protected handlePaste = async (ev: ClipboardEvent) => {
    if (!canOverrideAlphanumericInput(ev.composedPath())) {
      return;
    }

    const paste = ev.clipboardData?.getData("text");
    if (!paste) {
      return;
    }

    let loaded: any;
    try {
      loaded = load(paste, { schema: YAML11_SCHEMA });
    } catch (_err: any) {
      showEditorToast(this, {
        message: this.hass.localize(
          "ui.panel.config.automation.editor.paste_invalid_yaml"
        ),
        duration: 4000,
        dismissable: true,
      });
      return;
    }

    if (!loaded || typeof loaded !== "object") {
      return;
    }

    let config = loaded;

    if ("automation" in config) {
      config = config.automation;
      if (Array.isArray(config)) {
        config = config[0];
      }
    }

    // If an object can be ambiguously an action or an automation, check for
    // toplevel automation keywords to disqualify it
    function isQualifiedAction(cfg): boolean {
      const type = getActionType(cfg);
      if (type === "variables") {
        if (
          [
            "trigger",
            "triggers",
            "condition",
            "conditions",
            "action",
            "actions",
          ].some((key) => key in cfg)
        ) {
          return false;
        }
      }
      return type !== "unknown";
    }

    if (Array.isArray(config)) {
      if (config.length === 1) {
        config = config[0];
      } else {
        const newConfig: AutomationConfig = {
          triggers: [],
          conditions: [],
          actions: [],
        };
        let found = false;
        config.forEach((cfg: any) => {
          if (isTrigger(cfg)) {
            found = true;
            (newConfig.triggers as Trigger[]).push(cfg);
          }
          if (isCondition(cfg)) {
            found = true;
            (newConfig.conditions as Condition[]).push(cfg);
          }
          if (isQualifiedAction(cfg)) {
            found = true;
            (newConfig.actions as Action[]).push(cfg);
          }
        });
        if (found) {
          config = newConfig;
        }
      }
    }

    if (isTrigger(config)) {
      config = { triggers: [config] };
    }
    if (isCondition(config)) {
      config = { conditions: [config] };
    }
    if (isQualifiedAction(config)) {
      config = { actions: [config] };
    }

    let normalized: AutomationConfig;

    try {
      normalized = normalizeAutomationConfig(config);
    } catch (_err: any) {
      return;
    }

    try {
      assert(normalized, automationConfigStruct);
    } catch (_err: any) {
      showEditorToast(this, {
        message: this.hass.localize(
          "ui.panel.config.automation.editor.paste_invalid_config"
        ),
        duration: 4000,
        dismissable: true,
      });
      return;
    }

    if (normalized) {
      ev.preventDefault();

      const keysPresent = Object.keys(normalized).filter(
        (key) => ensureArray(normalized[key]).length
      );

      if (
        keysPresent.length === 1 &&
        ["triggers", "conditions", "actions"].includes(keysPresent[0])
      ) {
        // if only one type of element is pasted, insert under the currently active item
        if (this.tryInsertAfterSelected(normalized[keysPresent[0]])) {
          this.showPastedToastWithUndo();
          return;
        }
      }

      if (
        this.dirty ||
        ensureArray(this.config.triggers)?.length ||
        ensureArray(this.config.conditions)?.length ||
        ensureArray(this.config.actions)?.length
      ) {
        // ask if they want to append or replace if we have existing config or there are unsaved changes
        const result = await new Promise<boolean>((resolve) => {
          showPasteReplaceDialog(this, {
            domain: "automation",
            pastedConfig: normalized,
            onClose: () => resolve(false),
            onAppend: () => {
              this._appendToExistingConfig(normalized);
              resolve(false);
            },
            onReplace: () => resolve(true),
          });
        });

        if (!result) {
          return;
        }
      }

      // replace the config completely
      this.replaceExistingConfig(normalized);
    }
  };

  private _appendToExistingConfig(config: ManualAutomationConfig) {
    this.pastedConfig = config;
    // make a copy otherwise we will modify the original config
    // which breaks the (referenced) config used for storing in undo stack
    const workingCopy: ManualAutomationConfig = { ...this.config };

    if (!workingCopy) {
      return;
    }
    ["variables", "trigger_variables"].forEach((key) => {
      if (key in config) {
        workingCopy[key] = { ...workingCopy[key], ...config[key] };
      }
    });

    let appendedConfig = config;
    if ("triggers" in config) {
      const pastedTriggers = ensureArray(config.triggers);
      // Strip generated trigger IDs and remove matching references from pasted
      // conditions/actions so they do not dangle against the stripped triggers.
      const strippedIds = new Set(
        getExplicitTriggerIds(pastedTriggers).filter(isGeneratedTriggerId)
      );
      appendedConfig = strippedIds.size
        ? cleanupRemovedGeneratedTriggerReferences(config, strippedIds)
        : config;
      workingCopy.triggers = ensureArray(workingCopy.triggers || []).concat(
        pastedTriggers.map((t) => stripGeneratedTriggerIds(t))
      );
    }
    if ("conditions" in appendedConfig) {
      workingCopy.conditions = ensureArray(workingCopy.conditions || []).concat(
        ensureArray(appendedConfig.conditions)
      );
    }
    if ("actions" in appendedConfig) {
      workingCopy.actions = ensureArray(workingCopy.actions || []).concat(
        ensureArray(appendedConfig.actions)
      ) as Action[];
    }

    this.showPastedToastWithUndo();

    fireEvent(this, "value-changed", {
      value: {
        ...workingCopy!,
      },
    });
  }

  protected showPastedToastWithUndo() {
    showEditorToast(this, {
      id: PASTED_CONFIG_TOAST_ID,
      message: this.hass.localize(
        "ui.panel.config.automation.editor.paste_toast_message"
      ),
      duration: 4000,
      action: {
        text: this.hass.localize("ui.common.undo"),
        action: () => {
          fireEvent(this, "undo-change");

          this.pastedConfig = undefined;
        },
      },
    });
  }

  static get styles(): CSSResultGroup {
    return [
      manualEditorStyles,
      css`
        p {
          margin-top: 0;
        }
        .starting-points {
          margin-bottom: var(--ha-space-4);
        }
        .header {
          display: flex;
          align-items: center;
        }
        .title-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
        }
        .enabled-switch {
          min-height: 44px;
          min-width: 44px;
          transition: opacity var(--ha-animation-duration-fast, 150ms);
        }
        .toggle-error {
          animation: ha-automation-enter
            var(--ha-animation-duration-normal, 250ms)
            var(--ha-automation-ease-enter) backwards;
          color: var(--ha-color-on-danger-normal, var(--error-color));
        }
        .page-title {
          margin: var(--ha-space-2) 0 var(--ha-space-1);
          font-size: var(--ha-font-size-3xl, 1.75rem);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed, 1.2);
        }
        .section {
          background: var(
            --ha-color-surface-container,
            var(--card-background-color)
          );
          border-radius: var(--ha-border-radius-3xl, 28px);
          padding: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
        }
        .section p {
          margin-bottom: var(--ha-space-2);
        }
        .header .name {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-l, 1.125rem);
          font-weight: var(--ha-font-weight-normal);
          flex: 1;
          margin: 0 0 var(--ha-space-3);
        }
        .chip {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          font-size: var(--ha-font-size-s, 0.875rem);
          font-weight: var(--ha-font-weight-medium);
          background: var(
            --ha-color-fill-primary-quiet-resting,
            var(--secondary-background-color)
          );
          color: var(--primary-text-color);
        }
        .chip-when {
          background: var(
            --ha-color-fill-primary-quiet-resting,
            var(--secondary-background-color)
          );
        }
        .chip-if {
          background: var(--secondary-background-color);
        }
        .chip-do {
          background: var(
            --ha-color-fill-success-quiet-resting,
            var(--secondary-background-color)
          );
        }
        .section-title {
          font-size: var(--ha-font-size-l, 1.125rem);
        }
        .header .small {
          font-size: small;
          font-weight: var(--ha-font-weight-normal);
          line-height: 0;
        }

        .description {
          margin-top: 16px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "manual-automation-editor": HaManualAutomationEditor;
  }

  interface HASSDomEvents {
    "open-sidebar": SidebarConfig;
    "request-close-sidebar": undefined;
    "close-sidebar": undefined;
  }
}
