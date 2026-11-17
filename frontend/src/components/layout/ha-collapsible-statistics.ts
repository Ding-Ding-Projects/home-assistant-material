import type { ContextType } from "@lit/context";
import { mdiChevronDown } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
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
  nextStatisticSelection,
  parseStoredCollapsed,
  showingCounts,
  STATISTIC_CLEAR_KEY,
  statisticTone,
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
 * - The numbers sit in a wrapping grid, each tile at least 150 px wide.
 * - An item with a `filterKey` is a button with `aria-pressed`. Pressing it
 *   fires `statistic-selected` with its key; pressing the held one again fires
 *   it with no key. The page owns the filter and passes the held key back as
 *   `activeKey`, which also shows a "Showing N of M" line with a clear action.
 */
@customElement("ha-collapsible-statistics")
export class HaCollapsibleStatistics extends LitElement {
  @property({ attribute: false }) public statistics: CollapsibleStatistic[] =
    [];

  /** Where the choice is remembered. Empty: not remembered. */
  @property({ attribute: "storage-key" }) public storageKey = "";

  /** The filter key of the item the page is filtering by, if any. */
  @property({ attribute: "active-key" }) public activeKey?: string;

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

  private _press(ev: Event) {
    const key = (ev.currentTarget as HTMLElement).dataset.filterKey;
    if (!key) {
      return;
    }
    fireEvent(this, "statistic-selected", {
      key: nextStatisticSelection(this.activeKey, key),
    });
  }

  private _clear() {
    fireEvent(this, "statistic-selected", { key: undefined });
  }

  private _renderItem(item: CollapsibleStatistic, language?: string) {
    const content = html`
      <span class="label">${item.label}</span>
      <span class="value">${formatStatisticValue(item.value, language)}</span>
    `;
    const classes = {
      item: true,
      [`tone-${statisticTone(item.id)}`]: true,
    };
    if (!item.filterKey) {
      return html`<div class=${classMap(classes)}>${content}</div>`;
    }
    const clears = item.filterKey === STATISTIC_CLEAR_KEY;
    const pressed = !clears && item.filterKey === this.activeKey;
    return html`<button
      type="button"
      class=${classMap({ ...classes, action: true, pressed })}
      data-filter-key=${item.filterKey}
      aria-pressed=${ifDefined(clears ? undefined : String(pressed))}
      @click=${this._press}
    >
      ${content}
    </button>`;
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

    const counts = showingCounts(items, this.activeKey);

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
                <div class="items">
                  ${items.map((item) => this._renderItem(item, language))}
                </div>
                ${
                  counts
                    ? html`<div class="status" role="status">
                        <span
                          >${
                            localize
                              ? localize(
                                  "ui.components.collapsible-statistics.showing",
                                  {
                                    shown: formatStatisticValue(
                                      counts.shown,
                                      language
                                    ),
                                    total: formatStatisticValue(
                                      counts.total,
                                      language
                                    ),
                                  }
                                )
                              : `Showing ${counts.shown} of ${counts.total}`
                          }</span
                        >
                        <button
                          type="button"
                          class="clear"
                          @click=${this._clear}
                        >
                          ${
                            localize
                              ? localize(
                                  "ui.components.collapsible-statistics.clear"
                                )
                              : "Clear"
                          }
                        </button>
                      </div>`
                    : nothing
                }
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
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: var(--ha-space-2, 8px);
      padding-block: var(--ha-space-1, 4px);
    }
    .item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 0;
      box-sizing: border-box;
      margin: 0;
      padding: var(--ha-space-2, 8px) var(--ha-space-3, 12px);
      border: 2px solid transparent;
      border-radius: 14px;
      background: var(--stat-bg);
      color: var(--stat-fg);
      font: inherit;
      text-align: start;
    }
    .tone-neutral {
      --stat-bg: var(
        --md-sys-color-surface-container-high,
        var(--card-background-color)
      );
      --stat-fg: var(--primary-text-color);
    }
    .tone-primary {
      --stat-bg: var(
        --md-sys-color-primary-container,
        var(--ha-color-fill-primary-quiet-resting)
      );
      --stat-fg: var(
        --md-sys-color-on-primary-container,
        var(--primary-text-color)
      );
    }
    .tone-warning {
      --stat-bg: var(
        --md-sys-color-error-container,
        var(--ha-color-fill-danger-quiet-resting)
      );
      --stat-fg: var(
        --md-sys-color-on-error-container,
        var(--primary-text-color)
      );
    }
    .tone-quiet {
      --stat-bg: var(
        --md-sys-color-secondary-container,
        var(--ha-color-fill-neutral-quiet-resting)
      );
      --stat-fg: var(
        --md-sys-color-on-secondary-container,
        var(--primary-text-color)
      );
    }
    .label {
      overflow-wrap: anywhere;
      font-size: var(--ha-font-size-xs, 11px);
      line-height: 1.2;
      opacity: 0.85;
    }
    .value {
      overflow-wrap: anywhere;
      font-size: var(--ha-font-size-2xl, 24px);
      font-weight: 700;
      line-height: 1.1;
    }
    button.item {
      cursor: pointer;
    }
    button.item:hover {
      border-color: color-mix(in srgb, var(--stat-fg) 35%, transparent);
    }
    button.item:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button.item.pressed {
      border-color: var(--stat-fg);
      box-shadow: inset 0 0 0 1px var(--stat-fg);
    }
    .status {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ha-space-2, 8px);
      padding-block: var(--ha-space-1, 4px);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 13px);
    }
    .clear {
      padding: 4px 12px;
      border: 0;
      border-radius: 16px;
      background: none;
      color: var(--primary-color);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .clear:hover {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
    .clear:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }
    @media (prefers-reduced-motion: no-preference) {
      .chevron {
        transition: transform 200ms ease;
      }
      .item {
        transition:
          border-color 150ms ease,
          background-color 150ms ease;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-collapsible-statistics": HaCollapsibleStatistics;
  }

  interface HASSDomEvents {
    /** `key` is the filter key now held, or undefined when it was let go. */
    "statistic-selected": { key: string | undefined };
  }
}
