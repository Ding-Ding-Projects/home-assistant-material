import { mdiHelpCircleOutline, mdiPlay, mdiTransitConnection } from "@mdi/js";
import { load, YAML11_SCHEMA } from "js-yaml";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, queryAll } from "lit/decorators";
import memoizeOne from "memoize-one";
import {
  any,
  array,
  assert,
  enums,
  number,
  object,
  optional,
  string,
} from "superstruct";
import { ensureArray } from "../../../common/array/ensure-array";
import { canOverrideAlphanumericInput } from "../../../common/dom/can-override-input";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-icon-button";
import "../../../components/ha-markdown";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import {
  AUTOMATION_DEFAULT_MAX,
  AUTOMATION_DEFAULT_MODE,
} from "../../../data/automation";
import type { HomeAssistant, ToggleButton } from "../../../types";
import type {
  Action,
  Fields,
  ManualScriptConfig,
  ScriptConfig,
} from "../../../data/script";
import {
  getActionType,
  isMaxMode,
  MODES,
  normalizeScriptConfig,
} from "../../../data/script";
import { documentationUrl } from "../../../util/documentation-url";
import { showEditorToast } from "../automation/editor-toast";
import "../automation/action/ha-automation-action";
import type HaAutomationAction from "../automation/action/ha-automation-action";
import {
  ManualEditorMixin,
  PASTED_CONFIG_TOAST_ID,
} from "../automation/ha-manual-editor-mixin";
import { showPasteReplaceDialog } from "../automation/paste-replace-dialog/show-dialog-paste-replace";
import { manualEditorStyles, saveFabStyles } from "../automation/styles";
import "./ha-script-fields";
import type HaScriptFields from "./ha-script-fields";

const scriptConfigStruct = object({
  alias: optional(string()),
  description: optional(string()),
  sequence: optional(array(any())),
  icon: optional(string()),
  mode: optional(enums([typeof MODES])),
  max: optional(number()),
  fields: optional(object()),
  variables: optional(object()),
});

