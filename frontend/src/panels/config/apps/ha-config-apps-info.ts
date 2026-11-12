import { mdiEyeOff, mdiOpenInNew, mdiPuzzle } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import { saveFrontendUserData } from "../../../data/frontend";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { navigate } from "../../../common/navigate";

@customElement("ha-config-apps-info")
class HaConfigAppsInfo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this.hass.localize("ui.panel.config.dashboard.apps.main")}
      >
        <div class="content">
          <div class="icon-wrap">
            <ha-svg-icon .path=${mdiPuzzle}></ha-svg-icon>
          </div>
          <h1>
            ${this.hass.localize("ui.panel.config.apps.info.needs_os_title")}
          </h1>
          <p>
            ${this.hass.localize("ui.panel.config.apps.info.no_store_text")}
          </p>
          <div class="actions">
            <ha-button
              href=${documentationUrl(this.hass, "/installation/")}
              target="_blank"
              rel="noreferrer"
            >
              <ha-svg-icon slot="start" .path=${mdiOpenInNew}></ha-svg-icon>
              ${this.hass.localize("ui.panel.config.apps.info.compare_methods")}
            </ha-button>
            <ha-button @click=${this._dismiss} appearance="outlined">
              <ha-svg-icon slot="start" .path=${mdiEyeOff}></ha-svg-icon>
              ${this.hass.localize("ui.panel.config.apps.info.dismiss")}
            </ha-button>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private async _dismiss(): Promise<void> {
    try {
      await saveFrontendUserData(this.hass.connection, "core", {
        ...this.hass.userData,
        apps_info_dismissed: true,
      });
    } catch (err) {
      showAlertDialog(this, { text: (err as Error).message });
      return;
    }
    navigate("/config", { replace: true });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          box-sizing: border-box;
          max-width: 640px;
          margin: 0 auto;
          padding: var(--ha-space-10) var(--ha-space-4);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--ha-space-4);
        }
        .icon-wrap {
          display: grid;
          place-items: center;
          width: 96px;
          height: 96px;
          border-radius: var(--ha-border-radius-3xl, 32px);
          background: linear-gradient(
            135deg,
            var(--ha-color-fill-primary-normal-resting),
            var(--ha-color-fill-neutral-normal-resting)
          );
          color: var(--primary-color);
        }
        .icon-wrap ha-svg-icon {
          --mdc-icon-size: 48px;
          width: 48px;
          height: 48px;
        }
        h1 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        p {
          margin: 0;
          line-height: var(--ha-line-height-normal);
          color: var(--secondary-text-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--ha-space-3);
          margin-top: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-apps-info": HaConfigAppsInfo;
  }
}
