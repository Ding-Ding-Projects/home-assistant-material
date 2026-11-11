import { mdiAlertCircle } from "@mdi/js";
import type { TemplateResult } from "lit";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { redactDetails } from "../../common/activity/redact-details";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
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

  @state() private _copyState: "idle" | "copied" | "failed" = "idle";

  // The redacted text, worked out once per `details` and not on every render.
  private _redacted = "";

  private _copyTimer?: number;

  private _lang = new LanguageModeController(this);

  private _l(key: string): string {
    return this._lang.text(
      this.hass.localize as any,
      `ui.activity.recovery.${key}`
    );
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._copyTimer);
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    if (changedProps.has("details")) {
      this._redacted = this.details ? redactDetails(this.details) : "";
      this._copyState = "idle";
    }
  }

  protected render(): TemplateResult {
    const details = this._redacted;
    return html`<div class="card">
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
                >${this._copyState === "copied" ? this._l("copied") : this._l("copy_details")}</ha-button
              >`
            : nothing
        }
        <ha-button appearance="plain" href="/config/problem-log"
          >${this._l("open_problem_log")}</ha-button
        >
      </div>
      <p class="hint">${this._l("problem_log_hint")}</p>
      <p class="sr-only" role="status">
        ${
          this._copyState === "copied"
            ? this._l("copied")
            : this._copyState === "failed"
              ? this._l("copy_failed")
              : ""
        }
      </p>
    </div>`;
  }

  private _retry(): void {
    fireEvent(this, "recovery-retry");
  }

  private _undo(): void {
    fireEvent(this, "recovery-undo");
  }

  private async _copy(): Promise<void> {
    window.clearTimeout(this._copyTimer);
    try {
      await copyToClipboard(this._redacted, this);
      this._copyState = "copied";
    } catch {
      this._copyState = "failed";
    }
    // The label goes back to "Copy details" after a moment.
    this._copyTimer = window.setTimeout(() => {
      this._copyState = "idle";
    }, 3000);
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
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
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