@customElement("manual-script-editor")
export class HaManualScriptEditor extends ManualEditorMixin<ScriptConfig>(
  LitElement
) {
  @query("ha-script-fields")
  private _scriptFields?: HaScriptFields;

  @queryAll("ha-automation-action, ha-script-fields")
  protected collapsableElements?: NodeListOf<
    HaAutomationAction | HaScriptFields
  >;

  @property({ attribute: false }) public scriptId: string | null = null;

  private _openFields = false;

  public addFields() {
    this._openFields = true;
    fireEvent(this, "value-changed", {
      value: {
        ...this.config,
        fields: {
          [this.hass.localize("ui.panel.config.script.editor.field.field") ||
          "field"]: {
            selector: {
              text: null,
            },
          },
        },
      },
    });
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (this._openFields && changedProps.has("config")) {
      this._openFields = false;
      this._scriptFields?.updateComplete.then(() =>
        this._scriptFields?.focusLastField()
      );
    }
  }

  protected renderContent() {
    const mode = this.config.mode || AUTOMATION_DEFAULT_MODE;
    const canRun = !!this.scriptId && !this.disabled;
    return html`
      <div class="title-block">
        <h1 class="title">
          ${
            this.disabled
              ? this.config.alias ||
                this.hass.localize("ui.panel.config.script.editor.default_name")
              : html`<button
                  type="button"
                  class="title-button"
                  title=${this.hass.localize(
                    "ui.panel.config.script.editor.board.rename_hint"
                  )}
                  @click=${this._renameClicked}
                >
                  ${
                    this.config.alias ||
                    this.hass.localize(
                      "ui.panel.config.script.editor.board.untitled"
                    )
                  }
                </button>`
          }
        </h1>
        ${
          this.config.description
            ? html`<ha-markdown
                class="description"
                breaks
                .content=${this.config.description}
              ></ha-markdown>`
            : nothing
        }
      </div>

      <div class="mode-row" role="group" aria-labelledby="mode-label">
        <span id="mode-label" class="mode-label">
          ${this.hass.localize("ui.panel.config.script.editor.board.mode_label")}
        </span>
        <ha-button-toggle-group
          .buttons=${this._modeButtons(this.hass.localize)}
          .active=${mode}
          .disabled=${this.disabled}
          size="s"
          @value-changed=${this._modeChanged}
        ></ha-button-toggle-group>
        ${
          isMaxMode(mode)
            ? html`<ha-input
                class="max-input"
                type="number"
                .label=${this.hass.localize(
                  `ui.panel.config.script.editor.board.max_${mode}`
                )}
                .value=${String(this.config.max ?? AUTOMATION_DEFAULT_MAX)}
                .disabled=${this.disabled}
                @input=${this._maxChanged}
              ></ha-input>`
            : nothing
        }
      </div>

      ${
        this.config.fields
          ? html`<section class="card" aria-labelledby="fields-heading">
              <div class="header">
                <span class="tag tag-ask">
                  ${this.hass.localize(
                    "ui.panel.config.script.editor.board.fields_tag"
                  )}
                </span>
                <h2 id="fields-heading" class="name">
                  ${this.hass.localize(
                    "ui.panel.config.script.editor.board.fields_title"
                  )}
                </h2>
                <ha-icon-button
                  .path=${mdiHelpCircleOutline}
                  .label=${this.hass.localize(
                    "ui.panel.config.script.editor.field.link_help_fields"
                  )}
                  href=${documentationUrl(
                    this.hass,
                    "/integrations/script/#fields"
                  )}
                  target="_blank"
                  rel="noreferrer"
                ></ha-icon-button>
              </div>
              <ha-script-fields
                .fields=${this.config.fields}
                .highlightedFields=${this.pastedConfig?.fields}
                @value-changed=${this._fieldsChanged}
                .hass=${this.hass}
                .disabled=${this.disabled}
                .narrow=${this.narrow}
                @open-sidebar=${this.openSidebar}
                @request-close-sidebar=${this.triggerCloseSidebar}
                @close-sidebar=${this.handleCloseSidebar}
              ></ha-script-fields>
            </section>`
          : nothing
      }

      <section class="card" aria-labelledby="sequence-heading">
        <div class="header">
          <span class="tag tag-do">
            ${this.hass.localize(
              "ui.panel.config.script.editor.board.actions_tag"
            )}
          </span>
          <h2 id="sequence-heading" class="name">
            ${this.hass.localize(
              "ui.panel.config.script.editor.board.actions_title"
            )}
          </h2>
        </div>
        <ha-automation-action
          .actions=${this.config.sequence || []}
          .highlightedActions=${this.pastedConfig?.sequence}
          @value-changed=${this._sequenceChanged}
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

      <div class="bottom-bar">
        <ha-button
          appearance="outlined"
          variant="neutral"
          .disabled=${!canRun}
          title=${
            this.scriptId
              ? ""
              : this.hass.localize(
                  "ui.panel.config.script.editor.board.run_unsaved"
                )
          }
          @click=${this._runClicked}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.script.editor.board.run_now")}
        </ha-button>
        ${
          this.scriptId
            ? html`<ha-button appearance="plain" @click=${this._traceClicked}>
                <ha-svg-icon
                  slot="start"
                  .path=${mdiTransitConnection}
                ></ha-svg-icon>
                ${this.hass.localize(
                  "ui.panel.config.script.editor.board.see_past_runs"
                )}
              </ha-button>`
            : nothing
        }
      </div>
    `;
  }

  private _modeButtons = memoizeOne(
    (localize: HomeAssistant["localize"]): ToggleButton[] =>
      MODES.map((mode) => ({
        value: mode,
        label: localize(`ui.panel.config.script.editor.board.mode_${mode}`),
      }))
  );

  private _renameClicked() {
    fireEvent(this, "rename-script");
  }

  private _runClicked() {
    fireEvent(this, "run-script");
  }

  private _traceClicked() {
    fireEvent(this, "show-script-trace");
  }

  private _modeChanged(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    const mode = ev.detail.value as (typeof MODES)[number];
    if (!mode || mode === (this.config.mode || AUTOMATION_DEFAULT_MODE)) {
      return;
    }
    const value: ScriptConfig = { ...this.config, mode };
    if (isMaxMode(mode)) {
      value.max = this.config.max || AUTOMATION_DEFAULT_MAX;
    } else {
      delete value.max;
    }
    fireEvent(this, "value-changed", { value });
  }

  private _maxChanged(ev: Event) {
    ev.stopPropagation();
    const max = Number((ev.target as HaInput).value);
    if (!Number.isFinite(max) || max < 1) {
      return;
    }
    fireEvent(this, "value-changed", {
      value: { ...this.config, max: Math.floor(max) },
    });
  }

  protected saveConfig() {
    fireEvent(this, "save-script");
  }

  private _fieldsChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this.resetPastedConfig();
    fireEvent(this, "value-changed", {
      value: { ...this.config!, fields: ev.detail.value as Fields },
    });
  }

  private _sequenceChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this.resetPastedConfig();
    fireEvent(this, "value-changed", {
      value: { ...this.config!, sequence: ev.detail.value as Action[] },
    });
  }

  protected handlePaste = async (ev: ClipboardEvent) => {
    // Ignore events on inputs/textareas
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
          "ui.panel.config.script.editor.paste_invalid_config"
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

    if ("script" in config) {
      config = config.script;
      if (Object.keys(config).length) {
        config = config[Object.keys(config)[0]];
      }
    }

    if (Array.isArray(config)) {
      if (config.length === 1) {
        config = config[0];
      } else {
        config = { sequence: config };
      }
    }

    const actionType = getActionType(config);
    if (
      !["sequence", "variables", "unknown"].includes(actionType) ||
      (actionType === "sequence" && "metadata" in config) ||
      (actionType === "variables" && !("sequence" in config))
    ) {
      config = { sequence: [config] };
    }

    let normalized: ScriptConfig | undefined;

    try {
      normalized = normalizeScriptConfig(config);
    } catch (_err: any) {
      return;
    }

    try {
      assert(normalized, scriptConfigStruct);
    } catch (_err: any) {
      showEditorToast(this, {
        message: this.hass.localize(
          "ui.panel.config.script.editor.paste_invalid_config"
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

      if (keysPresent.length === 1 && ["sequence"].includes(keysPresent[0])) {
        // if only one type of element is pasted, insert under the currently active item
        if (this.tryInsertAfterSelected(normalized[keysPresent[0]])) {
          this.showPastedToastWithUndo();
          return;
        }
      }

      if (
        this.dirty ||
        ensureArray(this.config.sequence)?.length ||
        Object.keys(this.config.fields || {}).length
      ) {
        const result = await new Promise<boolean>((resolve) => {
          showPasteReplaceDialog(this, {
            domain: "script",
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

  private _appendToExistingConfig(config: ScriptConfig) {
    this.pastedConfig = config;
    // make a copy otherwise we will modify the original config
    // which breaks the (referenced) config used for storing in undo stack
    const workingCopy: ManualScriptConfig = { ...this.config };

    if (!workingCopy) {
      return;
    }

    ["fields", "variables"].forEach((key) => {
      if (key in config) {
        workingCopy[key] = {
          ...workingCopy[key],
          ...config[key],
        };
      }
    });
    if ("sequence" in config) {
      workingCopy.sequence = ensureArray(workingCopy.sequence || []).concat(
        ensureArray(config.sequence)
      ) as Action[];
    }

    this.showPastedToastWithUndo();

    fireEvent(this, "value-changed", {
      value: {
        ...workingCopy,
      },
    });
  }

  protected showPastedToastWithUndo() {
    showEditorToast(this, {
      id: PASTED_CONFIG_TOAST_ID,
      message: this.hass.localize(
        "ui.panel.config.script.editor.paste_toast_message"
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
      saveFabStyles,
      manualEditorStyles,
      css`
        .title-block {
          margin-bottom: var(--ha-space-4);
        }
        .title {
          margin: 0;
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-normal);
          overflow-wrap: anywhere;
        }
        .title-button {
          all: unset;
          cursor: pointer;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          border-radius: var(--ha-border-radius-md);
        }
        .title-button:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .description {
          margin-top: var(--ha-space-1);
          color: var(--secondary-text-color);
        }
        .mode-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-4);
        }
        .mode-label {
          color: var(--secondary-text-color);
        }
        .max-input {
          width: 160px;
          max-width: 100%;
        }
        .card {
          padding: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          flex-wrap: wrap;
        }
        .header .name {
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
          margin: var(--ha-space-2) 0;
          flex: 1;
          min-width: 0;
        }
        .tag {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-text-color);
        }
        .tag-ask {
          background: var(--ha-color-fill-primary-quiet-resting);
        }
        .tag-do {
          background: var(--ha-color-fill-success-quiet-resting);
        }
        .bottom-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-8);
        }
        .bottom-bar ha-button,
        ha-button-toggle-group {
          min-height: 44px;
        }

        ha-icon-button {
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "manual-script-editor": HaManualScriptEditor;
  }
}
