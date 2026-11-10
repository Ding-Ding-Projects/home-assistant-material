import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../layouts/hass-subpage";
import type { RefreshToken } from "../../data/refresh_token";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import "./ha-change-password-card";
import "./ha-long-lived-access-tokens-card";
import "./ha-mfa-modules-card";
import "./ha-profile-tabs";
import "./ha-refresh-tokens-card";

@customElement("ha-profile-section-security")
class HaProfileSectionSecurity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _refreshTokens?: RefreshToken[];

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  public connectedCallback() {
    super.connectedCallback();
    this._refreshRefreshTokens();
  }

  public firstUpdated() {
    if (!this._refreshTokens) {
      this._refreshRefreshTokens();
    }
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize("panel.profile")}
      >
        <div class="container">
          <ha-profile-tabs
            .hass=${this.hass}
            active="security"
          ></ha-profile-tabs>
          <div class="cards">
            <div class="column">
              ${
                this.hass.user!.credentials.some(
                  (cred) => cred.auth_provider_type === "homeassistant"
                )
                  ? html`
                      <ha-change-password-card
                        .refreshTokens=${this._refreshTokens}
                        @hass-refresh-tokens=${this._refreshRefreshTokens}
                        .hass=${this.hass}
                      ></ha-change-password-card>
                    `
                  : ""
              }
              <ha-mfa-modules-card
                .hass=${this.hass}
                .mfaModules=${this.hass.user!.mfa_modules}
              ></ha-mfa-modules-card>
            </div>
            <div class="column">
              <ha-refresh-tokens-card
                .hass=${this.hass}
                .refreshTokens=${this._refreshTokens}
                @hass-refresh-tokens=${this._refreshRefreshTokens}
              ></ha-refresh-tokens-card>

              <ha-long-lived-access-tokens-card
                .hass=${this.hass}
                .refreshTokens=${this._refreshTokens}
                @hass-refresh-tokens=${this._refreshRefreshTokens}
              ></ha-long-lived-access-tokens-card>
            </div>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private async _refreshRefreshTokens() {
    if (!this.hass) {
      return;
    }
    this._refreshTokens = await this.hass.callWS({
      type: "auth/refresh_tokens",
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: initial;
        }

        .container {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-5)
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
        }

        :host([narrow]) .container {
          padding: var(--ha-space-2) var(--ha-space-3)
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 340px), 1fr)
          );
          align-items: start;
          gap: var(--ha-space-4);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }

        .column > * {
          display: block;
        }
      `,
    ];
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-section-security": HaProfileSectionSecurity;
  }
}
