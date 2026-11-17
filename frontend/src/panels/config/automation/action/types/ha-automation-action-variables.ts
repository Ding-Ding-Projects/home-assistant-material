import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { transferObjectDrafts } from "../../../../../common/object-editor/object-model";
import "../../../../../components/action-editors/ha-automation-options-editor";
import type { VariablesAction } from "../../../../../data/script";
import type { HomeAssistant } from "../../../../../types";
import type { ActionElement } from "../ha-automation-action-row";

/** Visual editor for the "define variables" action: one row per variable. */
@customElement("ha-automation-action-variables")
export class HaVariablesAction extends LitElement implements ActionElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public action!: VariablesAction;

  @property({ type: Boolean }) public disabled = false;

  public static get defaultConfig(): VariablesAction {
    return { variables: {} };
  }

  protected render() {
    return html`<ha-automation-options-editor
      .hass=${this.hass}
      .label=${this.hass.localize(
        "ui.panel.config.automation.editor.actions.type.variables.label"
      )}
      .value=${this.action.variables}
      .disabled=${this.disabled}
      .draftOwner=${this.action}
      .draftKey=${"variables"}
      @value-changed=${this._changed}
    ></ha-automation-options-editor>`;
  }

  private _changed(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    ev.stopPropagation();
    if (this.disabled) return;
    // Other keys on the action, such as the alias, are kept as they are.
    const value = { ...this.action, variables: ev.detail.value };
    transferObjectDrafts(this.action, value);
    fireEvent(this, "value-changed", { value });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-action-variables": HaVariablesAction;
  }
}
