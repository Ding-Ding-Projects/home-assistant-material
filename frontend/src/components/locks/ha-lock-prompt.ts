/* eslint-disable lit/prefer-query-decorators -- the fields asked for depend on the step shown */
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import {
  grantUnlock,
  isUnlocked,
} from "../../common/locks/element-lock-session";
import {
  readLocks,
  writeLocks,
  withUpdatedRecord,
} from "../../common/locks/element-locks";
import type {
  LockFactor,
  LockRecord,
} from "../../common/locks/lock-credentials";
import {
  checkFactor,
  finishAttempt,
  POLICY_FACTORS,
} from "../../common/locks/lock-credentials";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "./ha-lock-pin-entry";
import type { HaLockPinEntry } from "./ha-lock-pin-entry";
import { anchorStyle, lockText } from "./lock-text";

export interface LockPromptOptions {
  /** Opens the lock for its chosen time on success. On by default. */
  grant?: boolean;
  /** Called after every factor was right. */
  onSuccess?: () => void;
  /** Where focus goes back to; the element itself when left out. */
  returnTo?: HTMLElement;
}

/**
 * The unlock prompt of one lock. It floats beside the element that was
 * pressed, takes no focus trap and does not darken the page. The factors of
 * the lock's policy are asked one by one in their order; a wrong answer
 * starts the attempt again and spends the one budget the lock has.
 */
@customElement("ha-lock-prompt")
export class HaLockPrompt extends LitElement {
  @property({ attribute: false }) public lockKey = "";

  @property({ attribute: false }) public anchor?: Element;

  @property({ attribute: false }) public options: LockPromptOptions = {};

  @state() private _step = 0;

  @state() private _message = "";

  @state() private _busy = false;

  @state() private _now = Date.now();

  private _timer?: number;

  private _returnTo?: HTMLElement;

  @query(".panel") private _panel?: HTMLElement;

