import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { atLeastVersion } from "../common/config/version";
import { applyThemesOnElement } from "../common/dom/apply_themes_on_element";
import "../components/ha-card";
import { haStyle } from "../resources/styles";
import { documentationUrl } from "../util/documentation-url";
import type { HomeAssistant } from "../types";
import "./hass-subpage";

import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../common/translations/localize";

@customElement("supervisor-error-screen")
class SupervisorErrorScreen extends LitElement {
  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // The page's strings in the chosen language mode, where they have Cantonese.
  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    this._applyTheme();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    if (!oldHass) {
      return;
    }
    if (oldHass.themes !== this.hass.themes) {
      this._applyTheme();
    }
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .header=${this._modeLocalize("ui.errors.supervisor.title")}
      >
        <ha-card header="Troubleshooting">
          <div class="card-content">
            <ol>
              <li>${this._modeLocalize("ui.errors.supervisor.wait")}</li>
              <li>
                <a
                  class="supervisor_error-link"
                  href="http://homeassistant.local:4357"
                  target="_blank"
                  rel="noreferrer"
                >
                  ${this._modeLocalize("ui.errors.supervisor.observer")}
                </a>
              </li>
              <li>${this._modeLocalize("ui.errors.supervisor.reboot")}</li>
              <li>
                <a href="/config/info" target="_parent">
                  ${this._modeLocalize("ui.errors.supervisor.system_health")}
                </a>
              </li>
              <li>
                <a
                  href=${documentationUrl(this.hass, "/help/")}
                  target="_blank"
                  rel="noreferrer"
                >
                  ${this._modeLocalize("ui.errors.supervisor.ask")}
                </a>
              </li>
            </ol>
          </div>
        </ha-card>
      </hass-subpage>
    `;
  }

  private _applyTheme() {
    let themeName: string;
    let themeSettings: Partial<HomeAssistant["selectedTheme"]> | undefined;

    if (atLeastVersion(this.hass.config.version, 0, 114)) {
      themeName =
        this.hass.selectedTheme?.theme ||
        (this.hass.themes.darkMode && this.hass.themes.default_dark_theme
          ? this.hass.themes.default_dark_theme!
          : this.hass.themes.default_theme);

      themeSettings = this.hass.selectedTheme;
    } else {
      themeName =
        (this.hass.selectedTheme as unknown as string) ||
        this.hass.themes.default_theme;
    }

    applyThemesOnElement(
      this.parentElement,
      this.hass.themes,
      themeName,
      themeSettings,
      true
    );
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        a {
          color: var(--mdc-theme-primary);
        }

        ha-card {
          width: 600px;
          margin: auto;
          padding: 8px;
        }
        @media all and (max-width: 500px) {
          ha-card {
            width: calc(100vw - 32px);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "supervisor-error-screen": SupervisorErrorScreen;
  }
}
