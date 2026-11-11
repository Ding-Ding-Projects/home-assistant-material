import { mdiCheck, mdiChevronDown, mdiClose } from "@mdi/js";
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
import { formatShortDateTime } from "../../common/datetime/format_date_time";
import { fireEvent } from "../../common/dom/fire_event";
import { searchMatcher } from "../../common/regex/filter";
import type { HomeAssistant } from "../../types";
import "../ha-icon-button";
import "../ha-relative-time";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import {
  limitAfterItems,
  parseBarHeight,
  placeSheet,
  shouldRestoreFocus,
  versionListSignature,
} from "./version-picker-logic";

/** One choice of the picker: a saved version of something. */
export interface VersionPickerItem {
  id: string;
  /** The message of the version. */
  title: string;
  /** The short identifier, shown in code type. */
  short?: string;
  /** Seconds since 1970. Left out for a version that has no date. */
  timestamp?: number;
  /** Shown in place of the date, for a version that has no date. */
  note?: string;
}

declare global {
  interface HASSDomEvents {
    "version-picker-changed": { value: string };
  }
}

/** Options drawn before "Show more". */
export const VERSION_PICKER_PAGE = 200;

const PANEL_WIDTH = 420;
const PANEL_MARGIN = 8;
const PANEL_MIN_HEIGHT = 260;

/** True on a touch screen, where focusing a field raises the keyboard. */
const isCoarsePointer = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Picks one version out of a list that can be long.
 *
 * A button shows the chosen version. It opens a list box with its own search
 * field (with the pattern workbench beside it), the versions in the order
 * given (newest first), each with its message, relative and exact date and
 * short identifier. The current version is marked and cannot be picked. On a
 * phone the list opens as a sheet above the bottom bar.
 *
 * Keyboard: Arrow Down from the search field enters the list; Arrow Up, Arrow
 * Down, Home and End move; Enter or Space picks; typing in the list goes to
 * the search field; Escape closes and focus returns to the button.
 *
 * @fires version-picker-changed - `{ value }`, the id of the picked version.
 */
