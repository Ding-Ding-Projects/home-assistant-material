import { mdiChevronDown, mdiLightningBolt } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { quickControlFor } from "../../data/quick-control";
import { showQuickActionDialog } from "../../dialogs/quick-action/show-dialog-quick-action";
import type { HomeAssistant } from "../../types";
import "../ha-adaptive-dialog";
import "../ha-svg-icon";

const BLOCK = "ui.components.quick_control";

let detailsId = 0;

/**
 * The two small buttons under an entity's name: "Run a quick action" and
 * "Show more details". The details open in place under the buttons, or in a
 * sheet where the row has no room to grow (`details="dialog"`, for tables).
 */
@customElement("ha-entity-quick-row-actions")
export class HaEntityQuickRowActions extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId?: string;

  /** Where "Show more details" opens: under the buttons or in a sheet. */
  @property() public details: "inline" | "dialog" = "inline";

  /** Icon-only buttons on one line, for table rows. */
  @property({ type: Boolean, reflect: true }) public compact = false;

  @state() private _expanded = false;

  @state() private _detailsLoaded = false;

  private _lang = new LanguageModeController(this);

  private readonly _detailsId = `quick-details-${++detailsId}`;

  public connectedCallback(): void {
    super.connectedCallback();
    // The buttons and the details must never open or select the row.
    this.addEventListener("click", this._stopEvent);
    this.addEventListener("pointerdown", this._stopEvent);
    this.addEventListener("keydown", this._stopActivationKeys);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("click", this._stopEvent);
    this.removeEventListener("pointerdown", this._stopEvent);
    this.removeEventListener("keydown", this._stopActivationKeys);
  }

  private _stopEvent = (ev: Event) => ev.stopPropagation();

  private _stopActivationKeys = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.stopPropagation();
    }
  };

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${BLOCK}.${key}`, values);
  }

  protected render(): TemplateResult | typeof nothing {
    const stateObj = this.entityId
      ? this.hass?.states[this.entityId]
      : undefined;
    if (!this.hass || !this.entityId) {
      return nothing;
    }
    // Read-only things report a value only: there is nothing to run.
    const canAct = !!stateObj && quickControlFor(stateObj).kind !== "value";
    const name = stateObj ? this.hass.formatEntityName(stateObj) : "";
    const inline = this.details === "inline";

    return html`
      <div class="actions">
        ${
          canAct
            ? html`<button
                type="button"
                class="act"
                aria-haspopup="dialog"
                aria-label=${this._t("quick_action_label", { name })}
                title=${this.compact ? this._t("quick_action") : nothing}
                @click=${this._quickAction}
              >
                <ha-svg-icon .path=${mdiLightningBolt}></ha-svg-icon>
                ${
                  this.compact
                    ? nothing
                    : html`<span>${this._t("quick_action")}</span>`
                }
              </button>`
            : nothing
        }
        <button
          type="button"
          class="act"
          aria-expanded=${this._expanded ? "true" : "false"}
          aria-controls=${inline ? this._detailsId : nothing}
          aria-haspopup=${inline ? nothing : "dialog"}
          aria-label=${this._t(
            this._expanded ? "less_details_label" : "more_details_label",
            { name }
          )}
          title=${
            this.compact
              ? this._t(this._expanded ? "less_details" : "more_details")
              : nothing
          }
          @click=${this._toggleDetails}
        >
          ${
            this.compact
              ? nothing
              : html`<span
                  >${this._t(
                    this._expanded ? "less_details" : "more_details"
                  )}</span
                >`
          }
          <ha-svg-icon
            class=${this._expanded ? "chevron open" : "chevron"}
            .path=${mdiChevronDown}
          ></ha-svg-icon>
        </button>
      </div>
      ${
        this._detailsLoaded
          ? inline
            ? html`<div
                id=${this._detailsId}
                class="details"
                ?hidden=${!this._expanded}
              >
                ${
                  this._expanded
                    ? html`<ha-entity-more-details
                        .hass=${this.hass}
                        .entityId=${this.entityId}
                      ></ha-entity-more-details>`
                    : nothing
                }
              </div>`
            : html`<ha-adaptive-dialog
                .open=${this._expanded}
                header-title=${this._t("details_title", { name })}
                @closed=${this._detailsClosed}
              >
                ${
                  this._expanded
                    ? html`<ha-entity-more-details
                        .hass=${this.hass}
                        .entityId=${this.entityId}
                      ></ha-entity-more-details>`
                    : nothing
                }
              </ha-adaptive-dialog>`
          : nothing
      }
    `;
  }

  private _quickAction() {
    showQuickActionDialog(this, { entityId: this.entityId });
  }

  private async _toggleDetails() {
    if (!this._detailsLoaded) {
      // The details are loaded only when someone opens them.
      await import("./ha-entity-more-details");
      this._detailsLoaded = true;
    }
    this._expanded = !this._expanded;
  }

  private _detailsClosed() {
    this._expanded = false;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      min-width: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    .act {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      height: 36px;
      padding: 0 var(--ha-space-3);
      border: var(--ha-border-width-sm) solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      --mdc-icon-size: 16px;
    }
    /* A 48 px hit area around the 36 px button. */
    .act::after {
      content: "";
      position: absolute;
      inset: -6px 0;
    }
    :host([compact]) .actions {
      flex-wrap: nowrap;
      margin-top: 0;
      gap: var(--ha-space-1);
    }
    :host([compact]) .act {
      width: 40px;
      height: 40px;
      padding: 0;
      justify-content: center;
      border-radius: var(--ha-border-radius-circle);
      --mdc-icon-size: 20px;
    }
    :host([compact]) .act::after {
      inset: -4px;
    }
    .act:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .act:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .chevron.open {
      transform: rotate(180deg);
    }
    .details {
      margin-top: var(--ha-space-2);
      min-width: 0;
    }
    .details[hidden] {
      display: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-entity-quick-row-actions": HaEntityQuickRowActions;
  }
}
