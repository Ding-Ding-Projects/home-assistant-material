import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, svg } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { CurvePoints } from "../../common/appearance/motion-profiles";
import {
  CURVE_X_MAX,
  CURVE_X_MIN,
  CURVE_Y_MAX,
  CURVE_Y_MIN,
  customCurve,
} from "../../common/appearance/motion-profiles";

const WIDTH = 300;
const HEIGHT = 240;
const PAD = 24;
const PLOT_W = WIDTH - PAD * 2;
const PLOT_H = HEIGHT - PAD * 2;
const KEY_STEP = 0.01;
const KEY_STEP_LARGE = 0.05;

const toX = (x: number) =>
  PAD + ((x - CURVE_X_MIN) / (CURVE_X_MAX - CURVE_X_MIN)) * PLOT_W;
const toY = (y: number) =>
  PAD + (1 - (y - CURVE_Y_MIN) / (CURVE_Y_MAX - CURVE_Y_MIN)) * PLOT_H;
const fromX = (px: number) =>
  CURVE_X_MIN + ((px - PAD) / PLOT_W) * (CURVE_X_MAX - CURVE_X_MIN);
const fromY = (py: number) =>
  CURVE_Y_MIN + (1 - (py - PAD) / PLOT_H) * (CURVE_Y_MAX - CURVE_Y_MIN);

export interface MotionCurveChangedEvent {
  points: CurvePoints;
}

declare global {
  interface HASSDomEvents {
    "motion-curve-changed": MotionCurveChangedEvent;
  }
}

/**
 * A cubic-bezier curve with two handles. A handle moves with the pointer or
 * with the arrow keys (Shift moves it in larger steps).
 */
@customElement("ha-motion-curve-editor")
export class HaMotionCurveEditor extends LitElement {
  @property({ attribute: false }) public points: CurvePoints = [0, 0, 1, 1];

  @property({ type: Boolean, reflect: true }) public disabled = false;

  @property({ attribute: false }) public handleLabels: [string, string] = [
    "",
    "",
  ];

  @property({ attribute: false }) public label = "";

  @state() private _dragging?: 0 | 1;

  protected render(): TemplateResult {
    const [x1, y1, x2, y2] = this.points;
    const p1 = { x: toX(x1), y: toY(y1) };
    const p2 = { x: toX(x2), y: toY(y2) };
    const start = { x: toX(0), y: toY(0) };
    const end = { x: toX(1), y: toY(1) };
    return html`
      <svg
        viewBox="0 0 ${WIDTH} ${HEIGHT}"
        role="group"
        aria-label=${this.label}
        @pointermove=${this._move}
        @pointerup=${this._release}
        @pointercancel=${this._release}
      >
        ${svg`
          <rect class="plot" x=${PAD} y=${toY(1)} width=${PLOT_W} height=${toY(0) - toY(1)}></rect>
          <line class="diagonal" x1=${start.x} y1=${start.y} x2=${end.x} y2=${end.y}></line>
          <line class="arm" x1=${start.x} y1=${start.y} x2=${p1.x} y2=${p1.y}></line>
          <line class="arm" x1=${end.x} y1=${end.y} x2=${p2.x} y2=${p2.y}></line>
          <path
            class="curve"
            d="M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}"
          ></path>
          ${this._handle(0, p1.x, p1.y, x1, y1)}
          ${this._handle(1, p2.x, p2.y, x2, y2)}
        `}
      </svg>
    `;
  }

  private _handle(index: 0 | 1, cx: number, cy: number, x: number, y: number) {
    return svg`
      <circle
        class=${this._dragging === index ? "handle active" : "handle"}
        cx=${cx}
        cy=${cy}
        r="9"
        tabindex=${this.disabled ? "-1" : "0"}
        role="slider"
        aria-label=${this.handleLabels[index]}
        aria-valuemin=${CURVE_Y_MIN}
        aria-valuemax=${CURVE_Y_MAX}
        aria-valuenow=${y}
        aria-valuetext=${`x ${x.toFixed(2)}, y ${y.toFixed(2)}`}
        aria-disabled=${this.disabled ? "true" : "false"}
        data-index=${index}
        @pointerdown=${this._press}
        @keydown=${this._key}
      ></circle>
    `;
  }

  private _press(ev: PointerEvent) {
    if (this.disabled) {
      return;
    }
    const target = ev.currentTarget as SVGCircleElement;
    this._dragging = Number(target.dataset.index) as 0 | 1;
    target.setPointerCapture(ev.pointerId);
    target.focus();
    ev.preventDefault();
  }

  private _move(ev: PointerEvent) {
    if (this._dragging === undefined) {
      return;
    }
    const svgElement = ev.currentTarget as SVGSVGElement;
    const rect = svgElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const px = ((ev.clientX - rect.left) / rect.width) * WIDTH;
    const py = ((ev.clientY - rect.top) / rect.height) * HEIGHT;
    this._set(this._dragging, fromX(px), fromY(py));
  }

  private _release() {
    this._dragging = undefined;
  }

  private _key(ev: KeyboardEvent) {
    if (this.disabled) {
      return;
    }
    const index = Number((ev.currentTarget as SVGElement).dataset.index) as
      0 | 1;
    const step = ev.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const x = this.points[index * 2];
    const y = this.points[index * 2 + 1];
    switch (ev.key) {
      case "ArrowLeft":
        this._set(index, x - step, y);
        break;
      case "ArrowRight":
        this._set(index, x + step, y);
        break;
      case "ArrowUp":
        this._set(index, x, y + step);
        break;
      case "ArrowDown":
        this._set(index, x, y - step);
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  private _set(index: 0 | 1, x: number, y: number) {
    const next = [...this.points];
    next[index * 2] = x;
    next[index * 2 + 1] = y;
    const points = customCurve(next).points;
    if (points.every((value, i) => value === this.points[i])) {
      return;
    }
    fireEvent(this, "motion-curve-changed", { points });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      background: var(
        --ha-color-surface-tone-2,
        var(--secondary-background-color)
      );
      border-radius: var(--ha-border-radius-xl);
      touch-action: none;
    }
    .plot {
      fill: var(--card-background-color);
      stroke: var(--divider-color);
    }
    .diagonal {
      stroke: var(--divider-color);
      stroke-dasharray: 4 4;
    }
    .arm {
      stroke: var(--ha-color-on-primary-container, var(--primary-color));
      stroke-opacity: 0.5;
      stroke-width: 1.5;
    }
    .curve {
      fill: none;
      stroke: var(--primary-color);
      stroke-width: 3;
      stroke-linecap: round;
    }
    .handle {
      fill: var(--primary-color);
      stroke: var(--card-background-color);
      stroke-width: 2;
      cursor: grab;
      outline: none;
    }
    .handle.active {
      cursor: grabbing;
    }
    .handle:focus-visible {
      stroke: var(--primary-text-color);
      stroke-width: 3;
    }
    :host([disabled]) .handle {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-motion-curve-editor": HaMotionCurveEditor;
  }
}
