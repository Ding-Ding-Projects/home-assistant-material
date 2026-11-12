import {
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiHome,
  mdiHuman,
  mdiMagnify,
  mdiMenu,
  mdiPin,
  mdiPlus,
  mdiTab,
  mdiTabPlus,
  mdiTabRemove,
  mdiUndo,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { storage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { navigate } from "../../common/navigate";
import { searchMatcher } from "../../common/regex/filter";
import type { BulkCloseMode } from "../../common/tabs/bulk-close";
import { planBulkClose } from "../../common/tabs/bulk-close";
import type { TabGroupId } from "../../common/tabs/tab-group-search";
import {
  filterGroupItems,
  TAB_GROUP_IDS,
} from "../../common/tabs/tab-group-search";
import { getDefaultPanelUrlPath } from "../../data/panel";
import { showQuickBar } from "../../dialogs/quick-bar/show-dialog-quick-bar";
import type { HomeAssistant } from "../../types";
import type { PageTab } from "../ha-page-tabs";
import {
  CLOSED_TABS_STORAGE_KEY,
  computePageTabs,
  PINNED_TABS_STORAGE_KEY,
  TABS_ORDER_STORAGE_KEY,
} from "../ha-page-tabs";
import { applyTabOrder } from "../tab-order";
import type { CatalogSettingsEntry } from "../page-catalog-entries";
import {
  computeSettingsEntries,
  computeToolEntries,
  loadCatalogTranslations,
} from "../page-catalog-entries";
import "../ha-svg-icon";
import "../ha-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";

const UNDO_MS = 5000;
const SWIPE_CLOSE_PX = 96;
const SWIPE_SWITCH_PX = 48;
/** The keyboard is up when the visible height drops by more than this. */
const KEYBOARD_PX = 150;
/**
 * Set on the document root: the bar's height while it is shown and `0px` while
 * it is hidden. Absent when there is no phone bar.
 */
const VISIBLE_HEIGHT_PROPERTY = "--ha-phone-bar-visible-height";

/**
 * @element ha-phone-bar
 *
 * @summary
 * What replaces the tab bar below 700 px. A bottom bar with Home, Search,
 * Pages, Access and Menu; a slim top bar that shows the current page and
 * switches between open pages by swipe or arrow buttons; and the Pages sheet
 * that lists the open pages as cards, with a search, New tab, bulk close and
 * Undo. The open pages are the same ones the tab bar shows on a wide window.
 */
@customElement("ha-phone-bar")
export class HaPhoneBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** True below 700 px. Nothing is drawn otherwise. */
  @property({ type: Boolean, reflect: true }) public phone = false;

  @state()
  @storage({ key: CLOSED_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _closed: string[] = [];

  /** The order the person gave the tabs, shared with the tab bar. */
  @state()
  @storage({ key: TABS_ORDER_STORAGE_KEY, state: true, subscribe: true })
  private _order: string[] = [];

  /** Pinned tabs sit first and are never closed by a bulk close. */
  @state()
  @storage({ key: PINNED_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _pinned: string[] = [];

  // Draws the bar again when the language mode changes.
  private _lang = new LanguageModeController(this);

  @state() private _barHidden = false;

  @state() private _filter = "";

  /** True while the sheet lists every page instead of the open ones. */
  @state() private _catalog = false;

  /** The search text of each group of the catalog, one field per group. */
  @state() private _groupFilters: Record<TabGroupId, string> = {
    pinned: "",
    pages: "",
    settings: "",
    tools: "",
  };

  /** Pages closed last, kept for Undo. */
  @state() private _undo?: { ids: string[]; name: string };

  /** Sideways drag of a card or of the top bar, in pixels. */
  @state() private _dragId?: string;

  @state() private _dragX = 0;

  @query("#sheet") private _sheet?: HTMLElement;

  private _undoTimer?: number;

  private _lastScrollY = 0;

  private _closedAt = 0;

  private _dragStartX = 0;

  private _swallowClick = false;

  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener("scroll", this._handleScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", this._handleViewport);
    this.addEventListener("focusin", this._handleFocusIn);
    this.addEventListener("focusout", this._handleFocusOut);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("scroll", this._handleScroll);
    window.visualViewport?.removeEventListener("resize", this._handleViewport);
    this.removeEventListener("focusin", this._handleFocusIn);
    this.removeEventListener("focusout", this._handleFocusOut);
    window.clearTimeout(this._undoTimer);
    document.documentElement.style.removeProperty(VISIBLE_HEIGHT_PROPERTY);
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has("phone") || changed.has("_barHidden")) {
      this._publishVisibleHeight();
    }
  }

  /**
   * Tells the rest of the page how tall the bar is right now: its height while
   * shown, `0px` while hidden or when this is not a phone. Sheets and sticky
   * bars read it to stay clear of the bar only while it is there.
   */
  private _publishVisibleHeight() {
    const root = document.documentElement.style;
    if (!this.phone) {
      root.removeProperty(VISIBLE_HEIGHT_PROPERTY);
      return;
    }
    const height =
      getComputedStyle(this).getPropertyValue("--ha-phone-bar-height").trim() ||
      "64px";
    root.setProperty(VISIBLE_HEIGHT_PROPERTY, this._barHidden ? "0px" : height);
  }

  // The bar hides while scrolling down and returns on any scroll up.
  private _handleScroll = () => {
    const y = window.scrollY;
    if (y > this._lastScrollY + 4) {
      this._barHidden = true;
    } else if (y < this._lastScrollY) {
      this._barHidden = false;
    }
    this._lastScrollY = y;
  };

  // The bar also hides while the on-screen keyboard is up.
  private _handleViewport = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    this._barHidden = window.innerHeight - viewport.height > KEYBOARD_PX;
  };

  private _handleFocusIn = (ev: FocusEvent) => {
    if ((ev.target as HTMLElement).localName === "ha-input-search") {
      // The field in the Pages sheet raises the keyboard.
      this._barHidden = true;
    }
  };

  private _handleFocusOut = () => {
    this._barHidden = false;
  };

  private _tabs(): PageTab[] {
    return applyTabOrder(
      computePageTabs(
        this.hass.panels,
        getDefaultPanelUrlPath(this.hass),
        Boolean(this.hass.user?.is_admin),
        this.hass.localize
      ),
      this._order,
      this._pinned
    );
  }

  /** A string in the chosen language mode. */
  private _text = (
    key: string,
    values?: Record<string, string | number>
  ): string => this._lang.text(this.hass.localize, key, values);

  /** Pinned ids are left out: a pinned page is never closed in bulk. */
  private _closable(ids: string[]): string[] {
    return ids.filter((id) => !this._pinned.includes(id));
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.phone || !this.hass?.panels) {
      return nothing;
    }
    const localize = this._text;
    const tabs = this._tabs();
    const closed = new Set(this._closed);
    const open = tabs.filter((tab) => !closed.has(tab.urlPath));
    const current = this.hass.panelUrl;
    const index = open.findIndex((tab) => tab.urlPath === current);
    const label = tabs.find((tab) => tab.urlPath === current)?.title ?? current;
    const barItems: [string, string, string, () => void][] = [
      [
        "home",
        mdiHome,
        localize("ui.phone.home"),
        () => navigate(`/${getDefaultPanelUrlPath(this.hass)}`),
      ],
      [
        "search",
        mdiMagnify,
        localize("ui.phone.search"),
        () => showQuickBar(this, {}),
      ],
      ["pages", mdiTab, localize("ui.phone.pages"), () => this._togglePages()],
      [
        "access",
        mdiHuman,
        localize("ui.phone.access"),
        () => fireEvent(this, "hass-show-accessibility-tools"),
      ],
      [
        "menu",
        mdiMenu,
        localize("ui.phone.menu"),
        () => fireEvent(this, "hass-toggle-menu"),
      ],
    ];

    return html`
      <div class="top">
        <button
          class="round"
          aria-label=${localize("ui.phone.previous_page")}
          ?disabled=${open.length < 2}
          .step=${-1}
          @click=${this._switchPage}
        >
          <ha-svg-icon .path=${mdiChevronLeft}></ha-svg-icon>
        </button>
        <div
          class="title-area"
          @pointerdown=${this._startDrag}
          @pointermove=${this._moveDrag}
          @pointerup=${this._endTopDrag}
          @pointercancel=${this._cancelDrag}
        >
          <span
            class="title"
            style=${styleMap({
              transform:
                this._dragId === "top" ? `translateX(${this._dragX}px)` : "",
            })}
            >${label}</span
          >
          <span
            class="dots"
            role="img"
            aria-label=${localize("ui.phone.page_position", {
              current: Math.max(index, 0) + 1,
              total: open.length,
            })}
          >
            ${open
              .slice(0, 9)
              .map(
                (tab) =>
                  html`<span
                    class=${classMap({ dot: true, on: tab.urlPath === current })}
                  ></span>`
              )}
          </span>
        </div>
        <button
          class="round"
          aria-label=${localize("ui.phone.next_page")}
          ?disabled=${open.length < 2}
          .step=${1}
          @click=${this._switchPage}
        >
          <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
        </button>
      </div>

      ${this._renderSheet(tabs, closed, current)}
      ${
        this._undo
          ? html`<div class="toast" role="status">
              <span class="toast-text"
                >${localize("ui.phone.closed_toast", {
                  name: this._undo.name,
                })}</span
              >
              <button class="text-button" @click=${this._undoClose}>
                <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
                ${localize("ui.page_tabs.bulk_undo")}
              </button>
            </div>`
          : nothing
      }

      <nav
        class=${classMap({ bar: true, hidden: this._barHidden })}
        aria-label=${localize("ui.phone.navigation")}
      >
        ${barItems.map(
          ([id, icon, text, run]) => html`
            <button
              class=${classMap({
                item: true,
                active:
                  id === "home" &&
                  current === getDefaultPanelUrlPath(this.hass),
              })}
              aria-label=${text}
              .run=${run}
              @click=${this._runItem}
            >
              <span class="glyph">
                <ha-svg-icon .path=${icon}></ha-svg-icon>
                ${
                  id === "pages" && open.length
                    ? html`<span class="badge" aria-hidden="true"
                        >${open.length}</span
                      >`
                    : nothing
                }
              </span>
              <span class="item-label" aria-hidden="true">${text}</span>
            </button>
          `
        )}
      </nav>
    `;
  }

  private _renderSheet(
    tabs: PageTab[],
    closed: Set<string>,
    current: string | undefined
  ): TemplateResult {
    const localize = this._text;
    const open = tabs.filter((tab) => !closed.has(tab.urlPath));
    const matches = searchMatcher(this._filter);
    const listed = (this._catalog ? tabs : open).filter((tab) =>
      matches(tab.title, tab.urlPath)
    );
    const candidates = tabs.map((tab) => ({
      id: tab.urlPath,
      texts: [tab.title, tab.urlPath],
      open: !closed.has(tab.urlPath),
      current: tab.urlPath === current || this._pinned.includes(tab.urlPath),
    }));
    const filtering = Boolean(this._filter.trim());
    const matching = planBulkClose(candidates, this._filter, "matching");
    const rest = planBulkClose(candidates, this._filter, "not_matching");
    const others = candidates.filter((c) => c.open && !c.current).length;

    return html`
      <div
        id="sheet"
        popover
        role="dialog"
        aria-label=${localize("ui.phone.pages")}
        @toggle=${this._sheetToggled}
      >
        <div class="handle" aria-hidden="true"></div>
        <div class="sheet-header">
          <span class="sheet-title"
            >${
              this._catalog
                ? localize("ui.page_tabs.catalog_title")
                : localize("ui.phone.pages_title", { count: open.length })
            }</span
          >
          ${
            this._catalog
              ? html`<button
                  class="text-button"
                  ?disabled=${closed.size === 0}
                  @click=${this._openEveryTab}
                >
                  <ha-svg-icon .path=${mdiTabPlus}></ha-svg-icon>
                  ${localize("ui.page_tabs.open_every_tab")}
                </button>`
              : filtering
                ? nothing
                : html`<button
                    class="text-button"
                    ?disabled=${others === 0}
                    @click=${this._closeOthers}
                  >
                    <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
                    ${localize("ui.phone.close_others")}
                  </button>`
          }
        </div>
        <ha-input-search
          id="sheet-search"
          appearance="outlined"
          .value=${this._filter}
          .placeholder=${localize("ui.phone.search_pages")}
          .accessibleLabel=${localize("ui.phone.search_pages")}
          .patternSamples=${tabs.map((tab) => tab.title)}
          @input=${this._filterChanged}
        ></ha-input-search>
        ${
          filtering && !this._catalog
            ? html`<div class="bulk">
                <button
                  class="text-button"
                  .mode=${"matching"}
                  ?disabled=${!matching.ids.length}
                  @click=${this._bulkClose}
                >
                  <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
                  ${localize("ui.page_tabs.bulk_close_matching", {
                    count: matching.ids.length,
                  })}
                </button>
                <button
                  class="text-button"
                  .mode=${"not_matching"}
                  ?disabled=${!rest.ids.length}
                  @click=${this._bulkClose}
                >
                  <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
                  ${localize("ui.phone.close_the_rest", {
                    count: rest.ids.length,
                  })}
                </button>
                ${
                  matching.blocked === "invalid"
                    ? html`<span class="note"
                        >${localize("ui.page_tabs.bulk_invalid")}</span
                      >`
                    : nothing
                }
              </div>`
            : nothing
        }
        <button class="new-tab-row" @click=${this._toggleCatalog}>
          <span class="entry-icon"
            ><ha-svg-icon
              .path=${this._catalog ? mdiTab : mdiPlus}
            ></ha-svg-icon
          ></span>
          <span class="entry-title"
            >${
              this._catalog
                ? localize("ui.phone.back_to_open")
                : localize("ui.page_tabs.new_tab")
            }</span
          >
        </button>
        <div class=${classMap({ list: true, cards: !this._catalog })}>
          ${
            this._catalog
              ? this._renderCatalogGroups(listed, closed, matches)
              : listed.length
                ? listed.map((tab) =>
                    this._renderCard(tab, tab.urlPath === current)
                  )
                : html`<p class="empty">
                    ${localize("ui.page_tabs.no_match")}
                  </p>`
          }
        </div>
      </div>
    `;
  }

  // The catalog in groups, as on a wide window: pinned pages, pages, settings
  // and tools, each with its own search that filters only that group.
  private _renderCatalogGroups(
    listed: PageTab[],
    closed: Set<string>,
    matches: (...texts: string[]) => boolean
  ): TemplateResult {
    const settings = computeSettingsEntries(this.hass).filter((entry) =>
      matches(entry.title, entry.path)
    );
    const tools = computeToolEntries(this.hass).filter((entry) =>
      matches(entry.title, entry.path)
    );
    if (!listed.length && !settings.length && !tools.length) {
      return html`<p class="empty">${this._text("ui.page_tabs.no_match")}</p>`;
    }
    const tabTexts = (tab: PageTab) => [tab.title, tab.urlPath];
    const entryTexts = (entry: CatalogSettingsEntry) => [
      entry.title,
      entry.path,
    ];
    const renderTab = (tab: PageTab) =>
      this._renderCatalogRow(tab, closed.has(tab.urlPath));
    return html`
      ${this._renderGroup(
        "pinned",
        "group-pinned",
        "ui.page_tabs.group_pinned",
        listed.filter((tab) => this._pinned.includes(tab.urlPath)),
        tabTexts,
        (tab) => tab.title,
        renderTab
      )}
      ${this._renderGroup(
        "pages",
        "group-pages",
        "ui.page_tabs.group_pages",
        listed.filter((tab) => !this._pinned.includes(tab.urlPath)),
        tabTexts,
        (tab) => tab.title,
        renderTab
      )}
      ${this._renderGroup(
        "settings",
        "group-settings",
        "ui.page_tabs.group_settings",
        settings,
        entryTexts,
        (entry) => entry.title,
        (entry) => this._renderEntryRow(entry)
      )}
      ${this._renderGroup(
        "tools",
        "group-tools",
        "ui.page_tabs.group_tools",
        tools,
        entryTexts,
        (entry) => entry.title,
        (entry) => this._renderEntryRow(entry)
      )}
    `;
  }

  private _renderGroup<T>(
    group: TabGroupId,
    id: string,
    titleKey: string,
    all: T[],
    texts: (item: T) => string[],
    title: (item: T) => string,
    row: (item: T) => TemplateResult
  ): TemplateResult | typeof nothing {
    if (!all.length) {
      return nothing;
    }
    const name = this._text(titleKey);
    const shown = filterGroupItems(all, this._groupFilters[group], texts);
    const label = this._text("ui.page_tabs.group_search", { name });
    return html`<section class="group" role="group" aria-labelledby=${id}>
      <div class="group-head">
        <h3 id=${id} class="group-title">${name}</h3>
        <span class="group-count" role="status"
          >${this._text("ui.page_tabs.group_count", {
            shown: shown.length,
            total: all.length,
          })}</span
        >
      </div>
      <ha-input-search
        class="group-search"
        data-group=${group}
        appearance="outlined"
        .value=${this._groupFilters[group]}
        .placeholder=${label}
        .accessibleLabel=${label}
        .patternSamples=${all.map(title)}
        @input=${this._groupFilterChanged}
      ></ha-input-search>
      ${
        shown.length
          ? nothing
          : html`<p class="empty">
              ${this._text("ui.page_tabs.group_empty", { name })}
            </p>`
      }
      <div class="group-list">${shown.map(row)}</div>
    </section>`;
  }

  private _renderEntryRow(entry: CatalogSettingsEntry): TemplateResult {
    return html`
      <button class="entry" .path=${entry.path} @click=${this._openEntry}>
        <span class="entry-icon">
          ${
            entry.iconPath
              ? html`<ha-svg-icon .path=${entry.iconPath}></ha-svg-icon>`
              : nothing
          }
        </span>
        <span class="entry-text">
          <span class="entry-title">${entry.title}</span>
        </span>
      </button>
    `;
  }

  private _groupFilterChanged(ev: Event) {
    const field = ev.target as HaInputSearch;
    const group = field.dataset.group as TabGroupId | undefined;
    if (!group || !TAB_GROUP_IDS.includes(group)) {
      return;
    }
    this._groupFilters = { ...this._groupFilters, [group]: field.value ?? "" };
  }

  private _openEntry(ev: Event) {
    const path = (ev.currentTarget as HTMLElement & { path: string }).path;
    this._sheet?.hidePopover();
    navigate(path);
  }

  private _renderCard(tab: PageTab, selected: boolean): TemplateResult {
    const pinned = this._pinned.includes(tab.urlPath);
    return html`
      <div
        class=${classMap({ card: true, selected })}
        style=${styleMap({
          transform:
            this._dragId === tab.urlPath ? `translateX(${this._dragX}px)` : "",
          opacity:
            this._dragId === tab.urlPath
              ? String(Math.max(0.3, 1 - Math.abs(this._dragX) / 240))
              : "",
        })}
        .urlPath=${tab.urlPath}
        @pointerdown=${this._startCardDrag}
        @pointermove=${this._moveDrag}
        @pointerup=${this._endCardDrag}
        @pointercancel=${this._cancelDrag}
      >
        <button
          class="card-main"
          aria-current=${selected ? "page" : "false"}
          .urlPath=${tab.urlPath}
          @click=${this._openFromSheet}
        >
          <span class="entry-icon">${this._renderIcon(tab)}</span>
          <span class="card-title">${tab.title}</span>
          ${
            pinned
              ? html`<ha-svg-icon
                  class="pin-mark"
                  .path=${mdiPin}
                  role="img"
                  aria-label=${this._text("ui.page_tabs.pinned", {
                    name: tab.title,
                  })}
                ></ha-svg-icon>`
              : nothing
          }
        </button>
        ${
          pinned
            ? nothing
            : html`<button
                class="card-close"
                aria-label=${this._text("ui.page_tabs.close_tab", {
                  name: tab.title,
                })}
                .urlPath=${tab.urlPath}
                @click=${this._closeCard}
              >
                <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
              </button>`
        }
      </div>
    `;
  }

  private _renderCatalogRow(tab: PageTab, isClosed: boolean): TemplateResult {
    return html`
      <button
        class=${classMap({ entry: true, closed: isClosed })}
        .urlPath=${tab.urlPath}
        @click=${this._openFromSheet}
      >
        <span class="entry-icon">${this._renderIcon(tab)}</span>
        <span class="entry-text">
          <span class="entry-title">${tab.title}</span>
          <span class="note"
            >${this._text(
              isClosed ? "ui.page_tabs.state_closed" : "ui.page_tabs.state_open"
            )}</span
          >
        </span>
        ${isClosed ? html`<ha-svg-icon .path=${mdiPlus}></ha-svg-icon>` : nothing}
      </button>
    `;
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

  private _runItem(ev: Event) {
    (ev.currentTarget as HTMLElement & { run: () => void }).run();
  }

  private _togglePages() {
    if (!this._sheet) {
      return;
    }
    if (this._sheet.matches(":popover-open")) {
      this._sheet.hidePopover();
      return;
    }
    // The press that dismissed the sheet is the same press on this button.
    if (Date.now() - this._closedAt < 250) {
      return;
    }
    this._sheet.showPopover();
  }

  private _sheetToggled(ev: ToggleEvent) {
    if (ev.newState === "closed") {
      this._closedAt = Date.now();
      this._catalog = false;
      this._filter = "";
      this._clearGroupFilters();
      return;
    }
    this._filter = "";
    this._catalog = false;
    this._clearGroupFilters();
    this._loadCatalogStrings();
  }

  // The settings and tools titles may not be loaded yet.
  private _loadCatalogStrings() {
    loadCatalogTranslations(this.hass).then(() => this.requestUpdate());
  }

  private _toggleCatalog() {
    this._catalog = !this._catalog;
    if (this._catalog) {
      this._loadCatalogStrings();
    }
    this._filter = "";
    this._clearGroupFilters();
  }

  private _clearGroupFilters() {
    this._groupFilters = { pinned: "", pages: "", settings: "", tools: "" };
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _openFromSheet(ev: Event) {
    if (this._swallowClick) {
      this._swallowClick = false;
      return;
    }
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    this._closed = this._closed.filter((closed) => closed !== urlPath);
    this._sheet?.hidePopover();
    navigate(`/${urlPath}`);
  }

  private _openEveryTab() {
    this._closed = [];
  }

  private _titleOf(urlPath: string) {
    return (
      this._tabs().find((tab) => tab.urlPath === urlPath)?.title ?? urlPath
    );
  }

  private _closeIds(requested: string[], name: string) {
    const ids = this._closable(requested);
    if (!ids.length) {
      return;
    }
    this._closed = [
      ...this._closed,
      ...ids.filter((id) => !this._closed.includes(id)),
    ];
    this._undo = { ids, name };
    window.clearTimeout(this._undoTimer);
    this._undoTimer = window.setTimeout(() => {
      this._undo = undefined;
    }, UNDO_MS);
  }

  private _undoClose() {
    if (!this._undo) {
      return;
    }
    const reopen = new Set(this._undo.ids);
    this._closed = this._closed.filter((urlPath) => !reopen.has(urlPath));
    this._undo = undefined;
    window.clearTimeout(this._undoTimer);
  }

  private _closeCard(ev: Event) {
    ev.stopPropagation();
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    this._closeIds([urlPath], this._titleOf(urlPath));
  }

  private _countName(ids: string[]) {
    return ids.length === 1
      ? this._titleOf(ids[0])
      : this._text("ui.phone.pages_count", { count: ids.length });
  }

  private _closeOthers() {
    const ids = this._closable(
      this._tabs()
        .map((tab) => tab.urlPath)
        .filter((id) => !this._closed.includes(id) && id !== this.hass.panelUrl)
    );
    this._closeIds(ids, this._countName(ids));
  }

  private _bulkClose(ev: Event) {
    const mode = (ev.currentTarget as HTMLElement & { mode: BulkCloseMode })
      .mode;
    const { ids } = planBulkClose(
      this._tabs().map((tab) => ({
        id: tab.urlPath,
        texts: [tab.title, tab.urlPath],
        open: !this._closed.includes(tab.urlPath),
        current:
          tab.urlPath === this.hass.panelUrl ||
          this._pinned.includes(tab.urlPath),
      })),
      this._filter,
      mode
    );
    this._closeIds(ids, this._countName(ids));
    this._filter = "";
  }

  // The previous or next open page, in the order of the tab bar.
  private _switchPage(ev: Event) {
    const step = (ev.currentTarget as HTMLElement & { step: number }).step;
    this._stepPage(step);
  }

  private _stepPage(step: number) {
    const open = this._tabs().filter(
      (tab) => !this._closed.includes(tab.urlPath)
    );
    if (open.length < 2) {
      return;
    }
    const index = open.findIndex((tab) => tab.urlPath === this.hass.panelUrl);
    const next = (index + step + open.length) % open.length;
    navigate(`/${open[next].urlPath}`);
  }

  private _startDrag(ev: PointerEvent) {
    this._dragStartX = ev.clientX;
    this._dragId = "top";
    this._dragX = 0;
  }

  private _startCardDrag(ev: PointerEvent) {
    this._dragStartX = ev.clientX;
    this._dragId = (
      ev.currentTarget as HTMLElement & { urlPath: string }
    ).urlPath;
    this._dragX = 0;
  }

  private _moveDrag(ev: PointerEvent) {
    if (!this._dragId) {
      return;
    }
    this._dragX = ev.clientX - this._dragStartX;
  }

  private _cancelDrag() {
    this._dragId = undefined;
    this._dragX = 0;
  }

  private _endTopDrag() {
    const dx = this._dragX;
    this._cancelDrag();
    if (Math.abs(dx) < SWIPE_SWITCH_PX) {
      return;
    }
    const rtl = getComputedStyle(this).direction === "rtl";
    // Swiping left goes to the next page, as turning a page does.
    this._stepPage(dx < 0 !== rtl ? 1 : -1);
  }

  private _endCardDrag(ev: Event) {
    const urlPath = this._dragId;
    const dx = this._dragX;
    this._cancelDrag();
    if (
      !urlPath ||
      Math.abs(dx) < SWIPE_CLOSE_PX ||
      this._pinned.includes(urlPath)
    ) {
      return;
    }
    // The press that ends a swipe is not a tap on the card.
    this._swallowClick = true;
    window.setTimeout(() => {
      this._swallowClick = false;
    }, 0);
    ev.stopPropagation();
    this._closeIds([urlPath], this._titleOf(urlPath));
  }

  static styles: CSSResultGroup = css`
    :host {
      display: none;
      font-family: var(--ha-font-family-body);
      color: var(--primary-text-color);
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
    }
    :host([phone]) {
      display: block;
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
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    button[disabled] {
      opacity: 0.4;
      cursor: default;
    }
    .top {
      /* Not shown: Pages in the bottom bar switches pages, and each page has
         its own header. See --ha-phone-top-height in home-assistant-main. */
      display: none;
      position: fixed;
      z-index: 5;
      inset-inline: 0;
      top: var(--app-safe-area-inset-top, env(safe-area-inset-top, 0px));
      height: 48px;
      box-sizing: border-box;
      align-items: center;
      padding-inline: var(--ha-space-1);
      background-color: var(--primary-background-color);
      border-bottom: var(--ha-card-border-width, 0px) solid
        var(--ha-card-border-color, transparent);
    }
    .round {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: var(--ha-border-radius-circle);
      color: var(--secondary-text-color);
    }
    .title-area {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      height: 100%;
      touch-action: pan-y;
      user-select: none;
    }
    .title {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .dots {
      display: flex;
      gap: 4px;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: var(--ha-border-radius-circle);
      background-color: var(--divider-color);
    }
    .dot.on {
      background-color: var(--primary-text-color);
    }
    .bar {
      position: fixed;
      z-index: 7;
      inset-inline: 0;
      bottom: 0;
      box-sizing: border-box;
      min-height: var(--ha-phone-bar-height, 64px);
      padding-bottom: var(
        --app-safe-area-inset-bottom,
        env(safe-area-inset-bottom, 0px)
      );
      display: flex;
      align-items: stretch;
      justify-content: space-around;
      background-color: var(--primary-background-color);
      border-top: 1px solid var(--divider-color);
      transition: transform var(--ha-animation-duration-normal) ease;
    }
    .bar.hidden {
      transform: translateY(100%);
    }
    .item {
      flex: 1;
      min-width: 64px;
      min-height: 64px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: var(--secondary-text-color);
    }
    .item.active {
      color: var(--primary-text-color);
    }
    .glyph {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 32px;
      border-radius: var(--ha-border-radius-pill);
    }
    .item.active .glyph {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .badge {
      position: absolute;
      top: -2px;
      inset-inline-end: 6px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--primary-text-color);
      color: var(--primary-background-color);
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      line-height: 18px;
      text-align: center;
    }
    .item-label {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toast {
      position: fixed;
      z-index: 8;
      inset-inline: var(--ha-space-3);
      bottom: calc(
        var(--ha-phone-bar-height, 64px) + var(--ha-space-3) +
          var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-2)
        var(--ha-space-4);
      border-radius: var(--ha-border-radius-2xl);
      background-color: var(--primary-text-color);
      color: var(--primary-background-color);
      box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15);
    }
    .toast-text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .toast .text-button {
      background: none;
      color: inherit;
      font-weight: var(--ha-font-weight-bold, 700);
    }
    #sheet {
      position: fixed;
      inset: auto;
      inset-inline: 0;
      bottom: calc(
        var(--ha-phone-bar-height, 64px) +
          var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      margin: 0;
      width: auto;
      max-width: none;
      max-height: calc(100dvh - 120px);
      box-sizing: border-box;
      padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0 0;
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      box-shadow: 0 -4px 8px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    #sheet:popover-open {
      display: flex;
    }
    #sheet::backdrop {
      background: transparent;
    }
    .handle {
      align-self: center;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background-color: var(--divider-color);
    }
    .sheet-header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
    }
    .sheet-title {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .text-button {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-text-color));
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 18px;
    }
    #sheet-search {
      --ha-input-search-height: 48px;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .bulk {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .new-tab-row,
    .entry {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      min-height: 56px;
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-2)
        var(--ha-space-2);
      border-radius: var(--ha-border-radius-2xl);
      text-align: start;
      width: 100%;
      box-sizing: border-box;
    }
    .new-tab-row {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .entry.closed {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .entry-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-xl);
      background-color: var(--secondary-background-color);
    }
    .entry-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .entry-title,
    .card-title {
      font-weight: var(--ha-font-weight-medium);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      overflow-y: auto;
      min-height: 0;
    }
    /* Rows of a scrolling column keep their height instead of being squeezed. */
    .list > * {
      flex-shrink: 0;
    }
    .list.cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ha-space-2);
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2);
      border-radius: var(--ha-border-radius-2xl);
      background-color: var(--card-background-color);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color));
      touch-action: pan-y;
      min-width: 0;
    }
    .card.selected {
      border-color: var(--primary-text-color);
    }
    .card-main {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 48px;
      text-align: start;
      min-width: 0;
    }
    .pin-mark {
      flex: none;
      margin-inline-start: auto;
      color: var(--secondary-text-color);
      --mdc-icon-size: 18px;
    }
    .card-close {
      align-self: flex-end;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: var(--ha-border-radius-circle);
      color: var(--secondary-text-color);
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding-bottom: var(--ha-space-2);
    }
    .group-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
    }
    .group-title {
      margin: 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
    .group-count {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .group-search {
      --ha-input-search-height: 44px;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .group-list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .group-list .entry {
      min-height: 44px;
    }
    .empty {
      grid-column: 1 / -1;
      margin: 0;
      padding: var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    @media (prefers-reduced-motion: reduce) {
      .bar {
        transition: none;
      }
    }
    @media (max-width: 340px) {
      .list.cards {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-phone-bar": HaPhoneBar;
  }
}
