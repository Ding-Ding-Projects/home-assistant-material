import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { HASSDomCurrentTargetEvent } from "../common/dom/fire_event";
import { PageLockController } from "../common/locks/page-lock-controller";
import { pageHeaderStyles } from "../common/motion/page-entry";
import { goBack } from "../common/navigate";
import type { FoldedToolbarAction } from "../layouts/tool-pill-order";
import {
  inspectToolbarSlot,
  orderToolPillItems,
  setToolbarFolded,
} from "../layouts/tool-pill-order";
import { haStyleScrollbar } from "../resources/styles";
import "./ha-icon-button-arrow-prev";
import "./ha-menu-button";
import "./page/ha-page-footer";
import "./page/ha-page-lock-banner";
import "./page/ha-page-tools";

const PASSIVE_EVENT_OPTIONS = { passive: true } as const;

/**
 * The header every top level page shares with the settings pages: a large
 * heavy title that wraps instead of clipping, a round tonal menu or back
 * button, the page tools and the page's own buttons in one rounded pill on a
 * wide screen, and a soft tonal surface that appears once the page scrolls.
 */
export const haTopAppBarFixedStyles: CSSResultGroup = [
  pageHeaderStyles,
  css`
    :host {
      display: block;
      position: relative;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      /* Replaced by the measured height of the header once it is drawn. */
      --total-top-app-bar-height: calc(
        var(--header-height, 0px) + var(--sub-row-height, 0px)
      );
      --sub-row-height: 0px;
    }

    .top-app-bar {
      box-sizing: border-box;
      color: var(--primary-text-color);
      background-color: transparent;
      position: absolute;
      top: 0;
      inset-inline-start: 0;
      inset-inline-end: 0;
      width: 100%;
      z-index: 4;
      padding-top: var(--safe-area-inset-top);
      transition:
        background-color 200ms ease,
        width var(--ha-animation-duration-normal) ease,
        padding-left var(--ha-animation-duration-normal) ease,
        padding-right var(--ha-animation-duration-normal) ease;
    }

    .top-app-bar.scrolled:not(.pane-header) {
      background-color: var(
        --ha-header-scrolled-background,
        var(--md-sys-color-surface-container, var(--card-background-color))
      );
    }

    .row {
      box-sizing: border-box;
      display: flex;
      width: 100%;
      align-items: center;
      min-height: var(--header-height);
      padding-block: var(--ha-space-2);
      padding-inline: var(--ha-space-3);
      padding-inline-end: calc(
        var(--ha-space-3) + var(--safe-area-inset-right, 0px)
      );
    }

    :host(:not([narrow])) .top-app-bar:not(.pane-header) .row {
      flex-wrap: wrap;
      row-gap: var(--ha-space-2);
      padding-block: var(--ha-space-4) var(--ha-space-2);
      padding-inline: var(--ha-space-6);
      padding-inline-end: calc(
        var(--ha-space-6) + var(--safe-area-inset-right, 0px)
      );
    }

    /* With a side pane the header is split above the pane and the page, and
       each part carries its own padding. */
    .top-app-bar.pane-header .row {
      padding-inline: 0;
    }
    .top-app-bar.pane-header .section {
      padding-inline: var(--ha-space-3);
    }

    /* A phone gets a small bar: about 56 px, a 21 px title that may wrap to
       two lines and 44 px round buttons. The large title is for wide windows. */
    :host([narrow]) .row {
      min-height: 56px;
      padding-block: var(--ha-space-1);
    }
    :host([narrow]) .main-title .page-title {
      font-size: 21px;
    }
    :host([narrow]) ha-icon-button-arrow-prev,
    :host([narrow]) ha-menu-button,
    :host([narrow]) ::slotted([slot="navigationIcon"]) {
      width: 44px;
      height: 44px;
      --mdc-icon-button-size: 44px;
    }

    :host([narrow]) .row {
      padding-inline-start: calc(
        var(--ha-space-3) + var(--safe-area-inset-left, 0px)
      );
    }
    :host([narrow]) .sub-row {
      padding-left: var(--safe-area-inset-left, 0px);
    }

    .sub-row {
      box-sizing: border-box;
      display: block;
      width: 100%;
      padding-right: var(--safe-area-inset-right, 0px);
      overflow: hidden;
    }

    .sub-row slot,
    .sub-row ::slotted(*) {
      box-sizing: border-box;
      display: block;
      width: 100%;
    }

    .sub-row[hidden] {
      display: none;
    }

    .section {
      display: flex;
      align-items: center;
      box-sizing: border-box;
      min-width: 0;
      padding: 0;
    }

    #navigation {
      flex: 1 1 auto;
    }

    /* The title gets its room first: when the tools do not fit beside it,
       they drop to their own row instead of squeezing the title. */
    :host(:not([narrow])) .top-app-bar:not(.pane-header) #navigation {
      flex: 1 1 22rem;
      min-width: min(22rem, 100%);
    }

    .section.center {
      flex: 1 1 auto;
      justify-content: center;
      text-align: center;
    }

    .section.end {
      flex: none;
      justify-content: flex-end;
      margin-inline-start: auto;
    }

    /* The title takes the room the row has left. On a phone it measures its
       font size against its own width (a size container), so it contributes
       no width of its own to the row: without growing into the free space it
       would collapse to nothing and stack one letter per line. */
    .main-title {
      display: flex;
      flex-direction: column;
      justify-content: center;
      flex: 1 1 auto;
      min-width: 0;
      margin-inline-start: var(--ha-space-4);
      line-height: var(--ha-line-height-condensed);
    }
    :host([narrow]) .main-title {
      margin-inline-start: var(--ha-space-2);
    }
    /* On a phone the title stays on one line and ends in an ellipsis only
       when it is too long even at its smallest size. */
    :host([narrow]) .main-title .page-title,
    :host([narrow]) ::slotted([slot="title"]) {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow-wrap: normal;
    }
    #title .main-title {
      margin-inline-start: var(--ha-space-2);
    }
    /* The title of a side pane sits in a narrow column. */
    .top-app-bar.pane-header .main-title .page-title.page-title {
      font-size: var(--ha-font-size-xl);
    }

    .summary {
      margin-top: var(--ha-space-1);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-normal);
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    ::slotted([slot="title"]) {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: break-word;
    }

    /* A button a page puts in the navigation slot looks like the menu button. */
    ::slotted([slot="navigationIcon"]) {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background-color: var(
        --md-sys-color-secondary-container,
        var(--ha-color-fill-neutral-quiet-resting)
      );
      color: var(
        --md-sys-color-on-secondary-container,
        var(--primary-text-color)
      );
    }

    /* The page's own labelled buttons, on a wide screen. On a phone they stay
       in the page's menu. */
    .primary-action {
      display: contents;
    }
    .primary-action ::slotted(*) {
      flex: none;
      margin-inline-end: var(--ha-space-3);
    }
    :host([narrow]) .primary-action ::slotted(*) {
      display: none;
    }

    /* On a wide screen the page tools and the page's own buttons share one
       floating pill. */
    .tool-pill {
      display: flex;
      align-items: center;
      flex: none;
    }
    :host(:not([narrow])) .tool-pill {
      position: relative;
      gap: var(--ha-space-1);
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--card-background-color);
      box-shadow: var(--ha-shadow-card, var(--ha-box-shadow-m));
    }
    .tool-pill[hidden] {
      display: none;
    }

    .top-app-bar-fixed-adjust {
      box-sizing: border-box;
      position: absolute;
      top: calc(
        var(--total-top-app-bar-height, 0px) + var(--safe-area-inset-top, 0px)
      );
      bottom: 0;
      inset-inline-start: 0;
      inset-inline-end: 0;
      padding-bottom: var(--safe-area-inset-bottom);
      padding-right: var(--safe-area-inset-right);
      overflow: auto;
    }

    /* A phone page ends clear of the dim sum card while it shows. */
    :host([narrow]) .top-app-bar-fixed-adjust {
      padding-left: var(--safe-area-inset-left);
      padding-bottom: calc(
        var(--safe-area-inset-bottom, 0px) +
          var(--ha-toast-reserved-height, 0px) +
          var(--ha-dim-sum-reserved-height, 0px)
      );
    }

    /* Wide pages end in the page footer. */
    :host(:not([narrow]):not([no-page-tools])) .top-app-bar-fixed-adjust {
      bottom: calc(
        var(--ha-page-footer-height, 40px) + var(--safe-area-inset-bottom, 0px)
      );
      padding-bottom: 0;
    }
    ha-page-footer {
      position: absolute;
      bottom: 0;
      inset-inline: 0;
    }
    ha-page-tools {
      color: var(--sidebar-icon-color, inherit);
    }
    .action-items {
      display: contents;
    }
    ha-page-lock-banner {
      position: static;
    }
  `,
];

