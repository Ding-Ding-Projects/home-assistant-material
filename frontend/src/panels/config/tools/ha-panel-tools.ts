import { mdiChevronDown, mdiDotsVertical } from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { modeText } from "../../../common/language-mode/language-mode";
import { isNavigationClick } from "../../../common/dom/is-navigation-click";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-button-arrow-prev";
import "../../../components/ha-svg-icon";
import "../../../components/ha-top-app-bar-fixed";
import type { LocalizeKeys } from "../../../common/translations/localize";
import type { HomeAssistant, Route } from "../../../types";
import { partitionTools, resolveToolPanel } from "./tools-navigation";
import "./tools-router";

@customElement("ha-panel-tools")
class PanelTools extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
  }

  protected render(): TemplateResult {
    const page = resolveToolPanel(this._page);
    const { main, more } = partitionTools(
      (tab) =>
        !tab.component || isComponentLoaded(this.hass.config, tab.component)
    );
    const moreActive = more.some((tab) => tab.panel === page);
    const localize = this.hass.localize;

    return html`
      <ha-top-app-bar-fixed .narrow=${this.narrow}>
        <ha-icon-button-arrow-prev
          slot="navigationIcon"
          @click=${this._handleBack}
        ></ha-icon-button-arrow-prev>
        <ha-dropdown slot="actionItems" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>
          <ha-dropdown-item value="debug">
            ${localize("ui.panel.config.tools.tabs.debug.title")}
          </ha-dropdown-item>
        </ha-dropdown>
        <div class="wrapper">
          <header class="header">
            <h1>${localize("ui.panel.config.dashboard.tools.main")}</h1>
            <nav
              class="pills"
              aria-label=${modeText(localize, "ui.panel.config.tools.nav.label")}
            >
              ${main.map(
                (tab) => html`
                  <a
                    class=${classMap({ pill: true, active: page === tab.panel })}
                    href="/config/tools/${tab.panel}"
                    aria-current=${page === tab.panel ? "page" : "false"}
                    @click=${this._handleAnchorClick}
                    >${localize(tab.translationKey as LocalizeKeys)}</a
                  >
                `
              )}
              ${
                more.length
                  ? html`
                      <ha-dropdown
                        class="more"
                        placement="bottom-end"
                        @wa-select=${this._handleMoreSelect}
                      >
                        <button
                          slot="trigger"
                          type="button"
                          class=${classMap({ pill: true, active: moreActive })}
                          aria-haspopup="menu"
                        >
                          ${modeText(
                            localize,
                            "ui.panel.config.tools.nav.more",
                            {
                              count: more.length,
                            }
                          )}
                          <ha-svg-icon .path=${mdiChevronDown}></ha-svg-icon>
                        </button>
                        ${more.map(
                          (tab) => html`
                            <ha-dropdown-item
                              class="more-item"
                              .value=${tab.panel}
                              .selected=${page === tab.panel}
                            >
                              ${localize(tab.translationKey as LocalizeKeys)}
                              <span slot="details" class="more-description"
                                >${modeText(localize, tab.descriptionKey)}</span
                              >
                            </ha-dropdown-item>
                          `
                        )}
                      </ha-dropdown>
                    `
                  : nothing
              }
            </nav>
          </header>
          <tools-router
            .route=${this.route}
            .narrow=${this.narrow}
            .hass=${this.hass}
          ></tools-router>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  private _handleAnchorClick(ev: MouseEvent) {
    const href = isNavigationClick(ev);
    if (href) {
      navigate(href);
    }
  }

  private _handleMoreSelect(ev: HaDropdownSelectEvent) {
    ev.stopPropagation();
    const panel = ev.detail.item.value;
    if (!panel) {
      return;
    }
    if (panel !== resolveToolPanel(this._page)) {
      navigate(`/config/tools/${panel}`);
    }
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    if (action === "debug") {
      navigate(`/config/tools/debug`);
    }
  }

  private get _page() {
    return this.route.path.substr(1);
  }

  private _handleBack() {
    navigate("/config");
  }

  static readonly styles: CSSResultGroup = css`
    .wrapper {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .header {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-4) var(--ha-space-4) 0;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
    h1 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-bold, 700);
      line-height: var(--ha-line-height-condensed);
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      overflow-wrap: anywhere;
    }
    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      align-items: center;
    }
    .pill {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-1);
      min-height: 48px;
      padding: 0 var(--ha-space-5);
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font-family: inherit;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .pill:hover {
      background: var(--secondary-background-color);
    }
    .pill:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .pill.active {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .pill ha-svg-icon {
      --mdc-icon-size: 20px;
    }
    .more-description {
      display: block;
      max-width: 280px;
      white-space: normal;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    tools-router {
      display: block;
      flex: 1;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-tools": PanelTools;
  }
}
