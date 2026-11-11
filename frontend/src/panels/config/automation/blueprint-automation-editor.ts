import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/editor/ha-editor-save-bar";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-markdown";
import type { BlueprintAutomationConfig } from "../../../data/automation";
import { fetchBlueprints } from "../../../data/blueprint";
import {
  dirtyStateContext,
  type DirtyStateContext,
} from "../../../data/context/dirty-state";
import { HaBlueprintGenericEditor } from "../blueprint/blueprint-generic-editor";

@customElement("blueprint-automation-editor")
export class HaBlueprintAutomationEditor extends HaBlueprintGenericEditor {
  @property({ attribute: false }) public config!: BlueprintAutomationConfig;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @property({ type: Boolean }) public saving = false;

  @consume({ context: dirtyStateContext, subscribe: true })
  @state()
  private _dirtyState?: DirtyStateContext;

  protected get _config(): BlueprintAutomationConfig {
    return this.config;
  }

  protected render() {
    return html`
      <slot name="alerts"></slot>
      ${
        this.stateObj?.state === "off"
          ? html`
              <ha-alert alert-type="info">
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.disabled"
                )}
                <ha-button
                  appearance="plain"
                  size="s"
                  slot="action"
                  @click=${this._enable}
                >
                  ${this.hass.localize(
                    "ui.panel.config.automation.editor.enable"
                  )}
                </ha-button>
              </ha-alert>
            `
          : ""
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
      ${this.renderCard()}

      <ha-editor-save-bar
        .hass=${this.hass}
        .dirty=${!this.disabled && (this._dirtyState?.isDirty ?? false)}
        .saving=${this.saving}
        .disabled=${this.disabled}
        show-shortcut
        @save-bar-save=${this._saveAutomation}
      ></ha-editor-save-bar>
    `;
  }

  private _saveAutomation() {
    fireEvent(this, "save-automation");
  }

  protected async _getBlueprints() {
    this._blueprints = await fetchBlueprints(this.hass.callWS, "automation");
  }

  private async _enable(): Promise<void> {
    if (!this.hass || !this.stateObj) {
      return;
    }
    await this.hass.callService("automation", "turn_on", {
      entity_id: this.stateObj.entity_id,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      HaBlueprintGenericEditor.styles,
      css`
        :host {
          position: relative;
          height: 100%;
          min-height: calc(
            100vh -
              134px - var(--safe-area-inset-top, 0px) - var(
                --safe-area-inset-bottom,
                0px
              )
          );
          min-height: calc(
            100dvh -
              134px - var(--safe-area-inset-top, 0px) - var(
                --safe-area-inset-bottom,
                0px
              )
          );
        }
      `,
    ];
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "blueprint-automation-editor": HaBlueprintAutomationEditor;
  }
}
