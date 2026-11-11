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
        <button
          type="button"
          class="toggle"
          aria-expanded=${this._collapsed ? "false" : "true"}
          aria-controls="statistics-body"
          title=${action}
          @click=${this._toggle}
        >
          <span class="toggle-label">${label}</span>
          ${
            this._collapsed
              ? html`<span class="summary"
                  >${summaryLine(items, language)}</span
                >`
              : html`<span class="summary"></span>`
          }
          <ha-svg-icon class="chevron" .path=${mdiChevronDown}></ha-svg-icon>
        </button>
        <div class="body" id="statistics-body" ?inert=${this._collapsed}>
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
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .strip {
      box-sizing: border-box;
      margin-block: var(--ha-space-2, 8px);
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3, 12px);
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px);
      border: 0;
      border-radius: inherit;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .toggle:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .toggle-label {
      flex-shrink: 0;
      font-weight: 500;
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
      flex-shrink: 0;
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }
    .strip:not(.collapsed) .chevron {
      transform: rotate(180deg);
    }
    /* The body folds by sliding its row between zero and its own height */
    .body {
      display: grid;
      grid-template-rows: 1fr;
    }
    .collapsed .body {
      grid-template-rows: 0fr;
      visibility: hidden;
    }
    .items {
      min-height: 0;
      overflow: hidden;
      margin: 0;
      padding: 0 var(--ha-space-4, 16px);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ha-space-3, 12px) var(--ha-space-4, 16px);
    }
    .strip:not(.collapsed) .items {
      padding-block: var(--ha-space-1, 4px) var(--ha-space-4, 16px);
    }
    .item {
      min-width: 0;
    }
    dt {
      overflow-wrap: anywhere;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: 500;
    }
    @media (min-width: 600px) {
      .items {
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .body {
        transition:
          grid-template-rows 200ms ease,
          visibility 0s linear 0s;
      }
      .collapsed .body {
        transition:
          grid-template-rows 200ms ease,
          visibility 0s linear 200ms;
      }
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
