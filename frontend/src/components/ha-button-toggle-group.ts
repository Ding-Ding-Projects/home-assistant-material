import "@home-assistant/webawesome/dist/components/button-group/button-group";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import {
  isBilingualLabel,
  renderStackedLabel,
  stackedLabelStyles,
} from "../common/language-mode/stacked-label";
import type { ToggleButton } from "../types";
import "./ha-button";
import "./ha-svg-icon";

/**
 * @element ha-button-toggle-group
 *
 * @summary
 * A button-group with one active selection.
 *
 * @attr {ToggleButton[]} buttons - the button config
 * @attr {string} active - The value of the currently active button.
 * @attr {("s"|"m")} size - The size of the buttons in the group.
 * @attr {("brand"|"neutral"|"success"|"warning"|"danger")} variant - The variant of the buttons in the group.
 *
 * @fires value-changed - Dispatched when the active button changes.
 */
@customElement("ha-button-toggle-group")
export class HaButtonToggleGroup extends LitElement {
  @property({ attribute: false }) public buttons!: ToggleButton[];

  @property() public active?: string;

  @property({ reflect: true }) size: "s" | "m" = "m";

  @property({ type: Boolean, reflect: true, attribute: "no-wrap" })
  public nowrap = false;

  @property({ type: Boolean, reflect: true, attribute: "full-width" })
  public fullWidth = false;

  @property({ type: Boolean }) public disabled = false;

  @property() public variant:
    "brand" | "neutral" | "success" | "warning" | "danger" = "brand";

  @property({ attribute: "active-variant" }) public activeVariant?:
    "brand" | "neutral" | "success" | "warning" | "danger";

  protected render(): TemplateResult {
    return html`
      <wa-button-group childSelector="ha-button">
        ${this.buttons.map(
          (button) =>
            html`<ha-button
              iconTag="ha-svg-icon"
              class=${isBilingualLabel(button.label) ? "icon stacked" : "icon"}
              .variant=${
                this.active !== button.value || !this.activeVariant
                  ? this.variant
                  : this.activeVariant
              }
              .size=${this.size}
              .value=${button.value}
              @click=${this._handleClick}
              .title=${button.title ?? button.label}
              aria-label=${button.title ?? nothing}
              .disabled=${this.disabled}
              .appearance=${this.active === button.value ? "accent" : "filled"}
            >
              ${
                button.iconPath
                  ? html`<ha-svg-icon
                      aria-label=${button.label}
                      .path=${button.iconPath}
                    ></ha-svg-icon>`
                  : renderStackedLabel(button.label)
              }
            </ha-button>`
        )}
      </wa-button-group>
    `;
  }

  private _handleClick(ev): void {
    this.active = ev.currentTarget.value;
    fireEvent(this, "value-changed", { value: this.active });
  }

  static styles = [
    stackedLabelStyles,
    css`
      :host {
        --mdc-icon-size: var(--button-toggle-icon-size, 20px);
      }

      :host([no-wrap]) wa-button-group::part(base) {
        flex-wrap: nowrap;
      }

      wa-button-group {
        padding: var(--ha-button-toggle-group-padding);
      }

      :host([full-width]) wa-button-group,
      :host([full-width]) wa-button-group::part(base) {
        width: 100%;
      }

      :host([full-width]) ha-button {
        flex: 1;
      }

      ha-button {
        word-break: keep-all;
        overflow-wrap: anywhere;
        text-wrap: balance;
      }

      /* A small button keeps its look but gets a 44 px touch target: an
       invisible strip above and below it. */
      :host([size="s"]) ha-button {
        position: relative;
      }
      :host([size="s"]) ha-button::after {
        content: "";
        position: absolute;
        inset-block: -6px;
        inset-inline: 0;
      }

      /* Both-language labels stack in one row with a 44 px target. */
      ha-button.stacked {
        --ha-button-height: 44px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-button-toggle-group": HaButtonToggleGroup;
  }
}
