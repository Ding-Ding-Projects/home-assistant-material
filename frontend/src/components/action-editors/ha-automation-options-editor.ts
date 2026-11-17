import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { HomeAssistant } from "../../types";
import "../ha-selector/ha-selector-object";

/**
 * A labelled name and value list for free-form options: event data, the
 * options of a trigger or condition without a field description, and
 * variables. Every entry is its own row, so nothing falls back to a code box.
 * The value is always a plain object, and keys it does not show are kept.
 */
@customElement("ha-automation-options-editor")
export class HaAutomationOptionsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public value?: Record<string, unknown>;

  @property() public label?: string;

  @property({ type: Boolean }) public disabled = false;

  /** Object that owns the editor's drafts, normally the edited config. */
  @property({ attribute: false }) public draftOwner?: object;

  @property({ attribute: false }) public draftKey = "$options";

  protected render() {
    return html`<ha-selector-object
      .hass=${this.hass}
      .selector=${{ object: {} }}
      .dictionaryOnly=${true}
      .required=${true}
      .disabled=${this.disabled}
      .label=${this.label}
      .value=${this.value}
      .context=${{ draft_owner: this.draftOwner ?? this, draft_key: this.draftKey }}
      @value-changed=${this._changed}
    ></ha-selector-object>`;
  }

  private _changed(
    ev: CustomEvent<{ value: unknown; isValid?: boolean }>
  ): void {
    ev.stopPropagation();
    if (this.disabled || ev.detail.isValid === false) return;
    const value = ev.detail.value;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    fireEvent(this, "value-changed", {
      value: value as Record<string, unknown>,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-options-editor": HaAutomationOptionsEditor;
  }
}
