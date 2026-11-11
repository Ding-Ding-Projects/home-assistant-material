import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-card";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { showAuthenticatorSetupDialog } from "./show-ha-authenticator-setup-dialog";

export const AUTHENTICATOR_MODULE_ID = "totp";

/**
 * Manages the authenticator app step of sign-in. It is a view over the
 * server's existing time-based one-time password module: it turns it on
 * through the module's own setup flow and turns it off with `auth/depose_mfa`.
 * When the server has that module switched off in its configuration the card
 * is not shown.
 */
@customElement("ha-authenticator-card")
class HaAuthenticatorCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _busy = false;

  protected render(): TemplateResult | typeof nothing {
    const module = this.hass.user?.mfa_modules.find(
      (item) => item.id === AUTHENTICATOR_MODULE_ID
    );
    if (!module) {
      return nothing;
    }
    return html`
      <ha-card
        .header=${this.hass.localize("ui.panel.profile.authenticator.header")}
      >
        <div class="card-content">
          <p>
            ${this.hass.localize("ui.panel.profile.authenticator.description")}
          </p>
          <p class="state" role="status">
            ${this.hass.localize(
              module.enabled
                ? "ui.panel.profile.authenticator.state_on"
                : "ui.panel.profile.authenticator.state_off"
            )}
          </p>
          <p class="note">
            ${this.hass.localize("ui.panel.profile.authenticator.key_note")}
          </p>
        </div>
        <div class="card-actions">
          ${
            module.enabled
              ? html`<ha-button
                  appearance="plain"
                  variant="danger"
                  .disabled=${this._busy}
                  @click=${this._remove}
                >
                  ${this.hass.localize("ui.panel.profile.authenticator.remove")}
                </ha-button>`
              : html`<ha-button .disabled=${this._busy} @click=${this._setup}>
                  ${this.hass.localize("ui.panel.profile.authenticator.set_up")}
                </ha-button>`
          }
        </div>
      </ha-card>
    `;
  }

  private _setup() {
    showAuthenticatorSetupDialog(this, {
      dialogClosedCallback: ({ done }) => {
        if (done) {
          fireEvent(this, "hass-refresh-current-user");
        }
      },
    });
  }

  private async _remove() {
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.authenticator.confirm_remove_title"
        ),
        text: this.hass.localize(
          "ui.panel.profile.authenticator.confirm_remove"
        ),
        confirmText: this.hass.localize(
          "ui.panel.profile.authenticator.remove"
        ),
        destructive: true,
      }))
    ) {
      return;
    }
    this._busy = true;
    try {
      await this.hass.callWS({
        type: "auth/depose_mfa",
        mfa_module_id: AUTHENTICATOR_MODULE_ID,
      });
      fireEvent(this, "hass-refresh-current-user");
    } catch {
      await showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.profile.authenticator.remove_failed"
        ),
      });
    } finally {
      this._busy = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .state {
          font-weight: var(--ha-font-weight-medium);
        }
        .note {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .card-actions {
          display: flex;
          justify-content: flex-end;
        }
        ha-button {
          min-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-authenticator-card": HaAuthenticatorCard;
  }
}
