import { mdiClose } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { getStorage } from "../../common/decorators/storage";
import { LOCKS_STORAGE_KEY } from "../../common/locks/element-locks";
import { regexQuery } from "../../common/regex/filter";
import { GROUPS_STORAGE_KEY } from "../../common/tabs/tab-groups";
import {
  CLOSED_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  PINNED_STORAGE_KEY,
} from "../../common/tabs/tab-pins";
import { buildSearchRows, searchMaster } from "../../common/tabs/tab-search";
import type { HomeAssistant } from "../../types";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import "./ha-tab-search-results";
import type { HaTabSearchResults } from "./ha-tab-search-results";
import { TabGroupPanel } from "./tab-group-panel";
import { readAllStrips, readLockStore } from "./tab-group-state";

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-search-all": HaTabSearchAll;
  }
}

/** The window event that opens the search of every open tab. */
export const MASTER_SEARCH_EVENT = "tab-master-search-open";

const KEYS = [
  GROUPS_STORAGE_KEY,
  CLOSED_STORAGE_KEY,
  PINNED_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  LOCKS_STORAGE_KEY,
];

/**
 * @element ha-tab-search-all
 *
 * @summary
 * Search all tabs: an anchored panel with its own search field and pattern
 * workbench that looks through every open tab on every strip the product has
 * (the wide strip `main`, and every other strip named in the saved maps).
 * Each result shows its strip, group, pinned and locked state and its visible
 * label, and offers pin, move into group and close without clearing the query.
 * Opened by the "Search all tabs" entry, by Alt+Shift+F, or by the window
 * event `tab-master-search-open`. Its query is its own: it never shares text
 * with the strip, group or group-name searches. Up and Down move through the
 * results, Enter opens one, Escape closes the panel and returns focus.
 */
@customElement("ha-tab-search-all")
export class HaTabSearchAll extends TabGroupPanel {
  protected readonly openEvent = MASTER_SEARCH_EVENT;

  protected readonly panelWidth = 480;

  @query("#master-search") private _field?: HaInputSearch;

  @query("ha-tab-search-results")
  private _results?: HaTabSearchResults;

  @state() private _query = "";

  private _unsubscribe: (() => void)[] = [];

  public connectedCallback(): void {
    super.connectedCallback();
    const storage = getStorage();
    this._unsubscribe = KEYS.map((key) =>
      storage.subscribeChanges(key, () => this.requestUpdate())
    );
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe.forEach((stop) => stop());
    this._unsubscribe = [];
  }

  protected _beforeOpen() {
    this._query = "";
    return true;
  }

  protected _afterClose() {
    this._query = "";
  }

  protected _focusFirst() {
    this._field?.focus();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._open || !this.hass) {
      return nothing;
    }
    const strips = readAllStrips(this.hass, (surface) =>
      surface === "main"
        ? this._t("ui.page_tabs.searches.strip_main")
        : this._t("ui.page_tabs.searches.strip_other", { name: surface })
    );
    const rows = buildSearchRows(strips, readLockStore());
    const result = searchMaster(rows, this._query);
    const sheet = this._narrow;
    return html`
      <div
        class=${classMap({ panel: true, sheet, bottom: sheet })}
        style=${styleMap(sheet ? {} : this._position)}
        role="dialog"
        aria-label=${this._t("ui.page_tabs.searches.all_title")}
        @keydown=${this._panelKeydown}
        @tab-search-activated=${this._activated}
        @tab-search-leave-top=${this._focusFirst}
      >
        <header>
          <div class="titles">
            <h2>${this._t("ui.page_tabs.searches.all_title")}</h2>
            <p class="sub">${this._t("ui.page_tabs.searches.all_intro")}</p>
          </div>
          <button
            class="close"
            type="button"
            aria-label=${this._t("ui.page_tabs.searches.close_panel")}
            @click=${this._dismiss}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </header>
        <ha-input-search
          id="master-search"
          appearance="outlined"
          .value=${this._query}
          .placeholder=${this._t("ui.page_tabs.searches.all_placeholder")}
          .accessibleLabel=${this._t("ui.page_tabs.searches.all_placeholder")}
          .patternSamples=${rows.map((row) => row.label)}
          @input=${this._queryChanged}
          @keydown=${this._fieldKeydown}
        ></ha-input-search>
        ${
          result.invalid && regexQuery(this._query)
            ? html`<p class="note error">
                ${this._t("ui.page_tabs.searches.invalid_pattern")}
              </p>`
            : nothing
        }
        <p class="note" role="status">
          ${this._t("ui.page_tabs.searches.result_count", {
            count: result.items.length,
          })}
        </p>
        <ha-tab-search-results
          .hass=${this.hass}
          .rows=${result.items}
          show-strip
          .label=${this._t("ui.page_tabs.searches.all_results")}
          .empty=${this._t("ui.page_tabs.searches.no_results")}
        ></ha-tab-search-results>
      </div>
    `;
  }

  private _queryChanged = (ev: Event) => {
    this._query = (ev.target as HaInputSearch).value ?? "";
  };

  private _fieldKeydown = (ev: KeyboardEvent) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      this._results?.focusFirst();
    }
  };

  private _activated = () => this.close(false);

  private _dismiss = () => this.close(true);

  public static styles = [
    ...TabGroupPanel.panelStyles,
    css`
      .panel {
        display: grid;
        max-height: min(640px, calc(100dvh - 16px));
      }
      ha-input-search {
        --ha-input-search-height: 44px;
        --ha-input-search-border-radius: var(--ha-border-radius-pill);
      }
      .note {
        margin: 0;
      }
    `,
  ];
}

/**
 * Opens Search all tabs, creating the panel the first time. Used by the
 * "Search all tabs" entry and the keyboard shortcut.
 */
export const openMasterSearch = async (
  hass: HomeAssistant,
  anchor: HTMLElement
): Promise<void> => {
  let panel = document.body.querySelector<HaTabSearchAll>("ha-tab-search-all");
  if (!panel) {
    panel = document.createElement("ha-tab-search-all");
    document.body.append(panel);
  }
  panel.hass = hass;
  await panel.updateComplete;
  window.dispatchEvent(
    new CustomEvent(MASTER_SEARCH_EVENT, {
      detail: { anchor, surface: panel.surface },
    })
  );
};
