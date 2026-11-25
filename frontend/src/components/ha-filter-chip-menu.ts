import "@home-assistant/webawesome/dist/components/divider/divider";
import { mdiMagnifyRemoveOutline, mdiMenuDown } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { computeCssColor } from "../common/color/compute-color";
import { getContrastedColorHex } from "../common/color/rgb";
import { fireEvent } from "../common/dom/fire_event";
import { normalizeSearchText, searchMatcher } from "../common/regex/filter";
import type { LocalizeFunc } from "../common/translations/localize";
import "./chips/ha-assist-chip";
import "./ha-button";
import "./ha-checkbox";
import "./ha-domain-icon";
import type { HaDropdownSelectEvent } from "./ha-dropdown";
import "./ha-dropdown";
import type { HaDropdownItem } from "./ha-dropdown-item";
import "./ha-dropdown-item";
import "./ha-icon";
import "./ha-svg-icon";
import type { HaInputSearch } from "./input/ha-input-search";
import "./input/ha-input-search";

/** What a chip menu lists. Picks the wording of the search field and count. */
export type FilterChipKind =
  "domain" | "area" | "category" | "label" | "blueprint" | "integration";

export interface FilterChipOption {
  value: string;
  label: string;
  /** An icon name such as `mdi:sofa`. */
  icon?: string;
  /** The icon of an integration; wins over `icon`. */
  domain?: string;
  /** The colour of a label; tints the icon circle. */
  color?: string;
}

export interface FilterChipSelectDetail {
  /** The row that was picked, or `__any` for the entry that clears the filter. */
  value: string;
}

declare global {
  interface HASSDomEvents {
    "chip-select": FilterChipSelectDetail;
  }
}

const CLEAR_VALUE = "__any";

/**
 * A filter chip that opens a menu of checkable rows: an icon in a tonal
 * circle for each row, a search field pinned at the top with a match count and
 * the pattern workbench, a no-match message, and the rows that were selected
 * when the menu opened listed first.
 *
 * Pages that filter a list through chips use this one component so their
 * menus look and behave the same. The page owns the filter; this element only
 * reports the row that was picked in a `chip-select` event.
 *
 * @element ha-filter-chip-menu
 *
 * @fires chip-select - A row, or the clear entry, was picked.
 */
@customElement("ha-filter-chip-menu")
export class HaFilterChipMenu extends LitElement {
  @property() public kind: FilterChipKind = "area";

  /** The text of the chip, already carrying the current selection. */
  @property({ attribute: false }) public chipLabel = "";

  /** Text of the entry that clears the filter. */
  @property({ attribute: false }) public clearLabel = "";

  @property({ attribute: false }) public options: FilterChipOption[] = [];

  @property({ attribute: false }) public selected: string[] = [];

  /** How many things are selected, which may count more than the rows. */
  @property({ type: Number }) public total = 0;

  @property({ attribute: false }) public localize!: LocalizeFunc;

  /** The icon path of a row that has no icon of its own. */
  @property({ attribute: false }) public fallbackPath?: string;

  @state() private _search = "";

  @query("ha-input-search") private _searchField?: HaInputSearch;

  @queryAll("ha-dropdown-item") private _items!: NodeListOf<HaDropdownItem>;

  /**
   * What was selected when the menu last opened. Those rows sit at the top; a
   * row ticked while the menu is open keeps its place until the menu opens
   * again, so rows never jump under a finger.
   */
  @state() private _pinned: string[] = [];

