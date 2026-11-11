import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/editor/ha-editor-save-bar";
import "../../../components/ha-markdown";
import { fetchBlueprints } from "../../../data/blueprint";
import {
  dirtyStateContext,
  type DirtyStateContext,
} from "../../../data/context/dirty-state";
import type { BlueprintScriptConfig } from "../../../data/script";
import { HaBlueprintGenericEditor } from "../blueprint/blueprint-generic-editor";

@customElement("blueprint-script-editor")
export class HaBlueprintScriptEditor extends HaBlueprintGenericEditor {
  @property({ attribute: false }) public config!: BlueprintScriptConfig;

  @property({ type: Boolean }) public saving = false;

  @consume({ context: dirtyStateContext, subscribe: true })
  @state()
  private _dirtyState?: DirtyStateContext;

  protected get _config(): BlueprintScriptConfig {
    return this.config;
  }

  protected render() {
    return html`
      <slot name="alerts"></slot>
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
        @save-bar-save=${this._saveScript}
      ></ha-editor-save-bar>
    `;
  }

  private _saveScript() {
    fireEvent(this, "save-script");
  }

  protected async _getBlueprints() {
    this._blueprints = await fetchBlueprints(this.hass.callWS, "script");
  }

  static get styles(): CSSResultGroup {
    return [
      HaBlueprintGenericEditor.styles,
      css`
        :host {
          position: relative;
          height: 100%;
          min-height: calc(100vh - 85px);
          min-height: calc(100dvh - 85px);
        }
      `,
    ];
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "blueprint-script-editor": HaBlueprintScriptEditor;
  }
}
