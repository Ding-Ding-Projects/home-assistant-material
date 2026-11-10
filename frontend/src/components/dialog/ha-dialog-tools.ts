import type { ContextType } from "@lit/context";
import { mdiFormatPaint, mdiLock, mdiLockOpenVariantOutline } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import {
  isLocked,
  readLocks,
  subscribeLocks,
  tryPin,
  UNLOCK_HOLD_MS,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import { FIND_LIMIT, PageFinder } from "../../common/page/find-in-page";
import { internationalizationContext } from "../../data/context";
import "../ha-button";
import "../ha-icon-button";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";

declare global {
  interface HASSDomEvents {
    /** A dialog was locked or unlocked with its tools. */
    "dialog-lock-changed": { locked: boolean };
  }
}

/** Wrappers a dialog is built from; the dialog itself is what holds them. */
const WRAPPERS = new Set(["ha-dialog", "ha-adaptive-dialog"]);

/**
 * The tools at the foot of a dialog: search this dialog, edit appearance
 * and lock. It works on the dialog it is placed in.
 *
 * A locked dialog can be read and closed, but nothing in it can be
 * changed. Unlocking takes a hold, or the PIN when one is set; the PIN is
 * asked for here, because nothing outside an open dialog takes input.
 */
@customElement("ha-dialog-tools")
export class HaDialogTools extends LitElement {
  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _query = "";

  @state() private _total = 0;

  @state() private _position = 0;

  @state() private _locked = false;

  @state() private _holding = false;

  @state() private _askPin = false;

  @state() private _message = "";

  private _finder = new PageFinder();

  private _findTimer?: number;

  private _holdTimer?: number;

  private _justUnlocked = false;

  private _unsubscribe?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribeLocks(this._check);
    this._check();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    window.clearTimeout(this._findTimer);
    window.clearTimeout(this._holdTimer);
    if (this._query) {
      this._finder.clear();
    }
  }

  /** The dialog wrapper these tools are placed in. */
  private get _dialog(): HTMLElement {
    const root = this.getRootNode();
    return root instanceof ShadowRoot ? (root.host as HTMLElement) : this;
  }

  /** The key of the lock: the kind of dialog, whatever it shows. */
  private get _lockKey(): string {
    let element: HTMLElement = this._dialog;
    while (WRAPPERS.has(element.localName)) {
      const root = element.getRootNode();
      if (!(root instanceof ShadowRoot)) {
        break;
      }
      element = root.host as HTMLElement;
    }
    return `dialog:${element.localName}`;
  }

  private _check = (): void => {
    const locked = isLocked(readLocks(), this._lockKey);
    if (locked !== this._locked) {
      this._locked = locked;
      fireEvent(this, "dialog-lock-changed", { locked });
    }
    if (!locked) {
      this._askPin = false;
      this._message = "";
    }
  };

  protected render(): TemplateResult | typeof nothing {
    if (!this._i18n) {
      return nothing;
    }
    const localize = this._i18n.localize;
    const find = localize("ui.dialog_tools.find");
    return html`
      <div class="row">
        <ha-input-search
          appearance="outlined"
          .placeholder=${find}
          .accessibleLabel=${find}
          .value=${this._query}
          @input=${this._findInput}
          @keydown=${this._findKeydown}
        ></ha-input-search>
        ${
          this._query.trim()
            ? html`<span
                class=${classMap({ count: true, bad: this._finder.invalid })}
                role="status"
                >${
                  this._finder.invalid
                    ? localize("ui.page_tools.find_invalid")
                    : this._total
                      ? localize(
                          this._total >= FIND_LIMIT
                            ? "ui.page_tools.find_count_limit"
                            : "ui.page_tools.find_count",
                          { current: this._position + 1, total: this._total }
                        )
                      : localize("ui.page_tools.find_none")
                }</span
              >`
            : nothing
        }
        <ha-icon-button
          .label=${localize("ui.page_tools.appearance")}
          .path=${mdiFormatPaint}
          @click=${this._editAppearance}
        ></ha-icon-button>
        <ha-icon-button
          class=${classMap({ on: this._locked, holding: this._holding })}
          .label=${localize(
            this._locked
              ? "ui.dialog_tools.unlock_hold"
              : "ui.dialog_tools.lock"
          )}
          .path=${this._locked ? mdiLock : mdiLockOpenVariantOutline}
          @click=${this._lockClick}
          @pointerdown=${this._holdStart}
          @pointerup=${this._holdEnd}
          @pointerleave=${this._holdEnd}
          @pointercancel=${this._holdEnd}
          @keydown=${this._holdKeydown}
          @keyup=${this._holdKeyup}
          @blur=${this._holdEnd}
        ></ha-icon-button>
      </div>
      ${
        this._locked
          ? html`<p class="state" role="status">
              ${localize("ui.dialog_tools.locked")}
              ${
                readLocks().pin
                  ? nothing
                  : localize("ui.page_tools.unlock_hint")
              }
            </p>`
          : nothing
      }
      ${
        this._locked && this._askPin
          ? html`<form class="pin" @submit=${this._submitPin}>
              <ha-input
                type="password"
                inputmode="numeric"
                autocomplete="off"
                .label=${localize("ui.page_tools.lock_panel.pin_label")}
              ></ha-input>
              <ha-button type="submit" size="s">
                ${localize("ui.page_tools.lock_panel.unlock")}
              </ha-button>
            </form>`
          : nothing
      }
      ${
        this._message
          ? html`<p class="error" role="alert">${this._message}</p>`
          : nothing
      }
    `;
  }

  private _findInput(ev: Event): void {
    this._query = (ev.target as HaInputSearch).value ?? "";
    window.clearTimeout(this._findTimer);
    this._findTimer = window.setTimeout(() => this._find(), 150);
  }

  private _find(): void {
    if (!this._query.trim()) {
      this._finder.clear();
      this._total = 0;
      this._position = 0;
      return;
    }
    this._finder.search(
      this._dialog,
      this._query,
      (element) => element.localName === "ha-dialog-tools"
    );
    this._total = this._finder.ranges.length;
    this._position = this._finder.current;
  }

  private _findKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      window.clearTimeout(this._findTimer);
      if (this._finder.query !== this._query) {
        this._find();
        return;
      }
      this._finder.step(ev.shiftKey ? -1 : 1);
      this._total = this._finder.ranges.length;
      this._position = this._finder.current;
    } else if (ev.key === "Escape" && this._query) {
      // The first Escape clears the search; the next one closes the dialog.
      ev.preventDefault();
      ev.stopPropagation();
      this._query = "";
      this._find();
    }
  }

  private _editAppearance(): void {
    fireEvent(this, "hass-pick-appearance");
  }

  private _lockClick(): void {
    if (this._locked) {
      if (readLocks().pin) {
        this._askPin = true;
      }
      return;
    }
    if (this._justUnlocked) {
      this._justUnlocked = false;
      return;
    }
    writeLocks(withLock(readLocks(), this._lockKey, true));
  }

  private _unlock(): void {
    this._justUnlocked = true;
    window.setTimeout(() => {
      this._justUnlocked = false;
    }, 600);
    writeLocks(withLock(readLocks(), this._lockKey, false));
  }

  private _holdStart(): void {
    if (!this._locked || readLocks().pin || this._holding) {
      return;
    }
    this._holding = true;
    this._holdTimer = window.setTimeout(() => {
      this._holding = false;
      this._unlock();
    }, UNLOCK_HOLD_MS);
  }

  private _holdEnd(): void {
    if (!this._holding) {
      return;
    }
    this._holding = false;
    window.clearTimeout(this._holdTimer);
  }

  private _holdKeydown(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      this._holdStart();
    }
  }

  private _holdKeyup(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      this._holdEnd();
    }
  }

  private _submitPin(ev: SubmitEvent): void {
    ev.preventDefault();
    const input = (ev.currentTarget as HTMLFormElement).querySelector<HaInput>(
      "ha-input"
    );
    const pin = input?.value ?? "";
    if (input) {
      input.value = "";
    }
    const localize = this._i18n!.localize;
    const result = tryPin(readLocks(), pin, Date.now());
    writeLocks(result.store);
    if (result.outcome === "ok") {
      this._message = "";
      this._unlock();
      return;
    }
    this._message = result.waitMs
      ? localize("ui.page_tools.lock_panel.wait", {
          seconds: Math.ceil(result.waitMs / 1000),
        })
      : localize("ui.page_tools.lock_panel.wrong");
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      padding: var(--ha-space-2) var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    ha-input-search {
      flex: 1;
      min-width: 0;
      --ha-input-search-height: var(--ha-space-10);
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .count {
      font-size: var(--ha-font-size-s);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .count.bad,
    .error {
      color: var(--error-color);
    }
    ha-icon-button {
      --ha-icon-button-size: 40px;
      border-radius: var(--ha-border-radius-pill);
    }
    ha-icon-button.on {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    ha-icon-button.holding {
      animation: hold 1500ms linear forwards;
    }
    @keyframes hold {
      from {
        box-shadow: 0 0 0 0 var(--primary-color);
      }
      to {
        box-shadow: 0 0 0 6px var(--primary-color);
        background: var(--card-background-color);
        color: var(--primary-color);
      }
    }
    p {
      margin: var(--ha-space-1) var(--ha-space-2) 0;
      font-size: var(--ha-font-size-s);
    }
    .state {
      color: var(--primary-color);
    }
    .pin {
      display: flex;
      align-items: flex-end;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    .pin ha-input {
      flex: 1;
    }
    @media (prefers-reduced-motion: reduce) {
      ha-icon-button.holding {
        animation: none;
        outline: 3px solid var(--primary-color);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-tools": HaDialogTools;
  }
}
