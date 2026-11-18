import { mdiChevronDown, mdiChevronUp, mdiClose, mdiMagnify } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../common/dom/fire_event";
import {
  currentLanguageMode,
  modeText,
} from "../common/language-mode/language-mode";
import type { LocalizeFunc } from "../common/translations/localize";
import "./ha-icon-button";
import "./input/ha-input-search";
import type { HaInputSearch } from "./input/ha-input-search";

/**
 * The short "n of m" text of a page search. In Cantonese mode it is the
 * Cantonese sentence; in English and both-language mode it stays the short
 * English text, because it has to fit inside the field.
 */
export const searchCountText = (
  localize: LocalizeFunc,
  values: { current: number; total: number }
): string =>
  currentLanguageMode() === "cantonese"
    ? modeText(localize, "ui.components.top_bar_search.count", values)
    : localize("ui.components.top_bar_search.count", values);

/** The "found in" line under the field, with the same language rule as the count. */
export const searchWhereText = (
  localize: LocalizeFunc,
  places: string
): string =>
  currentLanguageMode() === "cantonese"
    ? modeText(localize, "ui.components.top_bar_search.found_in", { places })
    : localize("ui.components.top_bar_search.found_in", { places });

export interface TopBarSearchInputDetail {
  value: string;
}

export interface TopBarSearchStepDetail {
  /** 1 goes to the next match, -1 to the previous one. */
  direction: 1 | -1;
}

declare global {
  interface HASSDomEvents {
    "top-bar-search-open": undefined;
    "top-bar-search-close": undefined;
    "top-bar-search-input": TopBarSearchInputDetail;
    "top-bar-search-step": TopBarSearchStepDetail;
  }
}

/**
 * The search of a page, drawn in the page's top bar. At rest it is one 44 px
 * button. Open, it is a 40 px field with the pattern builder, a count and a
 * close button. The page owns the text and the matching; this element only
 * draws the control and reports what the person did.
 *
 * @fires top-bar-search-open - The button was pressed.
 * @fires top-bar-search-close - Close was pressed or Escape was typed.
 * @fires top-bar-search-input - The text or pattern changed. `detail.value`.
 * @fires top-bar-search-step - Enter or Shift+Enter. `detail.direction`.
 */
@customElement("ha-top-bar-search")
export class HaTopBarSearch extends LitElement {
  @property({ attribute: false }) public localize!: LocalizeFunc;

  /** What the field is called, for example "Search settings". */
  @property() public label?: string;

  @property() public value = "";

  @property({ type: Boolean, reflect: true }) public open = false;

  /** A wide window opens the field at a fixed 360 px. */
  @property({ type: Boolean, reflect: true }) public wide = false;

  /** Short count shown inside the open field, for example "2 of 3". */
  @property({ attribute: "count-text" }) public countText?: string;

  /** Items of the list the field filters, offered as test text. */
  @property({ attribute: false }) public patternSamples?: string[];

  @query("ha-input-search") private _input?: HaInputSearch;

  protected updated(changed: PropertyValues): void {
    if (changed.has("open") && this.open) {
      // The keyboard comes up with the field; the page stays where it is.
      const input = this._input;
      // The inner field exists only once the input has rendered
      input?.updateComplete.then(() =>
        requestAnimationFrame(() => input.focus({ preventScroll: true }))
      );
    }
  }

  protected render(): TemplateResult {
    const label =
      this.label ||
      modeText(this.localize, "ui.components.top_bar_search.open");
    if (!this.open) {
      return html`<ha-icon-button
        class=${classMap({ "open-button": true, "has-value": !!this.value })}
        .label=${label}
        .path=${mdiMagnify}
        aria-keyshortcuts="/"
        @click=${this._open}
      ></ha-icon-button>`;
    }
    return html`
      <div class="open-search" @keydown=${this._keydown}>
        <ha-input-search
          appearance="outlined"
          .value=${this.value}
          .placeholder=${label}
          .accessibleLabel=${label}
          .patternSamples=${this.patternSamples}
          @input=${this._inputChanged}
        >
          ${
            this.value && this.countText
              ? html`<span class="count" slot="end" role="status"
                  >${this.countText}</span
                >`
              : nothing
          }
        </ha-input-search>
        <ha-icon-button
          class="close"
          .label=${modeText(this.localize, "ui.components.top_bar_search.close")}
          .path=${mdiClose}
          @click=${this._close}
        ></ha-icon-button>
      </div>
    `;
  }

