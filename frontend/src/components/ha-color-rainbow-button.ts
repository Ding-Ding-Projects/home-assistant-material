import type { ContextType } from "@lit/context";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { resolveThemeColor } from "../common/color/compute-color";
import { parseColor, toHex } from "../common/color/translate-color";
import { fireEvent } from "../common/dom/fire_event";
import { internationalizationContext } from "../data/context";
import "./appearance/ha-appearance-color-picker";
import "./ha-button";
import "./ha-dialog";
import "./ha-dialog-footer";

/**
 * @element ha-color-rainbow-button
 *
 * @summary
 * A rainbow swatch that ends a colour row. It opens the full colour picker in
 * a dialog and returns the chosen colour as `#rrggbb` in `value-changed`.
 *
 * @fires value-changed - The person chose a colour; `detail.value` is `#rrggbb`.
 */
@customElement("ha-color-rainbow-button")
export class HaColorRainbowButton extends LitElement {
  /** The row's current colour: a theme colour name or any CSS colour. */
  @property() public value?: string;

  @property({ type: Boolean }) public disabled = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _open = false;

  @state() private _pending?: string;

  private _l(key: string): string {
    return (
      this._i18n?.localize(`ui.components.color-picker.${key}` as never) || key
    );
  }

  protected render() {
    return html`
      <button
        type="button"
        class="rainbow"
        aria-haspopup="dialog"
        aria-label=${this._l("open_any_color")}
        title=${this._l("open_any_color")}
        .disabled=${this.disabled}
        @click=${this._openDialog}
      ></button>
      ${
        this._open
          ? html`
              <ha-dialog
                open
                width="medium"
                .headerTitle=${this._l("any_color")}
                @closed=${this._closed}
              >
                <ha-appearance-color-picker
                  inline
                  .label=${this._l("any_color")}
                  .value=${this._pending}
                  @appearance-color-changed=${this._changed}
                  @appearance-color-closed=${this._use}
                ></ha-appearance-color-picker>
                <ha-dialog-footer slot="footer">
                  <ha-button
                    slot="secondaryAction"
                    appearance="plain"
                    @click=${this._cancel}
                  >
                    ${this._i18n?.localize("ui.common.cancel")}
                  </ha-button>
                  <ha-button slot="primaryAction" @click=${this._use}>
                    ${this._l("use_color")}
                  </ha-button>
                </ha-dialog-footer>
              </ha-dialog>
            `
          : nothing
      }
    `;
  }

  private _openDialog() {
    const current = this.value
      ? parseColor(resolveThemeColor(this.value, getComputedStyle(this)))
      : undefined;
    this._pending = current ? toHex(current) : undefined;
    this._open = true;
  }

  private _changed(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    this._pending = ev.detail.value;
  }

  private _use() {
    const chosen = this._pending;
    this._open = false;
    if (chosen && chosen !== this.value) {
      fireEvent(this, "value-changed", { value: chosen });
    }
  }

  private _cancel() {
    this._open = false;
  }

  private _closed(ev: Event) {
    if (ev.target === ev.currentTarget) {
      this._open = false;
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: inline-flex;
      flex: none;
    }
    .rainbow {
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      padding: 0;
      border: 2px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: conic-gradient(red, #ff0, lime, cyan, blue, #f0f, red);
      cursor: pointer;
    }
    .rainbow:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .rainbow:disabled {
      opacity: 0.4;
      cursor: default;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-color-rainbow-button": HaColorRainbowButton;
  }
}
