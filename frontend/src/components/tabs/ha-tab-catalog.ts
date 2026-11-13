import { mdiPlus, mdiTabPlus } from "@mdi/js";
import { css, html } from "lit";
import { searchMatcher } from "../../common/regex/filter";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import "../ha-svg-icon";
import { loadCatalogTranslations } from "../page-catalog-entries";
import type { TabBulkCloseController } from "./ha-tab-bulk-close";
import type { TabSearchesController } from "./ha-tab-searches";
import type { PageTab, TabModuleContext } from "./tab-types";

/**
 * The New tab button and the catalog it opens: every page with its state, the
 * settings pages and the tools, behind one search field that filters all of
 * them. The catalog is a popover, so the button and the popover must share a
 * shadow root, and this module renders into the shell's. It owns the text of
 * its search field and the popover; the bulk close and the group searches that
 * sit inside it are their own modules, which it clears each time it opens.
 */
export class TabCatalogController {
  /** The text of the catalog search. */
  private _filter = "";

  constructor(
    private readonly _ctx: TabModuleContext,
    private readonly _bulk: TabBulkCloseController,
    private readonly _searches: TabSearchesController
  ) {}

  /** The text of the catalog search. */
  public get filter(): string {
    return this._filter;
  }

  public set filter(value: string) {
    this._filter = value;
    this._ctx.host.requestUpdate();
  }

  private get _catalog(): HTMLElement | undefined {
    return (
      this._ctx.host.renderRoot?.querySelector<HTMLElement>("#catalog") ??
      undefined
    );
  }

  private get _search(): HaInputSearch | undefined {
    return (
      this._ctx.host.renderRoot?.querySelector<HaInputSearch>(
        "#catalog-search"
      ) ?? undefined
    );
  }

  /** Closes the catalog, as choosing a page in it does. */
  public hide() {
    this._catalog?.hidePopover();
  }

  /** Opens the catalog, as the New tab button does. */
  public show() {
    const catalog = this._catalog;
    if (catalog && !catalog.matches(":popover-open")) {
      catalog.showPopover();
    }
  }

  public render(
    tabs: PageTab[],
    closed: Set<string>,
    current: string | undefined
  ) {
    const { t } = this._ctx;
    const matches = searchMatcher(this._filter);
    const listed = tabs.filter((tab) => matches(tab.title, tab.urlPath));
    return html`
      <button
        class="new-tab"
        popovertarget="catalog"
        aria-label=${t("ui.page_tabs.new_tab")}
        title=${t("ui.page_tabs.new_tab")}
      >
        <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
      </button>
      <div
        id="catalog"
        popover
        role="dialog"
        aria-label=${t("ui.page_tabs.catalog_title")}
        @toggle=${this._toggled}
      >
        <div class="catalog-header">
          <span class="catalog-title">${t("ui.page_tabs.catalog_title")}</span>
          <button
            class="text-button"
            ?disabled=${closed.size === 0}
            @click=${this._openEveryTab}
          >
            <ha-svg-icon .path=${mdiTabPlus}></ha-svg-icon>
            ${t("ui.page_tabs.open_every_tab")}
          </button>
        </div>
        <p class="catalog-note">${t("ui.page_tabs.catalog_intro")}</p>
        <ha-input-search
          id="catalog-search"
          appearance="outlined"
          .value=${this._filter}
          .placeholder=${t("ui.page_tabs.search")}
          .accessibleLabel=${t("ui.page_tabs.search")}
          .patternSamples=${tabs.map((tab) => tab.title)}
          @input=${this._filterChanged}
        ></ha-input-search>
        ${this._bulk.render(tabs, closed, current)}
        <div class="catalog-list">
          ${this._searches.renderCatalogGroups(listed, closed, this._filter)}
        </div>
        <p class="catalog-note">${t("ui.page_tabs.catalog_note")}</p>
      </div>
    `;
  }

  private _openEveryTab = () => {
    this._ctx.store.closed = [];
    this._bulk.reset();
  };

  private _filterChanged = (ev: InputEvent) => {
    this.filter = (ev.target as HaInputSearch).value ?? "";
  };

  private _toggled = (ev: ToggleEvent) => {
    const { host } = this._ctx;
    if (ev.newState === "open") {
      this._filter = "";
      this._bulk.reset();
      this._searches.reset();
      // The settings and tools titles may not be loaded yet.
      loadCatalogTranslations(host.hass).then(() => host.requestUpdate());
      host.updateComplete.then(() => this._search?.focus());
    }
  };

  public static styles = css`
    @media (max-width: 700px) {
      :host #catalog {
        inset-inline: var(--ha-space-4);
        width: auto;
      }
    }
    #catalog {
      position: fixed;
      inset: auto;
      --ha-catalog-top: calc(
        var(--ha-page-tabs-top, 12px) + var(--ha-space-12)
      );
      top: var(--ha-catalog-top);
      inset-inline-start: calc(
        var(--ha-sidebar-width, 88px) + var(--ha-space-5)
      );
      margin: 0;
      width: min(760px, calc(100vw - 32px));
      /* Uses the height of the window, keeping a margin below. The list
         scrolls; the search and the notes stay in view. */
      max-height: calc(100dvh - var(--ha-catalog-top) - var(--ha-space-4));
      box-sizing: border-box;
      padding: var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-4xl);
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      box-shadow: var(
        --ha-shadow-overlay,
        0 4px 8px 3px rgba(0, 0, 0, 0.1),
        0 1px 3px rgba(0, 0, 0, 0.2)
      );
      overflow: hidden;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    #catalog:popover-open {
      display: flex;
    }
    .catalog-header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-1) var(--ha-space-2);
    }
    .catalog-title {
      flex: 1;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-title, var(--ha-font-weight-medium));
    }
    #catalog-search {
      --ha-input-search-height: var(--ha-space-12);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .catalog-list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      overflow-y: auto;
      min-height: 0;
    }
    /* Groups of a scrolling column keep their height instead of being squeezed. */
    .catalog-list > * {
      flex-shrink: 0;
    }
    .catalog-note {
      margin: 0;
      padding: 0 var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}