  public connectedCallback(): void {
    super.connectedCallback();
    const active = document.activeElement;
    this._returnTo =
      this.options.returnTo ??
      (active instanceof HTMLElement && active !== document.body
        ? active
        : (this.anchor as HTMLElement | undefined));
    this._timer = window.setInterval(() => {
      this._now = Date.now();
    }, 1000);
    window.addEventListener("keydown", this._escape, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
    window.removeEventListener("keydown", this._escape, true);
  }

  private get _record(): LockRecord | undefined {
    return readLocks().records?.[this.lockKey];
  }

  protected firstUpdated(_changed: PropertyValues): void {
    this._focusFirst();
  }

  private _focusFirst(): void {
    this.updateComplete.then(() => {
      const target = this.renderRoot.querySelector<HTMLElement>(
        "ha-lock-pin-entry, ha-input, .close"
      );
      (target as HTMLElement | null)?.focus?.();
    });
  }

  private _escape = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    }
  };

  private _close(): void {
    const target = this._returnTo;
    this.remove();
    if (target?.isConnected) {
      target.focus?.();
    }
  }

  private get _waitSeconds(): number {
    const record = this._record;
    return record
      ? Math.max(0, Math.ceil((record.blockedUntil - this._now) / 1000))
      : 0;
  }

  protected render(): TemplateResult {
    const record = this._record;
    const style = anchorStyle(this.anchor);
    return html`
      <div
        class="panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="title"
        style=${styleMap(style)}
      >
        <h2 id="title">
          ${lockText("unlock_title", { name: record?.label ?? "" })}
        </h2>
        ${record ? this._renderSteps(record) : this._renderLegacy()}
        <p class="note">${lockText("toy_note")}</p>
        <p class="note">${lockText("recovery")}</p>
        ${
          record
            ? nothing
            : html`<button type="button" class="close" @click=${this._close}>
                ${lockText("close")}
              </button>`
        }
      </div>
    `;
  }

  private _renderLegacy(): TemplateResult {
    return html`<p>${lockText("legacy_lock")}</p>`;
  }

  private _renderSteps(record: LockRecord): TemplateResult {
    const factors = POLICY_FACTORS[record.policy];
    const factor = factors[this._step];
    const wait = this._waitSeconds;
    return html`
      ${
        factors.length > 1
          ? html`<ol class="steps">
              ${factors.map(
                (item, index) =>
                  html`<li
                    aria-current=${index === this._step ? "step" : "false"}
                    class=${index < this._step ? "done" : ""}
                  >
                    ${lockText(`factor_${item}`)}
                  </li>`
              )}
            </ol>`
          : nothing
      }
      ${
        factor === "pin"
          ? html`<ha-lock-pin-entry
              .submitLabel=${
                this._step === factors.length - 1
                  ? lockText("unlock")
                  : lockText("next")
              }
              .disabled=${this._busy || wait > 0}
              @lock-pin-submit=${this._pinSubmitted}
              @lock-pin-cancel=${this._close}
            ></ha-lock-pin-entry>`
          : html`<form @submit=${this._textSubmitted} novalidate>
              <ha-input
                name="value"
                type=${factor === "password" ? "password" : "text"}
                inputmode=${factor === "totp" ? "numeric" : "text"}
                autocomplete="off"
                maxlength=${factor === "totp" ? 6 : 200}
                .label=${lockText(`factor_${factor}_label`)}
                ?disabled=${this._busy || wait > 0}
              ></ha-input>
              <div class="buttons">
                <button type="button" @click=${this._close}>
                  ${lockText("cancel")}
                </button>
                <button
                  type="submit"
                  class="primary"
                  ?disabled=${this._busy || wait > 0}
                >
                  ${
                    this._step === factors.length - 1
                      ? lockText("unlock")
                      : lockText("next")
                  }
                </button>
              </div>
            </form>`
      }
      ${
        wait > 0
          ? html`<p class="error" role="status">
              ${lockText("wait", { seconds: wait })}
            </p>`
          : nothing
      }
      ${
        this._message
          ? html`<p class="error" role="alert">${this._message}</p>`
          : nothing
      }
    `;
  }

  private _pinSubmitted(ev: CustomEvent<{ value: string }>): void {
    void this._submit("pin", ev.detail.value);
  }

  private _textSubmitted(ev: SubmitEvent): void {
    ev.preventDefault();
    const input = (ev.currentTarget as HTMLFormElement).querySelector<HaInput>(
      "ha-input"
    );
    const value = input?.value ?? "";
    if (input) {
      input.value = "";
    }
    const record = this._record;
    if (!record) {
      return;
    }
    void this._submit(POLICY_FACTORS[record.policy][this._step], value);
  }

  private async _submit(factor: LockFactor, value: string): Promise<void> {
    const record = this._record;
    if (!record || this._busy) {
      return;
    }
    this._busy = true;
    try {
      const result = await checkFactor(record, factor, value, Date.now());
      let saved = result.record;
      if (result.outcome === "ok") {
        const last = this._step >= POLICY_FACTORS[record.policy].length - 1;
        if (!last) {
          this._message = "";
          this._step += 1;
          this._focusFirst();
          return;
        }
        saved = finishAttempt(saved);
        writeLocks(withUpdatedRecord(readLocks(), saved));
        if (this.options.grant !== false && !isUnlocked(record.key)) {
          grantUnlock(record.key, record.duration);
        }
        const done = this.options.onSuccess;
        this._close();
        done?.();
        return;
      }
      writeLocks(withUpdatedRecord(readLocks(), saved));
      this._step = 0;
      this._now = Date.now();
      // Honest, and the same wherever the try was wrong or has to wait.
      this._message =
        result.outcome === "wait"
          ? ""
          : lockText("wrong", { count: saved.failures });
      this._panel?.querySelector<HaLockPinEntry>("ha-lock-pin-entry")?.clear();
      this._focusFirst();
    } finally {
      this._busy = false;
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: contents;
    }
    .panel {
      position: fixed;
      z-index: 1000;
      box-sizing: border-box;
      overflow: auto;
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      border: 1px solid var(--divider-color);
      display: grid;
      gap: var(--ha-space-2);
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-l, 1.1rem);
      overflow-wrap: anywhere;
    }
    .note {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .error {
      margin: 0;
      color: var(--error-color);
    }
    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .steps li {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
    }
    .steps li[aria-current="step"] {
      border-color: var(--primary-color);
      color: var(--primary-text-color);
      font-weight: 600;
    }
    .steps li.done {
      text-decoration: line-through;
    }
    .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    button {
      min-height: 48px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-prompt": HaLockPrompt;
  }
}

/** Opens the unlock prompt of a lock, beside an element. One at a time. */
export const openLockPrompt = (
  key: string,
  anchor: Element,
  options: LockPromptOptions = {}
): void => {
  document.querySelectorAll("ha-lock-prompt").forEach((old) => old.remove());
  const prompt = document.createElement("ha-lock-prompt");
  prompt.lockKey = key;
  prompt.anchor = anchor;
  prompt.options = options;
  document.body.append(prompt);
};
