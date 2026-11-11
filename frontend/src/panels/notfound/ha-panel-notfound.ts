import { mdiShieldLockOutline } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { navigate } from "../../common/navigate";
import "../../components/ha-button";
import "../../components/ha-svg-icon";
import "../../components/ha-top-app-bar-fixed";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant, PanelInfo, Route } from "../../types";

@customElement("ha-panel-notfound")
class HaPanelNotFound extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route?: Route;

  @property({ attribute: false }) public panel?: PanelInfo;

  protected render(): TemplateResult {
    const localize = this.hass.localize;
    return html`
      <ha-top-app-bar-fixed no-page-tools .narrow=${this.narrow}>
        <div class="content">
          <div class="panel" role="status">
            <div class="tile">
              <ha-svg-icon .path=${mdiShieldLockOutline}></ha-svg-icon>
            </div>
            <h2 class="title">
              ${localize("ui.panel.notfound.no_access_title")}
            </h2>
            <div class="message">
              ${localize("ui.panel.notfound.no_access_content")}
            </div>
            <div class="actions">
              <ha-button appearance="filled" @click=${this._goToProfile}>
                ${localize("ui.panel.notfound.no_access_go_to_profile")}
              </ha-button>
              <ha-button appearance="plain" @click=${this._switchAccount}>
                ${localize("ui.status_screens.switch_account")}
              </ha-button>
            </div>
          </div>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  private _goToProfile(): void {
    navigate("/profile/dashboard");
  }

  // Same confirmed sign-out the profile page offers.
  private _switchAccount(): void {
    showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.profile.logout_title"),
      text: this.hass.localize("ui.panel.profile.logout_text"),
      confirmText: this.hass.localize("ui.panel.profile.logout"),
      confirm: () => fireEvent(this, "hass-logout"),
      destructive: true,
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      height: 100%;
      background-color: var(--primary-background-color);
    }
    .content {
      color: var(--primary-text-color);
      height: 100%;
      display: flex;
      padding: var(--ha-space-4);
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      max-width: 480px;
      padding: var(--ha-space-6);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      text-align: center;
    }
    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: var(--ha-border-radius-xl);
      background: var(--primary-background-color);
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .message {
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    ha-button {
      min-height: 44px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-notfound": HaPanelNotFound;
  }
}
