import { mdiHelpCircleOutline } from "@mdi/js";
import type { ContextType } from "@lit/context";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  eventOptions,
  property,
  query,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import memoizeOne from "memoize-one";
import { canShowPage } from "../common/config/can_show_page";
import { consume } from "../common/decorators/consume";
import { restoreScroll } from "../common/decorators/restore-scroll";
import { pageHeaderStyles, playPageEntry } from "../common/motion/page-entry";
import type { HASSDomTargetEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { PageLockController } from "../common/locks/page-lock-controller";
import { getHistoryState } from "../common/navigate";
import type {
  LocalizeFunc,
  LocalizeKeys,
} from "../common/translations/localize";
import { sanitizeNavigationPath } from "../common/url/sanitize-navigation-path";
import "../components/ha-icon-button-arrow-prev";
import "../components/ha-menu-button";
import "../components/page/ha-page-footer";
import "../components/page/ha-page-lock-banner";
import "../components/page/ha-page-tools";
import "../components/ha-svg-icon";
import type { SectionTabItem } from "../components/section-tabs/ha-section-tabs";
import { sectionTabsStyles } from "../components/section-tabs/ha-section-tabs";
import {
  SECTION_TAB_PANEL_ID,
  sectionTabDomId,
} from "../components/section-tabs/section-tabs-model";
import {
  configContext,
  entitiesContext,
  internationalizationContext,
  narrowViewportContext,
} from "../data/context";
import type { CoreFrontendUserData } from "../data/frontend";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant, Route } from "../types";
import type { FoldedToolbarAction } from "./tool-pill-order";
import {
  inspectToolbarSlot,
  orderToolPillItems,
  setToolbarFolded,
} from "./tool-pill-order";
import { handleBackClick } from "./back-navigation";

const normalizePathname = (pathname: string): string =>
  pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

declare global {
  interface HASSDomEvents {
    /** The title of the page a layout shows, for content that repeats it. */
    "page-title-changed": { title: string };
  }
}

type SectionResolver = (tabs: PageNavigation[]) => string | undefined;

let sectionResolver: SectionResolver | undefined;

/**
 * Lets a panel say which of its sections a set of tabs belongs to, as a
 * translation key. The layout shows it in the breadcrumb.
 */
export const setPageSectionResolver = (resolver: SectionResolver): void => {
  sectionResolver = resolver;
};

export interface PageNavigation {
  path: string;
  translationKey?: string;
  component?: string | string[];
  name?: string;
  core?: boolean;
  /** Hide from non-admin users in filtered navigation and quick bar. */
  adminOnly?: boolean;
  iconPath?: string;
  iconSecondaryPath?: string;
  iconViewBox?: string;
  description?: string;
  iconColor?: string;
  // Shown next to the name of the tab
  badge?: string;
  info?: any;
  filter?: (hass: Pick<HomeAssistant, "entities">) => boolean;
}

const BOTTOM_TABS_PROPERTY = "--ha-bottom-tabs-height";

/**
 * The layouts that show a bottom tab bar now. A page that is being replaced
 * can disconnect after the next one has connected, so the property stays while
 * any layout still shows its tabs.
 */
const bottomTabsOwners = new Set<HassTabsSubpage>();

const syncBottomTabsProperty = () => {
  if (bottomTabsOwners.size > 0) {
    document.documentElement.style.setProperty(
      BOTTOM_TABS_PROPERTY,
      "var(--header-height, 56px)"
    );
  } else {
    document.documentElement.style.removeProperty(BOTTOM_TABS_PROPERTY);
  }
};

@customElement("hass-tabs-subpage")
export class HassTabsSubpage extends LitElement {
  // Unread, kept for callers that still pass it until they move to contexts
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @property({ attribute: false }) public backCallback?: () => void;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public tabs!: PageNavigation[];

  // On a phone, a page without a menu of its own folds its tools into a More sheet
  @state() private _foldTools = false;

  @query('slot[name="toolbar-icon"]')
  private _toolbarSlot?: HTMLSlotElement;

  private _foldedActions = (): FoldedToolbarAction[] =>
    inspectToolbarSlot(this._toolbarSlot ?? null).actions;

