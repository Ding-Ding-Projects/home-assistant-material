import { mdiChevronDown, mdiDotsVertical } from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { modeText } from "../../../common/language-mode/language-mode";
import { isNavigationClick } from "../../../common/dom/is-navigation-click";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../layouts/hass-subpage";
import type { LocalizeKeys } from "../../../common/translations/localize";
import type { HomeAssistant, Route } from "../../../types";
import { partitionTools, resolveToolPanel } from "./tools-navigation";
import type { ToolsSearchState } from "./tools-search";
import "./tools-router";

@customElement("ha-panel-tools")
class PanelTools extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  // What each tab told the page about its main search, by tab
  @state() private _searches: Record<string, ToolsSearchState> = {};

  @query("hass-subpage")
  private _layout?: HTMLElementTagNameMap["hass-subpage"];

  // Whether the bar's search was open, by tab: closing it on one tab does not
  // close it on the next, and a tab with no words opens closed.
  private _searchOpenByTab: Record<string, boolean> = {};

  // The tab whose bar state was last put in order.
  private _syncedPage?: string;

  private _syncingSearch = false;

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    const page = resolveToolPanel(this._page);
    const search = this._searches[page];
    if (!search?.searchable || !this._layout || this._syncedPage === page) {
      return;
    }
    this._syncedPage = page;
    const wantOpen = this._searchOpenByTab[page] ?? !!search.value;
    this._syncingSearch = true;
    if (wantOpen) {
      this._layout.openSearch();
    } else {
      this._layout.closeSearch();
    }
    this._syncingSearch = false;
  }

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
    const search = this._searches[page];

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${localize("ui.panel.config.dashboard.tools.main")}
        .searchable=${!!search?.searchable}
        .searchLabel=${search?.label}
        .searchValue=${search?.value ?? ""}
        .searchCountText=${search?.countText}
        .searchSamples=${search?.samples}
        @top-bar-search-input=${this._searchInput}
        @top-bar-search-open=${this._searchOpened}
        @top-bar-search-close=${this._searchClosed}
        @top-bar-search-step=${this._searchStep}
      >
        <ha-dropdown slot="toolbar-icon" @wa-select=${this._handleMenuAction}>
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
                              <span class="more-text">
                                <span class="more-name"
                                  >${localize(tab.translationKey as LocalizeKeys)}</span
                                >
                                <span class="more-description"
                                  >${modeText(localize, tab.descriptionKey)}</span
                                >
                              </span>
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
            @tools-search-state=${this._searchReported}
            @tools-search-open=${this._searchOpenRequested}
          ></tools-router>
        </div>
      </hass-subpage>
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

  // The tab that is showing owns the bar's search; the others keep their own words
  private get _activeSearch(): ToolsSearchState | undefined {
    return this._searches[resolveToolPanel(this._page)];
  }

  private _searchReported(ev: CustomEvent<ToolsSearchState>) {
    ev.stopPropagation();
    this._searches = { ...this._searches, [ev.detail.panel]: ev.detail };
  }

  private _searchOpened() {
    this._searchOpenByTab[resolveToolPanel(this._page)] = true;
  }

  private _searchOpenRequested(ev: Event) {
    ev.stopPropagation();
    this._layout?.openSearch();
  }

  private _searchInput(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    this._activeSearch?.onInput?.(ev.detail.value);
  }

  private _searchClosed(ev: Event) {
    ev.stopPropagation();
    if (this._syncingSearch) {
      return;
    }
    this._searchOpenByTab[resolveToolPanel(this._page)] = false;
    this._activeSearch?.onClose?.();
  }

  private _searchStep(ev: CustomEvent<{ direction: 1 | -1 }>) {
    ev.stopPropagation();
    this._activeSearch?.onStep?.(ev.detail.direction);
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
    .more-text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
      max-width: 280px;
      white-space: normal;
      overflow-wrap: normal;
      word-break: normal;
    }
    .more-name {
      font-weight: var(--ha-font-weight-medium);
    }
    .more-description {
      display: block;
      white-space: normal;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    tools-router {
      display: block;
      flex: 1;
    }
    /* Phone: a 22 px title and 44 px pills. */
    @media (max-width: 600px) {
      .header {
        gap: var(--ha-space-2);
        padding: var(--ha-space-3) var(--ha-space-3) 0;
      }
      .pill {
        min-height: 44px;
        padding: 0 var(--ha-space-4);
        font-size: 14px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-tools": PanelTools;
  }
}
