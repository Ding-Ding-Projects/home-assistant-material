import { mdiFingerprint } from "@mdi/js";
import { genClientId } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-alert";
import "../components/ha-button";
import "../components/ha-svg-icon";
import { redirectWithAuthCode } from "../data/auth";
import {
  fetchPasskeyAvailable,
  isPasskeySupported,
  signInWithPasskey,
  toPasskeyError,
} from "../data/passkey";

type State = "idle" | "working" | "cancelled" | "error";

@customElement("ha-passkey-login")
export class HaPasskeyLogin extends LitElement {
  @property({ attribute: false }) public clientId?: string;

  @property({ attribute: false }) public redirectUri?: string;

  @property({ attribute: false }) public oauth2State?: string;

  @property({ attribute: false }) public codeChallenge?: string;

  @property({ attribute: false }) public codeChallengeMethod?: string;

  @property({ attribute: false }) public initStoreToken = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _state: State = "idle";

  @state() private _available = false;

  private _supported = isPasskeySupported();

  public connectedCallback() {
    super.connectedCallback();
    if (this._supported) {
      fetchPasskeyAvailable().then((available) => {
        this._available = available;
      });
    }
  }

  protected render() {
    if (
      !this._supported ||
      !this._available ||
      !this.clientId ||
      !this.redirectUri
    ) {
      return nothing;
    }

    return html`
      <div class="divider" role="separator">
        <span>${this._localize("ui.panel.page-authorize.passkey.or")}</span>
      </div>
      ${
        this._state === "error"
          ? html`<ha-alert alert-type="error">
              ${this._localize("ui.panel.page-authorize.passkey.error")}
            </ha-alert>`
          : this._state === "cancelled"
            ? html`<ha-alert alert-type="info">
                ${this._localize("ui.panel.page-authorize.passkey.cancelled")}
              </ha-alert>`
            : nothing
      }
      <ha-button
        appearance="outlined"
        class="sign-in"
        .loading=${this._state === "working"}
        .disabled=${this._state === "working"}
        @click=${this._signIn}
      >
        <ha-svg-icon slot="start" .path=${mdiFingerprint}></ha-svg-icon>
        ${this._localize("ui.panel.page-authorize.passkey.sign_in")}
      </ha-button>
    `;
  }

  private async _signIn(): Promise<void> {
    this._state = "working";
    try {
      const code = await signInWithPasskey({
        clientId: this.clientId!,
        redirectUri: this.redirectUri!,
        codeChallenge: this.codeChallenge,
        codeChallengeMethod: this.codeChallengeMethod,
      });
      redirectWithAuthCode(
        this.redirectUri!,
        code,
        this.oauth2State,
        this.initStoreToken && this.clientId === genClientId()
      );
    } catch (err) {
      this._state =
        toPasskeyError(err).kind === "cancelled" ? "cancelled" : "error";
    }
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      max-width: 336px;
      margin-top: var(--ha-space-4);
    }
    .divider {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    .divider::before,
    .divider::after {
      content: "";
      flex: 1;
      border-top: 1px solid var(--divider-color);
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    .sign-in {
      width: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-passkey-login": HaPasskeyLogin;
  }
}