  private _open(): void {
    fireEvent(this, "top-bar-search-open");
  }

  private _close(): void {
    fireEvent(this, "top-bar-search-close");
  }

  private _inputChanged(ev: Event): void {
    ev.stopPropagation();
    fireEvent(this, "top-bar-search-input", {
      value: (ev.target as HaInputSearch).value ?? "",
    });
  }

  private _keydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    } else if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      fireEvent(this, "top-bar-search-step", {
        direction: ev.shiftKey ? -1 : 1,
      });
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      align-items: center;
      flex: none;
    }
    :host([open]) {
      flex: 1 1 auto;
      min-width: 0;
    }
    .open-button {
      --ha-icon-button-size: 44px;
      color: var(--sidebar-icon-color);
      border-radius: var(--ha-border-radius-pill);
    }
    .open-button.has-value {
      color: var(--primary-color);
      background: var(--ha-color-fill-primary-quiet-resting);
    }
    .open-search {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      flex: 1;
      min-width: 0;
    }
    ha-input-search {
      flex: 1;
      min-width: 0;
      --ha-input-search-height: 40px;
      --ha-input-search-border-radius: 20px;
    }
    /* A wide window opens the field at a fixed 360 px beside the close button. */
    :host([open][wide]) {
      flex: none;
      width: calc(360px + 44px + var(--ha-space-1));
    }
    :host([wide]) .open-search {
      flex: none;
      width: 100%;
    }
    :host([wide]) ha-input-search {
      flex: none;
      width: 360px;
      max-width: 360px;
    }
    .count {
      font-family: var(--ha-font-family-code, monospace);
      font-size: var(--ha-font-size-xs, 11px);
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .close {
      --ha-icon-button-size: 44px;
      color: var(--sidebar-icon-color);
      flex: none;
    }
  `;
}

/**
 * The strip under the bar while a page search is open: where the matches are,
 * and previous and next. Only pages that scroll to a match show it.
 *
 * @fires top-bar-search-step - Previous or next was pressed.
 */
@customElement("ha-top-bar-search-steps")
export class HaTopBarSearchSteps extends LitElement {
  @property({ attribute: false }) public localize!: LocalizeFunc;

  /** A line saying where the matches are, for example "Found on: Sound 1". */
  @property() public where?: string;

  @property({ type: Number }) public total = 0;

  protected render(): TemplateResult {
    const none = this.total < 1;
    return html`
      <span class="where" role="status"
        >${
          none
            ? modeText(this.localize, "ui.components.top_bar_search.no_matches")
            : this.where
        }</span
      >
      <ha-icon-button
        .label=${modeText(this.localize, "ui.components.top_bar_search.previous")}
        .path=${mdiChevronUp}
        ?disabled=${none}
        @click=${this._previous}
      ></ha-icon-button>
      <ha-icon-button
        .label=${modeText(this.localize, "ui.components.top_bar_search.next")}
        .path=${mdiChevronDown}
        ?disabled=${none}
        @click=${this._next}
      ></ha-icon-button>
    `;
  }

  private _previous(): void {
    fireEvent(this, "top-bar-search-step", { direction: -1 });
  }

  private _next(): void {
    fireEvent(this, "top-bar-search-step", { direction: 1 });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: var(--ha-space-1) var(--ha-space-3);
      box-sizing: border-box;
      border-bottom: 1px solid var(--divider-color);
    }
    .where {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow-wrap: anywhere;
    }
    ha-icon-button {
      --ha-icon-button-size: 44px;
      color: var(--primary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-top-bar-search": HaTopBarSearch;
    "ha-top-bar-search-steps": HaTopBarSearchSteps;
  }
}