  protected render(): TemplateResult {
    const localize = this.localize;
    const search = this._search;
    const matches = searchMatcher(normalizeSearchText(search));
    const shown = this.options.filter((option) =>
      matches(option.label, option.value)
    );
    const top = shown.filter((option) => this._pinned.includes(option.value));
    const rest = shown.filter((option) => !this._pinned.includes(option.value));

    return html`<ha-dropdown
      class="chip-menu"
      @wa-show=${this._handleShow}
      @wa-after-show=${this._handleAfterShow}
      @wa-after-hide=${this._handleAfterHide}
      @wa-select=${this._handleSelect}
    >
      <ha-assist-chip
        slot="trigger"
        .active=${this.total > 0}
        .label=${this.chipLabel}
      >
        <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
      </ha-assist-chip>
      <div class="chip-search" @keydown=${this._handleSearchKeydown}>
        <ha-input-search
          appearance="outlined"
          .value=${search}
          .label=${localize(
            `ui.components.filter_chip_menu.search_${this.kind}`
          )}
          .patternSamples=${this.options.map((option) => option.label)}
          @input=${this._handleSearch}
        ></ha-input-search>
        <span class="chip-count" role="status">
          ${
            search
              ? localize("ui.components.filter_chip_menu.match_count", {
                  shown: shown.length,
                  total: this.options.length,
                })
              : localize(`ui.components.filter_chip_menu.total_${this.kind}`, {
                  count: this.options.length,
                })
          }
        </span>
      </div>
      <ha-dropdown-item value=${CLEAR_VALUE} .disabled=${this.total === 0}>
        ${this.clearLabel}
      </ha-dropdown-item>
      <wa-divider></wa-divider>
      ${
        shown.length
          ? nothing
          : html`<div class="chip-empty">
              <ha-svg-icon .path=${mdiMagnifyRemoveOutline}></ha-svg-icon>
              <span class="chip-empty-title">
                ${localize("ui.components.filter_chip_menu.no_match", {
                  query: search,
                })}
              </span>
              <span>
                ${localize("ui.components.filter_chip_menu.no_match_hint")}
              </span>
              <ha-button
                appearance="filled"
                variant="neutral"
                @click=${this._clearSearch}
              >
                ${localize("ui.components.filter_chip_menu.clear_search")}
              </ha-button>
            </div>`
      }
      ${
        top.length
          ? html`<div class="chip-section">
              ${localize("ui.components.filter_chip_menu.section_selected")}
            </div>`
          : nothing
      }
      ${top.map((option) => this._renderOption(option))}
      ${
        top.length && rest.length
          ? html`<div class="chip-section">
              ${localize("ui.components.filter_chip_menu.section_other")}
            </div>`
          : nothing
      }
      ${rest.map((option) => this._renderOption(option))}
    </ha-dropdown>`;
  }

  private _renderOption(option: FilterChipOption) {
    const checked = this.selected.includes(option.value);
    const tint = !checked && option.color ? computeCssColor(option.color) : "";
    return html`<ha-dropdown-item
      class="chip-option"
      .value=${option.value}
      .selected=${checked}
    >
      <span
        slot="icon"
        class="chip-lead"
        style=${
          tint
            ? `background: ${tint}; color: ${getContrastedColorHex(option.color!)};`
            : ""
        }
      >
        ${
          option.domain
            ? html`<ha-domain-icon
                .domain=${option.domain}
                brand-fallback
              ></ha-domain-icon>`
            : option.icon
              ? html`<ha-icon .icon=${option.icon}></ha-icon>`
              : this.fallbackPath
                ? html`<ha-svg-icon .path=${this.fallbackPath}></ha-svg-icon>`
                : nothing
        }
      </span>
      ${option.label}
      <ha-checkbox
        slot="details"
        tabindex="-1"
        aria-hidden="true"
        .checked=${checked}
      ></ha-checkbox>
    </ha-dropdown-item>`;
  }

  private _handleShow(ev: Event) {
    // Nested popups, such as the pattern workbench, fire their own show events.
    if (ev.target !== ev.currentTarget) {
      return;
    }
    this._search = "";
    this._pinned = [...this.selected];
  }

