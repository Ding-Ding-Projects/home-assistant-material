import type { ContextType } from "@lit/context";
import { mdiChevronDown } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../common/decorators/consume";
import {
  safeGetStored,
  safeSetStored,
} from "../../common/preferences/safe-storage";
import { internationalizationContext } from "../../data/context";
import "../ha-svg-icon";
import type { CollapsibleStatistic } from "./collapsible-statistics-logic";
import {
  formatStatisticValue,
  limitStatistics,
  parseStoredCollapsed,
  summaryLine,
  toStoredState,
} from "./collapsible-statistics-logic";

/**
 * A strip of up to five labelled numbers, such as the total, the number shown
 * and the number selected, that can be folded to one summary line.
 *
 * - The page supplies the numbers through `statistics`; more than five are
 *   ignored.
 * - The toggle is a real button with `aria-expanded` and works with Enter and
 *   Space. Folded, the strip shows one line with every label and number.
 * - The choice is kept in this browser for each `storage-key`. A stored value
 *   that does not make sense leaves the strip expanded. Without a key the
 *   choice lasts until the page is left.
 * - The fold animates only when the person allows motion.
 * - From 320 px the numbers sit in two columns; wider, they fill the row.
 */
@customElement("ha-collapsible-statistics")
export class HaCollapsibleStatistics extends LitElement {
  @property({ attribute: false }) public statistics: CollapsibleStatistic[] =
    [];

  /** Where the choice is remembered. Empty: not remembered. */
  @property({ attribute: "storage-key" }) public storageKey = "";

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _collapsed = false;

  private _loadedKey?: string;

  protected willUpdate(changedProperties: PropertyValues) {
    if (
      changedProperties.has("storageKey") &&
      this.storageKey &&
      this.storageKey !== this._loadedKey
    ) {
      this._loadedKey = this.storageKey;
      this._collapsed = parseStoredCollapsed(
        safeGetStored<unknown>(this.storageKey)
      );
    }
  }

  private _toggle() {
    this._collapsed = !this._collapsed;
    if (this.storageKey) {
      safeSetStored(this.storageKey, toStoredState(this._collapsed));
    }
  }

  protected render() {
    const items = limitStatistics(this.statistics);
    if (items.length === 0) {
      return nothing;
    }
    const localize = this._i18n?.localize;
    const language = this._i18n?.language;
    const label = localize
      ? localize("ui.components.collapsible-statistics.label")
      : "Statistics";
    const action = localize
      ? localize(
          this._collapsed
            ? "ui.components.collapsible-statistics.show"
            : "ui.components.collapsible-statistics.hide"
        )
      : "";

    return html`
      <div
        class=${classMap({ strip: true, collapsed: this._collapsed })}
        role="group"
        aria-label=${label}
      >
        ${
          this._collapsed
            ? html`<span class="summary" id="statistics-body"
                >${summaryLine(items, language)}</span
              >`
            : html`<div class="body" id="statistics-body">
                <dl class="items">
                  ${items.map(
                    (item) => html`
                      <div class="item">
                        <dt>${item.label}</dt>
                        <dd>${formatStatisticValue(item.value, language)}</dd>
                      </div>
                    `
                  )}
                </dl>
              </div>`
        }
        <button
          type="button"
          class="toggle"
          aria-expanded=${this._collapsed ? "false" : "true"}
          aria-controls="statistics-body"
          aria-label=${`${label}: ${action}`}
          title=${action}
          @click=${this._toggle}
        >
          <ha-svg-icon class="chevron" .path=${mdiChevronDown}></ha-svg-icon>
        </button>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    /* One compact strip: each number is a small label over a large numeral,
       with the collapse control at the end. No title row. */
    .strip {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      box-sizing: border-box;
      margin-block: var(--ha-space-1, 4px);
      padding: var(--ha-space-1, 4px) var(--ha-space-1, 4px)
        var(--ha-space-1, 4px) var(--ha-space-4, 16px);
      border-radius: 20px;
      background: var(
        --md-sys-color-surface-container,
        var(--secondary-background-color)
      );
      color: var(--primary-text-color);
    }
    .toggle {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--secondary-text-color);
      font: inherit;
      cursor: pointer;
    }
    .toggle:hover {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .summary {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--secondary-text-color);
    }
    .chevron {
      --mdc-icon-size: 20px;
    }
    .strip:not(.collapsed) .chevron {
      transform: rotate(180deg);
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .items {
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1, 4px) var(--ha-space-8, 32px);
    }
    .item {
      min-width: 0;
    }
    dt {
      overflow-wrap: anywhere;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs, 11px);
      line-height: 1.2;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: 700;
      line-height: 1.15;
    }
    @media (max-width: 599px) {
      .items {
        gap: var(--ha-space-1, 4px) var(--ha-space-5, 20px);
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .chevron {
        transition: transform 200ms ease;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-collapsible-statistics": HaCollapsibleStatistics;
  }
}