@customElement("ha-version-picker")
export class HaVersionPicker extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Newest first. */
  @property({ attribute: false }) public items: VersionPickerItem[] = [];

  /** The id of the chosen version, or empty when nothing is chosen. */
  @property() public value = "";

  /** The id of the version being looked at: marked, and not selectable. */
  @property({ attribute: "current-id" }) public currentId = "";

  /** What the button is for, read before the chosen version. */
  @property() public label = "";

  @property({ type: Boolean, reflect: true }) public disabled = false;

  @state() private _open = false;

  @state() private _search = "";

  @state() private _limit = VERSION_PICKER_PAGE;

  @query("#panel") private _panel?: HTMLElement;

  @query("#trigger") private _trigger?: HTMLButtonElement;

  @queryAll("#list .option")
  private _optionElements!: NodeListOf<HTMLElement>;

  @query("ha-input-search") private _searchField?: HaInputSearch;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.components.version_picker.${key}` as any,
      values
    );
  }

  private _signature?: string;

  private _samples: string[] = [];

  private _samplesFor?: VersionPickerItem[];

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("items")) {
      // A new array with the same versions must not collapse "Show more".
      const signature = versionListSignature(this.items);
      this._limit = limitAfterItems(
        this._signature,
        signature,
        this._limit,
        VERSION_PICKER_PAGE
      );
      this._signature = signature;
    }
  }

  /** The titles for the pattern workbench, rebuilt only for a new list. */
  private _patternSamples(): string[] {
    if (this._samplesFor !== this.items) {
      this._samplesFor = this.items;
      this._samples = this.items.map((item) => item.title);
    }
    return this._samples;
  }

  /** Moves focus to the button, for a page that removes the control beside it. */
  public focusTrigger() {
    this._trigger?.focus();
  }

  protected render() {
    const selected = this.items.find((item) => item.id === this.value);
    const text = selected ? this._summary(selected) : this._l("choose");
    const visible = this._open ? this._visible() : [];
    const shown = visible.slice(0, this._limit);
    return html`
      <button
        id="trigger"
        type="button"
        class=${classMap({ trigger: true, empty: !selected })}
        aria-haspopup="dialog"
        aria-expanded=${this._open ? "true" : "false"}
        aria-label=${this.label ? `${this.label}: ${text}` : nothing}
        ?disabled=${this.disabled}
        @click=${this._toggle}
      >
        <span class="text">
          ${
            selected
              ? html`<span class="title"><bdi>${selected.title}</bdi></span>
                  <span class="meta">${this._meta(selected)}</span>`
              : html`<span class="title">${text}</span>`
          }
        </span>
        <ha-svg-icon .path=${mdiChevronDown}></ha-svg-icon>
      </button>
      <div
        id="panel"
        popover="auto"
        role="dialog"
        aria-label=${this.label || this._l("title")}
        tabindex="-1"
        @toggle=${this._panelToggled}
        @keydown=${this._keydown}
        @focusout=${this._focusOut}
      >
        <div class="header">
          <h2>${this.label || this._l("title")}</h2>
          <ha-icon-button
            .label=${this._l("close")}
            .path=${mdiClose}
            @click=${this._close}
          ></ha-icon-button>
        </div>
        ${
          this._open
            ? html`
                <ha-input-search
                  appearance="outlined"
                  .value=${this._search}
                  .placeholder=${this._l("search", {
                    count: this.items.length,
                  })}
                  .accessibleLabel=${this._l("search", {
                    count: this.items.length,
                  })}
                  .patternSamples=${this._patternSamples()}
                  @input=${this._searchChanged}
                ></ha-input-search>
                <p class="count" role="status">
                  ${
                    this._search
                      ? this._l("matches", {
                          count: visible.length,
                          total: this.items.length,
                        })
                      : this._l("count", { count: this.items.length })
                  }
                </p>
                <div class="scroll">
                  <div
                    id="list"
                    role="listbox"
                    aria-label=${this._l("versions")}
                  >
                    ${shown.map((item) => this._renderOption(item))}
                  </div>
                  ${
                    visible.length > shown.length
                      ? html`<button
                          type="button"
                          class="more"
                          @click=${this._showMore}
                        >
                          ${this._l("show_more", {
                            count: visible.length - shown.length,
                          })}
                        </button>`
                      : nothing
                  }
                  ${
                    visible.length
                      ? nothing
                      : html`<p class="empty">
                          ${this._l(this.items.length ? "no_match" : "none")}
                        </p>`
                  }
                </div>
                ${
                  this._search
                    ? html`<button
                        type="button"
                        class="more"
                        @click=${this._clearSearch}
                      >
                        ${this._l("clear_search")}
                      </button>`
                    : nothing
                }
              `
            : nothing
        }
      </div>
    `;
  }

  private _renderOption(item: VersionPickerItem) {
    const current = item.id === this.currentId;
    const chosen = item.id === this.value;
    return html`<div
      class=${classMap({ option: true, chosen, current })}
      role="option"
      tabindex="-1"
      aria-selected=${chosen ? "true" : "false"}
      aria-disabled=${current ? "true" : "false"}
      .itemId=${item.id}
      @click=${this._pick}
    >
      <span class="mark">
        ${chosen ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>` : nothing}
      </span>
      <span class="body">
        <span class="title"><bdi>${item.title}</bdi></span>
        <span class="meta">${this._meta(item, true)}</span>
      </span>
      ${
        current
          ? html`<span class="badge">${this._l("current")}</span>`
          : nothing
      }
    </div>`;
  }

  private _absolute(item: VersionPickerItem): string {
    return item.timestamp !== undefined
      ? formatShortDateTime(
          new Date(item.timestamp * 1000),
          this.hass.locale,
          this.hass.config
        )
      : "";
  }

  private _meta(item: VersionPickerItem, relative = false) {
    const parts: (string | TemplateResult)[] = [];
    if (item.timestamp !== undefined) {
      if (relative) {
        parts.push(
          html`<ha-relative-time
            .datetime=${new Date(item.timestamp * 1000)}
          ></ha-relative-time>`
        );
      }
      parts.push(this._absolute(item));
    } else if (item.note) {
      parts.push(item.note);
    }
    return html`${parts.map(
      (part, index) => html`${index ? " · " : nothing}${part}`
    )}${
      item.short
        ? html`${parts.length ? " · " : nothing}<code>${item.short}</code>`
        : nothing
    }`;
  }

  /** The chosen version as one line of text, for the accessible name. */
  private _summary(item: VersionPickerItem): string {
    return [item.title, this._absolute(item) || item.note, item.short]
      .filter(Boolean)
      .join(", ");
  }

  private _visible(): VersionPickerItem[] {
    const matches = searchMatcher(this._search);
    return this.items.filter((item) =>
      matches(item.title, item.short, item.id, this._absolute(item), item.note)
    );
  }

  private _options(): HTMLElement[] {
    return Array.from(this._optionElements);
  }

  private _toggle() {
    if (this._open) {
      this._close();
      return;
    }
    this._position();
    this._search = "";
    this._limit = VERSION_PICKER_PAGE;
    this._open = true;
    this._panel?.showPopover();
    this._listen(true);
    this.updateComplete.then(() => {
      if (isCoarsePointer()) {
        // Focusing the field would raise the keyboard over the list.
        this._panel?.focus({ preventScroll: true });
        return;
      }
      this._searchField?.focus();
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._listen(false);
  }

  /** Keeps the panel in place while the window or the visible area changes. */
  private _listen(on: boolean) {
    const viewport = window.visualViewport;
    if (on) {
      window.addEventListener("resize", this._reposition);
      window.addEventListener("scroll", this._reposition, {
        capture: true,
        passive: true,
      });
      viewport?.addEventListener("resize", this._reposition);
      viewport?.addEventListener("scroll", this._reposition);
    } else {
      window.removeEventListener("resize", this._reposition);
      window.removeEventListener("scroll", this._reposition, true);
      viewport?.removeEventListener("resize", this._reposition);
      viewport?.removeEventListener("scroll", this._reposition);
    }
  }

  private _reposition = () => {
    if (this._open) {
      this._position();
    }
  };

  private _focusOut(ev: FocusEvent) {
    const next = ev.relatedTarget as Node | null;
    // Focus moved to something outside the panel: the list is done.
    if (next && this._panel && !this._panel.contains(next)) {
      this._close();
    }
  }

  /** The height of the phone bar while it is shown. */
  private _barHeight(): number {
    const root = getComputedStyle(document.documentElement);
    const own = parseBarHeight(
      getComputedStyle(this).getPropertyValue("--ha-phone-bar-height"),
      0
    );
    return parseBarHeight(
      root.getPropertyValue("--ha-phone-bar-visible-height"),
      own
    );
  }

  private _close() {
    if (this._panel?.matches(":popover-open")) {
      this._panel.hidePopover();
    }
  }

  /** On a wide screen the panel sits under the button, or above it. */
  private _position() {
    const panel = this._panel;
    const rect = this._trigger?.getBoundingClientRect();
    if (!panel || !rect) {
      return;
    }
    const width = Math.min(
      Math.max(rect.width, PANEL_WIDTH),
      window.innerWidth - PANEL_MARGIN * 2
    );
    const left = Math.max(
      PANEL_MARGIN,
      Math.min(rect.left, window.innerWidth - width - PANEL_MARGIN)
    );
    const below = window.innerHeight - rect.bottom - PANEL_MARGIN * 2;
    const above = rect.top - PANEL_MARGIN * 2;
    const style = panel.style;
    const viewport = window.visualViewport;
    const sheet = placeSheet({
      layoutHeight: window.innerHeight,
      viewportHeight: viewport?.height ?? window.innerHeight,
      viewportOffsetTop: viewport?.offsetTop ?? 0,
      barHeight: this._barHeight(),
      margin: PANEL_MARGIN,
    });
    style.setProperty("--version-picker-sheet-lift", `${sheet.overlap}px`);
    style.setProperty("--version-picker-sheet-max", `${sheet.maxHeight}px`);
    style.setProperty("--version-picker-left", `${left}px`);
    style.setProperty("--version-picker-width", `${width}px`);
    if (below >= PANEL_MIN_HEIGHT || below >= above) {
      style.setProperty("--version-picker-top", `${rect.bottom + 4}px`);
      style.setProperty("--version-picker-bottom", "auto");
      style.setProperty("--version-picker-max", `${Math.max(below, 160)}px`);
    } else {
      style.setProperty("--version-picker-top", "auto");
      style.setProperty(
        "--version-picker-bottom",
        `${window.innerHeight - rect.top + 4}px`
      );
      style.setProperty("--version-picker-max", `${Math.max(above, 160)}px`);
    }
  }

  private _panelToggled(ev: Event) {
    if (ev.target !== this._panel) {
      return;
    }
    const open = this._panel!.matches(":popover-open");
    if (!open && this._open) {
      this._open = false;
      this._listen(false);
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      const insidePanel =
        !!active && !!this._panel && this._panel.contains(active);
      const onPage = !active || active === document.body;
      if (shouldRestoreFocus(insidePanel, onPage)) {
        this._trigger?.focus();
      }
    }
  }

  private _searchChanged(ev: Event) {
    this._search = (ev.target as HaInputSearch).value ?? "";
    this._limit = VERSION_PICKER_PAGE;
  }

  private _clearSearch() {
    this._search = "";
    this.updateComplete.then(() => this._searchField?.focus());
  }

  private _showMore() {
    this._limit += VERSION_PICKER_PAGE;
  }

  private _pick(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { itemId: string }).itemId;
    this._choose(id);
  }

  private _choose(id: string) {
    if (id === this.currentId) {
      return;
    }
    this.value = id;
    fireEvent(this, "version-picker-changed", { value: id });
    this._close();
  }

  private _focusOption(options: HTMLElement[], index: number) {
    const option = options[Math.max(0, Math.min(index, options.length - 1))];
    option?.focus();
    option?.scrollIntoView({ block: "nearest" });
  }

  private _keydown(ev: KeyboardEvent) {
    const target = ev.target as HTMLElement;
    const options = this._options();
    if (target.classList?.contains("option")) {
      const index = options.indexOf(target);
      switch (ev.key) {
        case "ArrowDown":
          ev.preventDefault();
          this._focusOption(options, index + 1);
          return;
        case "ArrowUp":
          ev.preventDefault();
          if (index <= 0) {
            this._searchField?.focus();
          } else {
            this._focusOption(options, index - 1);
          }
          return;
        case "Home":
          ev.preventDefault();
          this._focusOption(options, 0);
          return;
        case "End":
          ev.preventDefault();
          this._focusOption(options, options.length - 1);
          return;
        case "Enter":
        case " ":
          ev.preventDefault();
          this._choose((target as HTMLElement & { itemId: string }).itemId);
          return;
        default:
          if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            // Typing in the list goes on in the search field.
            ev.preventDefault();
            this._search += ev.key;
            this.updateComplete.then(() => this._searchField?.focus());
          }
          return;
      }
    }
    if (target === this._searchField) {
      if (ev.key === "ArrowDown" && options.length) {
        ev.preventDefault();
        this._focusOption(options, 0);
      } else if (
        ev.key === "Enter" &&
        this._search &&
        // Keys of the buttons inside the field arrive here retargeted to the
        // field: only Enter typed in the text input picks a version.
        ev.composedPath()[0] instanceof HTMLInputElement
      ) {
        const first = this._visible().find(
          (item) => item.id !== this.currentId
        );
        if (first) {
          ev.preventDefault();
          this._choose(first.id);
        }
      }
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: inline-block;
      max-width: 100%;
      min-width: 0;
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
      text-align: start;
    }
    button:focus-visible,
    .option:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .trigger {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-color);
      background: var(--card-background-color);
    }
    .trigger:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .trigger.empty .title {
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-normal);
    }
    .text,
    .body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .meta {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    code {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    #panel {
      margin: 0;
      padding: var(--ha-space-3);
      box-sizing: border-box;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-box-shadow-l, 0 8px 24px rgba(0, 0, 0, 0.3));
      flex-direction: column;
      gap: var(--ha-space-2);
      overflow: hidden;
    }
    #panel:popover-open {
      display: flex;
    }
    @media (min-width: 701px) {
      #panel {
        position: fixed;
        inset: auto;
        left: var(--version-picker-left, 0);
        top: var(--version-picker-top, auto);
        bottom: var(--version-picker-bottom, auto);
        width: var(--version-picker-width, 420px);
        max-height: var(--version-picker-max, 60vh);
      }
    }
    /* On a phone the list is a sheet above the bottom bar. */
    @media (max-width: 700px) {
      #panel {
        position: fixed;
        top: auto;
        inset-inline: var(--ha-space-3);
        /* Above the bar while it is shown, and above the keyboard. */
        bottom: calc(
          var(--version-picker-sheet-lift, 0px) +
            var(
              --ha-phone-bar-visible-height,
              var(--ha-phone-bar-height, 0px)
            ) +
            var(--ha-space-2) +
            var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
        );
        width: auto;
        max-height: var(--version-picker-sheet-max, calc(100dvh - 140px));
      }
    }
    .header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    /* The title bar with the close button is for the phone sheet. */
    @media (min-width: 701px) {
      .header {
        display: none;
      }
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .count {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .scroll {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .scroll > * {
      flex-shrink: 0;
    }
    #panel:focus {
      outline: none;
    }
    #list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .option .title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
    }
    .option {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      cursor: pointer;
      box-sizing: border-box;
    }
    .option:hover {
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    .option.chosen {
      background: var(--ha-color-fill-primary-normal-resting);
    }
    .option.current {
      cursor: default;
      opacity: 0.7;
    }
    .mark {
      flex: none;
      width: 24px;
      display: inline-flex;
    }
    .badge {
      flex: none;
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-primary-normal-resting);
      font-size: var(--ha-font-size-xs);
    }
    .more {
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .empty {
      margin: 0;
      padding: var(--ha-space-4);
      text-align: center;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-version-picker": HaVersionPicker;
  }
}
