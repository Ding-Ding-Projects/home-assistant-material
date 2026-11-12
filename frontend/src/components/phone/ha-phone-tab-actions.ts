import { mdiClose } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../common/dom/fire_event";
import "../ha-svg-icon";
import { phoneOverlayStyles, trapTab } from "./phone-overlay";

/** One row of the actions panel, with its words already localized. */
export interface PhoneActionItem {
  id: string;
  label: string;
  /** Why the row is not available, shown under the label. */
  note?: string;
  iconPath: string;
  enabled: boolean;
  destructive?: boolean;
}

declare global {
  interface HASSDomEvents {
    "phone-action-select": { id: string };
    "phone-actions-dismiss": undefined;
  }
}

/**
 * @element ha-phone-tab-actions
 *
 * @summary
 * A small panel over the Pages sheet with a list of actions, used for one
 * page (pin, close, move) and for the sheet's header menu. Every row is at
 * least 44 px tall. A row that is not available stays focusable and says why,
 * so a screen reader hears the reason instead of silence. Escape and the
 * close button dismiss it, and Tab stays inside it.
 *
 * @fires phone-action-select - A row was chosen. `detail.id` is the row.
 * @fires phone-actions-dismiss - The panel asks to close.
 */
@customElement("ha-phone-tab-actions")
export class HaPhoneTabActions extends LitElement {
  @property() public heading = "";

  @property({ attribute: false }) public items: PhoneActionItem[] = [];

  /** The accessible name of the close button. */
  @property({ attribute: "close-label" }) public closeLabel = "";

  @query(".row:not([aria-disabled])") private _firstRow?: HTMLElement;

  @query(".round") private _closeButton?: HTMLElement;

  protected firstUpdated(changed: PropertyValues) {
    super.firstUpdated(changed);
    (this._firstRow ?? this._closeButton)?.focus();
  }

  protected render(): TemplateResult {
    return html`
      <button
        class="scrim"
        tabindex="-1"
        aria-hidden="true"
        @click=${this._dismiss}
      ></button>
      <div
        class="panel"
        role="dialog"
        aria-label=${this.heading}
        @keydown=${this._keydown}
      >
        <div class="panel-head">
          <h2 class="panel-title">${this.heading}</h2>
          <button
            class="round"
            aria-label=${this.closeLabel}
            @click=${this._dismiss}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </div>
        <div class="rows">
          ${this.items.map(
            (item) => html`
              <button
                class=${classMap({
                  row: true,
                  destructive: Boolean(item.destructive),
                })}
                aria-disabled=${item.enabled ? nothing : "true"}
                .actionId=${item.id}
                @click=${this._select}
              >
                <span class="icon"
                  ><ha-svg-icon .path=${item.iconPath}></ha-svg-icon
                ></span>
                <span class="text">
                  <span class="label"><bdi>${item.label}</bdi></span>
                  ${
                    item.note
                      ? html`<span class="note">${item.note}</span>`
                      : nothing
                  }
                </span>
              </button>
            `
          )}
        </div>
      </div>
    `;
  }

  private _select(ev: Event) {
    const button = ev.currentTarget as HTMLElement & { actionId: string };
    if (button.getAttribute("aria-disabled") === "true") {
      return;
    }
    fireEvent(this, "phone-action-select", { id: button.actionId });
  }

  private _dismiss() {
    fireEvent(this, "phone-actions-dismiss");
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this._dismiss();
      return;
    }
    if (this.shadowRoot) {
      trapTab(ev, this.shadowRoot);
    }
  }

  static styles: CSSResultGroup = [
    phoneOverlayStyles,
    css`
      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        width: 100%;
        min-height: 48px;
        box-sizing: border-box;
        padding: var(--ha-space-1) var(--ha-space-4) var(--ha-space-1)
          var(--ha-space-2);
        border-radius: var(--ha-border-radius-2xl);
        text-align: start;
      }
      .row[aria-disabled="true"] {
        opacity: 0.55;
        cursor: default;
      }
      .row.destructive:not([aria-disabled="true"]) .label {
        color: var(--error-color);
      }
      .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 40px;
        height: 40px;
        border-radius: var(--ha-border-radius-xl);
        background-color: var(--secondary-background-color);
      }
      .text {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .label {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: break-word;
        word-break: normal;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-phone-tab-actions": HaPhoneTabActions;
  }
}
