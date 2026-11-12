import {
  mdiClose,
  mdiFolderMoveOutline,
  mdiLock,
  mdiPin,
  mdiPinOff,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, queryAll } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { navigate } from "../../common/navigate";
import {
  isUnlocked,
  setLockLocalize,
} from "../../common/locks/element-lock-session";
import { readLocks } from "../../common/locks/element-locks";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { TabSearchRow } from "../../common/tabs/tab-search";
import { groupLockKey, tabLockKey } from "../../common/tabs/tab-locks";
import type { HomeAssistant } from "../../types";
import "../ha-svg-icon";
import { tabRoute } from "../../common/tabs/tab-destinations";
import { currentTabId } from "./destination-tabs";
import { closeTabs, togglePinTab } from "./tab-group-actions";
import { readStripState } from "./tab-group-state";
import { revealTabForSession } from "./tab-search-reveal";

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-search-results": HaTabSearchResults;
  }
}

/**
 * @element ha-tab-search-results
 *
 * @summary
 * The results of a tab search: one row for each tab with its strip, group,
 * pinned and locked state and its visible label. It holds no query: the
 * field that owns the query stays where it is, so acting on a result never
 * loses what was typed. Arrow keys move between rows (Up and Down) and
 * between a row's buttons (Left and Right), Enter on the label opens the tab,
 * and each row can pin or unpin, close, and move the tab into a group (through
 * the picker, by the `tab-group-picker-open` window event). Pin and close
 * change the wide strip only, because only it keeps those lists. A locked tab
 * is marked as locked and opening it asks to unlock first; a result inside a
 * collapsed group is opened with the tab revealed for this visit only, and the
 * group's saved collapsed flag is never changed.
 *
 * Fires `tab-search-activated` (`{ surface, id }`) after a tab was opened, so
 * the surface around the results can close itself.
 */
