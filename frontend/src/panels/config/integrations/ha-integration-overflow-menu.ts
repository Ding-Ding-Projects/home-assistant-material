import { mdiDotsVertical } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import type { HomeAssistant } from "../../../types";

import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../../common/translations/localize";

@customElement("ha-integration-overflow-menu")
export class HaIntegrationOverflowMenu extends LitElement {
  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // The page's strings in the chosen language mode, where they have Cantonese.
  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  protected render() {
    return html`
      <ha-dropdown>
        <ha-icon-button
          slot="trigger"
          .label=${this._modeLocalize("ui.common.menu")}
          .path=${mdiDotsVertical}
        ></ha-icon-button>
        <a href="/config/application_credentials">
          <ha-dropdown-item>
            ${this._modeLocalize(
              "ui.panel.config.application_credentials.caption"
            )}
          </ha-dropdown-item>
        </a>
      </ha-dropdown>
    `;
  }

  static styles = css`
    :host {
      display: flex;
    }
    a {
      text-decoration: none;
    }
  `;
}
declare global {
  interface HTMLElementTagNameMap {
    "ha-integration-overflow-menu": HaIntegrationOverflowMenu;
  }
}