@customElement("ha-top-app-bar-fixed")
export class HaTopAppBarFixed extends LitElement {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "back-button", type: Boolean }) backButton = false;

  @property({ attribute: "center-title", type: Boolean }) centerTitle = false;

  /** One line of plain words under the title, on a wide screen. */
  @property() public summary?: string;

  /** Leaves out the page tools and the footer, for screens that are not pages. */
  @property({ attribute: "no-page-tools", type: Boolean, reflect: true })
  public noPageTools = false;

  private _pageLock = new PageLockController(this);

  /** Whether the page is locked, so nothing on it may take input. */
  protected get _locked(): boolean {
    return !this.noPageTools && this._pageLock.locked;
  }

  @query(".top-app-bar") protected _barElement!: HTMLElement;

  @query(".sub-row") protected _subRowElement?: HTMLElement;

  @query(".top-app-bar-fixed-adjust") protected _scrollElement?: HTMLElement;

  @query('slot[name="actionItems"]')
  private _actionSlot?: HTMLSlotElement;

  @state() private _hasSubRow = false;

  @state() private _hasActions = false;

  // On a phone, a page without a menu of its own folds its tools into a More sheet.
  @state() private _foldTools = false;

  private _scrollTarget?: HTMLElement | Window;

  private _subRowResizeObserver?: ResizeObserver;

  private _headerResizeObserver?: ResizeObserver;

  @property({ attribute: false })
  public get scrollTarget(): HTMLElement | Window {
    return this._scrollTarget || this._scrollElement || window;
  }

  public set scrollTarget(value: HTMLElement | Window) {
    const old = this.scrollTarget;
    this._unregisterListeners();
    this._scrollTarget = value;
    this.requestUpdate("scrollTarget", old);
    if (this.isConnected) {
      this._registerListeners();
      this._syncScrollState();
    }
  }

  protected _isPaneHeader(): boolean {
    return false;
  }

  private _foldedActions = (): FoldedToolbarAction[] =>
    inspectToolbarSlot(this._actionSlot ?? null).actions;

  protected render() {
    return html`${this._renderHeader()}${this._renderContent()}${
      this.noPageTools || this.narrow
        ? nothing
        : html`<ha-page-footer .locked=${this._locked}></ha-page-footer>`
    }`;
  }

  override connectedCallback() {
    super.connectedCallback();

    if (this.hasUpdated) {
      this._observeSubRowHeight();
      this._observeHeaderHeight();
      this._updateSubRowHeight();
      this._registerListeners();
      this._syncScrollState();
    }
  }

  protected _renderHeader() {
    const title = html`<span class="main-title">
      <span class="title page-title"><slot name="title"></slot></span>
      ${
        this.summary && !this.narrow && !this._isPaneHeader()
          ? html`<span class="summary">${this.summary}</span>`
          : nothing
      }
    </span>`;
    const paneHeader = this._isPaneHeader();
    const showTools = !this.noPageTools || this._hasActions;

    return html`
      <header
        class="top-app-bar ${classMap({
          "pane-header": paneHeader,
          "has-sub-row": this._hasSubRow,
        })}"
      >
        <div class="row">
          ${
            paneHeader
              ? html`<section class="section" id="title">
                  ${this._renderNavigationIcon()} ${title}
                </section>`
              : nothing
          }
          <section class="section" id="navigation">
            ${
              paneHeader
                ? nothing
                : html`${this._renderNavigationIcon()}
                  ${this.centerTitle ? nothing : title}`
            }
          </section>
          ${
            !paneHeader && this.centerTitle
              ? html`<section class="section center">${title}</section>`
              : nothing
          }
          <section class="section end" id="actions" role="toolbar">
            <div class="primary-action" ?inert=${this._locked}>
              <slot name="primaryAction"></slot>
            </div>
            <div class="tool-pill" ?hidden=${!showTools}>
              ${
                this.noPageTools
                  ? nothing
                  : html`<ha-page-tools
                      .compact=${this.narrow}
                      .fold=${this.narrow && this._foldTools}
                      .foldedActions=${this._foldedActions}
                      .pill=${!this.narrow}
                    ></ha-page-tools>`
              }
              <span class="action-items" ?inert=${this._locked}>
                <slot
                  name="actionItems"
                  @slotchange=${this._actionsChanged}
                ></slot>
              </span>
            </div>
          </section>
        </div>
        <div class="sub-row" ?hidden=${!this._hasSubRow}>
          <slot name="subRow" @slotchange=${this._subRowSlotChanged}></slot>
        </div>
        ${
          this._locked
            ? html`<ha-page-lock-banner></ha-page-lock-banner>`
            : nothing
        }
      </header>
    `;
  }

  private _renderNavigationIcon() {
    return html`
      <slot name="navigationIcon">
        ${
          this.backButton
            ? html`
                <ha-icon-button-arrow-prev
                  @click=${this._handleBackClick}
                ></ha-icon-button-arrow-prev>
              `
            : html`<ha-menu-button></ha-menu-button>`
        }
      </slot>
    `;
  }

  protected _renderContent() {
    return html`<div
      class="top-app-bar-fixed-adjust ha-scrollbar"
      ?inert=${this._locked}
    >
      <slot></slot>
    </div>`;
  }

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    this._observeSubRowHeight();
    this._observeHeaderHeight();
    this._updateSubRowHeight();
    this._registerListeners();
    this._syncScrollState();
    // A page with nothing in its toolbar never fires a slot change.
    this._actionsChanged();
  }

  protected override updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has("_hasSubRow")) {
      this._updateSubRowHeight();
    }
    setToolbarFolded(
      this._actionSlot ?? null,
      this.narrow && this._foldTools && !this.noPageTools
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._unobserveSubRowHeight();
    this._unobserveHeaderHeight();
    this._unregisterListeners();
  }

  protected _syncScrollState = () => {
    const scrollTop =
      this.scrollTarget instanceof Window
        ? this.scrollTarget.pageYOffset
        : this.scrollTarget.scrollTop;
    this._barElement?.classList.toggle("scrolled", scrollTop > 0);
  };

  private _handleBackClick(ev: Event) {
    ev.stopPropagation();
    goBack();
  }

  protected _registerListeners() {
    this.scrollTarget.addEventListener(
      "scroll",
      this._syncScrollState,
      PASSIVE_EVENT_OPTIONS
    );
  }

  protected _unregisterListeners() {
    this.scrollTarget.removeEventListener("scroll", this._syncScrollState);
  }

  private _actionsChanged = () => {
    const slot = this._actionSlot ?? null;
    if (!slot) {
      return;
    }
    orderToolPillItems(slot);
    this._foldTools = inspectToolbarSlot(slot).foldable;
    this._hasActions = slot.assignedElements({ flatten: true }).length > 0;
  };

  private _observeSubRowHeight() {
    if (
      this._subRowResizeObserver ||
      !this._subRowElement ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    this._subRowResizeObserver = new ResizeObserver(this._updateSubRowHeight);
    this._subRowResizeObserver.observe(this._subRowElement);
  }

  private _unobserveSubRowHeight() {
    this._subRowResizeObserver?.disconnect();
    this._subRowResizeObserver = undefined;
  }

  // The title wraps, so the header is as tall as it needs to be and the page
  // below it starts where the header ends.
  private _observeHeaderHeight() {
    if (
      this._headerResizeObserver ||
      !this._barElement ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    this._headerResizeObserver = new ResizeObserver(this._updateHeaderHeight);
    this._headerResizeObserver.observe(this._barElement);
  }

  private _unobserveHeaderHeight() {
    this._headerResizeObserver?.disconnect();
    this._headerResizeObserver = undefined;
  }

  private _updateHeaderHeight = () => {
    const bar = this._barElement;
    if (!bar) {
      return;
    }
    // The content is placed below the safe area on its own.
    const safeArea = parseFloat(getComputedStyle(bar).paddingTop) || 0;
    this.style.setProperty(
      "--total-top-app-bar-height",
      `${Math.max(bar.offsetHeight - safeArea, 0)}px`
    );
  };

  private _subRowSlotChanged = (
    ev: HASSDomCurrentTargetEvent<HTMLSlotElement>
  ) => {
    const slot = ev.currentTarget as HTMLSlotElement;
    this._hasSubRow = slot
      .assignedNodes({ flatten: true })
      .some(
        (node) =>
          node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())
      );
  };

  private _updateSubRowHeight = () => {
    const subRowHeight = this._hasSubRow
      ? this._subRowElement?.offsetHeight || 0
      : 0;
    this.style.setProperty("--sub-row-height", `${subRowHeight}px`);
  };

  static override styles: CSSResultGroup = [
    haStyleScrollbar,
    haTopAppBarFixedStyles,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-top-app-bar-fixed": HaTopAppBarFixed;
  }
}
