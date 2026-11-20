import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import "../../../components/ha-card";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../layouts/hass-subpage";
import { ChildPanelReady } from "../../../layouts/panel-ready";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { configSections } from "../config-sections";
import "../dashboard/ha-config-navigation";
import "../ha-config-section";

@customElement("ha-config-connectivity")
class HaConfigConnectivity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  /** The text of this page's search field. */
  @state() private _filter = "";

  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  public constructor() {
    super();
    new ChildPanelReady(this);
  }

  protected render(): TemplateResult {
    const title = this.hass.localize(
      "ui.panel.config.dashboard.connectivity.main"
    );

    return html`
      <hass-subpage
        .hass=${this.hass}
        back-path="/config"
        .header=${title}
        .narrow=${this.narrow}
      >
        <ha-config-section .isWide=${this.isWide} full-width>
          <div class="search">
            <ha-input-search
              appearance="outlined"
              .label=${this._lang.text(
                this.hass.localize,
                "ui.components.top_bar_search.search_pages"
              )}
              .value=${this._filter}
              @input=${this._handleSearchChange}
            ></ha-input-search>
          </div>
          <ha-card outlined>
            <ha-config-navigation
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${configSections.connectivity}
              .label=${title}
              .filter=${this._filter}
            ></ha-config-navigation>
          </ha-card>
        </ha-config-section>
      </hass-subpage>
    `;
  }

  private _handleSearchChange(ev: InputEvent): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .search {
          margin: var(--ha-space-4) 0;
        }
        .search ha-input-search {
          display: block;
        }
        ha-config-navigation {
          padding-bottom: var(--ha-space-2);
        }
        ha-config-section {
          margin: auto;
          margin-top: -32px;
          max-width: 600px;
        }

        ha-card {
          overflow: hidden;
          margin-bottom: max(24px, var(--safe-area-inset-bottom));
        }

        @media all and (max-width: 600px) {
          ha-card {
            border-width: 1px 0;
            border-radius: var(--ha-border-radius-square);
            box-shadow: unset;
          }
          ha-config-section {
            margin-top: -42px;
          }
          .search {
            margin-inline: var(--ha-space-3);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-connectivity": HaConfigConnectivity;
  }
}
