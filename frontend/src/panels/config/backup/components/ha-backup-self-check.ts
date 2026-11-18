import {
  mdiAlertOutline,
  mdiCheckCircleOutline,
  mdiHelpCircleOutline,
  mdiPlus,
} from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatShortDateTime } from "../../../../common/datetime/format_date_time";
import { fireEvent } from "../../../../common/dom/fire_event";
import { modeText } from "../../../../common/language-mode/language-mode";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import type {
  BackupContent,
  BackupSelfCheck,
  BackupSelfCheckResult,
} from "../../../../data/backup";
import { runBackupSelfCheck } from "../../../../data/backup";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import {
  selfCheckReasonText,
  summarizeSelfCheck,
} from "../helper/backup-self-check";

const PREFIX = "ui.panel.config.backup.self_check";

declare global {
  interface HASSDomEvents {
    "backup-self-check-updated": {
      backupId: string;
      selfCheck: BackupSelfCheck;
    };
    "backup-self-check-new-backup": undefined;
  }
}

/**
 * The result of the last self-check of one backup: how many checks passed,
 * the checks as a list in plain words, and what to do about a problem.
 */
@customElement("ha-backup-self-check")
class HaBackupSelfCheck extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public backup?: BackupContent;

  /** The overview offers a new backup, the details page a new check. */
  @property({ attribute: "variant" }) public variant: "overview" | "details" =
    "details";

  /** A self-check of a new backup is running: the shown result is about to change. */
  @property({ type: Boolean }) public checking = false;

  @state() private _checking = false;

  @state() private _error = false;

  private _t(key: string, values?: Record<string, string | number>) {
    return modeText(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  private _reason(check: BackupSelfCheckResult): string | undefined {
    if (!check.reason) {
      return undefined;
    }
    return selfCheckReasonText(
      this.hass,
      check.reason,
      check.detail?.join(", ") ?? ""
    );
  }

  protected render() {
    if (this.checking && this.variant === "overview") {
      return html`<section class="card checking" role="status">
        <div class="head">
          <ha-spinner size="small"></ha-spinner>
          <div class="titles">
            <h3>${this._t("checking_new")}</h3>
          </div>
        </div>
      </section>`;
    }
    const selfCheck = this.backup?.self_check;
    const summary = summarizeSelfCheck(selfCheck);
    if (!this.backup || !selfCheck || !summary) {
      return nothing;
    }
    const problem = summary.state !== "passed";
    return html`
      <section class="card ${summary.state}">
        <div class="head">
          <ha-svg-icon
            .path=${
              summary.state === "passed"
                ? mdiCheckCircleOutline
                : summary.state === "failed"
                  ? mdiAlertOutline
                  : mdiHelpCircleOutline
            }
          ></ha-svg-icon>
          <div class="titles">
            <h3>${this._t(`heading_${summary.state}`)}</h3>
            <p class="meta">
              ${this._t("checked_at", {
                time: formatShortDateTime(
                  new Date(selfCheck.checked_at),
                  this.hass.locale,
                  this.hass.config
                ),
              })}
              <span aria-hidden="true">·</span>
              ${this._t("summary", {
                passed: summary.passed,
                total: summary.total,
              })}
            </p>
          </div>
        </div>
        <ul class="checks">
          ${summary.checks.map((check) => this._renderCheck(check))}
        </ul>
        ${
          this._error
            ? html`<p class="error" role="alert">${this._t("check_failed")}</p>`
            : nothing
        }
        <div class="actions">
          ${
            this.variant === "overview"
              ? html`
                  ${
                    summary.state === "failed"
                      ? html`<ha-button @click=${this._backUpNow}>
                          <ha-svg-icon
                            slot="start"
                            .path=${mdiPlus}
                          ></ha-svg-icon>
                          ${this._t("back_up_now")}
                        </ha-button>`
                      : nothing
                  }
                  <ha-button
                    appearance="plain"
                    href="/config/backup/details/${this.backup.backup_id}"
                  >
                    ${this._t("open_backup")}
                  </ha-button>
                `
              : html`<ha-button
                  appearance=${problem ? "filled" : "outlined"}
                  .loading=${this._checking}
                  .disabled=${this._checking}
                  @click=${this._checkAgain}
                >
                  ${this._checking ? this._t("checking") : this._t("check_again")}
                </ha-button>`
          }
        </div>
      </section>
    `;
  }

  private _renderCheck(check: BackupSelfCheckResult) {
    const reason = this._reason(check);
    const label = this.hass.localize(`${PREFIX}.checks.${check.check}` as any)
      ? this._t(`checks.${check.check}`)
      : check.check;
    const status = check.status === "not_applicable" ? "passed" : check.status;
    return html`
      <li class="check ${status}">
        <ha-svg-icon
          .path=${
            status === "passed"
              ? mdiCheckCircleOutline
              : status === "failed"
                ? mdiAlertOutline
                : mdiHelpCircleOutline
          }
        ></ha-svg-icon>
        <span class="text">
          <span class="label">${label}</span>
          <span class="state"
            >${this._t(`status.${status}`)}${reason ? html`: ${reason}` : nothing}</span
          >
        </span>
      </li>
    `;
  }

  private _backUpNow() {
    fireEvent(this, "backup-self-check-new-backup");
  }

  private async _checkAgain() {
    if (!this.backup) {
      return;
    }
    this._checking = true;
    this._error = false;
    try {
      const { self_check: selfCheck } = await runBackupSelfCheck(
        this.hass,
        this.backup.backup_id
      );
      fireEvent(this, "backup-self-check-updated", {
        backupId: this.backup.backup_id,
        selfCheck,
      });
      fireEvent(this, "ha-refresh-backup-info");
    } catch (_err) {
      this._error = true;
    } finally {
      this._checking = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .card {
          box-sizing: border-box;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          border: 1px solid transparent;
        }
        .card.failed,
        .card.partial {
          border-color: var(--warning-color);
          background: color-mix(
            in srgb,
            var(--warning-color) 12%,
            var(--card-background-color)
          );
        }
        .head {
          display: flex;
          gap: var(--ha-space-3);
          align-items: flex-start;
        }
        .head > ha-spinner {
          flex: none;
        }
        .head > ha-svg-icon {
          flex: none;
          color: var(--success-color);
        }
        .failed .head > ha-svg-icon,
        .partial .head > ha-svg-icon {
          color: var(--warning-color);
        }
        .titles {
          min-width: 0;
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .meta {
          margin: var(--ha-space-1) 0 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .checks {
          list-style: none;
          margin: var(--ha-space-4) 0 0;
          padding: 0;
          display: grid;
          gap: var(--ha-space-2);
        }
        .check {
          display: flex;
          gap: var(--ha-space-2);
          align-items: flex-start;
        }
        .check ha-svg-icon {
          --mdc-icon-size: 20px;
          flex: none;
          color: var(--success-color);
        }
        .check.failed ha-svg-icon,
        .check.could_not_check ha-svg-icon {
          color: var(--warning-color);
        }
        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .check {
          min-width: 0;
        }
        .label {
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          overflow-wrap: anywhere;
        }
        .state {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .error {
          margin: var(--ha-space-3) 0 0;
          color: var(--error-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-4);
        }
        @media all and (max-width: 700px) {
          .card {
            padding: var(--ha-space-4);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-self-check": HaBackupSelfCheck;
  }
}
