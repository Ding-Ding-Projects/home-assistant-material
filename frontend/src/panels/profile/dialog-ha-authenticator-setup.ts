import { mdiContentCopy, mdiEye, mdiEyeOff, mdiShieldLock } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-qr-code";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import "../../components/input/ha-input";
import type { HaInput } from "../../components/input/ha-input";
import type {
  DataEntryFlowStep,
  DataEntryFlowStepForm,
} from "../../data/data_entry_flow";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { AuthenticatorSetupDialogParams } from "./show-ha-authenticator-setup-dialog";

const MODULE_ID = "totp";
const CODE_LENGTH = 6;

/**
 * Sets up the authenticator app step of sign-in on top of the server's own
 * setup flow. The key and the setup address arrive in the flow step and are
 * kept only in memory here: never written to storage, to the address bar, to
 * a label or to a live region, and dropped when the dialog closes.
 */
@customElement("ha-authenticator-setup-dialog")
class HaAuthenticatorSetupDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _step?: DataEntryFlowStep;

  @state() private _code = "";

  @state() private _revealed = false;

  @state() private _copied = false;

  @state() private _submitting = false;

  @state() private _error?: string;

  private _params?: AuthenticatorSetupDialogParams;

  private _instance = 0;

  private _done = false;

  private _copiedTimer?: number;

  public async showDialog(params: AuthenticatorSetupDialogParams) {
    this._params = params;
    this._instance++;
    this._done = false;
    this._step = undefined;
    this._code = "";
    this._error = undefined;
    this._revealed = false;
    this._copied = false;
    this._open = true;
    const current = this._instance;
    try {
      const step = await this.hass.callWS<DataEntryFlowStep>({
        type: "auth/setup_mfa",
        mfa_module_id: MODULE_ID,
      });
      if (current === this._instance) {
        this._step = step;
      }
    } catch {
      if (current === this._instance) {
        this._error = this.hass.localize(
          "ui.panel.profile.authenticator.load_failed"
        );
      }
    }
  }

  public closeDialog() {
    this._open = false;
  }

  private _dialogClosed() {
    window.clearTimeout(this._copiedTimer);
    const callback = this._params?.dialogClosedCallback;
    const done = this._done;
    // Drop the key and the setup address from memory.
    this._instance++;
    this._step = undefined;
    this._code = "";
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
    callback?.({ done });
  }

  private get _form(): DataEntryFlowStepForm | undefined {
    return this._step?.type === "form" ? this._step : undefined;
  }

  private _placeholder(name: string): string | undefined {
    const form = this._form;
    const value = form?.description_placeholders?.[name];
    return typeof value === "string" ? value : undefined;
  }

  private _groups(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const finished = this._step?.type === "create_entry";
    return html`
      <ha-dialog
        .open=${this._open}
        .preventScrimClose=${Boolean(this._form)}
        header-title=${this.hass.localize(
          "ui.panel.profile.authenticator.setup_title"
        )}
        @closed=${this._dialogClosed}
      >
        ${this._renderBody(finished)}
        <ha-dialog-footer slot="footer">
          <ha-button
            slot=${this._form ? "secondaryAction" : "primaryAction"}
            appearance=${this._form ? "plain" : "filled"}
            @click=${this.closeDialog}
          >
            ${this.hass.localize(
              this._form
                ? "ui.common.cancel"
                : "ui.panel.profile.authenticator.close"
            )}
          </ha-button>
          ${
            this._form
              ? html`<ha-button
                  slot="primaryAction"
                  .disabled=${this._code.length !== CODE_LENGTH}
                  .loading=${this._submitting}
                  @click=${this._submit}
                >
                  ${this.hass.localize(
                    "ui.panel.profile.authenticator.confirm"
                  )}
                </ha-button>`
              : nothing
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderBody(finished: boolean) {
    if (finished) {
      return html`<ha-alert alert-type="success" role="status">
        ${this.hass.localize("ui.panel.profile.authenticator.done")}
      </ha-alert>`;
    }
    if (this._step?.type === "abort") {
      return html`<ha-alert alert-type="error">
        ${this.hass.localize("ui.panel.profile.authenticator.load_failed")}
      </ha-alert>`;
    }
    if (!this._form) {
      return this._error
        ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
        : html`<div class="spinner"><ha-spinner></ha-spinner></div>`;
    }
    const secret = this._placeholder("code") ?? "";
    const url = this._placeholder("url");
    const digitsLeft = CODE_LENGTH - this._code.length;
    return html`
      <p class="intro">
        ${this.hass.localize("ui.panel.profile.authenticator.setup_intro")}
      </p>
      <div class="layout">
        <div
          class="qr"
          role="img"
          aria-label=${this.hass.localize(
            "ui.panel.profile.authenticator.qr_label"
          )}
        >
          ${url ? html`<ha-qr-code .data=${url} .scale="4" .margin="2"></ha-qr-code>` : nothing}
        </div>
        <div class="side">
          <div class="label" id="secret-label">
            ${this.hass.localize("ui.panel.profile.authenticator.type_secret")}
          </div>
          <div class="secret-row">
            <code class="secret" aria-labelledby="secret-label">
              ${
                this._revealed
                  ? this._groups(secret)
                  : this._groups("x".repeat(secret.length)).replace(/x/g, "•")
              }
            </code>
            <ha-button
              appearance="plain"
              size="s"
              aria-pressed=${this._revealed ? "true" : "false"}
              @click=${this._toggleReveal}
            >
              <ha-svg-icon
                slot="start"
                .path=${this._revealed ? mdiEyeOff : mdiEye}
              ></ha-svg-icon>
              ${this.hass.localize(
                this._revealed
                  ? "ui.panel.profile.authenticator.hide"
                  : "ui.panel.profile.authenticator.show"
              )}
            </ha-button>
            <ha-button appearance="plain" size="s" @click=${this._copy}>
              <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
              ${this.hass.localize("ui.panel.profile.authenticator.copy")}
            </ha-button>
          </div>
          <div class="facts">
            <span>SHA-1</span>
            <span>
              ${this.hass.localize("ui.panel.profile.authenticator.digits", {
                count: CODE_LENGTH,
              })}
            </span>
            <span>
              ${this.hass.localize("ui.panel.profile.authenticator.period", {
                count: 30,
              })}
            </span>
          </div>
          <ha-input
            .label=${this.hass.localize("ui.panel.profile.authenticator.code")}
            .value=${this._code}
            inputmode="numeric"
            autocomplete="off"
            maxlength=${CODE_LENGTH}
            .hint=${this.hass.localize(
              digitsLeft > 0
                ? "ui.panel.profile.authenticator.digits_left"
                : "ui.panel.profile.authenticator.digits_ready",
              { count: digitsLeft }
            )}
            @input=${this._codeChanged}
            @keydown=${this._keydown}
          ></ha-input>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
          <p class="status" role="status">
            ${
              this._copied
                ? this.hass.localize("ui.panel.profile.authenticator.copied")
                : nothing
            }
          </p>
          <div class="notice">
            <ha-svg-icon .path=${mdiShieldLock}></ha-svg-icon>
            <span>
              ${this.hass.localize("ui.panel.profile.authenticator.secret_note")}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private _toggleReveal() {
    this._revealed = !this._revealed;
  }

  private async _copy() {
    const secret = this._placeholder("code");
    if (!secret) {
      return;
    }
    await copyToClipboard(secret, this);
    this._copied = true;
    window.clearTimeout(this._copiedTimer);
    this._copiedTimer = window.setTimeout(() => {
      this._copied = false;
    }, 2500);
  }

  private _codeChanged(ev: Event) {
    const input = ev.target as HaInput;
    const digits = (input.value ?? "").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (digits !== input.value) {
      input.value = digits;
    }
    this._code = digits;
    this._error = undefined;
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" && this._code.length === CODE_LENGTH) {
      this._submit();
    }
  }

  private async _submit() {
    const form = this._form;
    if (!form || this._code.length !== CODE_LENGTH || this._submitting) {
      return;
    }
    this._submitting = true;
    this._error = undefined;
    const current = this._instance;
    try {
      const step = await this.hass.callWS<DataEntryFlowStep>({
        type: "auth/setup_mfa",
        flow_id: form.flow_id,
        user_input: { code: this._code },
      });
      if (current !== this._instance) {
        return;
      }
      if (step.type === "create_entry") {
        this._done = true;
        this._step = step;
      } else if (step.type === "form") {
        this._step = step;
        this._code = "";
        this._error = this.hass.localize(
          "ui.panel.profile.authenticator.invalid_code"
        );
      } else {
        this._step = step;
      }
    } catch {
      if (current === this._instance) {
        this._error = this.hass.localize(
          "ui.panel.profile.authenticator.submit_failed"
        );
      }
    } finally {
      this._submitting = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .intro {
          margin: 0 0 var(--ha-space-4);
        }
        .layout {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-4);
          align-items: flex-start;
        }
        .qr {
          background: #fff;
          color: #000;
          border-radius: var(--ha-border-radius-lg, 16px);
          padding: var(--ha-space-2);
          flex: 0 0 auto;
          max-width: 100%;
        }
        .side {
          flex: 1 1 260px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .label {
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
        .secret-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          background: var(--secondary-background-color);
          border-radius: var(--ha-border-radius-lg, 16px);
          padding: var(--ha-space-2) var(--ha-space-3);
        }
        .secret {
          flex: 1 1 100%;
          font-family: var(--ha-font-family-code, monospace);
          letter-spacing: 0.08em;
          overflow-wrap: anywhere;
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        .secret-row ha-button {
          min-height: 44px;
        }
        .facts {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .facts span {
          background: var(--secondary-background-color);
          border-radius: 999px;
          padding: var(--ha-space-1) var(--ha-space-3);
          font-size: var(--ha-font-size-s);
        }
        .status {
          margin: 0;
          min-height: 1.5em;
          color: var(--secondary-text-color);
        }
        .notice {
          display: flex;
          gap: var(--ha-space-3);
          align-items: center;
          background: var(--secondary-background-color);
          border-radius: var(--ha-border-radius-lg, 16px);
          padding: var(--ha-space-3);
          font-size: var(--ha-font-size-s);
        }
        .notice ha-svg-icon {
          flex: 0 0 auto;
        }
        .spinner {
          text-align: center;
          padding: var(--ha-space-6);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-authenticator-setup-dialog": HaAuthenticatorSetupDialog;
  }
}