@customElement("ha-tab-search-results")
export class HaTabSearchResults extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public rows: TabSearchRow[] = [];

  /** The accessible name of the list. */
  @property() public label = "";

  /** Shows the strip's name on each row; for the search across strips. */
  @property({ type: Boolean, attribute: "show-strip" }) public showStrip =
    false;

  /** What to say when the list is empty. */
  @property() public empty = "";

  @query(".live") private _liveRegion?: HTMLElement;

  @query(".main") private _firstMain?: HTMLButtonElement;

  @queryAll(".main") private _mainButtons!: NodeListOf<HTMLButtonElement>;

  private _lang = new LanguageModeController(this);

  private _t(key: string, values?: Record<string, string | number>) {
    return this._lang.text(this.hass.localize, key, values);
  }

  protected render(): TemplateResult {
    const locks = readLocks().locked;
    return html`
      <ul class="list" aria-label=${this.label} @keydown=${this._keydown}>
        ${this.rows.map((row) => this._renderRow(row, locks))}
      </ul>
      ${
        this.rows.length || !this.empty
          ? nothing
          : html`<p class="empty">${this.empty}</p>`
      }
      <span class="live" role="status" aria-live="polite"></span>
    `;
  }

  private _lockedNow(row: TabSearchRow, locks: readonly string[]): boolean {
    if (!row.locked) {
      return false;
    }
    const keys = [tabLockKey(row.surface, row.id)];
    const group = readStripState(this.hass, row.surface).groups.find(
      (item) => item.id === row.groupId
    );
    if (group) {
      keys.push(groupLockKey(row.surface, group.id));
    }
    return keys.some((key) => locks.includes(key) && !isUnlocked(key));
  }

  private _renderRow(row: TabSearchRow, locks: readonly string[]) {
    const strip = row.surface === "main";
    const group = row.groupId
      ? readStripState(this.hass, row.surface).groups.find(
          (item) => item.id === row.groupId
        )
      : undefined;
    const collapsed = group?.collapsed === true;
    return html`<li class=${classMap({ row: true, closed: !row.open })}>
      <button class="main" type="button" .row=${row} @click=${this._activate}>
        <span class="label">${row.label}</span>
        <span class="meta">
          ${this.showStrip ? html`<span>${row.surfaceLabel}</span>` : nothing}
          ${
            row.groupName !== undefined
              ? html`<span
                  >${this._t("ui.page_tabs.searches.in_group", {
                    name:
                      row.groupName || this._t("ui.page_tabs.groups.unnamed"),
                  })}${
                    collapsed
                      ? ` (${this._t("ui.page_tabs.searches.collapsed")})`
                      : ""
                  }</span
                >`
              : nothing
          }
          ${
            row.pinned
              ? html`<span>${this._t("ui.page_tabs.searches.pinned")}</span>`
              : nothing
          }
          ${
            row.locked
              ? html`<span class="lock"
                  ><ha-svg-icon .path=${mdiLock}></ha-svg-icon>${this._t(
                    "ui.page_tabs.searches.locked"
                  )}</span
                >`
              : nothing
          }
          ${
            row.open
              ? nothing
              : html`<span>${this._t("ui.page_tabs.searches.closed")}</span>`
          }
        </span>
      </button>
      <span
        class="actions"
        role="group"
        aria-label=${this._t("ui.page_tabs.searches.actions_for", { name: row.label })}
      >
        ${
          strip
            ? html`<button
                type="button"
                class="icon"
                aria-pressed=${row.pinned ? "true" : "false"}
                aria-label=${this._t(
                  row.pinned
                    ? "ui.page_tabs.searches.unpin"
                    : "ui.page_tabs.searches.pin",
                  { name: row.label }
                )}
                .row=${row}
                @click=${this._pin}
              >
                <ha-svg-icon
                  .path=${row.pinned ? mdiPinOff : mdiPin}
                ></ha-svg-icon>
              </button>`
            : nothing
        }
        <button
          type="button"
          class="icon"
          aria-haspopup="dialog"
          aria-label=${this._t("ui.page_tabs.searches.move_into_group", {
            name: row.label,
          })}
          ?disabled=${row.pinned}
          .row=${row}
          @click=${this._group}
        >
          <ha-svg-icon .path=${mdiFolderMoveOutline}></ha-svg-icon>
        </button>
        ${
          strip
            ? html`<button
                type="button"
                class="icon"
                aria-label=${this._t("ui.page_tabs.searches.close", {
                  name: row.label,
                })}
                ?disabled=${!row.open}
                .row=${row}
                .lockedNow=${this._lockedNow(row, locks)}
                @click=${this._close}
              >
                <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
              </button>`
            : nothing
        }
      </span>
    </li>`;
  }

  private _say(message: string) {
    const live = this._liveRegion;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => {
        live.textContent = message;
      });
    }
  }

  private _rowOf(ev: Event): TabSearchRow {
    return (ev.currentTarget as HTMLElement & { row: TabSearchRow }).row;
  }

  // Opens the tab. A locked tab asks for its credentials first; a tab in a
  // collapsed group is revealed in the strip for this visit only.
  private _activate = (ev: Event) => {
    const row = this._rowOf(ev);
    const anchor = ev.currentTarget as HTMLElement;
    const locks = readLocks().locked;
    if (this._lockedNow(row, locks)) {
      const key = locks.includes(tabLockKey(row.surface, row.id))
        ? tabLockKey(row.surface, row.id)
        : groupLockKey(row.surface, row.groupId ?? "");
      setLockLocalize(this.hass.localize);
      void import("../locks/ha-lock-prompt").then(({ openLockPrompt }) =>
        openLockPrompt(key, anchor, {
          returnTo: anchor,
          onSuccess: () => this._open(row),
        })
      );
      return;
    }
    this._open(row);
  };

  private _open(row: TabSearchRow) {
    const group = row.groupId
      ? readStripState(this.hass, row.surface).groups.find(
          (item) => item.id === row.groupId
        )
      : undefined;
    if (group?.collapsed) {
      revealTabForSession(row.surface, row.id);
    }
    if (row.surface === "main") {
      navigate(tabRoute(row.id));
    } else {
      window.dispatchEvent(
        new CustomEvent("tab-search-activate", {
          detail: { surface: row.surface, id: row.id },
        })
      );
    }
    this.dispatchEvent(
      new CustomEvent("tab-search-activated", {
        detail: { surface: row.surface, id: row.id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _pin = (ev: Event) => {
    const row = this._rowOf(ev);
    const state = readStripState(this.hass, row.surface);
    togglePinTab(state, row.id);
    this._say(
      this._t(row.pinned ? "ui.page_tabs.unpinned" : "ui.page_tabs.pinned", {
        name: row.label,
      })
    );
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent("tab-search-changed", { bubbles: true, composed: true })
    );
  };

  private _group = (ev: Event) => {
    const row = this._rowOf(ev);
    this.dispatchEvent(
      new CustomEvent("tab-group-picker-open", {
        detail: {
          tabIds: [row.id],
          anchor: ev.currentTarget as HTMLElement,
          surface: row.surface,
        },
        bubbles: true,
        composed: true,
      })
    );
  };

  // Closing from a result keeps the query: the field is not touched. The tab
  // in use, a locked tab and a pinned tab are not closed from here.
  private _close = (ev: Event) => {
    const row = this._rowOf(ev);
    const lockedNow = (ev.currentTarget as HTMLElement & { lockedNow: boolean })
      .lockedNow;
    if (row.pinned) {
      this._say(
        this._t("ui.page_tabs.searches.close_pinned", { name: row.label })
      );
      return;
    }
    if (lockedNow || row.locked) {
      this._say(
        this._t("ui.page_tabs.searches.close_locked", { name: row.label })
      );
      return;
    }
    if (row.id === currentTabId(this.hass, row.surface)) {
      this._say(
        this._t("ui.page_tabs.searches.close_current", { name: row.label })
      );
      return;
    }
    closeTabs(row.surface, [row.id]);
    this._say(this._t("ui.page_tabs.searches.closed_tab", { name: row.label }));
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent("tab-search-changed", { bubbles: true, composed: true })
    );
  };

  private _keydown = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement;
    const item = target.closest("li");
    if (!item) {
      return;
    }
    const mains = Array.from(this._mainButtons);
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      const at = mains.indexOf(item.querySelector<HTMLButtonElement>(".main")!);
      const next = at + (ev.key === "ArrowDown" ? 1 : -1);
      ev.preventDefault();
      if (next < 0) {
        this.dispatchEvent(
          new CustomEvent("tab-search-leave-top", {
            bubbles: true,
            composed: true,
          })
        );
      } else {
        mains[Math.min(next, mains.length - 1)]?.focus();
      }
      return;
    }
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      const buttons = Array.from(
        item.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
      );
      const at = buttons.indexOf(target as HTMLButtonElement);
      const forward =
        (ev.key === "ArrowRight") !==
        (getComputedStyle(this).direction === "rtl");
      const next = at + (forward ? 1 : -1);
      if (at !== -1 && next >= 0 && next < buttons.length) {
        ev.preventDefault();
        buttons[next].focus();
      }
    }
  };

  /** Focuses the first row, for the field above to hand focus down. */
  public focusFirst(): void {
    this._firstMain?.focus();
  }

  public static styles = css`
    :host {
      display: block;
    }
    .list {
      display: grid;
      gap: var(--ha-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      border-radius: var(--ha-border-radius-xl, 16px);
    }
    .row:hover {
      background: var(--secondary-background-color);
    }
    .row.closed .label {
      color: var(--secondary-text-color);
    }
    .main {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      display: grid;
      gap: 2px;
      padding: var(--ha-space-2) var(--ha-space-3);
      border: 0;
      border-radius: inherit;
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .label {
      overflow-wrap: anywhere;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .lock {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .lock ha-svg-icon {
      --mdc-icon-size: 14px;
    }
    .actions {
      display: flex;
      flex: none;
    }
    .icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--primary-text-color);
      cursor: pointer;
    }
    .icon:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .icon:hover:not(:disabled) {
      background: var(--secondary-background-color);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .empty {
      margin: 0;
      padding: var(--ha-space-2) var(--ha-space-3);
      color: var(--secondary-text-color);
    }
    .live {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `;
}
