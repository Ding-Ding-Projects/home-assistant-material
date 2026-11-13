import type { ContextType } from "@lit/context";
import {
  mdiChevronDown,
  mdiChevronUp,
  mdiExportVariant,
  mdiFormatPaint,
  mdiHelpCircleOutline,
  mdiHistory,
  mdiLock,
  mdiLockOpenVariantOutline,
  mdiMagnify,
  mdiStop,
  mdiVolumeHigh,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  canReadAloud,
  collectReadableText,
  readAloud,
  stopReadingAloud,
} from "../../common/accessibility/accessibility-tools";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import { showToast } from "../../util/toast";
import {
  isLocked,
  pageLockKey,
  readLocks,
  subscribeLocks,
  UNLOCK_HOLD_MS,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import { FIND_LIMIT, PageFinder } from "../../common/page/find-in-page";
import { internationalizationContext } from "../../data/context";
import "../ha-icon-button";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";

export type PageTool = "tools" | "export" | "history" | "lock" | "help";

/** Every entry the tools panel can list for a page. */
export type PageToolEntry =
  "find" | "appearance" | "readAloud" | "history" | "export" | "lock" | "help";

export interface PageToolRequest {
  tool: PageTool;
  /** The page the tool works on. */
  root: HTMLElement;
  title: string;
  /**
   * The entries this page offers. A page whose header leaves a tool out in some
   * mode (a dashboard in edit mode has no lock) lists only the ones it has.
   * Left out, the panel offers every entry.
   */
  available?: readonly PageToolEntry[];
}

declare global {
  interface HASSDomEvents {
    /** Opens a page tool in the tools panel. */
    "hass-page-tool": PageToolRequest;
  }
}

/** Parts of a page that are its tools, not its content. */
export const isPageChrome = (element: Element): boolean =>
  element.localName === "ha-page-tools" ||
  element.localName === "ha-page-footer" ||
  element.localName === "ha-page-tool-panel";

/**
 * The tools every page has in its header: search this page, edit
 * appearance, read aloud, history, export, lock and help.
 *
 * It works on the page layout it is placed in. With `compact` it is one
 * button that opens the tools panel.
 */
@customElement("ha-page-tools")
export class HaPageTools extends LitElement {
  @property({ type: Boolean, reflect: true }) public compact = false;

  @property({ attribute: "page-title" }) public pageTitle?: string;

  /** Leaves out Search this page, for a page with its own search of the page. */
  @property({ type: Boolean, attribute: "no-find" }) public noFind = false;

  /**
   * Lays the tools out as part of a floating tool pill. The host then takes no
   * box of its own, so its buttons join the pill the page layout draws around
   * it and are ordered with the page's own buttons by CSS `order`: Search this
   * page behind one icon, appearance, history, export and lock, a divider, then
   * help. Read aloud sits beside the search field. Ignored when `compact`.
   */
  @property({ type: Boolean, reflect: true }) public pill = false;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _query = "";

  @state() private _total = 0;

  @state() private _position = 0;

  @state() private _invalid = false;

  @state() private _reading = false;

  @state() private _locked = false;

  @state() private _holding = false;

  @state() private _hint = false;

  @state() private _findOpen = false;

  @query(".find-card ha-input-search")
  private _pillFindInput?: HaInputSearch;

  private _finder = new PageFinder();

  private _findTimer?: number;

  private _holdTimer?: number;

  private _hintTimer?: number;

  private _unsubscribeLocks?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribeLocks = subscribeLocks(this._checkLock);
    window.addEventListener("location-changed", this._pageChanged);
    this._checkLock();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeLocks?.();
    this._unsubscribeLocks = undefined;
    window.removeEventListener("location-changed", this._pageChanged);
    window.clearTimeout(this._findTimer);
    window.clearTimeout(this._holdTimer);
    window.clearTimeout(this._hintTimer);
    if (this._query) {
      this._finder.clear();
    }
    if (this._reading) {
      stopReadingAloud();
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("compact") && this.compact && this._query) {
      this._clearFind();
    }
    if (
      (changed.has("compact") || changed.has("pill")) &&
      (this.compact || !this.pill)
    ) {
      this._findOpen = false;
    }
  }

  /** The page layout these tools belong to. */
  private get _page(): HTMLElement {
    const root = this.getRootNode();
    return root instanceof ShadowRoot ? (root.host as HTMLElement) : this;
  }

  private get _title(): string {
    return this.pageTitle || document.title;
  }

  private _checkLock = (): void => {
    this._locked = isLocked(readLocks(), pageLockKey(window.location.pathname));
  };

  private _pageChanged = (): void => {
    this._checkLock();
    if (this._query) {
      this._clearFind();
    }
    if (this._reading) {
      stopReadingAloud();
      this._reading = false;
    }
  };

  protected render(): TemplateResult | typeof nothing {
    if (!this._i18n) {
      return nothing;
    }
    const localize = this._i18n.localize;
    if (this.compact) {
      return html`
        <ha-icon-button
          class=${classMap({ on: this._locked })}
          .label=${localize("ui.page_tools.label")}
          .path=${this._locked ? mdiLock : mdiMagnify}
          @click=${this._openTools}
        ></ha-icon-button>
      `;
    }
    return html`
      ${
        this.noFind
          ? nothing
          : this.pill
            ? this._renderPillFind()
            : this._renderFind()
      }
      <ha-icon-button
        class="tool"
        .label=${localize("ui.page_tools.appearance")}
        .path=${mdiFormatPaint}
        @click=${this._editAppearance}
      ></ha-icon-button>
      ${this.pill && !this.noFind ? nothing : this._renderReadAloud()}
      <ha-icon-button
        class="tool"
        .label=${localize("ui.page_tools.history")}
        .path=${mdiHistory}
        data-tool="history"
        @click=${this._openTool}
      ></ha-icon-button>
      <ha-icon-button
        class="tool"
        .label=${localize("ui.page_tools.export")}
        .path=${mdiExportVariant}
        data-tool="export"
        @click=${this._openTool}
      ></ha-icon-button>
      <span class="lock tool">
        <ha-icon-button
          class=${classMap({ on: this._locked, holding: this._holding })}
          .label=${localize(
            this._locked ? "ui.page_tools.unlock_hold" : "ui.page_tools.lock"
          )}
          .path=${this._locked ? mdiLock : mdiLockOpenVariantOutline}
          @click=${this._lockClick}
          @pointerdown=${this._holdStart}
          @pointerup=${this._holdEnd}
          @pointerleave=${this._holdEnd}
          @pointercancel=${this._holdEnd}
          @keydown=${this._holdKeydown}
          @keyup=${this._holdKeyup}
          @blur=${this._holdEnd}
        ></ha-icon-button>
        ${
          this._hint
            ? html`<span class="hint" role="status"
                >${localize("ui.page_tools.unlock_hint")}</span
              >`
            : nothing
        }
      </span>
      ${
        this.pill
          ? html`<span class="divider" role="separator"></span>`
          : nothing
      }
      <ha-icon-button
        class="help"
        .label=${localize("ui.page_tools.help")}
        .path=${mdiHelpCircleOutline}
        data-tool="help"
        @click=${this._openTool}
      ></ha-icon-button>
    `;
  }

  /**
   * In the tool pill, Search this page is one icon that opens the field and its
   * match controls in a small card under the pill. The card also holds Read
   * aloud, so every tool stays one click away.
   */
  private _renderPillFind(): TemplateResult {
    const localize = this._i18n.localize;
    return html`
      <span class="find-wrap tool">
        <ha-icon-button
          class=${classMap({ on: this._findOpen || !!this._query })}
          .label=${localize("ui.page_tools.find")}
          .path=${mdiMagnify}
          aria-expanded=${this._findOpen ? "true" : "false"}
          @click=${this._toggleFind}
        ></ha-icon-button>
        ${
          this._findOpen
            ? html`<div class="find-card" @keydown=${this._findCardKeydown}>
                ${this._renderFind()}${this._renderReadAloud()}
              </div>`
            : nothing
        }
      </span>
    `;
  }

  private _toggleFind(): void {
    this._findOpen = !this._findOpen;
    if (this._findOpen) {
      this.updateComplete.then(() => {
        this._pillFindInput?.focus();
      });
    }
  }

  private _findCardKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape" && !this._query) {
      ev.stopPropagation();
      this._findOpen = false;
    }
  }

  private _renderReadAloud(): TemplateResult | typeof nothing {
    if (!canReadAloud()) {
      return nothing;
    }
    const localize = this._i18n.localize;
    return html`<ha-icon-button
      class=${classMap({ on: this._reading, tool: true })}
      .label=${localize(
        this._reading
          ? "ui.page_tools.stop_reading"
          : "ui.page_tools.read_aloud"
      )}
      .path=${this._reading ? mdiStop : mdiVolumeHigh}
      @click=${this._toggleReading}
    ></ha-icon-button>`;
  }

  private _renderFind(): TemplateResult {
    const localize = this._i18n.localize;
    return html`
      <div class="find">
        <ha-input-search
          appearance="outlined"
          .placeholder=${localize("ui.page_tools.find")}
          .accessibleLabel=${localize("ui.page_tools.find")}
          .value=${this._query}
          @input=${this._findInput}
          @keydown=${this._findKeydown}
        ></ha-input-search>
        ${
          this._query.trim()
            ? html`
                <span
                  class=${classMap({ count: true, bad: this._invalid })}
                  role="status"
                  >${this._countText()}</span
                >
                <ha-icon-button
                  class="step"
                  .label=${localize("ui.page_tools.find_previous")}
                  .path=${mdiChevronUp}
                  .disabled=${!this._total}
                  @click=${this._previous}
                ></ha-icon-button>
                <ha-icon-button
                  class="step"
                  .label=${localize("ui.page_tools.find_next")}
                  .path=${mdiChevronDown}
                  .disabled=${!this._total}
                  @click=${this._next}
                ></ha-icon-button>
              `
            : nothing
        }
      </div>
    `;
  }

  private _countText(): string {
    const localize = this._i18n.localize;
    if (this._invalid) {
      return localize("ui.page_tools.find_invalid");
    }
    if (!this._total) {
      return localize("ui.page_tools.find_none");
    }
    return localize(
      this._total >= FIND_LIMIT
        ? "ui.page_tools.find_count_limit"
        : "ui.page_tools.find_count",
      { current: this._position + 1, total: this._total }
    );
  }

  private _findInput(ev: Event): void {
    this._query = (ev.target as HaInputSearch).value ?? "";
    window.clearTimeout(this._findTimer);
    this._findTimer = window.setTimeout(() => this._find(), 150);
  }

  private _find(): void {
    if (!this._query.trim()) {
      this._clearFind();
      return;
    }
    this._finder.search(this._page, this._query, isPageChrome);
    this._syncFind();
  }

  private _syncFind(): void {
    this._total = this._finder.ranges.length;
    this._position = this._finder.current;
    this._invalid = this._finder.invalid;
  }

  private _clearFind(): void {
    window.clearTimeout(this._findTimer);
    this._finder.clear();
    this._query = "";
    this._total = 0;
    this._position = 0;
    this._invalid = false;
  }

  private _findKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      window.clearTimeout(this._findTimer);
      if (this._finder.query !== this._query) {
        this._find();
        return;
      }
      this._finder.step(ev.shiftKey ? -1 : 1);
      this._syncFind();
    } else if (ev.key === "Escape" && this._query) {
      ev.stopPropagation();
      this._clearFind();
    }
  }

  private _next(): void {
    this._finder.step(1);
    this._syncFind();
  }

  private _previous(): void {
    this._finder.step(-1);
    this._syncFind();
  }

  private _editAppearance(): void {
    fireEvent(this, "hass-pick-appearance");
  }

  private _toggleReading(): void {
    if (this._reading) {
      stopReadingAloud();
      this._reading = false;
      return;
    }
    const chunks = collectReadableText(this._page);
    if (!chunks.length) {
      return;
    }
    this._reading = true;
    const started = readAloud(
      chunks,
      this._i18n.language,
      () => {
        this._reading = false;
      },
      () => {
        showToast(this, {
          message: this._i18n.localize("ui.page_tools.no_device_voice"),
        });
      }
    );
    if (!started) {
      showToast(this, {
        message: this._i18n.localize("ui.page_tools.no_device_voice"),
      });
    }
  }

  private _openTools(): void {
    this._request("tools");
  }

  private _openTool(ev: Event): void {
    this._request((ev.currentTarget as HTMLElement).dataset.tool as PageTool);
  }

  private _request(tool: PageTool): void {
    fireEvent(this, "hass-page-tool", {
      tool,
      root: this._page,
      title: this._title,
    });
  }

  private _lockClick(): void {
    if (this._locked) {
      // Unlocking takes a hold, or the PIN when one is set.
      if (readLocks().pin) {
        this._request("lock");
        return;
      }
      this._hint = true;
      window.clearTimeout(this._hintTimer);
      this._hintTimer = window.setTimeout(() => {
        this._hint = false;
      }, 4000);
      return;
    }
    if (this._justUnlocked) {
      this._justUnlocked = false;
      return;
    }
    writeLocks(
      withLock(readLocks(), pageLockKey(window.location.pathname), true)
    );
  }

  private _justUnlocked = false;

  private _holdStart(): void {
    if (!this._locked || readLocks().pin || this._holding) {
      return;
    }
    this._holding = true;
    this._holdTimer = window.setTimeout(() => {
      this._holding = false;
      this._hint = false;
      // The click that ends this hold must not lock the page again.
      this._justUnlocked = true;
      window.setTimeout(() => {
        this._justUnlocked = false;
      }, 600);
      writeLocks(
        withLock(readLocks(), pageLockKey(window.location.pathname), false)
      );
    }, UNLOCK_HOLD_MS);
  }

  private _holdEnd(): void {
    if (!this._holding) {
      return;
    }
    this._holding = false;
    window.clearTimeout(this._holdTimer);
  }

  private _holdKeydown(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      this._holdStart();
    }
  }

  private _holdKeyup(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      this._holdEnd();
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      color: var(--sidebar-icon-color);
      min-width: 0;
    }
    /* In a tool pill the host has no box: its buttons are items of the pill
       and take their place from the order values below. */
    :host([pill]:not([compact])) {
      display: contents;
    }
    :host([pill]:not([compact])) .tool {
      order: 1;
    }
    :host([pill]:not([compact])) .divider {
      order: 2;
      align-self: center;
      width: 1px;
      height: 24px;
      margin-inline: var(--ha-space-1);
      background: var(--divider-color);
    }
    :host([pill]:not([compact])) .help {
      order: 3;
    }
    .find-wrap {
      position: relative;
      display: inline-flex;
    }
    .find-card {
      position: absolute;
      inset-block-start: calc(100% + var(--ha-space-3));
      inset-inline-end: 0;
      z-index: 6;
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-2xl, 20px);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-shadow-overlay, var(--ha-box-shadow-l));
      max-width: calc(100vw - var(--ha-space-8));
    }
    .find {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-width: 0;
    }
    ha-input-search {
      width: clamp(180px, 22vw, 300px);
      --ha-input-search-height: var(--ha-space-10);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .count {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .count.bad {
      color: var(--error-color);
    }
    ha-icon-button {
      --ha-icon-button-size: 40px;
      border-radius: var(--ha-border-radius-pill);
    }
    ha-icon-button.step {
      --ha-icon-button-size: 32px;
    }
    @media (pointer: coarse) {
      ha-icon-button,
      ha-icon-button.step {
        --ha-icon-button-size: 44px;
      }
    }
    ha-icon-button.on {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .lock {
      position: relative;
      display: inline-flex;
    }
    ha-icon-button.holding {
      animation: hold 1500ms linear forwards;
    }
    @keyframes hold {
      from {
        box-shadow: 0 0 0 0 var(--primary-color);
      }
      to {
        box-shadow: 0 0 0 6px var(--primary-color);
        background: var(--card-background-color);
        color: var(--primary-color);
      }
    }
    .hint {
      position: absolute;
      top: calc(100% + var(--ha-space-1));
      inset-inline-end: 0;
      z-index: 5;
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-md);
      background: var(--primary-text-color);
      color: var(--card-background-color);
      font-size: var(--ha-font-size-s);
      white-space: nowrap;
    }
    @media (prefers-reduced-motion: reduce) {
      ha-icon-button.holding {
        animation: none;
        outline: 3px solid var(--primary-color);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-tools": HaPageTools;
  }
}
