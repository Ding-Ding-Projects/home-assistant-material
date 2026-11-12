import type { ContextType } from "@lit/context";
import { mdiChevronDoubleRight, mdiKeyVariant } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { KeyName, TwoKeyState } from "../common/confirm/two-key";
import {
  bothTurned,
  emptyTwoKeyState,
  holdKey,
  isTurned,
  KEY_LETTERS,
  keyForLetter,
  releaseKey,
  remaining,
} from "../common/confirm/two-key";
import { consume } from "../common/decorators/consume";
import { fireEvent } from "../common/dom/fire_event";
import { internationalizationContext } from "../data/context";
import "./ha-slider";
import type { HaSlider } from "./ha-slider";
import "./ha-svg-icon";

declare global {
  interface HASSDomEvents {
    /** Both keys were turned and the slider reached its end. */
    "two-key-confirmed": undefined;
  }
}

const KEYS: KeyName[] = ["one", "two"];

/**
 * The guard on anything that destroys data: turn two keys, then move the
 * slider to its end. Fires `two-key-confirmed` once.
 */
@customElement("ha-two-key-confirm")
export class HaTwoKeyConfirm extends LitElement {
  @property({ type: Boolean }) public disabled = false;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _keys: TwoKeyState = emptyTwoKeyState();

  @state() private _now = Date.now();

  @state() private _slide = 0;

  private _done = false;

