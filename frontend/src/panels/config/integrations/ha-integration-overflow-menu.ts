import { mdiDotsVertical, mdiExport, mdiImport } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";

import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../../common/translations/localize";
import {
  showIntegrationsListExportDialog,
  showIntegrationsListImportDialog,
} from "./transfer/show-transfer-dialogs";

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
    const isAdmin = !!this.hass.user?.is_admin;
    return html`
      <ha-dropdown @wa-select=${this._handleSelect}>
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
        ${
          isAdmin
            ? html`
                <ha-dropdown-item value="export_list">
                  <ha-svg-icon slot="icon" .path=${mdiExport}></ha-svg-icon>
                  ${this._modeLocalize(
                    "ui.panel.config.integrations.transfer.menu_export_list"
                  )}
                </ha-dropdown-item>
                <ha-dropdown-item value="import_list">
                  <ha-svg-icon slot="icon" .path=${mdiImport}></ha-svg-icon>
                  ${this._modeLocalize(
                    "ui.panel.config.integrations.transfer.menu_import_list"
                  )}
                </ha-dropdown-item>
              `
            : nothing
        }
      </ha-dropdown>
    `;
  }

  private _handleSelect = (ev: HaDropdownSelectEvent) => {
    const value = ev.detail.item.value;
    if (value === "export_list") {
      showIntegrationsListExportDialog(this);
    } else if (value === "import_list") {
      showIntegrationsListImportDialog(this);
    }
  };

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
