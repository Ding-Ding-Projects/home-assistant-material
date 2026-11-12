import { mdiDotsHorizontal, mdiDotsVertical, mdiLock, mdiPin } from "@mdi/js";
import { css, html, nothing } from "lit";
import type { DockEdge } from "../../common/tabs/tab-dock";
import { isVerticalDock } from "../../common/tabs/tab-dock";
import "../ha-svg-icon";
import { renderTabIcon } from "./tab-icons";
import type { PageTab, TabModuleContext } from "./tab-types";

/** One tab the strip cannot show in full, as the overflow list names it. */
export interface OverflowEntry {
  tab: PageTab;
  /** The name of its group, when it is in one. */
  group?: string;
  /** Its group is collapsed, so it has no tab in the strip. */
  collapsed: boolean;
  pinned: boolean;
  locked: boolean;
  selected: boolean;
}

/**
 * The overflow surface of the strip. When tabs do not fit along the strip's
 * axis (width on a horizontal strip, height on a vertical one) a button at
 * the end shows how many are out of view and opens a list of them with their
 * group, pinned and locked state, so nothing is silently clipped. The list is
 * a menu: Up and Down move through it, Home and End jump, Enter or Space opens
 * a tab (the strip brings it into view first), Escape closes it and returns to
 * the button. It lists tabs inside collapsed groups too.
 *
 * The button and its popover must share a shadow root, so this module renders
 * into the shell's, like the catalog.
 */
export class TabOverflowController {
  constructor(
    private readonly _ctx: TabModuleContext,
    private readonly _select: (id: string) => void
  ) {}

  private get _popover(): HTMLElement | undefined {
    return (
      this._ctx.host.renderRoot?.querySelector<HTMLElement>("#overflow") ??
      undefined
    );
  }

  private get _button(): HTMLElement | undefined {
    return (
      this._ctx.host.renderRoot?.querySelector<HTMLElement>(
        ".overflow-button"
      ) ?? undefined
    );
  }

  public render(entries: OverflowEntry[], edge: DockEdge) {
    if (!entries.length) {
      return nothing;
    }
    const { t } = this._ctx;
    const label = t("ui.page_tabs.overflow.button", { count: entries.length });
    return html`
      <button
        class="new-tab overflow-button"
        popovertarget="overflow"
        aria-haspopup="menu"
        aria-label=${label}
        title=${label}
      >
        <ha-svg-icon
          .path=${isVerticalDock(edge) ? mdiDotsVertical : mdiDotsHorizontal}
        ></ha-svg-icon>
        <span class="overflow-count" aria-hidden="true">${entries.length}</span>
      </button>
      <div
        id="overflow"
        popover
        role="menu"
        aria-label=${t("ui.page_tabs.overflow.title")}
        @toggle=${this._toggled}
        @keydown=${this._keydown}
      >
        ${entries.map((entry) => this._renderEntry(entry))}
      </div>
    `;
  }

  private _renderEntry(entry: OverflowEntry) {
    const { t } = this._ctx;
    const meta = [
      entry.pinned ? t("ui.page_tabs.overflow.pinned") : undefined,
      entry.locked ? t("ui.page_tabs.overflow.locked") : undefined,
      entry.group
        ? t("ui.page_tabs.overflow.in_group", { group: entry.group })
        : undefined,
      entry.collapsed ? t("ui.page_tabs.overflow.collapsed") : undefined,
    ].filter(Boolean);
    return html`<button
      class="entry"
      role="menuitem"
      tabindex="-1"
      aria-current=${entry.selected ? "page" : nothing}
      .tabId=${entry.tab.urlPath}
      @click=${this._choose}
    >
      <span class="entry-icon">${renderTabIcon(entry.tab)}</span>
      <span class="entry-text">
        <span class="entry-title">${entry.tab.title}</span>
        ${
          meta.length
            ? html`<span class="entry-meta">${meta.join(" · ")}</span>`
            : nothing
        }
      </span>
      ${
        entry.locked
          ? html`<ha-svg-icon .path=${mdiLock}></ha-svg-icon>`
          : entry.pinned
            ? html`<ha-svg-icon .path=${mdiPin}></ha-svg-icon>`
            : nothing
      }
    </button>`;
  }

