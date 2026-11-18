import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import type { ContextType } from "@lit/context";
import {
  customElement,
  eventOptions,
  property,
  query,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../common/decorators/consume";
import { restoreScroll } from "../common/decorators/restore-scroll";
import { pageHeaderStyles, playPageEntry } from "../common/motion/page-entry";
import type { HASSDomTargetEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { ShortcutManager } from "../common/keyboard/shortcuts";
import { PageLockController } from "../common/locks/page-lock-controller";
import { getHistoryState } from "../common/navigate";
import { sanitizeNavigationPath } from "../common/url/sanitize-navigation-path";
import { handleBackClick } from "./back-navigation";
import "../components/ha-icon-button-arrow-prev";
import "../components/ha-menu-button";
import "../components/ha-top-bar-search";
import "../components/page/ha-page-footer";
import "../components/page/ha-page-lock-banner";
import "../components/page/ha-page-tools";
import { internationalizationContext } from "../data/context";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant } from "../types";
import type { FoldedToolbarAction } from "./tool-pill-order";
import {
  inspectToolbarSlot,
  orderToolPillItems,
  setToolbarFolded,
} from "./tool-pill-order";

@customElement("hass-subpage")
class HassSubpage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public header?: string;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @property({ attribute: false }) public backCallback?: () => void;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean }) public scrollable = true;

  /**
   * Where the page sits, shown in small type above the title. Pages reached
   * from Settings say so when nothing is given; an empty text shows none.
   */
  @property() public breadcrumb?: string;

  /** One line of plain words under the title, on a wide screen. */
  @property() public summary?: string;

  /**
   * Draws a search button in the top bar, which never scrolls. The page keeps
   * the text and does the matching: it listens for `top-bar-search-input` and
   * `top-bar-search-step`, and hands back `searchValue`, `searchCountText` and
   * `searchWhere`. The button is the same search the page had in its content,
   * with the pattern builder; only its place changes.
   */
  @property({ type: Boolean }) public searchable = false;

  /** What the search is called, for example "Search settings". */
  @property({ attribute: false }) public searchLabel?: string;

  @property({ attribute: false }) public searchValue = "";

  /** Short count in the open field, for example "2 of 3" or "4 of 212". */
  @property({ attribute: false }) public searchCountText?: string;

  /** Pages that scroll to a match show previous and next under the bar. */
  @property({ type: Boolean, attribute: "search-steps" })
  public searchSteps = false;

  /** A line saying where the matches are, for example "Found on: Sound 1". */
  @property({ attribute: false }) public searchWhere?: string;

  @property({ type: Number, attribute: false }) public searchTotal = 0;

  @property({ attribute: false }) public searchSamples?: string[];

  @state() private _searchOpen = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  private _shortcuts = new ShortcutManager();

  // @ts-ignore
  @restoreScroll(".content") private _savedScrollPos?: number;

  private _pageLock = new PageLockController(this);

  // On a phone, a page without a menu of its own folds its tools into a More sheet
  @state() private _foldTools = false;

  /** A page filled the fab slot. Narrow pages then keep room under the content. */
  @property({ type: Boolean, reflect: true, attribute: "has-fab" })
  public hasFab = false;

  @query(".content > slot:not([name])")
  private _contentSlot?: HTMLSlotElement;

  @query('slot[name="toolbar-icon"]')
  private _toolbarSlot?: HTMLSlotElement;

  private _foldedActions = (): FoldedToolbarAction[] =>
    inspectToolbarSlot(this._toolbarSlot ?? null).actions;

  protected firstUpdated(): void {
    // A page with nothing in its toolbar never fires a slot change.
    this._foldTools = inspectToolbarSlot(this._toolbarSlot ?? null).foldable;
    playPageEntry(this._contentSlot?.assignedElements({ flatten: true }) ?? []);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // The slash key opens the search, except while typing in a field.
    this._shortcuts.add({
      "/": {
        handler: (ev) => {
          if (this.searchable && !this._searchOpen) {
            ev.preventDefault();
            this.openSearch();
          }
        },
      },
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._shortcuts.remove();
  }

  /** Opens the search in the bar. The page stays where it is. */
  public openSearch(): void {
    if (!this.searchable || this._searchOpen) {
      return;
    }
    this._searchOpen = true;
    fireEvent(this, "top-bar-search-open");
  }

  /** Gives the title back. The page stays where it is and the words stay. */
  public closeSearch(): void {
    if (!this._searchOpen) {
      return;
    }
    this._searchOpen = false;
    fireEvent(this, "top-bar-search-close");
  }

  private _searchOpened(ev: Event): void {
    // Opened from the button: the event is already on its way to the page.
    ev.stopPropagation();
    this.openSearch();
  }

  private _searchClosed(ev: Event): void {
    ev.stopPropagation();
    this.closeSearch();
  }

  protected updated(): void {
    setToolbarFolded(this._toolbarSlot ?? null, this.narrow && this._foldTools);
  }

  protected render(): TemplateResult {
    const backPath = sanitizeNavigationPath(this.backPath);
    const locked = this._pageLock.locked;
    const breadcrumb = this._breadcrumb(backPath);
    const searching = this.searchable && this._searchOpen;
    const hideForSearch = searching && this.narrow;
    const localize = this._i18n?.localize;

    return html`
      <div class="toolbar ${classMap({ narrow: this.narrow })}">
        <div class=${classMap({ "toolbar-content": true, searching })}>
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

          <div class="main-title" ?hidden=${hideForSearch}>
            ${
              breadcrumb && !this.narrow
                ? html`<span class="breadcrumb">${breadcrumb}</span>`
                : nothing
            }
            <span class="title-text page-title"
              ><slot name="header">${this.header}</slot></span
            >
            ${
              this.summary && !this.narrow
                ? html`<span class="summary">${this.summary}</span>`
                : nothing
            }
          </div>
          ${
            this.narrow
              ? nothing
              : html`<div id="fab" class="docked" ?inert=${locked}>
                  <slot name="fab" @slotchange=${this._fabChanged}></slot>
                </div>`
          }
          ${
            this.searchable && localize
              ? html`<ha-top-bar-search
                  .localize=${localize}
                  .label=${this.searchLabel}
                  .value=${this.searchValue}
                  .open=${this._searchOpen}
                  .wide=${!this.narrow}
                  .countText=${this.searchCountText}
                  .patternSamples=${this.searchSamples}
                  @top-bar-search-open=${this._searchOpened}
                  @top-bar-search-close=${this._searchClosed}
                ></ha-top-bar-search>`
              : nothing
          }
          <div class="tool-pill" ?hidden=${hideForSearch}>
            <ha-page-tools
              .compact=${this.narrow}
              .fold=${this.narrow && this._foldTools}
              .foldedActions=${this._foldedActions}
              .pill=${!this.narrow}
              .pageTitle=${this.header}
            ></ha-page-tools>
            <div class="toolbar-icons" ?inert=${locked}>
              <slot
                name="toolbar-icon"
                @slotchange=${this._toolbarIconsChanged}
              ></slot>
            </div>
          </div>
        </div>
        ${
          searching && this.searchSteps && localize
            ? html`<ha-top-bar-search-steps
                .localize=${localize}
                .where=${this.searchWhere}
                .total=${this.searchTotal}
              ></ha-top-bar-search-steps>`
            : nothing
        }
      </div>
      ${locked ? html`<ha-page-lock-banner></ha-page-lock-banner>` : nothing}
      <div
        class=${classMap({
          content: true,
          "ha-scrollbar": this.scrollable,
          "not-scrollable": !this.scrollable,
        })}
        ?inert=${locked}
        @scroll=${this._saveScrollPos}
      >
        <slot></slot>
      </div>
      ${
        this.narrow
          ? nothing
          : html`<ha-page-footer .locked=${locked}></ha-page-footer>`
      }
      ${
        this.narrow
          ? html`<div id="fab" ?inert=${locked}>
              <slot name="fab" @slotchange=${this._fabChanged}></slot>
            </div>`
          : nothing
      }
    `;
  }

  private _breadcrumb(backPath: string | undefined): string | undefined {
    if (this.breadcrumb !== undefined) {
      return this.breadcrumb || undefined;
    }
    if (!this._i18n || this.mainPage || !backPath?.startsWith("/config")) {
      return undefined;
    }
    const localize = this._i18n.localize;
    const parts = [
      localize("panel.config"),
      backPath.startsWith("/config/system")
        ? localize("ui.panel.config.dashboard.system.main")
        : undefined,
    ].filter((part) => part && part !== this.header);
    return parts.length ? parts.join(", ") : undefined;
  }

  private _fabChanged(ev: Event): void {
    this.hasFab =
      (ev.target as HTMLSlotElement).assignedElements({ flatten: true })
        .length > 0;
  }

  private _toolbarIconsChanged(ev: Event): void {
    const slot = ev.target as HTMLSlotElement;
    orderToolPillItems(slot);
    this._foldTools = inspectToolbarSlot(slot).foldable;
  }

  @eventOptions({ passive: true })
  private _saveScrollPos(e: HASSDomTargetEvent<HTMLDivElement>) {
    const top = (e.target as HTMLDivElement).scrollTop;
    this._savedScrollPos = top;
    this.toggleAttribute("scrolled", top > 4);
  }

  private _backTapped(ev: MouseEvent): void {
    handleBackClick(ev, this.backPath, this.backCallback);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      pageHeaderStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          position: relative;
        }

        .toolbar,
        ha-page-footer,
        ha-page-lock-banner {
          flex: none;
        }

        [hidden] {
          display: none !important;
        }

        ha-top-bar-search {
          margin-inline-start: var(--ha-space-1);
        }
        :host(:not([narrow])) ha-top-bar-search {
          margin-inline-start: auto;
          margin-inline-end: var(--ha-space-2);
        }

        /* While the search is open on a wide window the bar stays one row:
           the title keeps its room and ends with an ellipsis, the tools stay
           beside the field. */
        :host(:not([narrow])) .toolbar-content.searching {
          flex-wrap: nowrap;
        }
        :host(:not([narrow])) .toolbar-content.searching .main-title {
          flex: 1 1 0;
          min-width: 0;
          overflow: hidden;
        }
        :host(:not([narrow])) .toolbar-content.searching .page-title,
        :host(:not([narrow])) .toolbar-content.searching .summary,
        :host(:not([narrow]))
          .toolbar-content.searching
          ::slotted([slot="subtitle"]),
        :host(:not([narrow]))
          .toolbar-content.searching
          ::slotted([slot="header"]),
        :host(:not([narrow])) .toolbar-content.searching .breadcrumb {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .toolbar-icons {
          display: flex;
          align-items: center;
        }
        :host(:not([narrow])) .toolbar-icons {
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

        :host([narrow]) {
          width: 100%;
          position: fixed;
        }

        .toolbar {
          background-color: var(--app-header-background-color, transparent);
          padding-top: var(--safe-area-inset-top);
          padding-right: var(--safe-area-inset-right);
        }
        :host([narrow]) .toolbar {
          padding-left: var(--safe-area-inset-left);
        }

        .toolbar-content {
          display: flex;
          align-items: center;
          font-size: var(--ha-font-size-xl);
          min-height: var(--header-height);
          font-weight: var(--ha-font-weight-normal);
          color: var(--app-header-text-color, white);
          box-sizing: border-box;
          padding: 8px 12px;
        }

        .toolbar a {
          color: var(--sidebar-text-color);
          text-decoration: none;
        }

        ha-menu-button,
        ha-icon-button-arrow-prev,
        ::slotted([slot="toolbar-icon"]) {
          display: flex;
          align-items: center;
          pointer-events: auto;
          color: var(--sidebar-icon-color);
        }

        .main-title {
          margin-inline-start: var(--ha-space-6);
          line-height: var(--ha-line-height-condensed);
          min-width: 0;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        :host(:not([narrow])) .toolbar-content {
          min-height: var(--header-height);
          padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-2);
        }
        :host(:not([narrow])) .main-title {
          margin-inline-start: var(--ha-space-2);
          /* The title gets its room first: when the tools do not fit beside
             it, they drop to their own row instead of squeezing the title
             onto several lines. */
          flex: 1 1 22rem;
          min-width: min(22rem, 100%);
        }
        :host(:not([narrow])) .toolbar-content {
          flex-wrap: wrap;
          row-gap: var(--ha-space-2);
        }
        :host(:not([narrow])) .tool-pill {
          margin-inline-start: auto;
        }
        .summary {
          margin-top: var(--ha-space-1);
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .breadcrumb {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .narrow .main-title {
          margin-inline-start: var(--ha-space-2);
        }
        /* Phone: a compact header, about 56 px tall. */
        :host([narrow]) .toolbar-content {
          min-height: 56px;
          padding: 6px 8px;
        }
        :host([narrow]) .summary {
          font-size: 13px;
          margin-top: 0;
        }

        .content {
          position: relative;
          width: calc(100% - var(--safe-area-inset-right, 0px));
          flex: 1;
          min-height: 0;
          box-sizing: border-box;
          padding-bottom: var(--safe-area-inset-bottom, 0px);
          margin-right: var(--safe-area-inset-right);
          overflow-y: auto;
          overflow: auto;
        }
        .content.not-scrollable {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* A floating button never covers the last line: the page scrolls
           clear of it (56 px button and 16 px above and below), and clear of
           any toast shown in the phone strip. The bottom bars are already part
           of the safe area. */
        :host([narrow]) .content {
          padding-bottom: calc(
            var(--safe-area-inset-bottom, 0px) +
              var(--ha-toast-reserved-height, 0px) +
              var(--ha-dim-sum-reserved-height, 0px)
          );
        }
        :host([narrow][has-fab]) .content {
          padding-bottom: calc(
            var(--safe-area-inset-bottom, 0px) + 56px + 32px +
              var(--ha-toast-reserved-height, 0px) +
              var(--ha-dim-sum-reserved-height, 0px)
          );
        }

        :host([narrow]) .content {
          width: calc(
            100% - var(--safe-area-inset-left, 0px) - var(
                --safe-area-inset-right,
                0px
              )
          );
          margin-left: var(--safe-area-inset-left);
        }

        #fab {
          position: absolute;
          right: calc(16px + var(--safe-area-inset-right, 0px));
          inset-inline-end: calc(16px + var(--safe-area-inset-right, 0px));
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
        :host([narrow]) #fab.tabs {
          bottom: calc(84px + var(--safe-area-inset-bottom, 0px));
        }
        /* Wide screens dock the button in the header as a labelled pill. */
        #fab.docked {
          position: static;
          inset: auto;
          z-index: auto;
          flex: none;
          flex-wrap: nowrap;
          margin-inline-end: var(--ha-space-3);
          --ha-button-box-shadow: none;
        }
        #fab.docked ::slotted(*) {
          --ha-button-height: 40px;
        }
        #fab[is-wide] {
          bottom: calc(
            24px + var(--ha-page-footer-height, 40px) +
              var(--safe-area-inset-bottom, 0px)
          );
          right: calc(24px + var(--safe-area-inset-right, 0px));
          inset-inline-end: calc(24px + var(--safe-area-inset-right, 0px));
          inset-inline-start: initial;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-subpage": HassSubpage;
  }
}