  @state()
  @consume({ context: narrowViewportContext, subscribe: true })
  private _narrow = false;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig!: ContextType<typeof configContext>;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities!: ContextType<typeof entitiesContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ type: Boolean, reflect: true, attribute: "is-wide" })
  public isWide = false;

  @property({ type: Boolean }) public pane = false;

  /**
   * Do we need to add padding for a fab.
   * @type {Boolean}
   */
  @property({ type: Boolean, attribute: "has-fab" }) public hasFab = false;

  /**
   * Whether tabs are shown (2 or more tabs visible).
   * When both, show-tabs and narrow are true, tabs are shown as bottom bar.
   * @type {Boolean}
   */
  @property({ type: Boolean, attribute: "show-tabs", reflect: true })
  public showTabs = false;

  /**
   * Where the page sits, shown in small type above the title. Pages under
   * Settings get "Settings" when nothing is given.
   */
  @property() public breadcrumb?: string;

  /**
   * One line of plain words under the title, on a wide screen. Pages under
   * Settings get the description of their section when nothing is given; an
   * empty text shows none.
   */
  @property() public summary?: string;

  /**
   * Set when the content shows the page title as its heading, so the title
   * in the header is not a second heading.
   */
  @property({ type: Boolean, attribute: "content-heading" })
  public contentHeading = false;

  private _announcedTitle?: string;

  @state() private _activeTab?: PageNavigation;

  @state() private _hasCustomHeader = false;

  @state() private _hasCustomToolbar = false;

  @query(".content > slot:not([name])")
  private _contentSlot?: HTMLSlotElement;

  @query("#tabbar") private _tabBar?: HTMLElement;

  @query("#tabbar .strip") private _tabStrip?: HTMLElement;

  @query(".content") private _content?: HTMLDivElement;

  // @ts-ignore
  @restoreScroll(".content") private _savedScrollPos?: number;

  private _pageLock = new PageLockController(this);

  /**
   * The tab menu and its dialogs need the full state object. Most pages do not
   * pass one in, so it is read from the app element, which always holds it.
   * The language context re-renders this layout whenever it changes.
   */
  private _menuHass(): HomeAssistant | undefined {
    return (
      this.hass ??
      (
        document.querySelector("home-assistant") as
          (HTMLElement & { hass?: HomeAssistant }) | null
      )?.hass
    );
  }

  /** The pages this surface shows; two or more of them make a tab row. */
  private _getTabs = memoizeOne(
    (
      tabs: PageNavigation[],
      _components: string[],
      _language: string,
      _userData: CoreFrontendUserData | undefined,
      entities: ContextType<typeof entitiesContext>
    ): PageNavigation[] => {
      const shownTabs = tabs.filter((page) =>
        canShowPage({ ...this._hassConfig, entities }, page)
      );
      this.showTabs = shownTabs.length >= 2;
      return shownTabs;
    }
  );

  /** What the tab row needs of each page. */
  private _getTabItems = memoizeOne(
    (
      shown: PageNavigation[],
      _language: string,
      localize: LocalizeFunc
    ): SectionTabItem[] =>
      shown.map((page) => ({
        path: page.path,
        label: this._tabName(page, localize) ?? "",
        iconPath: page.iconPath,
        badge: page.badge,
      }))
  );

  public willUpdate(changedProperties: PropertyValues<this>) {
    this.toggleAttribute("narrow", this._narrow);

    if (changedProperties.has("route")) {
      const currentPath = `${this.route.prefix}${this.route.path}`;
      this._activeTab = this.tabs.find((tab) =>
        this._isActiveTabPath(tab.path, currentPath)
      );
    }
    super.willUpdate(changedProperties);
  }

  protected render(): TemplateResult {
    const localize = this._i18n.localize;
    const shown = this._getTabs(
      this.tabs,
      this._hassConfig.config.components,
      this._i18n.language,
      this._hassConfig.userData,
      this._entities
    );
    const tabItems = this._getTabItems(shown, this._i18n.language, localize);
    const backPath = sanitizeNavigationPath(this.backPath);
    const activeName =
      this._activeTab && this._tabName(this._activeTab, localize);
    const title = this.showTabs
      ? activeName
      : shown.length === 1
        ? this._tabName(shown[0], localize)
        : "";
    const hiddenHeading =
      !this.contentHeading && (this._hasCustomHeader || this._hasCustomToolbar)
        ? title
        : undefined;
    const locked = this._pageLock.locked;
    const breadcrumb = this.breadcrumb ?? this._breadcrumb(title);
    const summary = title ? this._summary() : undefined;

    return html`
      <div class="toolbar ${classMap({ narrow: this._narrow })}">
        <slot name="toolbar" @slotchange=${this._toolbarSlotChanged}>
          <div class="toolbar-content">
            ${
              this.mainPage || (!backPath && getHistoryState()?.root)
                ? html`<ha-menu-button></ha-menu-button>`
                : html`
                    <ha-icon-button-arrow-prev
                      .href=${backPath}
                      @click=${this._backTapped}
                    ></ha-icon-button-arrow-prev>
                  `
            }
            <div class="main-title">
              <slot name="header" @slotchange=${this._headerSlotChanged}
                >${
                  breadcrumb && !this._narrow
                    ? html`<span class="breadcrumb">${breadcrumb}</span>`
                    : nothing
                }${
                  !title
                    ? ""
                    : this.contentHeading
                      ? html`<span class="bar-title page-title">${title}</span>`
                      : html`<h1 class="page-title">${title}</h1>`
                }</slot
              >${
                summary && !this._narrow
                  ? html`<span class="summary">${summary}</span>`
                  : nothing
              }${this._narrow ? nothing : html`<slot name="subtitle"></slot>`}
            </div>
            <div class="tool-pill">
              <ha-page-tools
                .compact=${this._narrow}
                .fold=${this._narrow && this._foldTools}
                .foldedActions=${this._foldedActions}
                .pill=${!this._narrow}
                .pageTitle=${title}
              ></ha-page-tools>
              <div id="toolbar-icon" ?inert=${locked}>
                <slot
                  name="toolbar-icon"
                  @slotchange=${this._toolbarIconsChanged}
                ></slot>
              </div>
            </div>
          </div>
        </slot>
        ${
          this.showTabs
            ? html`<div
                id="tabbar"
                class=${this._narrow ? "tab-row compact" : "tab-row"}
              >
                <ha-section-tabs
                  .tabs=${tabItems}
                  .activePath=${this._activeTab?.path}
                  .narrow=${false}
                  .scrollable=${this._narrow}
                  .surface=${this.route.prefix}
                  .localize=${localize}
                  .hass=${this._menuHass()}
                ></ha-section-tabs>
              </div>`
            : ""
        }
      </div>
      ${locked ? html`<ha-page-lock-banner></ha-page-lock-banner>` : nothing}
      <div class="container">
        ${
          this.pane
            ? html`<div class="pane" ?inert=${locked}>
                <div class="shadow-container"></div>
                <div class="ha-scrollbar">
                  <slot name="pane"></slot>
                </div>
              </div>`
            : nothing
        }
        <div
          class="content ha-scrollbar"
          role=${ifDefined(this.showTabs ? "tabpanel" : undefined)}
          id=${ifDefined(this.showTabs ? SECTION_TAB_PANEL_ID : undefined)}
          aria-labelledby=${ifDefined(
            this.showTabs && this._activeTab
              ? sectionTabDomId(this._activeTab.path)
              : undefined
          )}
          ?inert=${locked}
          @scroll=${this._saveScrollPos}
        >
          ${
            hiddenHeading
              ? html`<h1 class="visually-hidden">${hiddenHeading}</h1>`
              : nothing
          }
          <slot></slot>
          ${this.hasFab ? html`<div class="fab-bottom-space"></div>` : nothing}
        </div>
      </div>
      ${
        this._narrow
          ? nothing
          : html`<ha-page-footer .locked=${locked}></ha-page-footer>`
      }
      <div id="fab" ?inert=${locked}>
        <slot name="fab"></slot>
      </div>
    `;
  }

  /** Where the page sits: the panel, then its section, when they are known. */
  private _breadcrumb(title: string | undefined): string | undefined {
    if (this.mainPage || !this.route?.prefix?.startsWith("/config")) {
      return undefined;
    }
    const localize = this._i18n.localize;
    const sectionKey = sectionResolver?.(this.tabs);
    const parts = [
      localize("panel.config"),
      sectionKey ? localize(sectionKey as LocalizeKeys) : undefined,
    ].filter((part): part is string => !!part && part !== title);
    return parts.length ? parts.join(", ") : undefined;
  }

  /** The line under the title: the given one, or the description of the Settings section. */
  private _summary(): string | undefined {
    if (this.summary !== undefined) {
      return this.summary || undefined;
    }
    if (this.mainPage || !this.route?.prefix?.startsWith("/config")) {
      return undefined;
    }
    const sectionKey = sectionResolver?.(this.tabs);
    if (!sectionKey?.endsWith(".main")) {
      return undefined;
    }
    const text = this._i18n.localize(
      `${sectionKey.slice(0, -".main".length)}.secondary` as LocalizeKeys
    );
    return text || undefined;
  }

  /** The title shown in the header: the open tab, or the only page. */
  private _title(): string | undefined {
    const localize = this._i18n.localize;
    const shown = this._getTabs(
      this.tabs,
      this._hassConfig.config.components,
      this._i18n.language,
      this._hassConfig.userData,
      this._entities
    );
    return this.showTabs
      ? this._activeTab && this._tabName(this._activeTab, localize)
      : shown.length === 1
        ? this._tabName(shown[0], localize)
        : "";
  }

  protected firstUpdated(): void {
    // A page with nothing in its toolbar never fires a slot change.
    this._foldTools = inspectToolbarSlot(this._toolbarSlot ?? null).foldable;
    playPageEntry(this._contentSlot?.assignedElements({ flatten: true }) ?? []);
    this._observeTabStrip();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);
    this._observeTabStrip();
    this._syncTabIndicator();
    setToolbarFolded(
      this._toolbarSlot ?? null,
      this._narrow && this._foldTools
    );
    const title = this._title();
    if (title !== this._announcedTitle) {
      this._announcedTitle = title;
      fireEvent(
        this,
        "page-title-changed",
        { title: title ?? "" },
        { bubbles: false, composed: false }
      );
    }
    this._publishBottomTabs();
  }

  private _stripObserver?: ResizeObserver;

  private _observedStrip?: Element;

  private _onStripScroll = () => this._syncTabIndicator();

  /** Keeps the sliding tab pill and the edge fades in step with the tab strip. */
  private _observeTabStrip(): void {
    const strip = this._tabStrip;
    if (strip === this._observedStrip) {
      return;
    }
    this._stripObserver?.disconnect();
    this._observedStrip?.removeEventListener("scroll", this._onStripScroll);
    this._observedStrip = strip ?? undefined;
    if (!strip) {
      return;
    }
    strip.addEventListener("scroll", this._onStripScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this._stripObserver ??= new ResizeObserver(() =>
        this._syncTabIndicator()
      );
      this._stripObserver.observe(strip);
    }
  }

  private _centredPath?: string;

  private _syncTabIndicator(): void {
    requestAnimationFrame(() => {
      const bar = this._tabBar;
      const strip = this._tabStrip;
      if (!bar || !strip) {
        return;
      }
      const active = strip.querySelector<HTMLElement>(
        '.section-tab[aria-selected="true"]:not([hidden])'
      );
      if (active) {
        // On a phone the row scrolls: bring the open tab into view once when
        // it changes, so the person never opens a page and cannot see where
        // they are.
        const path = active.dataset.path;
        if (this._narrow && path && path !== this._centredPath) {
          this._centredPath = path;
          if (typeof active.scrollIntoView === "function") {
            active.scrollIntoView({ inline: "center", block: "nearest" });
          }
        }
        bar.style.setProperty("--tab-ind-x", `${active.offsetLeft}px`);
        bar.style.setProperty("--tab-ind-w", `${active.offsetWidth}px`);
        // No slide on the first placement.
        requestAnimationFrame(() => bar.setAttribute("data-ind-ready", ""));
      } else {
        bar.style.setProperty("--tab-ind-w", "0px");
      }
      const max = strip.scrollWidth - strip.clientWidth;
      const atStart = Math.abs(strip.scrollLeft) <= 1;
      const atEnd = Math.abs(strip.scrollLeft) >= max - 1;
      bar.style.setProperty(
        "--tab-fade-start",
        max > 1 && !atStart ? "32px" : "0px"
      );
      bar.style.setProperty(
        "--tab-fade-end",
        max > 1 && !atEnd ? "32px" : "0px"
      );
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stripObserver?.disconnect();
    this._observedStrip?.removeEventListener("scroll", this._onStripScroll);
    this._observedStrip = undefined;
    bottomTabsOwners.delete(this);
    syncBottomTabsProperty();
  }

  /**
   * Publishes how tall the bottom tab bar is while a page shows one
   * (`--ha-bottom-tabs-height`; not set otherwise). Bars that float at the
   * bottom of a page, such as the selection bar, sit above the phone bar and
   * add this so that they do not cover the tabs. It is set on the document
   * because those bars are not inside this layout, so a property on this
   * element would never reach them.
   */
  private _publishBottomTabs(): void {
    // The section tabs sit under the page title on every width, so no page
    // has a bottom tab bar to keep clear of.
    bottomTabsOwners.delete(this);
    syncBottomTabsProperty();
  }

  @eventOptions({ passive: true })
  private _saveScrollPos(e: HASSDomTargetEvent<HTMLDivElement>) {
    const top = (e.target as HTMLDivElement).scrollTop;
    this._savedScrollPos = top;
    this.toggleAttribute("scrolled", top > 4);
  }

  public focusContentScroller() {
    if (!this._content) {
      return;
    }

    this._content.style.outline = "none";
    this._content.focus({ preventScroll: true });
  }

  private _headerSlotChanged(ev: Event): void {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    this._hasCustomHeader =
      (ev.target as HTMLSlotElement).assignedNodes().length > 0;
  }

  // slotchange bubbles, so nested slots also land here
  private _toolbarSlotChanged(ev: Event): void {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    this._hasCustomToolbar =
      (ev.target as HTMLSlotElement).assignedNodes().length > 0;
  }

  private _toolbarIconsChanged(ev: Event): void {
    const slot = ev.target as HTMLSlotElement;
    orderToolPillItems(slot);
    for (const item of slot.assignedElements({ flatten: true })) {
      item.toggleAttribute(
        "data-own-help",
        (item as { path?: string }).path === mdiHelpCircleOutline
      );
    }
    this._foldTools = inspectToolbarSlot(slot).foldable;
  }

  private _tabName(
    page: PageNavigation,
    localize: LocalizeFunc
  ): string | undefined {
    return (
      (page.translationKey && localize(page.translationKey as LocalizeKeys)) ||
      page.name
    );
  }

  private _backTapped(ev: MouseEvent): void {
    handleBackClick(ev, this.backPath, this.backCallback);
  }

  private _isActiveTabPath(tabPath: string, currentPath: string): boolean {
    try {
      const tabUrl = new URL(tabPath, window.location.origin);
      const currentUrl = new URL(currentPath, window.location.origin);

      const tabPathname = normalizePathname(tabUrl.pathname);
      const currentPathname = normalizePathname(currentUrl.pathname);

      if (
        currentPathname === tabPathname ||
        currentPathname.startsWith(`${tabPathname}/`)
      ) {
        return true;
      }

      return false;
    } catch (_err) {
      return currentPath === tabPath || currentPath.startsWith(`${tabPath}/`);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      sectionTabsStyles,
      pageHeaderStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        :host([narrow]) {
          width: 100%;
          position: fixed;
        }

        .container {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        ha-page-footer,
        ha-page-lock-banner {
          flex: none;
        }

        ha-menu-button {
          margin-right: 24px;
          margin-inline-end: 24px;
          margin-inline-start: initial;
        }

        .toolbar {
          flex: none;
          font-size: var(--ha-font-size-xl);
          min-height: calc(
            var(--header-height, 0px) + var(--safe-area-inset-top, 0px)
          );
          padding-top: var(--safe-area-inset-top);
          padding-right: var(--safe-area-inset-right);
          background-color: transparent;
          font-weight: var(--ha-font-weight-normal);
          box-sizing: border-box;
        }
        :host([narrow]) .toolbar {
          padding-left: var(--safe-area-inset-left);
          /* Phone: the page top is the page itself, not a separate bar. */
          background-color: var(
            --app-header-background-color,
            var(--primary-background-color)
          );
          border-bottom: none;
        }
        .toolbar-content {
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          min-height: var(--header-height);
          box-sizing: border-box;
        }
        :host([narrow]) .toolbar-content {
          padding: 4px;
        }
        .toolbar a {
          color: var(--sidebar-text-color);
          text-decoration: none;
        }
        #tabbar {
          display: flex;
          font-size: var(--ha-font-size-m);
          overflow: hidden;
        }

        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }

        #tabbar.bottom-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          padding: 0 calc(16px + var(--safe-area-inset-right))
            var(--safe-area-inset-bottom)
            calc(16px + var(--safe-area-inset-left));
          box-sizing: border-box;
          background-color: var(
            --app-header-background-color,
            var(--primary-background-color)
          );
          justify-content: space-around;
          z-index: 2;
          font-size: var(--ha-font-size-s);
          width: 100%;
        }
        /* On the narrowest phones five tabs need every pixel: less padding at
           the ends of the bar leaves the labels room. */
        @media (max-width: 400px) {
          #tabbar.bottom-bar {
            padding-inline: calc(4px + var(--safe-area-inset-left, 0px))
              calc(4px + var(--safe-area-inset-right, 0px));
          }
        }

        #tabbar.tab-row {
          justify-content: flex-start;
          padding: 0 var(--ha-space-6) var(--ha-space-3);
        }
        #tabbar.tab-row ha-section-tabs {
          flex: 0 1 auto;
          max-width: 100%;
        }
        /* A phone: the same pill row, level with the page content and
           scrolling sideways when the tabs are wider than the screen. */
        #tabbar.tab-row.compact {
          padding: 0 var(--ha-space-4) var(--ha-space-2);
        }
        #tabbar.tab-row.compact ha-section-tabs {
          flex: 1 1 auto;
          min-width: 0;
        }

        /* The segmented pill: a container with one filled tonal pill that
           slides under the open tab. */
        #tabbar {
          --tab-ind-x: 0px;
          --tab-ind-w: 0px;
          --tab-fade-start: 0px;
          --tab-fade-end: 0px;
          --ha-tab-height: calc(var(--header-height, 56px) - 8px);
        }
        #tabbar ha-tab {
          --header-height: var(--ha-tab-height);
        }
        #tabbar ha-section-tabs .strip {
          position: relative;
          box-sizing: border-box;
          padding: 4px;
          gap: 0;
          border-radius: 28px;
          background-color: var(
            --md-sys-color-surface-container-highest,
            var(--ha-color-fill-neutral-quiet-resting)
          );
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--tab-fade-start),
            #000 calc(100% - var(--tab-fade-end)),
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--tab-fade-start),
            #000 calc(100% - var(--tab-fade-end)),
            transparent 100%
          );
        }
        #tabbar ha-section-tabs .strip::-webkit-scrollbar {
          display: none;
        }
        #tabbar ha-section-tabs .strip::before {
          content: "";
          position: absolute;
          top: 4px;
          bottom: 4px;
          left: 0;
          width: var(--tab-ind-w);
          transform: translateX(var(--tab-ind-x));
          border-radius: 24px;
          background-color: var(
            --md-sys-color-secondary-container,
            var(--ha-color-fill-primary-quiet-resting)
          );
          pointer-events: none;
        }
        #tabbar[data-ind-ready] ha-section-tabs .strip::before {
          transition:
            transform 350ms cubic-bezier(0.2, 1.5, 0.3, 1),
            width 350ms cubic-bezier(0.2, 1.5, 0.3, 1);
        }
        #tabbar ha-section-tabs .section-tab {
          z-index: 1;
          border-radius: 24px;
        }
        #tabbar ha-section-tabs a.section-tab[aria-selected="true"] {
          --tab-color: var(
            --md-sys-color-on-secondary-container,
            var(--primary-text-color)
          );
        }
        #tabbar ha-section-tabs a.section-tab:focus-visible {
          outline-offset: -2px;
        }
        @media (prefers-reduced-motion: reduce) {
          #tabbar[data-ind-ready] ha-section-tabs .strip::before {
            transition: none;
          }
        }

        :host(:not([narrow])) #toolbar-icon {
          display: contents;
        }

        /* Wide windows: the page's tools sit in one floating pill at the end
           of the title row. The page's own buttons come first (its primary
           action), then the shared page tools and a divider and help, then the
           page's last button, normally its overflow menu. */
        .tool-pill {
          display: contents;
        }
        :host(:not([narrow])) .tool-pill {
          position: relative;
          display: flex;
          flex: none;
          align-items: center;
          gap: var(--ha-space-1);
          padding: var(--ha-space-1) var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
          box-shadow: var(--ha-shadow-card, var(--ha-box-shadow-m));
        }
        :host(:not([narrow])) .tool-pill ::slotted(*) {
          order: 0;
        }
        /* The pill already ends with the shared help button: a help button a
           page adds of its own would be a second one beside it. */
        :host(:not([narrow])) .tool-pill ::slotted([data-own-help]) {
          display: none;
        }
        :host(:not([narrow])) .toolbar-content {
          min-height: var(--header-height);
          padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-2);
        }
        :host(:not([narrow])) .main-title {
          margin-inline-start: var(--ha-space-2);
        }
        ha-menu-button,
        ha-icon-button-arrow-prev,
        ::slotted([slot="toolbar-icon"]:not(slot)) {
          display: flex;
          flex-shrink: 0;
          pointer-events: auto;
          color: var(--sidebar-icon-color);
        }

        .main-title {
          min-width: 0;
          flex: 1;
          line-height: var(--ha-line-height-normal);
          color: var(--sidebar-text-color);
          margin-inline-start: var(--main-title-margin, var(--ha-space-6));
        }
        .narrow .main-title {
          margin-inline-start: var(--main-title-margin, var(--ha-space-2));
        }
        /* The title itself (weight, size, wrapping) comes from the shared
           page header styles, which let it wrap instead of clipping. */
        .main-title h1,
        .main-title .bar-title {
          display: block;
          margin: 0;
        }
        .summary {
          display: block;
          margin-top: var(--ha-space-1);
          font-size: var(--ha-font-size-m);
          line-height: var(--ha-line-height-condensed);
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        :host([narrow]) .summary {
          font-size: 13px;
          margin-top: 0;
        }
        :host([narrow]) .toolbar-content {
          min-height: 56px;
        }
        .breadcrumb {
          display: block;
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-condensed);
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .content {
          position: relative;
          width: 100%;
          box-sizing: border-box;
          padding-right: var(--safe-area-inset-right);
          overflow: auto;
        }
        :host([narrow]) .content {
          padding-left: var(--safe-area-inset-left);
        }

        .content .fab-bottom-space {
          height: calc(
            88px + var(--safe-area-inset-bottom, 0px) +
              var(--ha-toast-reserved-height, 0px)
          );
        }

        #fab {
          position: fixed;
          right: calc(16px + var(--safe-area-inset-right, 0px));
          inset-inline-end: calc(16px + var(--safe-area-inset-right));
          inset-inline-start: initial;
          bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: var(--ha-space-2);
          --ha-button-box-shadow: var(--ha-box-shadow-l);
        }
        /* Above the page footer, which wide layouts show. */
        :host(:not([narrow])) #fab {
          bottom: calc(
            16px + var(--ha-page-footer-height, 40px) +
              var(--safe-area-inset-bottom, 0px)
          );
        }
        #fab[is-wide] {
          bottom: calc(24px + var(--ha-page-footer-height, 40px));
          right: 24px;
          inset-inline-end: 24px;
          inset-inline-start: initial;
        }

        .pane {
          border-right: 1px solid var(--divider-color);
          border-inline-end: 1px solid var(--divider-color);
          border-inline-start: initial;
          box-sizing: border-box;
          display: flex;
          flex: 0 0 var(--sidepane-width, 250px);
          width: var(--sidepane-width, 250px);
          flex-direction: column;
          position: relative;
        }
        .pane .ha-scrollbar {
          flex: 1;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-tabs-subpage": HassTabsSubpage;
  }
}
