import { mdiBackupRestore, mdiCheckCircle } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { modeText } from "../common/language-mode/language-mode";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-alert";
import "../components/ha-button";
import "../components/ha-svg-icon";
import "../components/progress/ha-progress-bar";
import type { OnboardingPendingRestore } from "../data/onboarding-pending-restore";
import {
  discardOnboardingPendingRestore,
  isChangeAccepted,
  retryOnboardingPendingRestore,
} from "../data/onboarding-pending-restore";
import { showConfirmationDialog } from "../dialogs/generic/show-dialog-box";
import "../components/input/ha-input";
import { onBoardingStyles } from "./styles";

declare global {
  interface HASSDomEvents {
    "pending-restore-dismiss": undefined;
    "pending-restore-recheck": undefined;
    "pending-restore-sign-in": undefined;
  }
}

/**
 * Shown in place of the welcome step while a backup that was queued during
 * first start is restoring, and afterwards with the sign-in note or the
 * reason it failed.
 */
@customElement("onboarding-pending-restore")
class OnboardingPendingRestoreView extends LitElement {
  @property({ attribute: false }) public restore!: OnboardingPendingRestore;

  @state() private _password = "";

  @state() private _busy = false;

  @state() private _actionFailed: false | "retry" | "rate" | "discard" = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  private _t(key: string, values?: Record<string, string | number>) {
    return modeText(this._localize, key, values);
  }

  protected render(): TemplateResult {
    const { state: restoreState, name, error } = this.restore;
    const protectedBackup = this.restore.protected === true;
    const prefix = "ui.panel.page-onboarding.restore_pending";
    const active = restoreState === "queued" || restoreState === "running";
    return html`
      <h1>${this._t(`${prefix}.${restoreState}_title`)}</h1>
      ${
        restoreState === "failed"
          ? html`<ha-alert alert-type="error" role="alert">
                ${this._t(`${prefix}.failed_text`, { error: error ?? "" })}
              </ha-alert>
              <p>${this._t(`${prefix}.failed_note`)}</p>`
          : html`<p role="status">
              <ha-svg-icon
                class="lead"
                .path=${restoreState === "done" ? mdiCheckCircle : mdiBackupRestore}
              ></ha-svg-icon>
              ${this._t(`${prefix}.${restoreState}_text`, { name })}
            </p>`
      }
      ${
        active
          ? html`<ha-progress-bar
              indeterminate
              .label=${this._t(`${prefix}.progress_label`)}
            ></ha-progress-bar>`
          : nothing
      }
      ${
        restoreState === "failed" && protectedBackup
          ? html`<ha-input
              type="password"
              password-toggle
              autocomplete="off"
              .label=${this._t(`${prefix}.password_label`)}
              .value=${this._password}
              .disabled=${this._busy}
              @input=${this._passwordChanged}
            ></ha-input>`
          : nothing
      }
      ${
        this._actionFailed
          ? html`<ha-alert alert-type="error" role="alert">
              ${this._t(
                `${prefix}.${this._actionFailed === "retry" ? "retry_failed" : "action_failed"}`
              )}
            </ha-alert>`
          : nothing
      }
      <div class="actions">
        ${
          restoreState === "done"
            ? html`<ha-button @click=${this._signIn}>
                  ${this._t(`${prefix}.sign_in`)}
                </ha-button>
                <ha-button appearance="plain" @click=${this._recheck}>
                  ${this._t(`${prefix}.reload`)}
                </ha-button>`
            : restoreState === "failed"
              ? html`<ha-button
                    .disabled=${this._busy || (protectedBackup && !this._password)}
                    @click=${this._retry}
                  >
                    ${this._t(`${prefix}.retry`)}
                  </ha-button>
                  <ha-button
                    appearance="plain"
                    variant="danger"
                    .disabled=${this._busy}
                    @click=${this._discard}
                  >
                    ${this._t(`${prefix}.set_up_without`)}
                  </ha-button>`
              : nothing
        }
      </div>
    `;
  }

  private _passwordChanged(ev: Event) {
    this._password = (ev.target as HTMLInputElement).value;
  }

  private async _retry() {
    this._busy = true;
    this._actionFailed = false;
    const status = await retryOnboardingPendingRestore(
      this.restore.protected ? this._password : undefined
    );
    this._busy = false;
    if (isChangeAccepted(status)) {
      this._password = "";
    } else {
      this._actionFailed = status === 429 ? "rate" : "retry";
    }
    // Either way ask again: the Supervisor may have started the restore after
    // the request timed out, and the page must not keep showing a stale failure
    fireEvent(this, "pending-restore-recheck");
  }

  private async _discard() {
    const prefix = "ui.panel.page-onboarding.restore_pending";
    const confirmed = await showConfirmationDialog(this, {
      title: this._t(`${prefix}.discard_title`),
      text: this._t(`${prefix}.discard_text`),
      confirmText: this._t(`${prefix}.discard_confirm`),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    this._actionFailed = false;
    const status = await discardOnboardingPendingRestore();
    this._busy = false;
    if (!isChangeAccepted(status)) {
      this._actionFailed = "discard";
      return;
    }
    fireEvent(this, "pending-restore-dismiss");
  }

  private _signIn() {
    fireEvent(this, "pending-restore-sign-in");
  }

  private _recheck() {
    fireEvent(this, "pending-restore-recheck");
  }

  static styles: CSSResultGroup = [
    onBoardingStyles,
    css`
      .lead {
        color: var(--primary-color);
        vertical-align: middle;
        margin-inline-end: var(--ha-space-2);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-4);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-pending-restore": OnboardingPendingRestoreView;
  }
}
