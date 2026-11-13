import { css, html, LitElement, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../common/dom/fire_event";
import { popoverSupported } from "../common/feature-detect/support-popover";
import { nextRender } from "../common/util/render-status";

export type ToastCloseReason =
  "dismiss" | "action" | "timeout" | "programmatic";

export interface ToastClosedEventDetail {
  reason: ToastCloseReason;
}

@customElement("ha-toast")
export class HaToast extends LitElement {
  @property({ attribute: "label-text" }) public labelText = "";

  @property({ attribute: "announce-text" }) public announceText?: string;

  @property({ type: Number, attribute: "timeout-ms" }) public timeoutMs = 4000;

  @property({ type: Number, attribute: "bottom-offset" }) public bottomOffset =
    0;

  @property({ type: Boolean }) public stacked = false;

  /**
   * Position in a stack: 0 is the newest toast, higher numbers are older and
   * are drawn slightly smaller.
   */
  @property({ type: Number }) public depth = 0;

  /**
   * Leaves announcing to the owner of the stack (one shared live region), so
   * older toasts are not read out again.
   */
  @property({ type: Boolean }) public silent = false;

  @query(".toast")
  private _toast?: HTMLDivElement;

  @queryAssignedElements({ slot: "action", flatten: true })
  private _actionElements?: Element[];

  @queryAssignedElements({ slot: "dismiss", flatten: true })
  private _dismissElements?: Element[];

  @state() private _active = false;

  @state() private _visible = false;

  private _dismissTimer?: ReturnType<typeof setTimeout>;

  private _timerArmed = false;

  private _timerRunning = false;

  private _timerStartedAt = 0;

  private _remainingMs = 0;

  private _hovered = false;

  private _focused = false;

  private _closeReason: ToastCloseReason = "programmatic";

  private _transitionId = 0;

  public disconnectedCallback(): void {
    clearTimeout(this._dismissTimer);
    this._transitionId += 1;
    super.disconnectedCallback();
  }

  public async show(): Promise<void> {
    clearTimeout(this._dismissTimer);

    if (this._active && this._visible) {
      this._setDismissTimer();
      return;
    }

    const transitionId = ++this._transitionId;

    this._active = true;
    await this.updateComplete;

    if (transitionId !== this._transitionId) {
      return;
    }

    this._showToastPopover();
    await nextRender();

    if (transitionId !== this._transitionId) {
      return;
    }

    this._visible = true;
    await this.updateComplete;
    await this._waitForTransitionEnd();

    if (transitionId !== this._transitionId) {
      return;
    }

    this._setDismissTimer();
  }

  public async hide(reason: ToastCloseReason = "programmatic"): Promise<void> {
    clearTimeout(this._dismissTimer);
    this._timerArmed = false;
    this._timerRunning = false;
    this._closeReason = reason;

    if (!this._active) {
      return;
    }

    const transitionId = ++this._transitionId;
    const wasVisible = this._visible;

    this._visible = false;
    await this.updateComplete;

    if (wasVisible) {
      await this._waitForTransitionEnd();
    }

    if (transitionId !== this._transitionId) {
      return;
    }

    this._hideToastPopover();
    this._active = false;
    await this.updateComplete;

    fireEvent(this, "toast-closed", {
      reason: this._closeReason,
    });
    this._closeReason = "programmatic";
  }

  public close(reason: ToastCloseReason = "programmatic"): void {
    this.hide(reason);
  }

  private _setDismissTimer() {
    clearTimeout(this._dismissTimer);
    this._timerRunning = false;
    if (this.timeoutMs > 0) {
      this._timerArmed = true;
      this._remainingMs = this.timeoutMs;
      if (!this._paused) {
        this._startTimer();
      }
    } else {
      this._timerArmed = false;
    }
  }

  private get _paused(): boolean {
    return this._hovered || this._focused;
  }

  private _startTimer() {
    clearTimeout(this._dismissTimer);
    this._timerStartedAt = Date.now();
    this._timerRunning = true;
    this._dismissTimer = setTimeout(() => {
      this._timerRunning = false;
      this.hide("timeout");
    }, this._remainingMs);
  }

  private _pauseTimer() {
    if (!this._timerArmed || !this._timerRunning) {
      return;
    }
    clearTimeout(this._dismissTimer);
    this._timerRunning = false;
    this._remainingMs = Math.max(
      1,
      this._remainingMs - (Date.now() - this._timerStartedAt)
    );
  }

  private _resumeTimer() {
    if (this._paused || !this._timerArmed || this._timerRunning) {
      return;
    }
    this._startTimer();
  }

  private _pointerEnter() {
    this._hovered = true;
    this._pauseTimer();
  }

  private _pointerLeave() {
    this._hovered = false;
    this._resumeTimer();
  }

  private _focusIn() {
    this._focused = true;
    this._pauseTimer();
  }

  private _focusOut(ev: FocusEvent) {
    const next = ev.relatedTarget;
    if (next instanceof Node && this.contains(next)) {
      return;
    }
    this._focused = false;
    this._resumeTimer();
  }

  private _isPopoverOpen(): boolean {
    if (!this._toast || !popoverSupported) {
      return false;
    }

    try {
      return this._toast.matches(":popover-open");
    } catch {
      return false;
    }
  }

  private _showToastPopover(): void {
    if (
      !this._toast ||
      this.stacked ||
      !popoverSupported ||
      this._isPopoverOpen()
    ) {
      return;
    }

    this._toast.showPopover?.();
  }

  private _hideToastPopover(): void {
    if (
      !this._toast ||
      this.stacked ||
      !popoverSupported ||
      !this._isPopoverOpen()
    ) {
      return;
    }

    this._toast.hidePopover?.();
  }

  private async _waitForTransitionEnd(): Promise<void> {
    const toastEl = this._toast;
    if (!toastEl) {
      return;
    }

    const animations = toastEl.getAnimations({ subtree: true });
    if (animations.length === 0) {
      return;
    }

    await Promise.allSettled(animations.map((animation) => animation.finished));
  }

  protected render() {
    const hasAction =
      (this._actionElements?.length ?? 0) > 0 ||
      (this._dismissElements?.length ?? 0) > 0;

    return html`
      <div
        class=${classMap({
          toast: true,
          active: this._active,
          stacked: this.stacked,
          visible: this._visible,
        })}
        style=${styleMap({
          "--ha-toast-bottom-offset": `${this.bottomOffset}px`,
          "--ha-toast-depth": `${this.depth}`,
        })}
        popover=${ifDefined(
          popoverSupported && !this.stacked ? "manual" : undefined
        )}
        @pointerenter=${this._pointerEnter}
        @pointerleave=${this._pointerLeave}
        @focusin=${this._focusIn}
        @focusout=${this._focusOut}
      >
        <span class="message">${this.labelText}</span>
        <div class=${classMap({ actions: true, "has-action": hasAction })}>
          <slot name="action"></slot>
          <slot name="dismiss"></slot>
        </div>
      </div>
      <span
        class="assistive-message"
        role="status"
        aria-live=${this._active && !this.silent ? "polite" : "off"}
        aria-atomic="true"
      >
        ${this.silent ? nothing : (this.announceText ?? this.labelText)}
      </span>
    `;
  }

  static override styles = css`
    .toast {
      position: fixed;
      inset-block-start: auto;
      inset-inline-end: auto;
      inset-block-end: calc(
        var(--safe-area-inset-bottom, 0px) + var(--ha-space-4) +
          var(--ha-toast-bottom-offset, 0px)
      );
      inset-inline-start: 50%;
      margin: 0;
      width: max-content;
      height: auto;
      border: none;
      overflow: hidden;
      box-sizing: border-box;
      min-width: min(350px, calc(var(--safe-width) - var(--ha-space-4)));
      max-width: min(650px, var(--safe-width));
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3) var(--ha-space-4);
      color: var(--ha-color-on-neutral-loud);
      background-color: var(--ha-color-neutral-10);
      border-radius: var(--ha-border-radius-sm);
      box-shadow: var(--wa-shadow-l);
      opacity: 0;
      transform: translate(
        calc(-50% * var(--scale-direction)),
        var(--ha-space-2)
      );
      transition:
        opacity
          var(
            --ha-motion-toasts-duration,
            var(--ha-animation-duration-fast, 150ms)
          )
          var(--ha-motion-toasts-curve, ease),
        transform
          var(
            --ha-motion-toasts-duration,
            var(--ha-animation-duration-fast, 150ms)
          )
          var(--ha-motion-toasts-curve, ease);
    }

    .toast.visible {
      opacity: 1;
      transform: translate(calc(-50% * var(--scale-direction)), 0);
    }

    .toast.stacked {
      position: static;
      transform: translateY(var(--ha-space-2));
    }

    .toast.stacked.visible {
      transform: translateY(0);
    }

    /* Older toasts in a stack are drawn slightly smaller. Only the surface is
       scaled, never the text or the buttons, so every button keeps its 44 px
       touch target. */
    .toast.stacked {
      position: relative;
      /* The stack places it. Without this the fixed toast's own offsets
         (half the width from the start, and up from the bottom) still moved
         it, which pushed every toast sideways and its buttons off a phone. */
      inset: auto;
      isolation: isolate;
      overflow: visible;
      background-color: transparent;
      box-shadow: none;
    }
    .toast.stacked::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      background-color: var(--ha-color-neutral-10);
      box-shadow: var(--wa-shadow-l);
      transform-origin: bottom center;
      scale: calc(1 - var(--ha-toast-depth, 0) * 0.04);
      transition: scale var(--ha-animation-duration-fast, 150ms) ease;
    }

    .toast:focus-within {
      outline: 2px solid var(--ha-color-on-neutral-loud);
      outline-offset: 2px;
    }

    ::slotted(ha-button) {
      --ha-button-height: 44px;
      min-width: 44px;
    }

    /* The toast is dark in both colour schemes. A plain button would take the
       brand colour, about 2.5 to 1 on this surface; the toast's own light text
       colour reads about 16 to 1. */
    ::slotted(ha-button[appearance="plain"]) {
      --wa-color-on-normal: var(--ha-color-on-neutral-loud);
      --wa-color-on-quiet: var(--ha-color-on-neutral-loud);
    }

    ::slotted(ha-icon-button) {
      --ha-icon-button-size: 44px;
      min-height: 44px;
      min-width: 44px;
    }

    @media (prefers-reduced-motion: reduce) {
      .toast,
      .toast.stacked {
        transition: opacity 1ms linear;
      }
      .toast,
      .toast.visible {
        transform: translate(calc(-50% * var(--scale-direction)), 0);
      }
      .toast.stacked,
      .toast.stacked.visible {
        transform: none;
      }
    }

    .toast:not(.active) {
      display: none;
    }

    .message {
      flex: 1;
      min-width: 0;
    }

    .assistive-message {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--ha-color-on-neutral-loud);
    }

    .actions:not(.has-action) {
      display: none;
    }

    @media all and (max-width: 450px), all and (max-height: 500px) {
      .toast {
        min-width: var(--safe-width);
        max-width: var(--safe-width);
        border-radius: var(--ha-border-radius-square);
      }
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "toast-closed": ToastClosedEventDetail;
  }

  interface HTMLElementTagNameMap {
    "ha-toast": HaToast;
  }
}
