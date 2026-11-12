import { mdiTabRemove, mdiUndo } from "@mdi/js";
import { css, html, nothing } from "lit";
import type { BulkCloseMode } from "../../common/tabs/bulk-close";
import { planBulkClose } from "../../common/tabs/bulk-close";
import { tabLockState } from "../../common/tabs/tab-locks";
import { closeTab } from "../../common/tabs/tab-seen";
import "../ha-svg-icon";
import type { PageTab, TabModuleContext } from "./tab-types";

/** The text of the catalog search, which the bulk close acts on. */
export interface TabBulkCloseFilter {
  get: () => string;
  set: (value: string) => void;
}

/**
 * Close tabs containing the text, or not containing it. The list under the
 * catalog search shows what the text matches, so it is the preview. Closing
 * keeps the page in use and the pinned tabs open, and Undo reopens exactly the
 * tabs it closed. Renders into the shell's shadow root, below the catalog
 * search field.
 */
export class TabBulkCloseController {
  /** Tabs closed by the last bulk close, kept so it can be undone. */
  private _closedByLast: string[] = [];

  constructor(
    private readonly _ctx: TabModuleContext,
    private readonly _filter: TabBulkCloseFilter
  ) {}

  /**
   * The text a bulk close matches: the visible label only (the name the person
   * gave the tab, else the page title), never the address.
   */
  private _visibleLabel(tab: PageTab): string {
    const { store } = this._ctx;
    return store.appearance[store.surface]?.[tab.urlPath]?.label || tab.title;
  }

  /** The page in use, a pinned tab and a locked tab are never closed in bulk. */
  private _protected(
    tab: PageTab,
    current: string | undefined,
    pinned: readonly string[]
  ): boolean {
    const { store } = this._ctx;
    return (
      tab.urlPath === current ||
      pinned.includes(tab.urlPath) ||
      tabLockState(store.locks, store.surface, tab.urlPath, store.groups).locked
    );
  }

  /** Forgets the last bulk close, so its Undo goes away. */
  public reset() {
    this._closedByLast = [];
    this._ctx.host.requestUpdate();
  }

  public render(
    tabs: PageTab[],
    closed: Set<string>,
    current: string | undefined
  ) {
    const { t, store } = this._ctx;
    const filter = this._filter.get();
    if (this._closedByLast.length && !filter) {
      return html`<div class="bulk" role="status">
        <span class="bulk-note"
          >${t("ui.page_tabs.bulk_done", {
            count: this._closedByLast.length,
          })}</span
        >
        <button class="text-button" @click=${this._undo}>
          <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
          ${t("ui.page_tabs.bulk_undo")}
        </button>
      </div>`;
    }
    if (!filter.trim()) {
      return nothing;
    }
    const pinned = store.pinned;
    const candidates = tabs.map((tab) => ({
      id: tab.urlPath,
      texts: [this._visibleLabel(tab)],
      open: !closed.has(tab.urlPath),
      current: this._protected(tab, current, pinned),
    }));
    const matching = planBulkClose(candidates, filter, "matching");
    const others = planBulkClose(candidates, filter, "not_matching");
    return html`<div class="bulk">
      <div class="bulk-buttons">
        <button
          class="text-button"
          .mode=${"matching"}
          ?disabled=${!matching.ids.length}
          @click=${this._close}
        >
          <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
          ${t("ui.page_tabs.bulk_close_matching", {
            count: matching.ids.length,
          })}
        </button>
        <button
          class="text-button"
          .mode=${"not_matching"}
          ?disabled=${!others.ids.length}
          @click=${this._close}
        >
          <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
          ${t("ui.page_tabs.bulk_close_others", {
            count: others.ids.length,
          })}
        </button>
      </div>
      <span class="bulk-note"
        >${t(
          matching.blocked === "invalid"
            ? "ui.page_tabs.bulk_invalid"
            : "ui.page_tabs.bulk_note"
        )}</span
      >
    </div>`;
  }

  private _close = (ev: Event) => {
    const { store } = this._ctx;
    const mode = (ev.currentTarget as HTMLElement & { mode: BulkCloseMode })
      .mode;
    const closed = store.closed;
    const pinned = store.pinned;
    const { ids } = planBulkClose(
      store.orderedTabs().map((tab) => ({
        id: tab.urlPath,
        texts: [this._visibleLabel(tab)],
        open: !closed.includes(tab.urlPath),
        current: this._protected(tab, store.currentTabId(), pinned),
      })),
      this._filter.get(),
      mode
    );
    if (!ids.length) {
      return;
    }
    store.closed = ids.reduce((list, id) => closeTab(list, id), closed);
    this._closedByLast = ids;
    this._filter.set("");
  };

  private _undo = () => {
    const { store } = this._ctx;
    const reopen = new Set(this._closedByLast);
    store.closed = store.closed.filter((urlPath) => !reopen.has(urlPath));
    this._closedByLast = [];
    this._ctx.host.requestUpdate();
  };

  public static styles = css`
    .bulk {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .bulk-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .bulk[role="status"] {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  `;
}
