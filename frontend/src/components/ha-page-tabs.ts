import {
  mdiClose,
  mdiCog,
  mdiFormatPaint,
  mdiHuman,
  mdiTranslate,
  mdiPlus,
  mdiTabPlus,
  mdiTabRemove,
  mdiUndo,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import {
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../common/accessibility/accessibility-tools";
import { storage } from "../common/decorators/storage";
import { fireEvent } from "../common/dom/fire_event";
import { navigate } from "../common/navigate";
import { searchMatcher } from "../common/regex/filter";
import type { BulkCloseMode } from "../common/tabs/bulk-close";
import { planBulkClose } from "../common/tabs/bulk-close";
import {
  FIXED_PANELS,
  getDefaultPanelUrlPath,
  getPanelIcon,
  getPanelIconPath,
  getPanelTitle,
  SYSTEM_PANELS,
} from "../data/panel";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import type { HomeAssistant, PanelInfo } from "../types";
import { isMac } from "../util/is_mac";
import "./ha-icon";
import "./input/ha-input-search";
import type { HaInputSearch } from "./input/ha-input-search";
import "./ha-svg-icon";
import "./user/ha-user-badge";

const CLOSED_TABS_STORAGE_KEY = "pageTabsClosed";

declare global {
  interface HASSDomEvents {
    "hass-show-accessibility-tools": undefined;
    /** Starts the tool that picks an element to edit its appearance. */
    "hass-pick-appearance": undefined;
  }
}

interface PageTab {
  urlPath: string;
  title: string;
  icon?: string;
  iconPath?: string;
}

/**
 * @element ha-page-tabs
 *
 * @summary
 * The bar of open pages at the top of the pane. Every page starts open, in
 * page order. A tab the person closes stays closed until they open it again
 * from the catalog behind the New tab button, which lists every page and can
 * reopen all of them at once. A page added by an update was never closed, so
 * it shows up open. Visiting a page from the navigation rail never adds a tab.
 *
 * Only the list of closed tabs is stored, in this browser.
 */
@customElement("ha-page-tabs")
export class HaPageTabs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @storage({ key: CLOSED_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _closed: string[] = [];

  @state() private _accessibilityButtonHidden =
    getAccessibilitySettings().hideButton;

  private _unsubAccessibility?: UnsubscribeFunc;

  @state() private _filter = "";

  /** Tabs closed by the last bulk close, kept so it can be undone. */
  @state() private _bulkClosed: string[] = [];

  @query("#catalog") private _catalog?: HTMLElement;

  @query("#catalog-search") private _search?: HaInputSearch;

  @queryAll(".tab-button") private _tabButtons?: NodeListOf<HTMLButtonElement>;

  private _computeTabs = memoizeOne(
    (
      panels: HomeAssistant["panels"],
      defaultPanel: string,
      isAdmin: boolean,
      localize: HomeAssistant["localize"]
    ): PageTab[] => {
      if (!panels) {
        return [];
      }
      const toTab = (panel: PanelInfo, title: string): PageTab => ({
        urlPath: panel.url_path,
        title,
        icon: getPanelIcon(panel),
        iconPath: getPanelIconPath(panel),
      });
      const tabs: PageTab[] = [];
      Object.values(panels).forEach((panel) => {
        if (
          FIXED_PANELS.includes(panel.url_path) ||
          SYSTEM_PANELS.includes(panel.url_path)
        ) {
          return;
        }
        const isDefault = panel.url_path === defaultPanel;
        const title = getPanelTitle({ localize }, panel);
        if (!isDefault && (!title || panel.show_in_sidebar === false)) {
          return;
        }
        const tab = toTab(panel, title || panel.url_path);
        if (isDefault) {
          tabs.unshift(tab);
        } else {
          tabs.push(tab);
        }
      });
      if (isAdmin && panels.config) {
        tabs.push({
          urlPath: "config",
          title: localize("panel.config"),
          iconPath: mdiCog,
        });
      }
      return tabs;
    }
  );

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass?.panels) {
      return nothing;
    }
    const tabs = this._computeTabs(
      this.hass.panels,
      getDefaultPanelUrlPath(this.hass),
      Boolean(this.hass.user?.is_admin),
      this.hass.localize
    );
    const closed = new Set(this._closed);
    const open = tabs.filter((tab) => !closed.has(tab.urlPath));
    const current = this.hass.panelUrl;
    const matches = searchMatcher(this._filter);
    const listed = tabs.filter((tab) => matches(tab.title, tab.urlPath));

    return html`
      <div
        class="tabs"
        role="tablist"
        aria-label=${this.hass.localize("ui.page_tabs.open_pages")}
        @keydown=${this._handleTabKeydown}
      >
        ${open.map((tab) => {
          const selected = tab.urlPath === current;
          return html`
            <div class=${classMap({ tab: true, selected })}>
              <button
                class="tab-button"
                role="tab"
                aria-selected=${selected ? "true" : "false"}
                tabindex=${selected || (!open.some((t) => t.urlPath === current) && tab === open[0]) ? "0" : "-1"}
                .urlPath=${tab.urlPath}
                @click=${this._openPage}
              >
                <span class="label">${tab.title}</span>
              </button>
              <button
                class="close"
                aria-label=${this.hass.localize("ui.page_tabs.close_tab", {
                  name: tab.title,
                })}
                .urlPath=${tab.urlPath}
                @click=${this._closeTab}
              >
                <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
              </button>
            </div>
          `;
        })}
      </div>
      <button
        class="new-tab"
        popovertarget="catalog"
        aria-label=${this.hass.localize("ui.page_tabs.new_tab")}
        title=${this.hass.localize("ui.page_tabs.new_tab")}
      >
        <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
      </button>
      <div
        id="catalog"
        popover
        role="dialog"
        aria-label=${this.hass.localize("ui.page_tabs.catalog_title")}
        @toggle=${this._catalogToggled}
      >
        <div class="catalog-header">
          <span class="catalog-title"
            >${this.hass.localize("ui.page_tabs.catalog_title")}</span
          >
          <button
            class="text-button"
            ?disabled=${closed.size === 0}
            @click=${this._openEveryTab}
          >
            <ha-svg-icon .path=${mdiTabPlus}></ha-svg-icon>
            ${this.hass.localize("ui.page_tabs.open_every_tab")}
          </button>
        </div>
        <ha-input-search
          id="catalog-search"
          appearance="outlined"
          .value=${this._filter}
          .placeholder=${this.hass.localize("ui.page_tabs.search")}
          .accessibleLabel=${this.hass.localize("ui.page_tabs.search")}
          .patternSamples=${tabs.map((tab) => tab.title)}
          @input=${this._filterChanged}
        ></ha-input-search>
        ${this._renderBulkClose(tabs, closed, current)}
        <div class="catalog-list" role="list">
          ${
            listed.length
              ? listed.map((tab) => {
                  const isClosed = closed.has(tab.urlPath);
                  return html`
                    <button
                      class=${classMap({ entry: true, closed: isClosed })}
                      role="listitem"
                      .urlPath=${tab.urlPath}
                      @click=${this._openFromCatalog}
                    >
                      <span class="entry-icon">${this._renderIcon(tab)}</span>
                      <span class="entry-text">
                        <span class="entry-title">${tab.title}</span>
                        <span class="entry-state"
                          >${this.hass.localize(
                            isClosed
                              ? "ui.page_tabs.state_closed"
                              : "ui.page_tabs.state_open"
                          )}</span
                        >
                      </span>
                      ${
                        isClosed
                          ? html`<ha-svg-icon .path=${mdiPlus}></ha-svg-icon>`
                          : nothing
                      }
                    </button>
                  `;
                })
              : html`<p class="empty">
                  ${this.hass.localize("ui.page_tabs.no_match")}
                </p>`
          }
        </div>
      </div>
      <div class="actions">
        <ha-input-search
          class="top-search"
          appearance="outlined"
          .placeholder=${this.hass.localize("ui.page_tabs.search_label")}
          .accessibleLabel=${this.hass.localize(
            "ui.page_tabs.search_everything"
          )}
          .patternSamples=${tabs.map((tab) => tab.title)}
          @input=${this._topSearchInput}
          @keydown=${this._topSearchKeydown}
        >
          <kbd slot="end">${isMac ? "⌘ ⇧ F" : "Ctrl Shift F"}</kbd>
        </ha-input-search>
        <button
          class="new-tab"
          aria-label=${this.hass.localize("ui.page_tabs.edit_appearance")}
          title=${this.hass.localize("ui.page_tabs.edit_appearance")}
          @click=${this._pickAppearance}
        >
          <ha-svg-icon .path=${mdiFormatPaint}></ha-svg-icon>
        </button>
        <a
          class="new-tab"
          href="/profile/localization"
          aria-label=${this.hass.localize("ui.page_tabs.language")}
          title=${this.hass.localize("ui.page_tabs.language")}
        >
          <ha-svg-icon .path=${mdiTranslate}></ha-svg-icon>
        </a>
        ${
          this._accessibilityButtonHidden
            ? nothing
            : html`<button
                class="new-tab"
                aria-label=${this.hass.localize("ui.accessibility_tools.title")}
                title=${this.hass.localize("ui.accessibility_tools.title")}
                @click=${this._openAccessibility}
              >
                <ha-svg-icon .path=${mdiHuman}></ha-svg-icon>
              </button>`
        }
        ${
          this.hass.user
            ? html`<a
                class="profile"
                href="/profile"
                aria-label=${this.hass.localize("ui.page_tabs.profile", {
                  name: this.hass.user.name,
                })}
                title=${this.hass.localize("ui.page_tabs.profile", {
                  name: this.hass.user.name,
                })}
              >
                <ha-user-badge .user=${this.hass.user}></ha-user-badge>
              </a>`
            : nothing
        }
      </div>
    `;
  }

  // Close tabs containing the text, or not containing it. The list under the
  // search field shows what the text matches, so it is the preview.
  private _renderBulkClose(
    tabs: PageTab[],
    closed: Set<string>,
    current: string | undefined
  ): TemplateResult | typeof nothing {
    if (this._bulkClosed.length && !this._filter) {
      return html`<div class="bulk" role="status">
        <span class="bulk-note"
          >${this.hass.localize("ui.page_tabs.bulk_done", {
            count: this._bulkClosed.length,
          })}</span
        >
        <button class="text-button" @click=${this._undoBulkClose}>
          <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
          ${this.hass.localize("ui.page_tabs.bulk_undo")}
        </button>
      </div>`;
    }
    if (!this._filter.trim()) {
      return nothing;
    }
    const candidates = tabs.map((tab) => ({
      id: tab.urlPath,
      texts: [tab.title, tab.urlPath],
      open: !closed.has(tab.urlPath),
      current: tab.urlPath === current,
    }));
    const matching = planBulkClose(candidates, this._filter, "matching");
    const others = planBulkClose(candidates, this._filter, "not_matching");
    return html`<div class="bulk">
      <div class="bulk-buttons">
        <button
          class="text-button"
          .mode=${"matching"}
          ?disabled=${!matching.ids.length}
          @click=${this._bulkClose}
        >
          <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
          ${this.hass.localize("ui.page_tabs.bulk_close_matching", {
            count: matching.ids.length,
          })}
        </button>
        <button
          class="text-button"
          .mode=${"not_matching"}
          ?disabled=${!others.ids.length}
          @click=${this._bulkClose}
        >
          <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
          ${this.hass.localize("ui.page_tabs.bulk_close_others", {
            count: others.ids.length,
          })}
        </button>
      </div>
      <span class="bulk-note"
        >${this.hass.localize(
          matching.blocked === "invalid"
            ? "ui.page_tabs.bulk_invalid"
            : "ui.page_tabs.bulk_note"
        )}</span
      >
    </div>`;
  }

  private _bulkClose(ev: Event) {
    const mode = (ev.currentTarget as HTMLElement & { mode: BulkCloseMode })
      .mode;
    const tabs = this._computeTabs(
      this.hass.panels,
      getDefaultPanelUrlPath(this.hass),
      Boolean(this.hass.user?.is_admin),
      this.hass.localize
    );
    const { ids } = planBulkClose(
      tabs.map((tab) => ({
        id: tab.urlPath,
        texts: [tab.title, tab.urlPath],
        open: !this._closed.includes(tab.urlPath),
        current: tab.urlPath === this.hass.panelUrl,
      })),
      this._filter,
      mode
    );
    if (!ids.length) {
      return;
    }
    this._closed = [...this._closed, ...ids];
    this._bulkClosed = ids;
    this._filter = "";
  }

  private _undoBulkClose() {
    const reopen = new Set(this._bulkClosed);
    this._closed = this._closed.filter((urlPath) => !reopen.has(urlPath));
    this._bulkClosed = [];
  }

  public connectedCallback() {
    super.connectedCallback();
    this._accessibilityButtonHidden = getAccessibilitySettings().hideButton;
    this._unsubAccessibility = subscribeAccessibilitySettings((settings) => {
      this._accessibilityButtonHidden = settings.hideButton;
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubAccessibility?.();
    this._unsubAccessibility = undefined;
  }

  private _renderIcon(tab: PageTab) {
    if (tab.iconPath) {
      return html`<ha-svg-icon .path=${tab.iconPath}></ha-svg-icon>`;
    }
    if (tab.icon) {
      return html`<ha-icon .icon=${tab.icon}></ha-icon>`;
    }
    return nothing;
  }

  private _openPage(ev: Event) {
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    navigate(`/${urlPath}`);
  }

  private _closeTab(ev: Event) {
    ev.stopPropagation();
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    if (!this._closed.includes(urlPath)) {
      this._closed = [...this._closed, urlPath];
    }
  }

  private _openFromCatalog(ev: Event) {
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    this._closed = this._closed.filter((closed) => closed !== urlPath);
    this._catalog?.hidePopover();
    navigate(`/${urlPath}`);
  }

  // The search at the top starts the search of everything: what is typed
  // or built here opens the full search with that text already in it.
  private _topSearchInput(ev: Event) {
    const field = ev.target as HaInputSearch;
    const value = field.value ?? "";
    if (!value) {
      return;
    }
    field.value = "";
    field.blur();
    showQuickBar(this, { search: value });
  }

  private _topSearchKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      (ev.currentTarget as HaInputSearch).blur();
      showQuickBar(this, {});
    }
  }

  private _pickAppearance() {
    fireEvent(this, "hass-pick-appearance");
  }

  private _openAccessibility() {
    fireEvent(this, "hass-show-accessibility-tools");
  }

  private _openEveryTab() {
    this._closed = [];
    this._bulkClosed = [];
  }

  private _filterChanged(ev: InputEvent) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _catalogToggled(ev: ToggleEvent) {
    if (ev.newState === "open") {
      this._filter = "";
      this._bulkClosed = [];
      this.updateComplete.then(() => this._search?.focus());
    }
  }

  // Left and right arrows move between tabs, Home and End jump to the ends.
  private _handleTabKeydown(ev: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) {
      return;
    }
    const buttons = Array.from(this._tabButtons ?? []);
    if (!buttons.length) {
      return;
    }
    const index = buttons.findIndex((button) => button.matches(":focus"));
    const rtl = getComputedStyle(this).direction === "rtl";
    const forward = (ev.key === "ArrowRight") !== rtl;
    const next =
      ev.key === "Home"
        ? 0
        : ev.key === "End"
          ? buttons.length - 1
          : (index + (forward ? 1 : -1) + buttons.length) % buttons.length;
    ev.preventDefault();
    buttons[next].focus();
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      box-sizing: border-box;
      height: 100%;
      padding: 0 var(--ha-space-3) 0 var(--ha-space-5);
      border-bottom: var(--ha-card-border-width, 0px) solid
        var(--ha-card-border-color, transparent);
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-body);
      user-select: none;
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .tabs {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
      padding: var(--ha-space-1) 0;
    }
    .tabs::-webkit-scrollbar {
      display: none;
    }
    .tab {
      display: flex;
      align-items: center;
      flex: none;
      height: var(--ha-page-tab-height, var(--ha-space-10));
      border-radius: var(--ha-border-radius-pill);
      color: var(--secondary-text-color);
      transition:
        background-color var(--ha-animation-duration-fast) ease,
        color var(--ha-animation-duration-fast) ease;
    }
    .tab:hover,
    .tab:focus-within {
      background-color: var(--ha-color-fill-neutral-quiet-resting);
      color: var(--primary-text-color);
    }
    .tab.selected {
      background-color: var(--primary-text-color);
      color: var(--primary-background-color);
    }
    .tab-button {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      height: 100%;
      padding-inline: var(--ha-space-4) var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      white-space: nowrap;
    }
    .tab-button ha-svg-icon,
    .tab-button ha-icon {
      --mdc-icon-size: 18px;
    }
    /* The close button shows on the selected tab, and on hover or focus. */
    .close {
      display: none;
      align-items: center;
      justify-content: center;
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      margin-inline: calc(-1 * var(--ha-space-3)) var(--ha-space-1);
      border-radius: var(--ha-border-radius-circle);
      --mdc-icon-size: 16px;
    }
    .tab.selected .close,
    .tab:hover .close,
    .tab:focus-within .close {
      display: flex;
    }
    .close:hover {
      background-color: rgba(127, 127, 127, 0.3);
    }
    .new-tab {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-circle);
      color: var(--secondary-text-color);
      anchor-name: --page-tabs-new;
    }
    a.new-tab {
      text-decoration: none;
    }
    .profile {
      display: flex;
      flex: none;
      border-radius: var(--ha-border-radius-circle);
    }
    .profile ha-user-badge {
      width: var(--ha-space-9);
      height: var(--ha-space-9);
    }
    .profile:focus-visible,
    a.new-tab:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .new-tab:hover {
      background-color: var(--ha-color-fill-neutral-quiet-resting);
      color: var(--primary-text-color);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      flex: none;
      margin-inline-start: auto;
      padding-inline-start: var(--ha-space-4);
    }
    .top-search {
      width: 300px;
      --ha-input-search-height: var(--ha-space-10);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    kbd {
      font-family: var(--ha-font-family-body);
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-hover-color);
      background-color: var(--primary-background-color);
      white-space: nowrap;
    }
    @media (max-width: 1100px) {
      .top-search {
        width: 180px;
      }
      kbd {
        display: none;
      }
    }
    #catalog {
      position: fixed;
      inset: auto;
      top: calc(var(--ha-page-tabs-top, 12px) + var(--ha-space-12));
      inset-inline-start: calc(
        var(--ha-sidebar-width, 88px) + var(--ha-space-5)
      );
      margin: 0;
      width: min(420px, calc(100vw - 32px));
      max-height: min(560px, calc(100vh - 96px));
      box-sizing: border-box;
      padding: var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-4xl);
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      box-shadow:
        0 4px 8px 3px rgba(0, 0, 0, 0.1),
        0 1px 3px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    #catalog:popover-open {
      display: flex;
    }
    .catalog-header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-1) var(--ha-space-2);
    }
    .catalog-title {
      flex: 1;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .text-button {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      height: var(--ha-space-10);
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-text-color));
      font-weight: var(--ha-font-weight-medium);
      white-space: nowrap;
      --mdc-icon-size: 18px;
    }
    .text-button[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    #catalog-search {
      --ha-input-search-height: var(--ha-space-12);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .bulk {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .bulk-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .bulk-note {
      padding: 0 var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .bulk[role="status"] {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
    .catalog-list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      overflow-y: auto;
      min-height: 0;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      min-height: var(--ha-space-14);
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-2)
        var(--ha-space-2);
      border-radius: var(--ha-border-radius-2xl);
      text-align: start;
    }
    .entry:hover {
      background-color: var(--card-background-color);
    }
    .entry.closed {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .entry-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-xl);
      background-color: var(--secondary-background-color);
    }
    .entry.closed .entry-icon {
      background-color: var(--primary-background-color);
    }
    .entry-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .entry-title {
      font-weight: var(--ha-font-weight-medium);
    }
    .entry-state {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .empty {
      margin: 0;
      padding: var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    @media (prefers-reduced-motion: reduce) {
      .tab {
        transition: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-tabs": HaPageTabs;
  }
}
