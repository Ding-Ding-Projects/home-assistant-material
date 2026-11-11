/* eslint-disable lit/prefer-query-decorators -- the first button is found by what is shown now */
import { mdiLock, mdiLifebuoy } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { readLocks } from "../../common/locks/element-locks";
import {
  clearStartupLock,
  startupLockKeys,
} from "../../common/locks/startup-lock";
import "../ha-svg-icon";
import { openSupportDesk } from "../support/ha-support-desk";
import { openLockPrompt } from "./ha-lock-prompt";
import { lockText } from "./lock-text";

/**
 * Covers the interface when the app starts, for the locks that ask for it,
 * until each of them is opened. It covers the interface in this browser
 * only: nobody is signed out and nothing on the server changes. It is a
 * speed bump for fun, not security. The rest of the page cannot be reached
 * with the keyboard while it is shown. Its prompts and the support desk
 * float above it.
 */
@customElement("ha-lock-start")
export class HaLockStart extends LitElement {
  // Draws the wording again when the language mode changes.
  protected _languageMode = new LanguageModeController(this);

  @state() private _keys: string[] = startupLockKeys(readLocks());

  private _inert: HTMLElement[] = [];

  public connectedCallback(): void {
    super.connectedCallback();
    this._keys = startupLockKeys(readLocks());
    this._holdPage();
    this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>("button.unlock")?.focus();
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._releasePage();
  }

  /** Keeps keyboard and assistive technology out of what is covered. */
  private _holdPage(): void {
    this._inert = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== this &&
        !element.inert &&
        !["SCRIPT", "STYLE"].includes(element.tagName)
    );
    this._inert.forEach((element) => {
      element.inert = true;
    });
  }

  private _releasePage(): void {
    this._inert.forEach((element) => {
      element.inert = false;
    });
    this._inert = [];
  }

  protected render(): TemplateResult {
    return html`<div
      class="cover"
      role="region"
      aria-label=${lockText("start_region")}
    >
      <div class="card">
        <ha-svg-icon class="mark" .path=${mdiLock}></ha-svg-icon>
        <h1>${lockText("start_heading")}</h1>
        <p>${lockText("start_note")}</p>
        <div class="actions">
          ${this._keys.map((key) => {
            const record = readLocks().records?.[key];
            return html`<button
              type="button"
              class="unlock"
              data-key=${key}
              @click=${this._unlock}
            >
              ${
                this._keys.length > 1
                  ? lockText("start_unlock_named", {
                      name: record?.label || key,
                    })
                  : lockText("unlock")
              }
            </button>`;
          })}
        </div>
        <button type="button" class="link" @click=${this._forgot}>
          <ha-svg-icon .path=${mdiLifebuoy}></ha-svg-icon>
          ${lockText("forgot")}
        </button>
        <p class="note">${lockText("start_scope")}</p>
        <p class="note">${lockText("toy_note")}</p>
      </div>
    </div>`;
  }

  private _unlock(ev: Event): void {
    const button = ev.currentTarget as HTMLElement;
    const key = button.dataset.key ?? "";
    // The cover is lifted; the lock itself is not opened for anything else.
    openLockPrompt(key, button, {
      grant: false,
      returnTo: button,
      onSuccess: () => {
        clearStartupLock(key);
        this._keys = startupLockKeys(readLocks());
        if (!this._keys.length) {
          this.remove();
        } else {
          this.updateComplete.then(() => {
            this.renderRoot
              .querySelector<HTMLElement>("button.unlock")
              ?.focus();
          });
        }
      },
    });
  }

  private _forgot(ev: Event): void {
    openSupportDesk(ev.currentTarget as Element);
  }

  static styles: CSSResultGroup = css`
    :host {
      display: contents;
    }
    .cover {
      position: fixed;
      inset: 0;
      /* Below the prompt and the support desk, which are at 1000. */
      z-index: 999;
      display: grid;
      place-items: center;
      padding: var(--ha-space-4);
      overflow: auto;
      background: var(--primary-background-color, #fafafa);
      color: var(--primary-text-color);
    }
    .card {
      display: grid;
      justify-items: center;
      gap: var(--ha-space-3);
      width: min(100%, 420px);
      text-align: center;
    }
    .mark {
      --mdc-icon-size: 56px;
      color: var(--primary-color);
    }
    h1 {
      margin: 0;
      font-size: var(--ha-font-size-2xl, 1.5rem);
      overflow-wrap: anywhere;
    }
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .actions {
      display: grid;
      gap: var(--ha-space-2);
      width: 100%;
    }
    button {
      min-height: 48px;
      padding: 0 var(--ha-space-6);
      border: 0;
      border-radius: var(--ha-border-radius-pill, 24px);
      font: inherit;
      cursor: pointer;
    }
    button.unlock {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button.link {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      background: none;
      color: var(--primary-color);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-start": HaLockStart;
  }
}

/** Covers the interface. Only one cover at a time. */
export const showStartupLock = (): void => {
  if (document.querySelector("ha-lock-start")) {
    return;
  }
  document.body.append(document.createElement("ha-lock-start"));
};