  private _handleAfterShow(ev: Event) {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    // The height of the menu once it opened with every row listed. Filtering
    // keeps that height, so a menu that sits against the bottom of a phone, or
    // flips above the chip, does not shrink and carry the search field away
    // from the finger that is typing in it. It is set directly on the
    // dropdown, because a bound style attribute would wipe the sheet offset
    // the dropdown sets on itself.
    const dropdown = ev.currentTarget as HTMLElement;
    const menu = dropdown.shadowRoot?.querySelector('[part~="menu"]');
    const height = Math.round(menu?.getBoundingClientRect().height ?? 0);
    if (height) {
      dropdown.style.setProperty("--chip-menu-open-height", `${height}px`);
    }
  }

  private _handleAfterHide(ev: Event) {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    (ev.currentTarget as HTMLElement).style.removeProperty(
      "--chip-menu-open-height"
    );
  }

  private _handleSearch(ev: Event) {
    this._search = (ev.target as HaInputSearch).value ?? "";
  }

  private _clearSearch(ev: Event) {
    ev.stopPropagation();
    this._search = "";
    this._searchField?.focus();
  }

  // The menu moves focus to the item whose name starts with a typed letter,
  // which would pull focus out of the search field on every key. Arrow down
  // steps from the field into the rows.
  private _handleSearchKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape" || ev.key === "Tab") {
      return;
    }
    ev.stopPropagation();
    if (ev.key !== "ArrowDown") {
      return;
    }
    ev.preventDefault();
    const items = [...this._items].filter((item) => !item.disabled);
    const first =
      items.find((item) => item.classList.contains("chip-option")) ?? items[0];
    if (!first) {
      return;
    }
    items.forEach((item) => {
      item.active = item === first;
    });
    first.focus();
  }

  private _handleSelect(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    if (!value) {
      return;
    }
    if (value !== CLEAR_VALUE) {
      // Keep the menu open to pick several
      ev.preventDefault();
    }
    fireEvent(this, "chip-select", { value });
  }

  static styles = css`
    :host {
      display: contents;
    }
    /* With the host display: contents, the dropdown is the flex item in the
       page's search row, so the slotted rules there cannot reach it. */
    .chip-menu {
      flex-shrink: 0;
    }
    @media (pointer: coarse) {
      .chip-menu {
        min-height: 44px;
      }
    }
    ha-assist-chip {
      --ha-assist-chip-container-shape: 10px;
      --ha-assist-chip-trailing-space: 8px;
    }
    ha-dropdown-item::part(submenu) {
      max-width: calc(60vw - var(--ha-space-8));
      max-height: calc(100vh - var(--ha-space-8));
      overflow-y: auto;
    }

    /* The search stays pinned at the top of the menu while the rows scroll
         under it. */
    .chip-menu::part(menu) {
      padding-top: 0;
      min-width: min(320px, calc(100vw - var(--ha-space-4)));
      min-height: var(--chip-menu-open-height, 0px);
    }
    .chip-search {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2) 0 var(--ha-space-1);
      background: var(--wa-color-surface-raised, var(--card-background-color));
    }
    .chip-search ha-input-search {
      display: block;
    }
    .chip-count {
      padding-inline: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .chip-section {
      padding: var(--ha-space-3) var(--ha-space-3) var(--ha-space-1);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.4px;
      color: var(--secondary-text-color);
    }
    .chip-option {
      --ha-dropdown-item-min-height: var(--ha-space-12);
    }
    .chip-lead {
      display: grid;
      place-items: center;
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      border-radius: var(--ha-border-radius-circle);
      background: var(
        --ha-color-secondary-container,
        var(--ha-color-fill-neutral-normal-resting)
      );
      color: var(--ha-color-on-secondary-container, var(--primary-text-color));
      --mdc-icon-size: 20px;
    }
    .chip-option[selected] .chip-lead {
      background: var(--primary-color);
      color: var(--text-primary-color);
    }
    .chip-option ha-checkbox {
      pointer-events: none;
    }
    .chip-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-6) var(--ha-space-4);
      text-align: center;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .chip-empty > ha-svg-icon {
      --mdc-icon-size: 40px;
    }
    .chip-empty-title {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-filter-chip-menu": HaFilterChipMenu;
  }
}