  private _items(): HTMLElement[] {
    return Array.from(
      this._popover?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []
    );
  }

  private _toggled = (ev: ToggleEvent) => {
    const popover = this._popover;
    const button = this._button;
    if (!popover || !button) {
      return;
    }
    if (ev.newState === "open") {
      // Sits beside the button, on the side that has room.
      const rect = button.getBoundingClientRect();
      const edge = this._ctx.store.dock;
      const set = (name: string, value: string) =>
        popover.style.setProperty(name, value);
      ["top", "bottom", "left", "right"].forEach((side) => set(side, "auto"));
      if (edge === "left") {
        set("left", `${rect.right + 8}px`);
        set("top", `${Math.max(8, rect.top)}px`);
      } else if (edge === "right") {
        set("right", `${window.innerWidth - rect.left + 8}px`);
        set("top", `${Math.max(8, rect.top)}px`);
      } else if (edge === "bottom") {
        set("bottom", `${window.innerHeight - rect.top + 8}px`);
        set("right", `${Math.max(8, window.innerWidth - rect.right)}px`);
      } else {
        set("top", `${rect.bottom + 8}px`);
        set("right", `${Math.max(8, window.innerWidth - rect.right)}px`);
      }
      // Beside a button low on a short window the list would run past the
      // bottom edge: move it up, and let it scroll if it still does not fit.
      if (edge === "left" || edge === "right") {
        const height = Math.min(
          popover.getBoundingClientRect().height,
          window.innerHeight - 16
        );
        set(
          "top",
          `${Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))}px`
        );
      }
      const items = this._items();
      (
        items.find((item) => item.getAttribute("aria-current")) ?? items[0]
      )?.focus();
    } else {
      button.focus();
    }
  };

  private _choose = (ev: Event) => {
    const id = (ev.currentTarget as HTMLElement & { tabId: string }).tabId;
    this._popover?.hidePopover();
    this._select(id);
  };

  private _keydown = (ev: KeyboardEvent) => {
    const items = this._items();
    const index = items.findIndex((item) => item.matches(":focus"));
    let next: number | undefined;
    if (ev.key === "ArrowDown") {
      next = (index + 1) % items.length;
    } else if (ev.key === "ArrowUp") {
      next = (index - 1 + items.length) % items.length;
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = items.length - 1;
    }
    if (next !== undefined) {
      ev.preventDefault();
      items[next]?.focus();
    }
  };

  public static styles = css`
    .overflow-button {
      position: relative;
      flex: none;
    }
    .overflow-count {
      position: absolute;
      inset-block-start: 2px;
      inset-inline-end: 0;
      min-width: 16px;
      padding-inline: 3px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-size: 10px;
      line-height: 16px;
      text-align: center;
    }
    #overflow {
      position: fixed;
      margin: 0;
      inset: auto;
      box-sizing: border-box;
      width: min(320px, calc(100vw - 16px));
      max-height: min(420px, calc(100dvh - 16px));
      overflow-y: auto;
      padding: var(--ha-space-2);
      border: none;
      border-radius: var(--ha-border-radius-4xl);
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      box-shadow:
        0 4px 8px 3px rgba(0, 0, 0, 0.1),
        0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .entry {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      min-height: var(--ha-space-12);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      text-align: start;
      --mdc-icon-size: 18px;
    }
    .entry:hover,
    .entry:focus-visible {
      background-color: var(--ha-color-fill-neutral-quiet-resting);
    }
    .entry[aria-current="page"] {
      font-weight: var(--ha-font-weight-medium);
    }
    .entry-icon {
      display: inline-flex;
      flex: none;
      color: var(--secondary-text-color);
    }
    .entry-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .entry-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry-meta {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}
