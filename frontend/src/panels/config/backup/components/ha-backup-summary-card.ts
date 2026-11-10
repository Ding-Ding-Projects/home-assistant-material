import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiBackupRestore,
  mdiCheck,
  mdiInformationOutline,
  mdiSync,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import "../../../../components/ha-icon";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";

type SummaryStatus =
  "success" | "error" | "info" | "warning" | "loading" | "none";

const ICONS: Partial<Record<SummaryStatus, string>> = {
  success: mdiCheck,
  error: mdiAlertCircleOutline,
  warning: mdiAlertOutline,
  info: mdiInformationOutline,
  loading: mdiSync,
};

/**
 * The large tinted card at the top of the backups page. The tint follows the
 * status, the heading is the one sentence that says how the backups are doing,
 * and whatever is slotted in follows it as plain lines.
 */
@customElement("ha-backup-summary-card")
class HaBackupSummaryCard extends LitElement {
  @property()
  public heading!: string;

  @property()
  public description!: string;

  @property()
  public eyebrow?: string;

  @property({ type: Boolean, attribute: "has-action" })
  public hasAction = false;

  @property({ reflect: true })
  public status: SummaryStatus = "info";

  render() {
    return html`
      <ha-card>
        <div class="eyebrow">
          ${
            this.status === "loading"
              ? html`<ha-spinner size="small"></ha-spinner>`
              : html`<ha-svg-icon
                  .path=${
                    this.status === "none" || this.status === "success"
                      ? mdiBackupRestore
                      : ICONS[this.status]
                  }
                ></ha-svg-icon>`
          }
          ${this.eyebrow ? html`<span>${this.eyebrow}</span>` : nothing}
        </div>
        <div class="summary">
          <div class="content">
            <h2 class="heading">${this.heading}</h2>
            ${
              this.description
                ? html`<p class="description">${this.description}</p>`
                : nothing
            }
          </div>
          ${
            this.hasAction
              ? html`
                  <div class="action">
                    <slot name="action"></slot>
                  </div>
                `
              : nothing
          }
        </div>
        <div class="slotted">
          <slot></slot>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      --backup-summary-tint: var(--primary-color);
      display: block;
    }
    :host([status="success"]) {
      --backup-summary-tint: var(--success-color);
    }
    :host([status="warning"]) {
      --backup-summary-tint: var(--warning-color);
    }
    :host([status="error"]) {
      --backup-summary-tint: var(--error-color);
    }
    ha-card {
      box-sizing: border-box;
      min-height: 74px;
      padding: var(--ha-space-5) var(--ha-space-6);
      background: color-mix(
        in srgb,
        var(--backup-summary-tint) 22%,
        var(--card-background-color)
      );
    }
    :host([status="none"]) ha-card,
    :host([status="loading"]) ha-card,
    :host([status="info"]) ha-card {
      background: var(--card-background-color);
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--backup-summary-tint);
      --mdc-icon-size: 28px;
    }
    :host([status="none"]) .eyebrow,
    :host([status="loading"]) .eyebrow,
    :host([status="info"]) .eyebrow {
      color: var(--secondary-text-color);
    }
    ha-spinner {
      --ha-spinner-size: 28px;
    }
    .summary {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      column-gap: var(--ha-space-4);
      row-gap: var(--ha-space-2);
      align-items: center;
      margin-top: var(--ha-space-2);
    }
    .content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .heading {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
      color: var(--primary-text-color);
      overflow-wrap: anywhere;
    }
    .description {
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    .slotted {
      min-width: 0;
    }
    @media all and (max-width: 550px) {
      ha-card {
        padding: var(--ha-space-4);
      }
      .heading {
        font-size: var(--ha-font-size-2xl);
      }
      .action {
        width: 100%;
        display: flex;
        justify-content: flex-end;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-summary-card": HaBackupSummaryCard;
  }
}
