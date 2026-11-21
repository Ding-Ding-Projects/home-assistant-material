import { mdiChevronDown, mdiLightningBolt } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { quickControlFor } from "../../data/quick-control";
import { showQuickActionDialog } from "../../dialogs/quick-action/show-dialog-quick-action";
import type { HomeAssistant } from "../../types";
import type { RowDetailsControl } from "../data-table/row-details";
import {
  closeRowDetailsOnKey,
  rowDetailsContext,
} from "../data-table/row-details";
import "../ha-adaptive-dialog";
import "../ha-svg-icon";

const BLOCK = "ui.components.quick_control";

let detailsId = 0;

/**
 * The two small buttons under an entity's name: "Run a quick action" and
 * "Show more details". The details open in place under the buttons, in a
 * sheet (`details="dialog"`), or in the table's detail row right under the
 * row (`details="row"`, for tables that set `renderRowDetails`; a table
 * without one falls back to the sheet).
 */
@customElement("ha-entity-quick-row-actions")
export class HaEntityQuickRowActions extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId?: string;

  /** Where "Show more details" opens: under the buttons, a sheet or a table row. */
  @property() public details: "inline" | "dialog" | "row" = "inline";

  /** The table row whose details open, when it is not the entity id. */
  @property({ attribute: false }) public rowId?: string;

  @state()
  @consume({ context: rowDetailsContext, subscribe: true })
  private _rowDetails?: RowDetailsControl;

  /**
   * Which buttons to show: both, only "Show more details" (a phone table
   * row, whose details hold the rest) or only "Run a quick action" (inside
   * those details).
   */
  @property() public buttons: "both" | "details" | "action" = "both";

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
      return;
    }
    if (ev.key === "Escape" && this._closeDetailsOnEscape(ev)) {
      ev.stopPropagation();
    }
  };

  /**
   * Escape on "Show more details", or inside details opened in place, closes
   * them and leaves focus on the button. The sheet handles its own Escape.
   */
  private _closeDetailsOnEscape(ev: KeyboardEvent): boolean {
    if (this.details === "row" && this._rowDetails) {
      const onToggle = ev
        .composedPath()
        .some(
          (target) =>
            target instanceof HTMLElement &&
            target.classList.contains("details-toggle")
        );
      if (!onToggle) {
        return false;
      }
      const rowId = this._detailsRowId;
      if (!closeRowDetailsOnKey("Escape", this._rowDetails.open, rowId)) {
        return false;
      }
      this._rowDetails.toggle(rowId);
      return true;
    }
    if (this.details === "inline" && this._expanded) {
      this._expanded = false;
      this.focusRowDetailsToggle();
      return true;
    }
    return false;
  }

  @query(".details-toggle") private _detailsButton?: HTMLButtonElement;

  public focusRowDetailsToggle(): boolean {
    const button = this._detailsButton;
    if (!button) {
      return false;
    }
    button.focus();
    return true;
  }

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
    const canAct =
      this.buttons !== "details" &&
      !!stateObj &&
      quickControlFor(stateObj).kind !== "value";
    const showDetails = this.buttons !== "action";
    if (!canAct && !showDetails) {
      return nothing;
    }
    const name = stateObj ? this.hass.formatEntityName(stateObj) : "";
    // Inside a table with detail rows, the details open in the row below.
    const inRow = this.details === "row" && !!this._rowDetails;
    const inline = this.details === "inline";
    const expanded = inRow
      ? this._rowDetails!.open.has(this._detailsRowId)
      : this._expanded;

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
        ${showDetails ? this._renderDetailsButton(expanded, inline, inRow, name) : nothing}
      </div>
      ${
        this._detailsLoaded && !inRow && showDetails
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

  private _renderDetailsButton(
    expanded: boolean,
    inline: boolean,
    inRow: boolean,
    name: string
  ): TemplateResult {
    return html`<button
      type="button"
      class="act details-toggle"
      aria-expanded=${expanded ? "true" : "false"}
      aria-controls=${inline ? this._detailsId : nothing}
      aria-haspopup=${inline || inRow ? nothing : "dialog"}
      aria-label=${this._t(
        expanded ? "less_details_label" : "more_details_label",
        { name }
      )}
      title=${
        this.compact
          ? this._t(expanded ? "less_details" : "more_details")
          : nothing
      }
      @click=${this._toggleDetails}
    >
      ${
        this.compact
          ? nothing
          : html`<span
              >${this._t(expanded ? "less_details" : "more_details")}</span
            >`
      }
      <ha-svg-icon
        class=${expanded ? "chevron open" : "chevron"}
        .path=${mdiChevronDown}
      ></ha-svg-icon>
    </button>`;
  }

  private _quickAction() {
    showQuickActionDialog(this, { entityId: this.entityId });
  }

  private get _detailsRowId(): string {
    return this.rowId ?? this.entityId ?? "";
  }

  private async _toggleDetails() {
    if (this.details === "row" && this._rowDetails) {
      // The table draws the details in its own row under this one.
      await import("./ha-entity-more-details");
      this._rowDetails.toggle(this._detailsRowId);
      return;
    }
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
