import { mdiLock, mdiLockOpenVariantOutline } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  applyElementLocks,
  isUnlocked,
  lockAgain,
  subscribeUnlocks,
} from "../../common/locks/element-lock-session";
import type { LockStore } from "../../common/locks/element-locks";
import {
  readLocks,
  subscribeLocks,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import { searchMatcher } from "../../common/regex/filter";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import { openLockPrompt } from "./ha-lock-prompt";
import { openLockWizard } from "./ha-lock-wizard";
import { lockText } from "./lock-text";

/**
 * Every lock in this browser as a list: searchable, with each lock
 * unlocked, locked again, edited or removed on its own. Editing and
 * removing ask for that lock's own credentials first.
 */
@customElement("ha-lock-list")
export class HaLockList extends LitElement {
  @state() private _store: LockStore = readLocks();

  @state() private _query = "";

  private _unsubscribe?: () => void;

  private _unsubscribeUnlocks?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribeLocks((store) => {
      this._store = store;
    });
    this._unsubscribeUnlocks = subscribeUnlocks(() => this.requestUpdate());
    this._store = readLocks();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribeUnlocks?.();
  }

  protected render(): TemplateResult {
    const matches = searchMatcher(this._query);
    const rows = this._store.locked.filter((key) => {
      const record = this._store.records?.[key];
      return matches(
        record?.label,
        key,
        record ? lockText(`policy_${record.policy}`) : lockText("legacy_name")
      );
    });
    return html`
      <h3>${lockText("list_title")}</h3>
      <ha-input-search
        appearance="outlined"
        .placeholder=${lockText("list_search")}
        .accessibleLabel=${lockText("list_search")}
        .value=${this._query}
        @input=${this._search}
      ></ha-input-search>
      ${
        rows.length
          ? html`<ul>
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
    `;
  }

  private _renderRow(key: string): TemplateResult {
    const record = this._store.records?.[key];
    const open = !!record && isUnlocked(key);
    return html`<li data-key=${key}>
      <ha-svg-icon
        .path=${open ? mdiLockOpenVariantOutline : mdiLock}
      ></ha-svg-icon>
      <div class="text">
        <span class="name">${record?.label || key}</span>
        <span class=${classMap({ note: true, open })}>
          ${
            record
              ? html`${lockText(`policy_${record.policy}`)} ·
                ${open ? lockText("state_open") : lockText("state_locked")}`
              : lockText("legacy_name")
          }
        </span>
      </div>
      ${
        record
          ? html`<div class="actions">
              ${
                open
                  ? html`<button
                      type="button"
                      data-key=${key}
                      @click=${this._lockAgain}
                    >
                      ${lockText("lock_again")}
                    </button>`
                  : html`<button
                      type="button"
                      data-key=${key}
                      @click=${this._unlock}
                    >
                      ${lockText("unlock")}
                    </button>`
              }
              <button type="button" data-key=${key} @click=${this._edit}>
                ${lockText("edit")}
              </button>
              <button
                type="button"
                class="danger"
                data-key=${key}
                @click=${this._remove}
              >
                ${lockText("remove")}
              </button>
            </div>`
          : nothing
      }
    </li>`;
  }

  private _search(ev: Event): void {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _row(ev: Event): HTMLElement {
    return (ev.currentTarget as HTMLElement).closest("li") as HTMLElement;
  }

  private _lockAgain(ev: Event): void {
    lockAgain((ev.currentTarget as HTMLElement).dataset.key ?? "");
  }

  private _unlock(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key ?? "";
    openLockPrompt(key, this._row(ev), {
      returnTo: ev.currentTarget as HTMLElement,
    });
  }

  private _edit(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key ?? "";
    const row = this._row(ev);
    const button = ev.currentTarget as HTMLElement;
    const record = this._store.records?.[key];
    openLockPrompt(key, row, {
      grant: false,
      returnTo: button,
      onSuccess: () =>
        openLockWizard({
          key,
          label: record?.label || key,
          anchor: row,
        }),
    });
  }

  private _remove(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key ?? "";
    const row = this._row(ev);
    openLockPrompt(key, row, {
      grant: false,
      returnTo: ev.currentTarget as HTMLElement,
      onSuccess: () => {
        lockAgain(key);
        writeLocks(withLock(readLocks(), key, false));
        applyElementLocks();
      },
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    h3 {
      margin: var(--ha-space-3) 0 var(--ha-space-2);
    }
    ul {
      list-style: none;
      margin: var(--ha-space-2) 0 0;
      padding: 0;
      display: grid;
      gap: var(--ha-space-2);
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
    }
    .text {
      display: grid;
      flex: 1 1 140px;
      min-width: 0;
    }
    .name {
      overflow-wrap: anywhere;
    }
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
      margin: 0;
    }
    .note.open {
      color: var(--success-color);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    button {
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    button.danger {
      color: var(--error-color);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-list": HaLockList;
  }
}
