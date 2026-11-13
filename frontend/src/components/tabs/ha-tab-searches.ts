import { mdiLock, mdiMagnify, mdiPlus, mdiTabRemove, mdiUndo } from "@mdi/js";
import type { ReactiveController } from "lit";
import { css, html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map";
import { classMap } from "lit/directives/class-map";
import { navigate } from "../../common/navigate";
import { readDestinations } from "../../common/tabs/tab-destination-list";
import {
  destinationId,
  parseDestinationId,
  tabRoute,
} from "../../common/tabs/tab-destinations";
import { searchMatcher } from "../../common/regex/filter";
import type { TabGroupId } from "../../common/tabs/tab-group-search";
import {
  filterGroupItems,
  planGroupClose,
  TAB_GROUP_IDS,
} from "../../common/tabs/tab-group-search";
import {
  buildSearchRows,
  searchGroup,
  searchGroupNames,
  searchStrip,
} from "../../common/tabs/tab-search";
import { showQuickBar } from "../../dialogs/quick-bar/show-dialog-quick-bar";
import { isMac } from "../../util/is_mac";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import "../ha-svg-icon";
import type { CatalogSettingsEntry } from "../page-catalog-entries";
import {
  computeSettingsEntries,
  computeToolEntries,
} from "../page-catalog-entries";
import { chooseDestination, isDestinationReachable } from "./destination-tabs";
import "./ha-tab-search-results";
import { openMasterSearch } from "./ha-tab-search-all";
import { groupColourCss } from "./tab-group-appearance-store";
import { readLockStore, readStripState } from "./tab-group-state";
import { isGroupLocked } from "../../common/tabs/tab-locks";
import { renderTabIcon } from "./tab-icons";
import type { PageTab, TabModuleContext } from "./tab-types";

/** The kind chips of the catalog. */
export type CatalogKind = "all" | "pages" | "settings" | "tools";

export const CATALOG_KINDS: CatalogKind[] = [
  "all",
  "pages",
  "settings",
  "tools",
];

const EMPTY_GROUP_FILTERS: Record<TabGroupId, string> = {
  pinned: "",
  pages: "",
  settings: "",
  tools: "",
};

/**
 * The search fields that are not the catalog's own search. They render into
 * the shell's shadow root, and every one keeps its own text, never shared:
 *
 * - one field for each group of the catalog (pinned, pages, settings, tools)
 *   that filters only that group and can close that group's matching tabs;
 * - the search at the top of the bar, which hands its text to the search of
 *   everything;
 * - the discovery searches of the tabs themselves: (1) the open tabs of this
 *   strip, (2) the tabs inside each group the person made, (3) the groups by
 *   name, and the entry that opens (4) Search all tabs, the master search of
 *   every open tab on every strip (`ha-tab-search-all`), also reachable with
 *   Alt+Shift+F while the bar is on the page.
 */
export class TabSearchesController implements ReactiveController {
  /** The search text of each group of the catalog, one field per group. */
  private _groupFilters: Record<TabGroupId, string> = {
    ...EMPTY_GROUP_FILTERS,
  };

  /** Tabs closed by the last group close, kept so that group can undo it. */
  private _groupClosed?: { group: TabGroupId; ids: string[] };

  /** Which kind of destination the catalog lists: the filter chips. */
  private _kind: CatalogKind = "all";

  /** Search 1: the open tabs of this strip. */
  private _stripQuery = "";

  /** Search 3: the groups, by name. */
  private _namesQuery = "";

  /** Search 2: one query for each group the person made, by group id. */
  private _groupQueries: Record<string, string> = {};

  constructor(
    private readonly _ctx: TabModuleContext,
    private readonly _hideCatalog: () => void
  ) {
    _ctx.host.addController(this);
  }

  public hostConnected() {
    window.addEventListener("keydown", this._shortcut);
  }

  public hostDisconnected() {
    window.removeEventListener("keydown", this._shortcut);
  }

  // Alt+Shift+F opens Search all tabs. It does not collide with the product's
  // Ctrl or Command + Shift shortcuts, and Alt+Shift with arrows is reorder.
  private _shortcut = (ev: KeyboardEvent) => {
    if (
      ev.altKey &&
      ev.shiftKey &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      ev.code === "KeyF"
    ) {
      ev.preventDefault();
      this.openAllTabsSearch();
    }
  };

  /** Opens Search all tabs beside the New tab button. */
  public openAllTabsSearch(anchor?: HTMLElement) {
    const { host } = this._ctx;
    const target =
      anchor ?? host.renderRoot?.querySelector<HTMLElement>(".new-tab") ?? host;
    this._hideCatalog();
    void openMasterSearch(host.hass, target);
  }

  /** Which kind of destination the catalog lists. */
  public get kind(): CatalogKind {
    return this._kind;
  }

  public set kind(value: CatalogKind) {
    this._kind = value;
    this._ctx.host.requestUpdate();
  }

  /** Clears every group search and the last group close, as the catalog opens. */
  public reset() {
    this._kind = "all";
    this._groupFilters = { ...EMPTY_GROUP_FILTERS };
    this._groupClosed = undefined;
    this._stripQuery = "";
    this._namesQuery = "";
    this._groupQueries = {};
    this._ctx.host.requestUpdate();
  }

  /** The search at the top of the bar. Typing in it opens the search of everything. */
  public renderTopSearch(tabs: PageTab[]) {
    const { t } = this._ctx;
    return html`<ha-input-search
      class="top-search"
      appearance="outlined"
      .placeholder=${t("ui.page_tabs.search_label")}
      .accessibleLabel=${t("ui.page_tabs.search_everything")}
      .patternSamples=${tabs.map((tab) => tab.title)}
      @input=${this._topSearchInput}
      @keydown=${this._topSearchKeydown}
    >
      <kbd slot="end">${isMac ? "⌘ ⇧ F" : "Ctrl Shift F"}</kbd>
    </ha-input-search>`;
  }

  // The catalog in groups: pages (which can be tabs), settings, then tools.
  public renderCatalogGroups(
    listed: PageTab[],
    closed: Set<string>,
    filter: string
  ) {
    const { t, host, store } = this._ctx;
    const matches = searchMatcher(filter);
    // Only pages this person can reach are offered, since a choice opens a tab.
    const reachable = (entry: CatalogSettingsEntry) =>
      isDestinationReachable(host.hass, entry.path);
    const settings = computeSettingsEntries(host.hass).filter(
      (entry) => reachable(entry) && matches(entry.title, entry.path)
    );
    const tools = computeToolEntries(host.hass).filter(
      (entry) => reachable(entry) && matches(entry.title, entry.path)
    );
    // The kind chips narrow the catalog to pages, settings or tools; the tab
    // searches belong to the full view only.
    const kind = this._kind;
    const discovery = kind === "all" ? this._renderDiscovery() : nothing;
    const showPages = kind === "all" || kind === "pages";
    const showSettings = kind === "all" || kind === "settings";
    const showTools = kind === "all" || kind === "tools";
    if (
      (!showPages || !listed.length) &&
      (!showSettings || !settings.length) &&
      (!showTools || !tools.length)
    ) {
      return html`${discovery}
        <p class="empty">${t("ui.page_tabs.no_match")}</p>`;
    }
    const pinned = store.pinned;
    return html`
      ${discovery}
      ${this._renderTabGroup(
        "pinned",
        "group-pinned",
        "ui.page_tabs.group_pinned",
        showPages ? listed.filter((tab) => pinned.includes(tab.urlPath)) : [],
        closed
      )}
      ${this._renderTabGroup(
        "pages",
        "group-pages",
        "ui.page_tabs.group_pages",
        // Settings pages and tools opened as tabs are listed with the
        // settings and tools below, where they can be opened or focused.
        showPages
          ? listed.filter(
              (tab) =>
                !pinned.includes(tab.urlPath) &&
                parseDestinationId(tab.urlPath).kind === "page"
            )
          : [],
        closed
      )}
      ${this._renderSettingsGroup(
        "settings",
        "group-settings",
        "ui.page_tabs.group_settings",
        showSettings ? settings : []
      )}
      ${this._renderSettingsGroup(
        "tools",
        "group-tools",
        "ui.page_tabs.group_tools",
        showTools ? tools : []
      )}
    `;
  }

  // The discovery searches of the tabs. Each has its own field and its own
  // text; acting on a result never clears the text, because the field and the
  // list of results are separate and the results are drawn again from storage.
  private _renderDiscovery() {
    const { t, host } = this._ctx;
    const state = readStripState(host.hass, "main");
    const lockStore = readLockStore();
    const rows = buildSearchRows(
      [
        {
          surface: "main",
          tabs: state.tabs,
          pinned: state.pinned,
          groups: state.groups,
        },
      ],
      lockStore
    );
    const strip = searchStrip(rows, "main", this._stripQuery);
    const names = searchGroupNames(
      state.groups,
      this._namesQuery,
      (id) => state.openIds.includes(id),
      (id) => isGroupLocked(lockStore, "main", id)
    );
    return html`<section
        class="group"
        role="group"
        aria-labelledby="group-open-tabs"
        @tab-search-activated=${this._hideCatalog}
        @tab-search-changed=${this._refresh}
      >
        <div class="group-head">
          <h3 id="group-open-tabs" class="group-title">
            ${t("ui.page_tabs.searches.strip_title")}
          </h3>
          <button class="text-button" @click=${this._openAll}>
            <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
            ${t("ui.page_tabs.searches.all_entry")}
          </button>
        </div>
        <ha-input-search
          class="group-search"
          data-search="strip"
          appearance="outlined"
          .value=${this._stripQuery}
          .placeholder=${t("ui.page_tabs.searches.strip_placeholder")}
          .accessibleLabel=${t("ui.page_tabs.searches.strip_placeholder")}
          .patternSamples=${rows.map((row) => row.label)}
          @input=${this._discoveryInput}
        ></ha-input-search>
        ${
          this._stripQuery
            ? html`<ha-tab-search-results
                .hass=${host.hass}
                .rows=${strip.items}
                .label=${t("ui.page_tabs.searches.strip_results")}
                .empty=${t("ui.page_tabs.searches.no_results")}
              ></ha-tab-search-results>`
            : nothing
        }
      </section>
      <section class="group" role="group" aria-labelledby="group-names">
        <div class="group-head">
          <h3 id="group-names" class="group-title">
            ${t("ui.page_tabs.searches.names_title")}
          </h3>
          <span class="group-count" role="status"
            >${t("ui.page_tabs.group_count", {
              shown: names.items.length,
              total: state.groups.length,
            })}</span
          >
        </div>
        <ha-input-search
          class="group-search"
          data-search="names"
          appearance="outlined"
          .value=${this._namesQuery}
          .placeholder=${t("ui.page_tabs.searches.names_placeholder")}
          .accessibleLabel=${t("ui.page_tabs.searches.names_placeholder")}
          .patternSamples=${state.groups.map((group) => group.name)}
          @input=${this._discoveryInput}
        ></ha-input-search>
        ${
          state.groups.length
            ? html`<ul
                class="group-list"
                aria-label=${t("ui.page_tabs.searches.names_results")}
              >
                ${names.items.map(
                  (group) =>
                    html`<li>
                      <button
                        class="entry"
                        .groupId=${group.id}
                        aria-haspopup="menu"
                        @click=${this._openGroupMenu}
                      >
                        <span
                          class="swatch"
                          aria-hidden="true"
                          style=${styleMap({
                            "background-color": groupColourCss(group.colour),
                          })}
                        ></span>
                        <span class="entry-text">
                          <span class="entry-title"
                            >${
                              group.name || t("ui.page_tabs.groups.unnamed")
                            }</span
                          >
                          <span class="entry-state"
                            >${t("ui.page_tabs.group_picker.members", {
                              count: group.memberCount,
                            })}${
                              group.collapsed
                                ? ` (${t("ui.page_tabs.searches.collapsed")})`
                                : ""
                            }</span
                          >
                        </span>
                        ${
                          group.locked
                            ? html`<ha-svg-icon
                                .path=${mdiLock}
                                aria-label=${t("ui.page_tabs.searches.locked")}
                              ></ha-svg-icon>`
                            : nothing
                        }
                      </button>
                    </li>`
                )}
              </ul>`
            : html`<p class="empty">${t("ui.page_tabs.groups.none")}</p>`
        }
        ${
          state.groups.length && !names.items.length
            ? html`<p class="empty">
                ${t("ui.page_tabs.searches.no_results")}
              </p>`
            : nothing
        }
      </section>
      ${state.groups.map((group) => {
        const own = searchGroup(
          rows,
          "main",
          group.id,
          this._groupQueries[group.id] ?? ""
        );
        const name = group.name || t("ui.page_tabs.groups.unnamed");
        return html`<section
          class="group"
          role="group"
          aria-label=${t("ui.page_tabs.searches.inside_title", { name })}
          @tab-search-activated=${this._hideCatalog}
          @tab-search-changed=${this._refresh}
        >
          <div class="group-head">
            <h3 class="group-title">
              ${t("ui.page_tabs.searches.inside_title", { name })}
            </h3>
          </div>
          <ha-input-search
            class="group-search"
            data-search="inside"
            data-group-id=${group.id}
            appearance="outlined"
            .value=${this._groupQueries[group.id] ?? ""}
            .placeholder=${t("ui.page_tabs.searches.inside_placeholder", {
              name,
            })}
            .accessibleLabel=${t("ui.page_tabs.searches.inside_placeholder", {
              name,
            })}
            .patternSamples=${rows
              .filter((row) => row.groupId === group.id)
              .map((row) => row.label)}
            @input=${this._discoveryInput}
          ></ha-input-search>
          ${
            this._groupQueries[group.id]
              ? html`<ha-tab-search-results
                  .hass=${host.hass}
                  .rows=${own.items}
                  .label=${t("ui.page_tabs.searches.inside_results", { name })}
                  .empty=${t("ui.page_tabs.searches.no_results")}
                ></ha-tab-search-results>`
              : nothing
          }
        </section>`;
      })}`;
  }

  private _refresh = () => this._ctx.host.requestUpdate();

  private _openAll = (ev: Event) =>
    this.openAllTabsSearch(ev.currentTarget as HTMLElement);

  // One handler for the three kinds of field; each writes only its own text.
  private _discoveryInput = (ev: Event) => {
    const field = ev.target as HaInputSearch;
    const value = field.value ?? "";
    const kind = field.dataset.search;
    if (kind === "strip") {
      this._stripQuery = value;
    } else if (kind === "names") {
      this._namesQuery = value;
    } else if (kind === "inside" && field.dataset.groupId) {
      this._groupQueries = {
        ...this._groupQueries,
        [field.dataset.groupId]: value,
      };
    }
    this._ctx.host.requestUpdate();
  };

  // A group found by name opens that group's own menu beside the result.
  private _openGroupMenu = (ev: Event) => {
    const button = ev.currentTarget as HTMLElement & { groupId: string };
    window.dispatchEvent(
      new CustomEvent("tab-group-context-menu", {
        detail: {
          groupId: button.groupId,
          anchor: button,
          shift: false,
          surface: "main",
        },
      })
    );
  };

  private _renderSettingsGroup(
    group: TabGroupId,
    id: string,
    titleKey: string,
    allEntries: CatalogSettingsEntry[]
  ) {
    const { t } = this._ctx;
    if (!allEntries.length) {
      return nothing;
    }
    const kind = group === "tools" ? "tool" : "settings";
    const entries = filterGroupItems(
      allEntries,
      this._groupFilters[group],
      (entry) => [entry.title, entry.path]
    );
    return html`<section class="group" role="group" aria-labelledby=${id}>
      ${this._renderGroupHeader(group, id, titleKey, {
        shown: entries.length,
        total: allEntries.length,
        samples: allEntries.map((entry) => entry.title),
      })}
      ${
        entries.length
          ? nothing
          : html`<p class="empty">
              ${t("ui.page_tabs.group_empty", {
                name: t(titleKey),
              })}
            </p>`
      }
      <ul class="group-list">
        ${entries.map((entry) => {
          const state = this._destinationState(kind, entry.path);
          return html`<li>
            <button
              class=${classMap({ entry: true, closed: state === "closed" })}
              .path=${entry.path}
              .kind=${kind}
              @click=${this._openSettingsPage}
            >
              <span class="entry-icon">
                ${
                  entry.iconPath
                    ? html`<ha-svg-icon .path=${entry.iconPath}></ha-svg-icon>`
                    : nothing
                }
              </span>
              <span class="entry-text">
                <span class="entry-title">${entry.title}</span>
                <span class="entry-state"
                  >${t(`ui.page_tabs.destinations.state_${state}`)}</span
                >
              </span>
              ${
                state === "open"
                  ? nothing
                  : html`<ha-svg-icon .path=${mdiPlus}></ha-svg-icon>`
              }
            </button>
          </li>`;
        })}
      </ul>
    </section>`;
  }

  // One group of tabs with its own search, count and Close matching button.
  private _renderTabGroup(
    group: "pinned" | "pages",
    id: string,
    titleKey: string,
    allTabs: PageTab[],
    closed: Set<string>
  ) {
    const { t, store } = this._ctx;
    if (!allTabs.length) {
      return nothing;
    }
    const currentId = store.currentTabId();
    const groupQuery = this._groupFilters[group];
    const shown = filterGroupItems(allTabs, groupQuery, (tab) => [
      tab.title,
      tab.urlPath,
    ]);
    const pinned = store.pinned;
    const plan = planGroupClose(
      store.orderedTabs().map((tab) => ({
        id: tab.urlPath,
        texts: [tab.title, tab.urlPath],
        open: !closed.has(tab.urlPath),
        current: tab.urlPath === currentId,
        pinned: pinned.includes(tab.urlPath),
      })),
      group,
      groupQuery,
      { includePinned: true }
    );
    return html`<section class="group" role="group" aria-labelledby=${id}>
      ${this._renderGroupHeader(group, id, titleKey, {
        shown: shown.length,
        total: allTabs.length,
        samples: allTabs.map((tab) => tab.title),
        close: { ids: plan.ids, blocked: plan.blocked },
      })}
      ${
        shown.length
          ? nothing
          : html`<p class="empty">
              ${t("ui.page_tabs.group_empty", {
                name: t(titleKey),
              })}
            </p>`
      }
      <ul class="group-list">
        ${shown.map((tab) => {
          const isClosed = closed.has(tab.urlPath);
          return html`<li>
            <button
              class=${classMap({ entry: true, closed: isClosed })}
              .urlPath=${tab.urlPath}
              @click=${this._openFromCatalog}
            >
              <span class="entry-icon">${renderTabIcon(tab)}</span>
              <span class="entry-text">
                <span class="entry-title">${tab.title}</span>
                <span class="entry-state"
                  >${t(
                    isClosed
                      ? "ui.page_tabs.state_closed"
                      : "ui.page_tabs.state_open"
                  )}</span
                >
              </span>
              ${
                isClosed
                  ? html`<ha-svg-icon .path=${mdiPlus}></ha-svg-icon>`
                  : nothing
              }
            </button>
          </li>`;
        })}
      </ul>
    </section>`;
  }

  // The header of a group: its title and count, its own search field, and for
  // tab groups the button that closes the matching tabs of that group only.
  private _renderGroupHeader(
    group: TabGroupId,
    id: string,
    titleKey: string,
    info: {
      shown: number;
      total: number;
      samples: string[];
      close?: { ids: string[]; blocked?: string };
    }
  ) {
    const { t } = this._ctx;
    const name = t(titleKey);
    const groupQuery = this._groupFilters[group];
    const undo =
      this._groupClosed?.group === group ? this._groupClosed : undefined;
    return html`
      <div class="group-head">
        <h3 id=${id} class="group-title">${name}</h3>
        <span class="group-count" role="status"
          >${t("ui.page_tabs.group_count", {
            shown: info.shown,
            total: info.total,
          })}</span
        >
      </div>
      <ha-input-search
        class="group-search"
        data-group=${group}
        appearance="outlined"
        .value=${groupQuery}
        .placeholder=${t("ui.page_tabs.group_search", { name })}
        .accessibleLabel=${t("ui.page_tabs.group_search", { name })}
        .patternSamples=${info.samples}
        @input=${this._groupFilterChanged}
      ></ha-input-search>
      ${
        info.close
          ? html`<div class="group-actions">
              <button
                class="text-button"
                .group=${group}
                ?disabled=${!info.close.ids.length}
                @click=${this._closeGroupMatching}
              >
                <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
                ${t(
                  group === "pinned"
                    ? "ui.page_tabs.group_close_pinned"
                    : "ui.page_tabs.bulk_close_matching",
                  { count: info.close.ids.length }
                )}
              </button>
              ${
                undo
                  ? html`<span class="bulk-note" role="status"
                        >${t("ui.page_tabs.bulk_done", {
                          count: undo.ids.length,
                        })}</span
                      >
                      <button
                        class="text-button"
                        @click=${this._undoGroupClose}
                      >
                        <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
                        ${t("ui.page_tabs.bulk_undo")}
                      </button>`
                  : info.close.blocked === "invalid"
                    ? html`<span class="bulk-note"
                        >${t("ui.page_tabs.bulk_invalid")}</span
                      >`
                    : nothing
              }
            </div>`
          : nothing
      }
    `;
  }

  private _groupFilterChanged = (ev: Event) => {
    const field = ev.target as HaInputSearch;
    const group = field.dataset.group as TabGroupId | undefined;
    if (!group || !TAB_GROUP_IDS.includes(group)) {
      return;
    }
    this._groupFilters = {
      ...this._groupFilters,
      [group]: field.value ?? "",
    };
    this._ctx.host.requestUpdate();
  };

  // Closes the matching tabs of one group. Other groups, the order, the pins
  // and the page in use stay as they are, and Undo reopens exactly these.
  private _closeGroupMatching = (ev: Event) => {
    const { host, store } = this._ctx;
    const group = (ev.currentTarget as HTMLElement & { group: TabGroupId })
      .group;
    const closed = store.closed;
    const pinned = store.pinned;
    const currentId = store.currentTabId();
    const { ids } = planGroupClose(
      store.orderedTabs().map((tab) => ({
        id: tab.urlPath,
        texts: [tab.title, tab.urlPath],
        open: !closed.includes(tab.urlPath),
        current: tab.urlPath === currentId,
        pinned: pinned.includes(tab.urlPath),
      })),
      group,
      this._groupFilters[group],
      { includePinned: true }
    );
    if (!ids.length) {
      return;
    }
    store.closed = [...closed, ...ids];
    this._groupClosed = { group, ids };
    this._groupFilters = { ...this._groupFilters, [group]: "" };
    host.requestUpdate();
  };

  private _undoGroupClose = () => {
    const { host, store } = this._ctx;
    const reopen = new Set(this._groupClosed?.ids ?? []);
    store.closed = store.closed.filter((urlPath) => !reopen.has(urlPath));
    this._groupClosed = undefined;
    host.requestUpdate();
  };

  // Whether a settings page or tool has an open tab, a closed one, or none yet.
  private _destinationState(
    kind: "settings" | "tool",
    path: string
  ): "open" | "closed" | "none" {
    const { store } = this._ctx;
    const id = destinationId(kind, path);
    if (!id || !readDestinations(store.surface).includes(id)) {
      return "none";
    }
    return store.closed.includes(id) ? "closed" : "open";
  }

  // Choosing a settings page or a tool opens it as its own tab, or focuses the
  // tab it already has, and shows the page.
  private _openSettingsPage = (ev: Event) => {
    const { store } = this._ctx;
    const button = ev.currentTarget as HTMLElement & {
      path: string;
      kind: "settings" | "tool";
    };
    const choice = chooseDestination(button.kind, button.path, store.surface);
    this._hideCatalog();
    navigate(choice.route ?? button.path);
  };

  private _openFromCatalog = (ev: Event) => {
    const { store } = this._ctx;
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    store.closed = store.closed.filter((closed) => closed !== urlPath);
    this._hideCatalog();
    navigate(tabRoute(urlPath));
  };

  // The search at the top starts the search of everything: what is typed
  // or built here opens the full search with that text already in it.
  private _topSearchInput = (ev: Event) => {
    const field = ev.target as HaInputSearch;
    const value = field.value ?? "";
    if (!value) {
      return;
    }
    field.value = "";
    field.blur();
    showQuickBar(this._ctx.host, { search: value });
  };

  private _topSearchKeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      (ev.currentTarget as HaInputSearch).blur();
      showQuickBar(this._ctx.host, {});
    }
  };

  public static styles = css`
    .top-search {
      width: 300px;
      --ha-input-search-height: var(--ha-space-10);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    kbd {
      font-family: var(--ha-font-family-body);
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-hover-color);
      background-color: var(--primary-background-color);
      white-space: nowrap;
    }
    /* Narrow bars trade the field for a button that opens the same search. */
    @media (max-width: 700px) {
      .top-search {
        display: none;
      }
    }
    @media (max-width: 1100px) {
      .top-search {
        width: 180px;
      }
      kbd {
        display: none;
      }
    }
    /* The strip's tab groups share this shadow root and the class name; a
       catalog section is a plain block, not a group pill. */
    #catalog section.group {
      display: block;
      padding: 0;
      border-radius: 0;
      background-color: transparent;
      box-shadow: none;
    }
    .group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .group-count {
      padding-inline: var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .group-search {
      display: block;
      margin-block: var(--ha-space-1);
      --ha-input-search-height: var(--ha-space-11, 44px);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .group-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-1);
    }
    .group-actions .text-button {
      min-height: 44px;
    }
    .group-title {
      margin: 0;
      padding: var(--ha-space-1) var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .group-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
      gap: var(--ha-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* Every destination is a tile: tinted icon, name, state. */
    #catalog .group-list {
      gap: var(--ha-space-2);
    }
    .group-list .entry {
      width: 100%;
      min-height: var(--ha-space-16, 64px);
      background-color: var(--card-background-color);
      box-shadow: var(--ha-shadow-card, none);
      border-radius: var(--ha-border-radius-3xl, 20px);
    }
    .group-list .entry:hover,
    .group-list .entry:focus-visible {
      background-color: var(
        --ha-color-surface-tone-2,
        var(--card-background-color)
      );
    }
    .group-list .entry .entry-icon {
      background-color: var(--ha-color-primary-container);
      color: var(--ha-color-on-primary-container);
    }
    .group-list .entry.closed {
      box-shadow: none;
      border: 1px dashed var(--ha-color-outline, var(--divider-color));
    }
    .entry {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      min-height: var(--ha-space-14);
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-2)
        var(--ha-space-2);
      border-radius: var(--ha-border-radius-2xl);
      text-align: start;
    }
    .entry:hover {
      background-color: var(--card-background-color);
    }
    .entry.closed {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .entry-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-xl);
      background-color: var(--secondary-background-color);
    }
    .entry.closed .entry-icon {
      background-color: var(--primary-background-color);
    }
    .entry-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .entry-title {
      font-weight: var(--ha-font-weight-medium);
    }
    .entry-state {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .swatch {
      flex: none;
      width: 20px;
      height: 20px;
      margin-inline: var(--ha-space-2);
      border-radius: 50%;
      border: 1px solid var(--divider-color);
    }
  `;
}
