import type { PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import {
  clampSize,
  sizeForDrag,
  sizeForKey,
  toPercent,
} from "./split-panels-logic";

export interface SplitDividerMoveDetail {
  /** The new size of the start side, in pixels. */
  size: number;
  /** False while a drag is under way, true when the move is settled. */
  committed: boolean;
}

/**
 * The movable divider between two sides, as a keyboard and pointer control.
 * It measures the start side: dragging toward the end makes the start side
 * larger, whatever the page direction. It only reports sizes; the owner
 * applies them, so no layout work happens here.
 *
 * @fires split-divider-move - `{ size, committed }`
 */
@customElement("ha-split-divider")
export class HaSplitDivider extends LitElement {
  /** Current size of the start side, in pixels. */
  @property({ type: Number }) public value = 0;

  @property({ type: Number }) public min = 0;

  @property({ type: Number }) public max = 0;

  /** Where Enter and a double click put the divider. */
  @property({ type: Number, attribute: "default-value" })
  public defaultValue = 0;

  /** Width of the area the divider divides, so the value reads as a percentage. */
  @property({ type: Number }) public total = 0;

  @property() public label = "";

  @property({ type: Boolean, reflect: true }) public disabled = false;

  @state() private _dragging = false;

  // The size while a drag or a key press is in progress
  @state() private _live?: number;

  private _startX = 0;

  private _startSize = 0;

  private _rtl = false;

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("value") && !this._dragging) {
      this._live = undefined;
    }
  }

  protected render() {
    const size = clampSize(this._live ?? this.value, this.min, this.max);
    const percent = this.total > 0;
    return html`<div
      class="handle"
      role="separator"
      aria-orientation="vertical"
      aria-label=${this.label}
      aria-valuenow=${percent ? toPercent(size, this.total) : Math.round(size)}
      aria-valuemin=${percent ? toPercent(this.min, this.total) : this.min}
      aria-valuemax=${percent ? toPercent(this.max, this.total) : this.max}
      tabindex=${this.disabled ? -1 : 0}
      aria-disabled=${this.disabled ? "true" : "false"}
      @keydown=${this._keydown}
      @pointerdown=${this._pointerDown}
      @pointermove=${this._pointerMove}
      @pointerup=${this._pointerUp}
      @pointercancel=${this._pointerCancel}
      @lostpointercapture=${this._pointerCancel}
      @dblclick=${this._reset}
    >
      <span class="line"></span>
    </div>`;
  }

  private get _isRtl(): boolean {
    return getComputedStyle(this).direction === "rtl";
  }

  private _keydown(ev: KeyboardEvent) {
    if (this.disabled || ev.altKey || ev.ctrlKey || ev.metaKey) {
      return;
    }
    const size = sizeForKey(ev.key, {
      current: this._live ?? this.value,
      min: this.min,
      max: this.max,
      defaultSize: this.defaultValue,
      rtl: this._isRtl,
      shift: ev.shiftKey,
    });
    if (size === undefined) {
      return;
    }
    ev.preventDefault();
    this._live = size;
    this._emit(size, true);
  }

  private _pointerDown(ev: PointerEvent) {
    if (this.disabled || (ev.pointerType === "mouse" && ev.button !== 0)) {
      return;
    }
    const handle = ev.currentTarget as HTMLElement;
    handle.setPointerCapture(ev.pointerId);
    this._dragging = true;
    this._rtl = this._isRtl;
    this._startX = ev.clientX;
    this._startSize = clampSize(this.value, this.min, this.max);
    this._live = this._startSize;
    ev.preventDefault();
    handle.focus();
  }

  private _pointerMove(ev: PointerEvent) {
    if (!this._dragging) {
      return;
    }
    const size = sizeForDrag(
      this._startSize,
      ev.clientX - this._startX,
      this._rtl,
      this.min,
      this.max
    );
    if (size === this._live) {
      return;
    }
    this._live = size;
    this._emit(size, false);
  }

  private _pointerUp(ev: PointerEvent) {
    if (!this._dragging) {
      return;
    }
    const handle = ev.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(ev.pointerId)) {
      handle.releasePointerCapture(ev.pointerId);
    }
    this._dragging = false;
    this._emit(this._live ?? this._startSize, true);
  }

  // A cancelled drag puts the divider back where it started
  private _pointerCancel() {
    if (!this._dragging) {
      return;
    }
    this._dragging = false;
    this._live = this._startSize;
    this._emit(this._startSize, true);
  }

  private _reset() {
    if (this.disabled) {
      return;
    }
    const size = clampSize(this.defaultValue, this.min, this.max);
    this._live = size;
    this._emit(size, true);
  }

  private _emit(size: number, committed: boolean) {
    fireEvent(this, "split-divider-move", { size, committed });
  }

  static styles = css`
    :host {
      display: block;
      flex: 0 0 var(--ha-split-divider-size, 12px);
      width: var(--ha-split-divider-size, 12px);
      position: relative;
      z-index: 1;
    }
    :host([disabled]) {
      cursor: default;
    }
    .handle {
      position: absolute;
      inset: 0;
      display: flex;
      justify-content: center;
      cursor: col-resize;
      touch-action: none;
      outline: none;
    }
    /* A wider area than the line, so the divider is easy to grab */
    .handle::before {
      content: "";
      position: absolute;
      inset-block: 0;
      inset-inline: -8px;
    }
    :host([disabled]) .handle {
      cursor: default;
    }
    .line {
      width: 2px;
      height: 100%;
      background: var(--divider-color);
      border-radius: var(--ha-border-radius-pill, 9999px);
    }
    .handle:hover .line,
    .handle:focus-visible .line {
      background: var(--primary-color);
      width: 4px;
    }
    .handle:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
      border-radius: var(--ha-border-radius-sm, 4px);
    }
    @media (prefers-reduced-motion: no-preference) {
      .line {
        transition:
          background-color var(--ha-animation-duration-fast, 150ms) ease-out,
          width var(--ha-animation-duration-fast, 150ms) ease-out;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-split-divider": HaSplitDivider;
  }

  interface HASSDomEvents {
    "split-divider-move": SplitDividerMoveDetail;
  }
}
