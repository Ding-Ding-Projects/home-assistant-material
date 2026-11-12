import {
  mdiArrowCollapseDown,
  mdiArrowCollapseUp,
  mdiArrowDown,
  mdiArrowUp,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiDotsVertical,
  mdiDragVertical,
  mdiHome,
  mdiHuman,
  mdiMagnify,
  mdiMenu,
  mdiPin,
  mdiPinOff,
  mdiPlus,
  mdiTab,
  mdiTabPlus,
  mdiTabRemove,
  mdiUndo,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { storage } from "../../common/decorators/storage";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { navigate } from "../../common/navigate";
import { searchMatcher } from "../../common/regex/filter";
import type { BulkCloseMode } from "../../common/tabs/bulk-close";
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
import type { PhoneActionItem } from "./ha-phone-tab-actions";
import "./ha-phone-bulk-close";
import "./ha-phone-tab-actions";
import type {
  ActionEntry,
  ActionReason,
  CloseKind,
  HeaderActionId,
  MoveKind,
  PageActionId,
  PhonePage,
} from "./phone-page-actions";
import {
  dropAfter,
  headerActions,
  pageActions,
  planClose,
  planDrop,
  planMove,
} from "./phone-page-actions";

const UNDO_MS = 5000;
/** Holding a card this long opens its actions. */
const LONG_PRESS_MS = 500;
/** Moving further than this cancels a long press. */
const LONG_PRESS_SLOP_PX = 10;

const PAGE_ACTION_VIEW: Record<PageActionId, [string, string]> = {
  pin: ["ui.phone.action_pin", mdiPin],
  unpin: ["ui.phone.action_unpin", mdiPinOff],
  close: ["ui.phone.action_close", mdiClose],
  close_others: ["ui.phone.action_close_others", mdiTabRemove],
  close_above: ["ui.phone.action_close_above", mdiTabRemove],
  close_below: ["ui.phone.action_close_below", mdiTabRemove],
  move_up: ["ui.phone.action_move_up", mdiArrowUp],
  move_down: ["ui.phone.action_move_down", mdiArrowDown],
  move_top: ["ui.phone.action_move_top", mdiArrowCollapseUp],
  move_bottom: ["ui.phone.action_move_bottom", mdiArrowCollapseDown],
};

const HEADER_ACTION_VIEW: Record<HeaderActionId, [string, string]> = {
  open_every: ["ui.phone.action_open_every", mdiTabPlus],
  bulk_contain: ["ui.phone.action_bulk_contain", mdiTabRemove],
  bulk_not_contain: ["ui.phone.action_bulk_not_contain", mdiTabRemove],
  close_others: ["ui.phone.action_close_others_all", mdiTabRemove],
};

const REASON_VIEW: Record<ActionReason, string> = {
  pinned: "ui.phone.reason_pinned",
  locked: "ui.phone.reason_locked",
  current: "ui.phone.reason_current",
  nothing_to_close: "ui.phone.reason_nothing_to_close",
  at_top: "ui.phone.reason_at_top",
  at_bottom: "ui.phone.reason_at_bottom",
};

/** Where focus goes when a panel over the sheet closes. */
type FocusTarget = { row: string } | "header" | "pages";
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

  /** The page whose actions panel is open. */
  @state() private _actionsFor?: string;

  /** True while the sheet's header menu is open. */
  @state() private _headerMenu = false;

  /** Set while the bulk close review is open. */
  @state() private _bulkMode?: BulkCloseMode;

  /** The page being dragged by its handle, and the drop mark. */
  @state() private _reorder?: { id: string; to?: string; after?: boolean };

  /** Said out loud by the sheet's live region. */
  @state() private _live = "";

  @query("#sheet") private _sheet?: HTMLElement;

  @queryAll(".handle")
  private _handles!: NodeListOf<HTMLElement & { urlPath?: string }>;

  private _undoTimer?: number;

  private _pressTimer?: number;

  private _pressX = 0;

  private _pressY = 0;

  private _returnFocus: FocusTarget = "pages";

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
    window.clearTimeout(this._pressTimer);
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

  /**
   * The pages as the actions see them, in the order shown. Seam for locks:
   * `locked` is false until the tab lock model exists.
   */
  private _pages(): PhonePage[] {
    return this._tabs().map((tab) => ({
      id: tab.urlPath,
      title: tab.title,
      open: !this._closed.includes(tab.urlPath),
      pinned: this._pinned.includes(tab.urlPath),
      locked: false,
    }));
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
              data-item=${id}
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
              : html`<button
                  class="round header-more"
                  aria-label=${localize("ui.phone.more_pages")}
                  aria-haspopup="dialog"
                  @click=${this._openHeaderMenu}
                >
                  <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
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
        <span class="live" role="status">${this._live}</span>
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
              : this._renderOpenPages(listed, current)
          }
        </div>
        ${this._renderOverlay(current)}
      </div>
    `;
  }

  // The open pages, with the pinned ones in their own group at the top.
  private _renderOpenPages(
    listed: PageTab[],
    current: string | undefined
  ): TemplateResult {
    if (!listed.length) {
      return html`<p class="empty">${this._text("ui.page_tabs.no_match")}</p>`;
    }
    const pinned = listed.filter((tab) => this._pinned.includes(tab.urlPath));
    const rest = listed.filter((tab) => !this._pinned.includes(tab.urlPath));
    const grid = (tabs: PageTab[]) =>
      html`<div class="grid">
        ${tabs.map((tab) => this._renderCard(tab, tab.urlPath === current))}
      </div>`;
    if (!pinned.length) {
      return grid(rest);
    }
    return html`
      <section class="open-group" aria-labelledby="open-pinned">
        <h3 id="open-pinned" class="group-title">
          ${this._text("ui.page_tabs.group_pinned")}
        </h3>
        ${grid(pinned)}
      </section>
      ${
        rest.length
          ? html`<section class="open-group" aria-labelledby="open-pages">
              <h3 id="open-pages" class="group-title">
                ${this._text("ui.page_tabs.group_pages")}
              </h3>
              ${grid(rest)}
            </section>`
          : nothing
      }
    `;
  }

  // The panel over the sheet: a page's actions, the header menu or the bulk
  // close review. At most one is open.
  private _renderOverlay(current: string | undefined) {
    const t = this._text;
    if (this._bulkMode) {
      return html`<ha-phone-bulk-close
        .mode=${this._bulkMode}
        .pages=${this._pages()}
        .currentId=${current}
        .text=${t}
        @phone-bulk-confirm=${this._bulkConfirm}
        @phone-bulk-dismiss=${this._dismissOverlay}
      ></ha-phone-bulk-close>`;
    }
    const pages = this._pages();
    if (this._actionsFor) {
      const page = pages.find((p) => p.id === this._actionsFor);
      if (!page) {
        return nothing;
      }
      return html`<ha-phone-tab-actions
        .heading=${t("ui.phone.actions_for", { name: page.title })}
        .closeLabel=${t("ui.phone.actions_close")}
        .items=${this._items(
          pageActions(pages, page.id, current),
          PAGE_ACTION_VIEW
        )}
        @phone-action-select=${this._pageActionSelected}
        @phone-actions-dismiss=${this._dismissOverlay}
      ></ha-phone-tab-actions>`;
    }
    if (this._headerMenu) {
      return html`<ha-phone-tab-actions
        .heading=${t("ui.phone.pages")}
        .closeLabel=${t("ui.phone.actions_close")}
        .items=${this._items(headerActions(pages, current), HEADER_ACTION_VIEW)}
        @phone-action-select=${this._headerActionSelected}
        @phone-actions-dismiss=${this._dismissOverlay}
      ></ha-phone-tab-actions>`;
    }
    return nothing;
  }

  private _items<T extends string>(
    entries: ActionEntry<T>[],
    view: Record<T, [string, string]>
  ): PhoneActionItem[] {
    return entries.map((entry) => ({
      id: entry.id,
      label: this._text(view[entry.id][0]),
      iconPath: view[entry.id][1],
      enabled: entry.enabled,
      destructive: entry.destructive,
      note: entry.reason ? this._text(REASON_VIEW[entry.reason]) : undefined,
    }));
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
    const mark = this._reorder?.to === tab.urlPath ? this._reorder : undefined;
    return html`
      <div
        class=${classMap({
          card: true,
          selected,
          dragging: this._reorder?.id === tab.urlPath,
          "drop-before": Boolean(mark) && !mark?.after,
          "drop-after": Boolean(mark?.after),
        })}
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
        @contextmenu=${this._cardContextMenu}
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
        <div class="card-tools">
          <button
            class="card-tool handle"
            aria-label=${this._text("ui.phone.reorder_handle", {
              name: tab.title,
            })}
            aria-keyshortcuts="ArrowUp ArrowDown"
            .urlPath=${tab.urlPath}
            @pointerdown=${this._startReorder}
            @pointermove=${this._moveReorder}
            @pointerup=${this._endReorder}
            @pointercancel=${this._cancelReorder}
            @keydown=${this._handleKeydown}
          >
            <ha-svg-icon .path=${mdiDragVertical}></ha-svg-icon>
          </button>
          <button
            class="card-tool more"
            aria-label=${this._text("ui.phone.more_actions", {
              name: tab.title,
            })}
            aria-haspopup="dialog"
            .urlPath=${tab.urlPath}
            @click=${this._openPageActions}
          >
            <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
          </button>
          ${
            pinned
              ? nothing
              : html`<button
                  class="card-tool card-close"
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
    this._closePanels();
    this._reorder = undefined;
    this._live = "";
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

  // Reopens every closed page. The order, the pins and the page you are on
  // are not touched: only the closed list is cleared.
  private _openEveryTab() {
    this._closed = [];
    this._live = this._text("ui.phone.opened_all");
  }

  private _titleOf(urlPath: string) {
    return (
      this._tabs().find((tab) => tab.urlPath === urlPath)?.title ?? urlPath
    );
  }

  /** Closes the pages and returns how many actually closed. */
  private _closeIds(requested: string[], name: string): number {
    const ids = this._closable(requested).filter(
      (id) => !this._closed.includes(id)
    );
    if (!ids.length) {
      return 0;
    }
    this._closed = [...this._closed, ...ids];
    this._undo = { ids, name };
    window.clearTimeout(this._undoTimer);
    this._undoTimer = window.setTimeout(() => {
      this._undo = undefined;
    }, UNDO_MS);
    return ids.length;
  }

  // Closes what a plan lists and says how many closed out of how many were
  // planned, and how many were kept.
  private _closeByPlan(ids: string[], kept: number, planned = ids.length) {
    const closed = this._closeIds(ids, this._countName(ids));
    const parts = [
      planned
        ? this._text("ui.phone.bulk_report", { closed, planned })
        : this._text("ui.phone.nothing_closed"),
    ];
    if (kept) {
      parts.push(this._text("ui.phone.kept_report", { count: kept }));
    }
    this._live = parts.join(" ");
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
    this._closeByPlan(ids, 0);
  }

  // The review step confirmed. A page that became pinned or the current page
  // since the review opened is dropped, and the report says how many closed
  // out of how many were planned.
  private _bulkConfirm(
    ev: HASSDomEvent<{ ids: string[]; planned: number; kept: number }>
  ) {
    const pinned = new Set(this._pinned);
    const ids = ev.detail.ids.filter(
      (id) => !pinned.has(id) && id !== this.hass.panelUrl
    );
    this._closeByPlan(ids, ev.detail.kept, ev.detail.planned);
    this._finishPanel();
  }

  private _openHeaderMenu() {
    this._returnFocus = "header";
    this._actionsFor = undefined;
    this._bulkMode = undefined;
    this._headerMenu = true;
  }

  private _showPageActions(id: string, returnTo: FocusTarget) {
    this._returnFocus = returnTo;
    this._headerMenu = false;
    this._bulkMode = undefined;
    this._actionsFor = id;
  }

  private _openPageActions(ev: Event) {
    ev.stopPropagation();
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._showPageActions(id, { row: id });
  }

  // A right click, the menu key and a long press on a touch screen.
  private _cardContextMenu(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._showPageActions(id, { row: id });
  }

  private _closePanels() {
    this._actionsFor = undefined;
    this._headerMenu = false;
    this._bulkMode = undefined;
  }

  private _dismissOverlay() {
    this._finishPanel();
  }

  // Closes whatever is open over the sheet and puts focus back where the
  // person came from: the row, the header menu button or the Pages button.
  private async _finishPanel() {
    const target = this._returnFocus;
    this._closePanels();
    await this.updateComplete;
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    let element: HTMLElement | null | undefined;
    if (typeof target === "object") {
      element = Array.from(
        root.querySelectorAll<HTMLElement & { urlPath?: string }>(".more")
      ).find((el) => el.urlPath === target.row);
    } else if (target === "header") {
      element = root.querySelector<HTMLElement>(".header-more");
    }
    (
      element ?? root.querySelector<HTMLElement>('.item[data-item="pages"]')
    )?.focus();
  }

  private _pageActionSelected(ev: HASSDomEvent<{ id: string }>) {
    const id = this._actionsFor;
    if (id) {
      this._runPageAction(id, ev.detail.id as PageActionId);
    }
    this._finishPanel();
  }

  private _runPageAction(id: string, action: PageActionId) {
    const pages = this._pages();
    const current = this.hass.panelUrl;
    const title = pages.find((page) => page.id === id)?.title ?? id;
    const closeKinds: Partial<Record<PageActionId, CloseKind>> = {
      close: "close",
      close_others: "others",
      close_above: "above",
      close_below: "below",
    };
    const moveKinds: Partial<Record<PageActionId, MoveKind>> = {
      move_up: "up",
      move_down: "down",
      move_top: "top",
      move_bottom: "bottom",
    };
    const closeKind = closeKinds[action];
    const moveKind = moveKinds[action];
    if (action === "pin" || action === "unpin") {
      this._togglePin(id, title);
    } else if (closeKind) {
      const plan = planClose(pages, id, closeKind, current);
      this._closeByPlan(plan.ids, plan.kept.length);
    } else if (moveKind) {
      this._applyMove(id, moveKind);
    }
  }

  // Pinning saves the shown order first, so the page keeps its place within
  // its new group, exactly as the tab bar does.
  private _togglePin(id: string, title: string) {
    const pinned = this._pinned.includes(id);
    this._order = this._tabs().map((tab) => tab.urlPath);
    this._pinned = pinned
      ? this._pinned.filter((p) => p !== id)
      : [...this._pinned, id];
    this._live = this._text(
      pinned ? "ui.page_tabs.unpinned" : "ui.page_tabs.pinned",
      { name: title }
    );
  }

  private _applyMove(id: string, kind: MoveKind) {
    const pages = this._pages();
    const title = pages.find((page) => page.id === id)?.title ?? id;
    const plan = planMove(pages, id, kind);
    if (plan.blocked) {
      this._live = this._text(REASON_VIEW[plan.blocked]);
      return;
    }
    if (!plan.order) {
      return;
    }
    this._order = plan.order;
    this._live = this._text("ui.page_tabs.moved", {
      name: title,
      position: plan.position ?? 0,
      total: plan.total ?? 0,
    });
  }

  private _headerActionSelected(ev: HASSDomEvent<{ id: string }>) {
    const action = ev.detail.id as HeaderActionId;
    if (action === "bulk_contain" || action === "bulk_not_contain") {
      // The review replaces the menu; focus returns to the menu button when
      // it closes.
      this._headerMenu = false;
      this._bulkMode = action === "bulk_contain" ? "matching" : "not_matching";
      return;
    }
    if (action === "open_every") {
      this._openEveryTab();
    } else if (action === "close_others") {
      this._closeOthers();
    }
    this._finishPanel();
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
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._dragId = id;
    this._dragX = 0;
    // Holding the card opens its actions, as a long press does elsewhere.
    this._pressX = ev.clientX;
    this._pressY = ev.clientY;
    window.clearTimeout(this._pressTimer);
    this._pressTimer = window.setTimeout(
      () => this._longPress(id),
      LONG_PRESS_MS
    );
  }

  private _longPress(id: string) {
    this._pressTimer = undefined;
    this._cancelDrag();
    // The lift of the finger that opened the panel is not a tap on the card.
    this._swallowClick = true;
    window.setTimeout(() => {
      this._swallowClick = false;
    }, 400);
    this._showPageActions(id, { row: id });
  }

  private _moveDrag(ev: PointerEvent) {
    if (
      this._pressTimer !== undefined &&
      Math.hypot(ev.clientX - this._pressX, ev.clientY - this._pressY) >
        LONG_PRESS_SLOP_PX
    ) {
      window.clearTimeout(this._pressTimer);
      this._pressTimer = undefined;
    }
    if (!this._dragId) {
      return;
    }
    this._dragX = ev.clientX - this._dragStartX;
  }

  private _cancelDrag() {
    window.clearTimeout(this._pressTimer);
    this._pressTimer = undefined;
    this._dragId = undefined;
    this._dragX = 0;
  }

  // Reorder by the drag handle. The handle captures the pointer, the card
  // under the finger shows a drop mark, and lifting the finger moves the page
  // there. Pinned pages move among pinned pages only.
  private _startReorder(ev: PointerEvent) {
    ev.stopPropagation();
    const handle = ev.currentTarget as HTMLElement & { urlPath: string };
    handle.setPointerCapture(ev.pointerId);
    window.clearTimeout(this._pressTimer);
    this._pressTimer = undefined;
    this._cancelDrag();
    this._reorder = { id: handle.urlPath };
  }

  private _moveReorder(ev: PointerEvent) {
    if (!this._reorder) {
      return;
    }
    ev.stopPropagation();
    const hit = this.shadowRoot
      ?.elementFromPoint(ev.clientX, ev.clientY)
      ?.closest<HTMLElement & { urlPath?: string }>(".card");
    const to = hit?.urlPath;
    if (!hit || !to || to === this._reorder.id) {
      this._reorder = { id: this._reorder.id };
      return;
    }
    const rect = hit.getBoundingClientRect();
    const grid = hit.parentElement;
    const singleColumn = !grid || rect.width > grid.clientWidth * 0.7;
    this._reorder = {
      id: this._reorder.id,
      to,
      after: dropAfter(
        { x: ev.clientX, y: ev.clientY },
        rect,
        singleColumn,
        getComputedStyle(this).direction === "rtl"
      ),
    };
  }

  private _endReorder(ev: PointerEvent) {
    const reorder = this._reorder;
    this._reorder = undefined;
    ev.stopPropagation();
    if (!reorder?.to) {
      return;
    }
    const pages = this._pages();
    const plan = planDrop(
      pages,
      reorder.id,
      reorder.to,
      Boolean(reorder.after)
    );
    const title = pages.find((page) => page.id === reorder.id)?.title ?? "";
    if (plan.blocked) {
      this._live = this._text("ui.page_tabs.move_blocked", { name: title });
      return;
    }
    if (plan.order) {
      this._order = plan.order;
      const open = plan.order.filter((id) =>
        pages.some((page) => page.id === id && page.open)
      );
      this._live = this._text("ui.page_tabs.moved", {
        name: title,
        position: open.indexOf(reorder.id) + 1,
        total: open.length,
      });
    }
  }

  private _cancelReorder() {
    this._reorder = undefined;
  }

  // Up and Down on the handle move the page one place, for keyboards and
  // switch devices. Focus stays on the page's own handle afterwards.
  private async _handleKeydown(ev: KeyboardEvent) {
    const kind: MoveKind | undefined =
      ev.key === "ArrowUp" ? "up" : ev.key === "ArrowDown" ? "down" : undefined;
    if (!kind || ev.ctrlKey || ev.altKey || ev.metaKey) {
      return;
    }
    ev.preventDefault();
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._applyMove(id, kind);
    await this.updateComplete;
    Array.from(this._handles)
      .find((el) => el.urlPath === id)
      ?.focus();
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
    .live {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
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
      gap: var(--ha-space-3);
    }
    .open-group {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ha-space-2);
    }
    .card {
      position: relative;
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
    .card.dragging {
      opacity: 0.5;
    }
    /* The drop mark: a bar on the side of the card the page lands on. */
    .card.drop-before::before,
    .card.drop-after::after {
      content: "";
      position: absolute;
      inset-block: 0;
      width: 4px;
      border-radius: 2px;
      background-color: var(--primary-color);
    }
    .card.drop-before::before {
      inset-inline-start: 2px;
    }
    .card.drop-after::after {
      inset-inline-end: 2px;
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
    .card-tools {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0;
      min-width: 0;
    }
    .card-tool {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: var(--ha-border-radius-circle);
      color: var(--secondary-text-color);
    }
    .handle {
      touch-action: none;
      cursor: grab;
      margin-inline-end: auto;
    }
    .header-more {
      margin-inline-start: auto;
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
    /* One column below 400 px, so three 44 px tools fit a card at 320 px. */
    @media (max-width: 400px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .card.drop-before::before,
      .card.drop-after::after {
        inset-block: auto;
        inset-inline: 0;
        width: auto;
        height: 4px;
      }
      .card.drop-before::before {
        inset-block-start: 2px;
      }
      .card.drop-after::after {
        inset-block-end: 2px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-phone-bar": HaPhoneBar;
  }
}