  private _tick?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this._keydown, true);
    window.addEventListener("keyup", this._keyup, true);
    window.addEventListener("blur", this._releaseAll);
    window.addEventListener("pointerup", this._endDrag, true);
    window.addEventListener("pointercancel", this._endDrag, true);
    this._tick = window.setInterval(() => {
      this._now = Date.now();
      // A slide that is still under a finger is never snapped back because the
      // keys timed out half-way; it is judged when the finger lifts.
      if (
        !bothTurned(this._keys, this._now) &&
        this._slide &&
        !this._done &&
        !this._dragging
      ) {
        this._slide = 0;
      }
    }, 250);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._keydown, true);
    window.removeEventListener("keyup", this._keyup, true);
    window.removeEventListener("blur", this._releaseAll);
    window.removeEventListener("pointerup", this._endDrag, true);
    window.removeEventListener("pointercancel", this._endDrag, true);
    window.clearInterval(this._tick);
  }

  private _dragging = false;

  private _startDrag = (): void => {
    this._dragging = true;
  };

  private _endDrag = (): void => {
    this._dragging = false;
  };

  private _typing(ev: KeyboardEvent): boolean {
    return ev
      .composedPath()
      .some(
        (target) =>
          target instanceof HTMLElement &&
          (target.localName === "textarea" ||
            target.isContentEditable ||
            (target instanceof HTMLInputElement && target.type !== "range"))
      );
  }

  private _keydown = (ev: KeyboardEvent): void => {
    const key = keyForLetter(ev.key);
    if (!key || this.disabled || ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    if (this._typing(ev)) {
      return;
    }
    ev.preventDefault();
    if (!ev.repeat) {
      this._keys = holdKey(this._keys, key);
    }
  };

  private _keyup = (ev: KeyboardEvent): void => {
    const key = keyForLetter(ev.key);
    if (key) {
      this._keys = releaseKey(this._keys, key, Date.now());
      this._now = Date.now();
    }
  };

  private _releaseAll = (): void => {
    const now = Date.now();
    this._keys = releaseKey(releaseKey(this._keys, "one", now), "two", now);
    this._now = now;
  };

  protected render(): TemplateResult | typeof nothing {
    if (!this._i18n) {
      return nothing;
    }
    const localize = this._i18n.localize;
    const now = this._now;
    const ready = bothTurned(this._keys, now);
    const waitingFor = KEYS.find((key) => !isTurned(this._keys, key, now));
    return html`
      <div class="keys">
        ${KEYS.map((key) => {
          const turned = isTurned(this._keys, key, now);
          const left = Math.ceil(remaining(this._keys, key, now) / 1000);
          return html`
            <button
              type="button"
              class=${classMap({ key: true, turned })}
              aria-pressed=${turned ? "true" : "false"}
              ?disabled=${this.disabled}
              data-key=${key}
              @pointerdown=${this._pointerDown}
              @pointerup=${this._pointerUp}
              @pointercancel=${this._pointerUp}
              @lostpointercapture=${this._pointerUp}
              @keydown=${this._tileKeydown}
              @keyup=${this._tileKeyup}
              @blur=${this._pointerUp}
            >
              <ha-svg-icon .path=${mdiKeyVariant}></ha-svg-icon>
              <strong
                >${localize(
                  turned
                    ? `ui.dialogs.two_key.turned_${key}`
                    : `ui.dialogs.two_key.turn_${key}`
                )}</strong
              >
              <span
                >${
                  turned && left
                    ? localize("ui.dialogs.two_key.stays", { seconds: left })
                    : localize("ui.dialogs.two_key.hold", {
                        letter: KEY_LETTERS[key].toUpperCase(),
                      })
                }</span
              >
            </button>
          `;
        })}
      </div>
      <span class="slide-label" id="slide-label"
        >${localize("ui.dialogs.two_key.slide")}</span
      >
      <div class=${classMap({ slide: true, ready })}>
        <ha-svg-icon .path=${mdiChevronDoubleRight}></ha-svg-icon>
        <span class="slide-state" aria-hidden="true"
          >${
            ready
              ? localize("ui.dialogs.two_key.slide_ready")
              : localize("ui.dialogs.two_key.waiting", {
                  key: localize(
                    `ui.dialogs.two_key.name_${waitingFor ?? "two"}`
                  ),
                })
          }</span
        >
        <ha-slider
          id="slide"
          size="m"
          .min=${0}
          .max=${100}
          .step=${1}
          .value=${this._slide}
          .withTooltip=${false}
          .disabled=${!ready || this.disabled}
          aria-labelledby="slide-label"
          aria-describedby="note"
          @pointerdown=${this._startDrag}
          @input=${this._slideInput}
          @change=${this._slideChange}
        ></ha-slider>
      </div>
      <p id="note" class="note">${localize("ui.dialogs.two_key.note")}</p>
    `;
  }

  private _keyOf(ev: Event): KeyName {
    return (ev.currentTarget as HTMLElement).dataset.key as KeyName;
  }

  private _pointerDown(ev: PointerEvent): void {
    if (this.disabled) {
      return;
    }
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._keys = holdKey(this._keys, this._keyOf(ev));
  }

  private _pointerUp(ev: Event): void {
    this._keys = releaseKey(this._keys, this._keyOf(ev), Date.now());
    this._now = Date.now();
  }

  private _tileKeydown(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      ev.preventDefault();
      this._keys = holdKey(this._keys, this._keyOf(ev));
    }
  }

  private _tileKeyup(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      this._pointerUp(ev);
    }
  }

  private _slideInput(ev: Event): void {
    this._slide = Number((ev.currentTarget as HaSlider).value);
    this._check();
  }

  private _slideChange(): void {
    // Let go before the end: the slider goes back to the start.
    if (!this._done && this._slide < 100) {
      this._slide = 0;
    }
  }

  private _check(): void {
    if (
      this._done ||
      this._slide < 100 ||
      !bothTurned(this._keys, Date.now())
    ) {
      return;
    }
    this._done = true;
    fireEvent(this, "two-key-confirmed");
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      margin-top: var(--ha-space-4);
    }
    .keys {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-3);
    }
    .key {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1);
      padding: var(--ha-space-4) var(--ha-space-3);
      border: 2px solid var(--outline-color);
      border-radius: var(--ha-border-radius-xl);
      background: var(--primary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      text-align: center;
      cursor: pointer;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      --mdc-icon-size: 28px;
    }
    .key span {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .key.turned {
      border-color: transparent;
      background: color-mix(
        in srgb,
        var(--success-color) 30%,
        var(--primary-background-color)
      );
    }
    .key:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .key[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    .slide-label {
      display: block;
      margin: var(--ha-space-4) 0 var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .slide {
      position: relative;
      height: 56px;
      border-radius: var(--ha-border-radius-pill);
      background: var(--primary-background-color);
      overflow: hidden;
    }
    .slide ha-svg-icon {
      display: none;
    }
    .slide-state {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding-inline-start: 56px;
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
      pointer-events: none;
    }
    ha-slider {
      position: absolute;
      inset: 0;
      width: 100%;
      min-width: 0;
      margin: 0;
      --track-size: 56px;
      --thumb-width: 48px;
      --thumb-height: 48px;
      --ha-slider-thumb-color: var(--error-color);
      --ha-slider-track-color: transparent;
      --ha-slider-indicator-color: transparent;
    }
    ha-slider[disabled] {
      --ha-slider-thumb-color: color-mix(
        in srgb,
        var(--error-color) 40%,
        transparent
      );
    }
    .note {
      margin: var(--ha-space-3) 0 0;
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    /* The narrowest supported width is 320 px: keep both keys side by side. */
    @media (max-width: 360px) {
      .keys {
        gap: var(--ha-space-2);
      }
      .key {
        min-width: 0;
        padding: var(--ha-space-3) var(--ha-space-2);
        overflow-wrap: anywhere;
        --mdc-icon-size: 24px;
      }
      .key span,
      .slide-label,
      .note {
        font-size: var(--ha-font-size-xs, 0.75rem);
      }
      .slide-state {
        padding-inline-start: 48px;
        padding-inline-end: var(--ha-space-2);
        text-align: center;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-two-key-confirm": HaTwoKeyConfirm;
  }
}
