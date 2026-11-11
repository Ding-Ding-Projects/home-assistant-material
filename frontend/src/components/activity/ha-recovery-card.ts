import { mdiAlertCircle } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { redactDetails } from "../../common/activity/redact-details";
import { fireEvent } from "../../common/dom/fire_event";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../ha-button";
import "../ha-svg-icon";

declare global {
  interface HASSDomEvents {
    "recovery-retry": undefined;
    "recovery-undo": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-recovery-card": HaRecoveryCard;
  }
}

/**
 * Shown where something failed. It says what failed in plain words, what was
 * and was not changed, and offers the ways forward that exist: try again,
 * undo, copy the technical details with credentials hidden, and the problem
 * log, where Home Assistant records the errors it logs.
 */
@customElement("ha-recovery-card")
export class HaRecoveryCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** What failed, in plain words. */
  @property() public heading = "";

  /** Plain words about the cause, when it is known. */
  @property() public message = "";

  /** What was and was not changed by the failed attempt. */
  @property() public changed = "";

  /** Raw technical text. It is redacted before it is shown or copied. */
  @property() public details = "";

  @property({ attribute: "can-retry", type: Boolean }) public canRetry = false;

  @property({ attribute: "undo-label" }) public undoLabel = "";

  @state() private _copied = false;

  private _l(key: string): string {
    return this.hass.localize(`ui.activity.recovery.${key}` as any);
  }

  protected render(): TemplateResult {
    const details = this.details ? redactDetails(this.details) : "";
    return html`<div class="card" role="group" aria-label=${this.heading}>
      <div class="head">
        <ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>
        <h3>${this.heading}</h3>
      </div>
      ${this.message ? html`<p>${this.message}</p>` : nothing}
      ${
        this.changed
          ? html`<p class="changed">
              <strong>${this._l("what_changed")}</strong> ${this.changed}
            </p>`
          : nothing
      }
      ${
        details
          ? html`<details>
              <summary>${this._l("details")}</summary>
              <pre>${details}</pre>
            </details>`
          : nothing
      }
      <div class="actions">
        ${
          this.canRetry
            ? html`<ha-button @click=${this._retry}
                >${this._l("try_again")}</ha-button
              >`
            : nothing
        }
        ${
          this.undoLabel
            ? html`<ha-button appearance="filled" @click=${this._undo}
                >${this.undoLabel}</ha-button
              >`
            : nothing
        }
        ${
          details
            ? html`<ha-button appearance="plain" @click=${this._copy}
                >${this._copied ? this._l("copied") : this._l("copy_details")}</ha-button
              >`
            : nothing
        }
        <ha-button appearance="plain" href="/config/problem-log"
          >${this._l("open_problem_log")}</ha-button
        >
      </div>
      <p class="hint">${this._l("problem_log_hint")}</p>
    </div>`;
  }

  private _retry(): void {
    fireEvent(this, "recovery-retry");
  }

  private _undo(): void {
    fireEvent(this, "recovery-undo");
  }

  private async _copy(): Promise<void> {
    await copyToClipboard(redactDetails(this.details), this);
    this._copied = true;
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .card {
        border: 1px solid var(--error-color);
        border-radius: var(--ha-border-radius-lg, 12px);
        padding: var(--ha-space-3);
        background: var(--secondary-background-color);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        color: var(--error-color);
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-m);
        overflow-wrap: anywhere;
      }
      p {
        margin: var(--ha-space-2) 0 0;
        overflow-wrap: anywhere;
      }
      .hint {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      summary {
        min-height: 44px;
        display: flex;
        align-items: center;
        cursor: pointer;
      }
      pre {
        margin: 0;
        max-height: 160px;
        overflow: auto;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: var(--ha-font-size-s);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-2);
      }
      .actions ha-button {
        min-height: 44px;
      }
    `,
  ];
}
