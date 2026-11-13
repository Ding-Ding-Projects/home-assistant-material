import { mdiClose } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { array, assert, object, optional, string, type } from "superstruct";
import { deepEqual } from "../../common/util/deep-equal";
import "../../components/ha-button";
import "../../components/ha-yaml-editor";
import type { CodeEditorStatus } from "../../components/ha-code-editor";
import type { HaYamlEditor } from "../../components/ha-yaml-editor";
import "./editor/hui-entity-swap-panel";
import type { EntitySwapRequest } from "./editor/hui-entity-swap-panel";
import "../../components/ha-icon-button";
import "../../components/ha-top-app-bar-fixed";
import type { LovelaceRawConfig } from "../../data/lovelace/config/types";
import { isStrategyDashboard } from "../../data/lovelace/config/types";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import { DirtyStateProviderMixin } from "../../mixins/dirty-state-provider-mixin";
import { KeyboardShortcutMixin } from "../../mixins/keyboard-shortcut-mixin";
import { PreventUnsavedMixin } from "../../mixins/prevent-unsaved-mixin";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { Lovelace } from "./types";

const lovelaceStruct = type({
  title: optional(string()),
  views: array(object()),
});

const strategyStruct = type({
  strategy: type({
    type: string(),
  }),
});

@customElement("hui-editor")
class LovelaceFullConfigEditor extends DirtyStateProviderMixin<string>()(
  PreventUnsavedMixin(KeyboardShortcutMixin(LitElement))
) {
  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public lovelace?: Lovelace;

  @property({ attribute: false }) public closeEditor?: () => void;

  @state() private _saving?: boolean;

  private _config?: LovelaceRawConfig;

  @state() private _yamlError?: string;

  @state() private _status?: CodeEditorStatus;

  @state() private _swapOpen = false;

  @state() private _text = "";

  private _statusChanged(ev: CustomEvent<CodeEditorStatus>) {
    ev.stopPropagation();
    this._status = ev.detail;
  }

  private _goToLine() {
    this.yamlEditor._codeEditor?.openGoToLine();
  }

  private _toggleSwap() {
    this._swapOpen = !this._swapOpen;
  }

  private _closeSwap() {
    this._swapOpen = false;
    this.yamlEditor.focus();
  }

  /** The entity ID at the cursor, used to start a swap. */
  private _entityUnderCursor(): string {
    const view = this.yamlEditor?.codemirror;
    if (!view) {
      return "";
    }
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const column = view.state.selection.main.head - line.from;
    for (const match of line.text.matchAll(/[a-z_]+\.[a-z0-9_]+/g)) {
      const start = match.index ?? 0;
      if (column >= start && column <= start + match[0].length) {
        return match[0];
      }
    }
    return "";
  }

  private _applySwap(ev: CustomEvent<EntitySwapRequest>) {
    ev.stopPropagation();
    const { matches, replacement } = ev.detail;
    // One transaction: every offset refers to the document before the swap.
    this.yamlEditor._codeEditor?.applyChanges(
      matches.map((m) => ({ from: m.from, to: m.to, insert: replacement }))
    );
  }

  protected render(): TemplateResult | undefined {
    return html`
      <ha-top-app-bar-fixed no-page-tools .narrow=${this.narrow}>
        <ha-icon-button
          slot="navigationIcon"
          .path=${mdiClose}
          @click=${this._closeEditor}
          .label=${this.hass!.localize("ui.common.close")}
        ></ha-icon-button>
        <div slot="title">
          ${this.hass!.localize("ui.panel.lovelace.editor.raw_editor.header")}
        </div>
        <div
          slot="actionItems"
          class="save-button
              ${classMap({
            saved: this._saving === false || this.isDirtyState,
          })}"
        >
          ${
            this.isDirtyState
              ? this.hass!.localize(
                  "ui.panel.lovelace.editor.raw_editor.unsaved_changes"
                )
              : this.hass!.localize("ui.panel.lovelace.editor.raw_editor.saved")
          }
        </div>
        <ha-button
          slot="actionItems"
          @click=${this._handleSave}
          .disabled=${!this.isDirtyState}
          >${this.hass!.localize(
            "ui.panel.lovelace.editor.raw_editor.save"
          )}</ha-button
        >
        <div class="content">
          ${
            this._swapOpen
              ? html`<hui-entity-swap-panel
                  .hass=${this.hass}
                  .text=${this._text}
                  .initialFrom=${this._entityUnderCursor()}
                  @entity-swap=${this._applySwap}
                  @entity-swap-close=${this._closeSwap}
                ></hui-entity-swap-panel>`
              : nothing
          }
          <ha-yaml-editor
            @value-changed=${this._yamlChanged}
            @editor-save=${this._handleSave}
            @editor-status=${this._statusChanged}
            disable-fullscreen
          >
          </ha-yaml-editor>
          <div class="status-bar">
            <span class="chip">
              ${this.hass.localize(
                "ui.panel.lovelace.editor.raw_editor.status_position",
                {
                  line: this._status?.line ?? 1,
                  column: this._status?.column ?? 1,
                }
              )}
            </span>
            <span class="chip ${this._yamlError ? "invalid" : "valid"}">
              ${this.hass.localize(
                this._yamlError
                  ? "ui.panel.lovelace.editor.raw_editor.status_invalid"
                  : "ui.panel.lovelace.editor.raw_editor.status_valid"
              )}
            </span>
            ${
              this._status?.matches !== undefined
                ? html`<span class="chip" aria-live="polite">
                    ${
                      this._status.currentMatch
                        ? this.hass.localize(
                            "ui.panel.lovelace.editor.raw_editor.status_match_of",
                            {
                              current: this._status.currentMatch,
                              count: this._status.matches,
                            }
                          )
                        : this.hass.localize(
                            "ui.panel.lovelace.editor.raw_editor.status_matches",
                            { count: this._status.matches }
                          )
                    }
                  </span>`
                : nothing
            }
            <ha-button appearance="plain" size="s" @click=${this._goToLine}>
              ${this.hass.localize("ui.components.yaml-editor.go_to_line.label")}
            </ha-button>
            <ha-button appearance="plain" size="s" @click=${this._toggleSwap}>
              ${this.hass.localize(
                "ui.panel.lovelace.editor.raw_editor.swap_entity.open"
              )}
            </ha-button>
          </div>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._setValue();
    this.yamlEditor.focus();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    const oldLovelace = changedProps.get("lovelace") as Lovelace | undefined;
    if (
      !this._saving &&
      oldLovelace &&
      this.lovelace &&
      oldLovelace.rawConfig !== this.lovelace.rawConfig &&
      !deepEqual(oldLovelace.rawConfig, this.lovelace.rawConfig)
    ) {
      this._setValue();
    }
  }

  private _setValue() {
    this.yamlEditor.setValue(this.lovelace!.rawConfig);
    // Baseline the dirty check against the loaded YAML so it resets on save.
    this._initDirtyTracking(
      { type: "custom", compare: (a, b) => a === b },
      this.yamlEditor.yaml
    );
    this._text = this.yamlEditor.yaml;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          --code-mirror-height: 100%;
          --app-header-background-color: var(
            --app-header-edit-background-color,
            #455a64
          );
          --app-header-text-color: var(--app-header-edit-text-color, #fff);
        }

        .content {
          height: calc(100vh - var(--header-height));
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }

        hui-entity-swap-panel {
          flex: none;
          max-height: 50%;
          overflow-y: auto;
        }

        .status-bar {
          flex: none;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1) var(--ha-space-3);
        }

        .status-bar .chip {
          padding: 2px var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .status-bar .chip.valid {
          background: var(
            --ha-color-success-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-success-container,
            var(--primary-text-color)
          );
        }

        .status-bar .chip.invalid {
          background: var(
            --ha-color-error-container,
            var(--secondary-background-color)
          );
          color: var(--ha-color-on-error-container, var(--primary-text-color));
        }

        .comments {
          font-size: var(--ha-font-size-l);
        }

        ha-yaml-editor {
          display: flex;
          flex-direction: column;
          /* Take the space the status bar leaves, rather than the full height
             of the content, which pushed the bar past the window bottom. */
          flex: 1 1 0;
          height: auto;
          min-height: 0;
        }

        .save-button {
          opacity: 0;
          font-size: var(--ha-font-size-m);
          padding: 0px 10px;
        }

        .saved {
          opacity: 1;
        }
      `,
    ];
  }

  private _yamlChanged(ev: CustomEvent) {
    this._config = ev.detail.isValid ? ev.detail.value : undefined;
    this._yamlError = ev.detail.errorMsg;
    this._text = this.yamlEditor.yaml;
    this._updateDirtyState(this.yamlEditor.yaml);
  }

  /**
   * Also closes the editor: it is a panel state rather than a route, so leaving
   * by a navigation never reaches `_closeEditor` and the panel can be cached.
   */
  private async _confirmDiscard(addHistory: boolean): Promise<boolean> {
    if (
      this.isDirtyState &&
      !(await showConfirmationDialog(this, {
        addHistory,
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.confirm_unsaved_changes"
        ),
        dismissText: this.hass!.localize("ui.common.stay"),
        confirmText: this.hass!.localize("ui.common.leave"),
      }))
    ) {
      return false;
    }

    this._markDirtyStateClean();
    this.closeEditor?.();
    return true;
  }

  protected async promptDiscardChanges(): Promise<boolean> {
    return this._confirmDiscard(false);
  }

  private async _closeEditor() {
    await this._confirmDiscard(true);
  }

  protected supportedShortcutsInInput(): SupportedShortcuts {
    return { Y: () => this._closeEditor() };
  }

  private async _resetConfig() {
    try {
      await this.lovelace!.deleteConfig();
    } catch (err: any) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.error_save_yaml",
          { error: err }
        ),
      });
      return;
    }
    this._markDirtyStateClean();
    if (this.closeEditor) {
      this.closeEditor();
    }
  }

  private async _handleSave() {
    this._saving = true;

    if (!this.yamlEditor.yaml) {
      showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.confirm_reset_config_title"
        ),
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.confirm_reset_config_text"
        ),
        confirmText: this.hass.localize("ui.common.reset"),
        dismissText: this.hass.localize("ui.common.cancel"),
        confirm: () => this._resetConfig(),
        destructive: true,
      });
      return;
    }

    if (this._yamlError) {
      showAlertDialog(this, {
        text: this._yamlError,
      });
      this._saving = false;
      return;
    }

    if (this.yamlEditor.hasComments) {
      const saveWithoutComments = await showConfirmationDialog(this, {
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.confirm_unsaved_comments"
        ),
        confirmText: this.hass.localize("ui.replaced_dialogs.save_anyway"),
        dismissText: this.hass.localize("ui.common.cancel"),
      });
      if (!saveWithoutComments) {
        this._saving = false;
        return;
      }
    }

    const config: LovelaceRawConfig = this._config!;

    try {
      if (isStrategyDashboard(config)) {
        assert(config, strategyStruct);
      } else {
        assert(config, lovelaceStruct);
      }
    } catch (err: any) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.error_invalid_config",
          { error: err }
        ),
      });
      return;
    }
    // @ts-ignore
    if (config.resources) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.resources_moved"
        ),
      });
    }
    try {
      await this.lovelace!.saveConfig(config);
    } catch (err: any) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.lovelace.editor.raw_editor.error_save_yaml",
          { error: err }
        ),
      });
    }
    this._markDirtyStateClean();
    this._saving = false;
  }

  private get yamlEditor(): HaYamlEditor {
    return this.shadowRoot!.querySelector("ha-yaml-editor")! as HaYamlEditor;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-editor": LovelaceFullConfigEditor;
  }
}
