/* eslint-disable lit/prefer-query-decorators -- the row and the first key are found by what is shown now */
import {
  mdiDotsVertical,
  mdiFileDocumentOutline,
  mdiInformationOutline,
  mdiLock,
  mdiLockPlusOutline,
  mdiLockOpenVariantOutline,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  applyElementLocks,
  isUnlocked,
  lockAgain,
  subscribeUnlocks,
  unlockMinutesLeft,
} from "../../common/locks/element-lock-session";
import type { LockStore } from "../../common/locks/element-locks";
import {
  pageLockKey,
  readLocks,
  subscribeLocks,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import { isPageLockKey, lockPageName } from "../../common/locks/lock-where";
import { searchMatcher } from "../../common/regex/filter";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import { openSupportDesk } from "../support/ha-support-desk";
import { openLockPrompt } from "./ha-lock-prompt";
import { openLockWizard } from "./ha-lock-wizard";
import { isNarrow, lockText, onNarrowChange } from "./lock-text";

type Filter = "locked" | "open" | "legacy";

/**
 * Every lock in this browser as a list: searchable, filtered by state and by
 * older locks, with each lock unlocked, locked again, edited or removed on
 * its own. Editing and removing ask for that lock's own credentials first.
 * Wide, the actions sit in each row and several rows can be chosen; on a
 * phone they sit in a sheet opened from the row's menu.
 */
@customElement("ha-lock-list")
export class HaLockList extends LitElement {
  // Draws the wording again when the language mode changes.
  protected _languageMode = new LanguageModeController(this);

  @state() private _store: LockStore = readLocks();

  @state() private _query = "";

  @state() private _filters: Filter[] = [];

  @state() private _selected: string[] = [];

  @state() private _menuKey?: string;

  @state() private _narrow = isNarrow();

  @state() private _howTo = false;

  private _unsubscribe?: () => void;

  private _unsubscribeUnlocks?: () => void;

  private _stopNarrow?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribeLocks((store) => {
      this._store = store;
    });
    this._unsubscribeUnlocks = subscribeUnlocks(() => this.requestUpdate());
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
    });
    this._store = readLocks();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribeUnlocks?.();
    this._stopNarrow?.();
  }

  /** Older locks go last. */
  private get _rows(): string[] {
    const matches = searchMatcher(this._query);
    const rows = this._store.locked.filter((key) => {
      const record = this._store.records?.[key];
      const open = isUnlocked(key);
      if (this._filters.length) {
        const kinds: Filter[] = [
          record ? (open ? "open" : "locked") : "legacy",
        ];
        if (!record) {
          kinds.push("locked");
        }
        if (!this._filters.some((filter) => kinds.includes(filter))) {
          return false;
        }
      }
      return matches(
        record?.label,
        key,
        lockPageName(this._store, key),
        record ? lockText(`policy_${record.policy}`) : lockText("legacy_name")
      );
    });
    return [
      ...rows.filter((key) => this._store.records?.[key]),
      ...rows.filter((key) => !this._store.records?.[key]),
    ];
  }

  protected render(): TemplateResult {
    const rows = this._rows;
    const hasLegacy = rows.some((key) => !this._store.records?.[key]);
    const selected = this._selected.filter((key) => rows.includes(key));
    return html`
      <div class="title-row">
        <h3>${lockText("list_title")}</h3>
        <button
          type="button"
          class="tonal lock-something"
          aria-expanded=${this._howTo ? "true" : "false"}
          @click=${this._toggleHowTo}
        >
          <ha-svg-icon .path=${mdiLockPlusOutline}></ha-svg-icon>
          ${lockText("lock_something")}
        </button>
      </div>
      ${this._howTo ? this._renderHowTo() : nothing}
      <div class="tools">
        <ha-input-search
          appearance="outlined"
          .placeholder=${lockText("list_search")}
          .accessibleLabel=${lockText("list_search")}
          .value=${this._query}
          @input=${this._search}
        ></ha-input-search>
        <div class="filters">
          ${(
            [
              ["locked", "state_locked"],
              ["open", "state_open"],
              ["legacy", "filter_legacy"],
            ] as const
          ).map(
            ([filter, text]) =>
              html`<button
                type="button"
                class=${classMap({
                  chip: true,
                  on: this._filters.includes(filter),
                })}
                aria-pressed=${this._filters.includes(filter) ? "true" : "false"}
                data-filter=${filter}
                @click=${this._toggleFilter}
              >
                ${lockText(text)}
              </button>`
          )}
        </div>
      </div>
      ${!this._narrow && selected.length ? this._renderBulk(selected) : nothing}
      ${
        rows.length
          ? html`${
                this._narrow
                  ? nothing
                  : html`<div class="head" aria-hidden="true">
                      <span class="head-element"
                        >${lockText("col_element")}</span
                      >
                      <span>${lockText("col_unlocks")}</span>
                      <span>${lockText("col_state")}</span>
                      <span>${lockText("actions_title")}</span>
                    </div>`
              }
              <ul>
                ${rows.map((key) => this._renderRow(key))}
              </ul>`
          : html`<p class="note">
              ${
                this._store.locked.length
                  ? lockText("list_no_match")
                  : lockText("list_empty")
              }
            </p>`
      }
      ${
        hasLegacy
          ? html`<p class="callout">
              <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
              <span>${lockText("legacy_note")}</span>
            </p>`
          : nothing
      }
      <button type="button" class="text support" @click=${this._support}>
        ${lockText("forgot")}
      </button>
      ${this._narrow && this._menuKey ? this._renderMenu(this._menuKey) : nothing}
    `;
  }

  private _renderBulk(selected: string[]): TemplateResult {
    const anyOpen = selected.some((key) => isUnlocked(key));
    const anyLocked = selected.some((key) => !isUnlocked(key));
    return html`<div class="bulk" role="group">
      <span>${lockText("selected_count", { count: selected.length })}</span>
      ${
        anyLocked
          ? html`<button type="button" @click=${this._bulkUnlock}>
              ${lockText("unlock")}
            </button>`
          : nothing
      }
      ${
        anyOpen
          ? html`<button type="button" @click=${this._bulkLockAgain}>
              ${lockText("lock_again")}
            </button>`
          : nothing
      }
      <button type="button" class="danger" @click=${this._bulkRemove}>
        ${lockText("remove")}
      </button>
      <button type="button" class="text" @click=${this._clearSelection}>
        ${lockText("select_clear")}
      </button>
    </div>`;
  }

  /** What kind of thing it is, and where it is. */
  private _kindText(key: string): string {
    if (isPageLockKey(key)) {
      return lockText("kind_page");
    }
    const page = lockPageName(this._store, key);
    return page
      ? lockText("kind_on_page", { kind: lockText("kind_element"), page })
      : lockText("kind_element");
  }

  private _support(ev: Event): void {
    openSupportDesk(ev.currentTarget as Element);
  }

  private _toggleHowTo(): void {
    this._howTo = !this._howTo;
  }

  /** Locking an element starts on the element itself; the page can be locked from here. */
  private _renderHowTo(): TemplateResult {
    return html`<div class="callout howto">
      <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
      <div>
        <p>${lockText("lock_element_howto")}</p>
        <button type="button" class="text" @click=${this._lockPage}>
          ${lockText("lock_this_page")}
        </button>
      </div>
    </div>`;
  }

  private _lockPage(ev: Event): void {
    const key = pageLockKey(window.location.pathname);
    if (this._store.locked.includes(key)) {
      return;
    }
    openLockWizard({
      key,
      label: document.title || key,
      page: document.title,
      anchor: ev.currentTarget as Element,
    });
  }

  private _rowName(key: string): string {
    return (
      this._store.records?.[key]?.label || lockPageName(this._store, key) || key
    );
  }

  private _stateText(key: string): string {
    const left = unlockMinutesLeft(key);
    return left === undefined
      ? lockText("state_open")
      : lockText("state_open_minutes", { minutes: left });
  }

  private _renderRow(key: string): TemplateResult {
    const record = this._store.records?.[key];
    const open = isUnlocked(key);
    return html`<li data-key=${key}>
      ${
        this._narrow
          ? nothing
          : html`<input
              type="checkbox"
              class="pick"
              data-key=${key}
              .checked=${this._selected.includes(key)}
              aria-label=${lockText("select_row", {
                name: this._rowName(key),
              })}
              @change=${this._pick}
            />`
      }
      <span class="icon">
        <ha-svg-icon
          .path=${
            open
              ? mdiLockOpenVariantOutline
              : key.startsWith("page:")
                ? mdiFileDocumentOutline
                : mdiLock
          }
        ></ha-svg-icon>
      </span>
      <div class="text">
        <span class="name">${record?.label || this._rowName(key)}</span>
        <span class="note">${this._kindText(key)}</span>
        ${
          record?.onStart
            ? html`<span class="note">${lockText("tag_on_start")}</span>`
            : nothing
        }
      </div>
      <div class="unlocks">
        ${
          record
            ? lockText(`policy_${record.policy}`)
            : html`${lockText("shared_pin")}
                <span class="tag">${lockText("legacy_name")}</span>`
        }
      </div>
      <span class=${classMap({ state: true, open })}>
        ${open ? this._stateText(key) : lockText("state_locked")}
      </span>
      ${
        this._narrow
          ? html`<button
              type="button"
              class="menu"
              data-key=${key}
              aria-label=${lockText("row_actions", {
                name: record?.label || this._rowName(key),
              })}
              @click=${this._openMenu}
            >
              <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
            </button>`
          : html`<div class="actions">${this._actions(key, open)}</div>`
      }
    </li>`;
  }

  /** The first action changes with the state; the others follow. */
  private _actions(key: string, open: boolean): TemplateResult {
    return html`${
        open
          ? html`<button
              type="button"
              class="tonal"
              data-key=${key}
              @click=${this._lockAgain}
            >
              ${lockText("lock_again")}
            </button>`
          : html`<button
              type="button"
              class="tonal"
              data-key=${key}
              @click=${this._unlock}
            >
              ${lockText("unlock")}
            </button>`
      }
      ${
        this._store.records?.[key]
          ? html`<button
              type="button"
              class="text"
              data-key=${key}
              @click=${this._edit}
            >
              ${lockText("edit")}
            </button>`
          : nothing
      }
      <button
        type="button"
        class="text danger"
        data-key=${key}
        @click=${this._remove}
      >
        ${lockText("remove")}
      </button>`;
  }

  private _renderMenu(key: string): TemplateResult {
    const record = this._store.records?.[key];
    const open = isUnlocked(key);
    return html`<div class="scrim" @click=${this._closeMenu}></div>
      <div
        class="sheet"
        role="dialog"
        aria-label=${lockText("row_actions", { name: this._rowName(key) })}
        @click=${this._menuClick}
      >
        <h4>${this._rowName(key)}</h4>
        ${this._actions(key, open)}
        ${
          record
            ? nothing
            : html`<p class="note">${lockText("legacy_edit_note")}</p>`
        }
      </div>`;
  }

  private _search(ev: Event): void {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _toggleFilter(ev: Event): void {
    const filter = (ev.currentTarget as HTMLElement).dataset.filter as Filter;
    this._filters = this._filters.includes(filter)
      ? this._filters.filter((item) => item !== filter)
      : [...this._filters, filter];
  }

  private _pick(ev: Event): void {
    const input = ev.currentTarget as HTMLInputElement;
    const key = input.dataset.key ?? "";
    this._selected = input.checked
      ? [...this._selected, key]
      : this._selected.filter((item) => item !== key);
  }

  private _clearSelection(): void {
    this._selected = [];
  }

  private _openMenu(ev: Event): void {
    this._menuKey = (ev.currentTarget as HTMLElement).dataset.key;
  }

  private _closeMenu(): void {
    this._menuKey = undefined;
  }

  /** A press on an action inside the sheet closes it. */
  private _menuClick(ev: Event): void {
    if ((ev.target as HTMLElement).closest("button")) {
      // The action reads its anchor before the sheet is gone.
      window.setTimeout(() => this._closeMenu(), 0);
    }
  }

  private _row(key: string): HTMLElement {
    return (this.renderRoot.querySelector(
      `li[data-key="${CSS.escape(key)}"]`
    ) ?? this) as HTMLElement;
  }

  private _lockAgain(ev: Event): void {
    lockAgain((ev.currentTarget as HTMLElement).dataset.key ?? "");
  }

  private _unlock(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key ?? "";
    openLockPrompt(key, this._row(key), {
      returnTo: ev.currentTarget as HTMLElement,
      title: lockText("unlock_title", { name: this._rowName(key) }),
    });
  }

  private _edit(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key ?? "";
    const row = this._row(key);
    const record = this._store.records?.[key];
    openLockPrompt(key, row, {
      grant: false,
      returnTo: ev.currentTarget as HTMLElement,
      onSuccess: () =>
        openLockWizard({
          key,
          label: record?.label || key,
          page: record?.page,
          anchor: row,
        }),
    });
  }

  private _removeKey(key: string, onDone?: () => void): void {
    openLockPrompt(key, this._row(key), {
      grant: false,
      title: lockText("remove_title", { name: this._rowName(key) }),
      onSuccess: () => {
        lockAgain(key);
        writeLocks(withLock(readLocks(), key, false));
        applyElementLocks();
        onDone?.();
      },
    });
  }

  private _remove(ev: Event): void {
    this._removeKey((ev.currentTarget as HTMLElement).dataset.key ?? "");
  }

  private _selectedKeys(): string[] {
    return this._selected.filter((key) => this._rows.includes(key));
  }

  private _bulkLockAgain(): void {
    this._selectedKeys().forEach((key) => lockAgain(key));
  }

  /** Each lock asks for its own credentials, one after the other. */
  private _chain(
    keys: string[],
    step: (key: string, next: () => void) => void
  ) {
    const [first, ...rest] = keys;
    if (first === undefined) {
      return;
    }
    step(first, () => this._chain(rest, step));
  }

  private _bulkUnlock(): void {
    this._chain(
      this._selectedKeys().filter((key) => !isUnlocked(key)),
      (key, next) =>
        openLockPrompt(key, this._row(key), {
          onSuccess: next,
          title: lockText("unlock_title", { name: this._rowName(key) }),
        })
    );
  }

  private _bulkRemove(): void {
    this._chain(this._selectedKeys(), (key, next) =>
      this._removeKey(key, next)
    );
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    h3 {
      margin: var(--ha-space-3) 0 var(--ha-space-2);
    }
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .lock-something {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .howto p {
      margin: 0 0 var(--ha-space-1);
    }
    .support {
      margin-top: var(--ha-space-2);
    }
    .head {
      display: grid;
      grid-template-columns: var(--lock-cols);
      gap: var(--ha-space-3);
      margin-top: var(--ha-space-2);
      padding: 0 var(--ha-space-3);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
      font-weight: 500;
    }
    .head-element {
      grid-column: 1 / 4;
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .tools ha-input-search {
      flex: 1 1 220px;
      min-width: 0;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    button {
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-pill, 24px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    button.chip {
      min-height: 36px;
      background: none;
    }
    button.chip.on {
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
      border-color: transparent;
    }
    button.tonal {
      border-color: transparent;
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    }
    button.text {
      border-color: transparent;
      background: none;
      color: var(--primary-color);
    }
    button.danger {
      color: var(--error-color);
    }
    button.menu {
      width: 44px;
      padding: 0;
      border-color: transparent;
      background: none;
    }
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .bulk {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    ul {
      list-style: none;
      margin: var(--ha-space-2) 0 0;
      padding: 0;
      display: grid;
      gap: var(--ha-space-2);
    }
    :host {
      --lock-cols: 20px 40px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr)
        14rem;
    }
    li {
      display: grid;
      grid-template-columns: var(--lock-cols);
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .pick {
      width: 20px;
      height: 20px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--card-background-color, #fff);
    }
    .text {
      display: grid;
      min-width: 0;
    }
    .name {
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
      margin: 0;
    }
    .tag {
      display: inline-block;
      margin-inline-start: var(--ha-space-1);
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--warning-color, #f2c744);
      color: #000;
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .state {
      justify-self: start;
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--divider-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .state.open {
      background: color-mix(in srgb, var(--success-color) 28%, transparent);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .callout {
      display: flex;
      gap: var(--ha-space-3);
      align-items: flex-start;
      margin: var(--ha-space-3) 0 0;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }
    .callout ha-svg-icon {
      flex: none;
    }
    /* A phone: the row is two lines, with its actions in a sheet. */
    :host([narrow]) li,
    li:has(.menu) {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    li:has(.menu) .unlocks {
      grid-column: 2;
      grid-row: 2;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    li:has(.menu) .state {
      grid-column: 2;
      grid-row: 3;
    }
    li:has(.menu) .menu {
      grid-column: 3;
      grid-row: 1;
    }
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.42);
    }
    .sheet {
      position: fixed;
      z-index: 1001;
      inset: auto 0 0 0;
      display: grid;
      gap: var(--ha-space-2);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl) var(--ha-border-radius-3xl) 0 0;
      background: var(--card-background-color, #fff);
    }
    .sheet h4 {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .sheet button {
      justify-content: flex-start;
      text-align: start;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-list": HaLockList;
  }
}
