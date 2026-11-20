import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-settings-row";
import "../../../../components/ha-spinner";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import type { SettingsExport } from "../../../../data/integration_transfer";
import {
  exportEntrySettings,
  exportEntrySettingsLocked,
} from "../../../../data/integration_transfer";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import type { EntrySettingsDialogParams } from "./show-transfer-dialogs";
import { saveTextFile, settingsFileName, TransferText } from "./transfer-text";

const PASSWORD_ERRORS = new Set([
  "password_too_weak",
  "password_mismatch",
  "confirmation_required",
]);

/**
 * Export one entry's settings. Sign-ins are left out unless they are turned
 * on behind the two keys and the slider; then the file is always locked with
 * a password typed twice, which is sent once to make the file and never kept.
 * Values of sign-ins are never shown here.
 */
@customElement("dialog-entry-settings-export")
export class DialogEntrySettingsExport extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: EntrySettingsDialogParams;

  @state() private _open = false;

  @state() private _plain?: SettingsExport;

  @state() private _loadFailed = false;

  @state() private _withSignins = false;

  @state() private _password = "";

  @state() private _passwordAgain = "";

  @state() private _busy = false;

  @state() private _error?: string;

  private _text = new TransferText(this, () => this.hass);

  public showDialog(params: EntrySettingsDialogParams): void {
    this._params = params;
    this._open = true;
    this._load();
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._plain = undefined;
    this._loadFailed = false;
    this._withSignins = false;
    this._clearPasswords();
    this._error = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _clearPasswords(): void {
    this._password = "";
    this._passwordAgain = "";
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._text.t(key, values);
  }

  private async _load(): Promise<void> {
    if (!this._params) {
      return;
    }
    try {
      this._plain = await exportEntrySettings(
        this.hass,
        this._params.entry.entry_id
      );
    } catch (_err: unknown) {
      this._loadFailed = true;
    }
  }

  protected render() {
    if (!this._params || !this._open) {
      return nothing;
    }
    const plain = this._plain;
    const options = plain ? Object.keys(plain.options ?? {}).length : 0;
    const other = plain ? Object.keys(plain.data ?? {}).length : 0;
    const signins = plain?.left_out ?? [];
    const ready =
      !!plain &&
      !this._busy &&
      (!this._withSignins ||
        (this._password.length >= 14 &&
          this._password === this._passwordAgain));
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t("settings_export.title")}
        header-subtitle=${`${this._params.integrationName} · ${this._params.entry.title}`}
        @closed=${this._dialogClosed}
      >
        ${
          this._loadFailed
            ? html`<ha-alert alert-type="error"
                >${this._t("settings_export.failed")}</ha-alert
              >`
            : !plain
              ? html`<div class="loading">
                  <ha-spinner size="small"></ha-spinner>${this._t("loading")}
                </div>`
              : html`
                  <p class="summary">
                    ${this._t("settings_export.counts", {
                      count: options + other + signins.length,
                      signins: signins.length,
                    })}
                  </p>
                  <div class="rows">
                    <div class="row">
                      <span>${this._t("settings_export.options")}</span>
                      <span class="value"
                        >${this._t("settings_export.included", {
                          count: options,
                        })}</span
                      >
                    </div>
                    <div class="row">
                      <span>${this._t("settings_export.other_settings")}</span>
                      <span class="value"
                        >${this._t("settings_export.included", {
                          count: other,
                        })}</span
                      >
                    </div>
                  </div>
                  <ha-settings-row wrap-heading>
                    <span slot="heading"
                      >${this._t("settings_export.signins")}</span
                    >
                    <span slot="description"
                      >${
                        signins.length
                          ? this._t("settings_export.signins_description", {
                              names: signins.join(", "),
                            })
                          : this._t("settings_export.no_signins")
                      }</span
                    >
                    <ha-switch
                      .accessibleLabel=${this._t("settings_export.signins")}
                      .checked=${this._withSignins}
                      .disabled=${this._busy || !signins.length}
                      @change=${this._toggleSignins}
                    ></ha-switch>
                  </ha-settings-row>
                  ${
                    signins.length
                      ? html`<ha-alert
                          alert-type="warning"
                          .title=${this._t("settings_export.locked_title")}
                        >
                          ${this._t("settings_export.locked_text")}
                        </ha-alert>`
                      : nothing
                  }
                  ${
                    this._withSignins
                      ? html`
                          <ha-input
                            type="password"
                            password-toggle
                            autocomplete="new-password"
                            .label=${this._t("settings_export.password")}
                            .hint=${this._t("settings_export.password_hint")}
                            .value=${this._password}
                            .disabled=${this._busy}
                            @input=${this._passwordInput}
                          ></ha-input>
                          <ha-input
                            type="password"
                            password-toggle
                            autocomplete="new-password"
                            .label=${this._t("settings_export.password_again")}
                            .value=${this._passwordAgain}
                            .disabled=${this._busy}
                            @input=${this._passwordAgainInput}
                          ></ha-input>
                        `
                      : nothing
                  }
                  ${
                    this._busy && this._withSignins
                      ? html`<div class="loading">
                          <ha-spinner size="small"></ha-spinner
                          >${this._t("settings_export.locking")}
                        </div>`
                      : nothing
                  }
                  ${
                    this._error
                      ? html`<ha-alert alert-type="error"
                          >${this._error}</ha-alert
                        >`
                      : nothing
                  }
                `
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this._t("cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .disabled=${!ready}
            @click=${this._save}
          >
            ${this._t("save_file")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private async _toggleSignins(ev: Event): Promise<void> {
    const toggle = ev.target as HaSwitch;
    this._error = undefined;
    if (!toggle.checked) {
      this._withSignins = false;
      this._clearPasswords();
      return;
    }
    toggle.checked = false;
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("settings_export.confirm_title"),
      text: this._t("settings_export.confirm_text"),
      confirmText: this._t("settings_export.confirm_action"),
      dismissText: this._t("settings_export.confirm_dismiss"),
      destructive: true,
    });
    this._withSignins = confirmed;
  }

  private _passwordInput(ev: Event): void {
    this._password = (ev.target as HaInput).value ?? "";
  }

  private _passwordAgainInput(ev: Event): void {
    this._passwordAgain = (ev.target as HaInput).value ?? "";
  }

  private async _save(): Promise<void> {
    if (!this._params || !this._plain) {
      return;
    }
    const domain = this._params.entry.domain;
    this._error = undefined;
    if (!this._withSignins) {
      const fileName = settingsFileName(domain, false);
      saveTextFile(`${JSON.stringify(this._plain, null, 2)}\n`, fileName);
      showToast(this, {
        message: this._t("settings_export.saved", { file: fileName }),
      });
      return;
    }
    this._busy = true;
    try {
      const locked = await exportEntrySettingsLocked(
        this.hass,
        this._params.entry.entry_id,
        this._password,
        this._passwordAgain
      );
      const fileName = settingsFileName(domain, true);
      saveTextFile(`${JSON.stringify(locked, null, 2)}\n`, fileName);
      this._clearPasswords();
      showToast(this, {
        message: this._t("settings_export.saved", { file: fileName }),
      });
    } catch (err: unknown) {
      const code = (err as { code?: string } | undefined)?.code ?? "";
      this._error = PASSWORD_ERRORS.has(code)
        ? this._t(`settings_export.${code}`)
        : this._t("settings_export.failed");
    } finally {
      this._busy = false;
    }
  }

  static styles = css`
    .summary {
      margin: 0 0 var(--ha-space-3);
      color: var(--secondary-text-color);
    }
    .rows {
      display: flex;
      flex-direction: column;
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      padding: 0 var(--ha-space-3);
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 48px;
    }
    .row + .row {
      border-top: 1px solid var(--divider-color);
    }
    .value {
      color: var(--secondary-text-color);
    }
    ha-settings-row {
      padding: 0;
      min-height: 48px;
      margin-top: var(--ha-space-2);
    }
    ha-alert {
      display: block;
      margin-top: var(--ha-space-3);
    }
    ha-input {
      display: block;
      margin-top: var(--ha-space-3);
    }
    ha-button {
      min-height: 48px;
    }
    .loading {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 48px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-entry-settings-export": DialogEntrySettingsExport;
  }
}
