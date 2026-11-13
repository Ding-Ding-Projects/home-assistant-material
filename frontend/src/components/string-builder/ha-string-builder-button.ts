import { mdiTextBoxEditOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { HomeAssistant } from "../../types";
import "../ha-icon-button";

declare global {
  interface HASSDomEvents {
    "string-builder-result": { value: string };
  }
}

/**
 * A small "Build text" icon button for a field that accepts a template. It
 * opens the string builder and, when the person chooses to use the text,
 * fires `string-builder-result` with the template. It never changes the field
 * by itself.
 */
@customElement("ha-string-builder-button")
export class HaStringBuilderButton extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  /** The field's current text. */
  @property() public value?: string;

  @property({ type: Boolean }) public disabled = false;

  @state() private _mounted = false;

  @state() private _shown = false;

  private _pending?: string;

  protected render() {
    if (!this.hass) {
      return nothing;
    }
    return html`
      <ha-icon-button
        .label=${this.hass.localize("ui.components.string_builder.button" as any)}
        .path=${mdiTextBoxEditOutline}
        .disabled=${this.disabled}
        @click=${this._open}
      ></ha-icon-button>
      ${
        this._mounted
          ? html`<ha-string-builder-dialog
              .hass=${this.hass}
              .value=${this.value ?? ""}
              .open=${this._shown}
              @string-builder-use=${this._use}
              @string-builder-closed=${this._closed}
            ></ha-string-builder-dialog>`
          : nothing
      }
    `;
  }

  private async _open(ev: Event) {
    ev.stopPropagation();
    await import("./ha-string-builder-dialog");
    this._pending = undefined;
    this._mounted = true;
    await this.updateComplete;
    this._shown = true;
  }

  private _use(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    this._pending = ev.detail.value;
    this._shown = false;
  }

  private _closed(ev: Event) {
    ev.stopPropagation();
    this._shown = false;
    this._mounted = false;
    // Only now, with the dialog gone, hand the text to the field.
    const value = this._pending;
    this._pending = undefined;
    if (value !== undefined) {
      fireEvent(this, "string-builder-result", { value });
    }
  }

  static styles = css`
    :host {
      display: inline-flex;
    }
    ha-icon-button {
      --ha-icon-button-size: 36px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-string-builder-button": HaStringBuilderButton;
  }
}
