import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { playArrival } from "../../common/motion/drama";
import "../ha-svg-icon";
import type { ShapedIconShape, ShapedIconTone } from "./shaped-icon-shapes";
import { normalizeShape, shapeTemplate } from "./shaped-icon-shapes";

/**
 * An icon on a coloured shape: a scalloped circle, a tilted rounded square, a
 * tilted pill, a ring, a diamond or a warning triangle, in one of the theme's
 * tonal colour pairs. Every colour follows the theme and the owner's accent.
 *
 * It is meant for action moments and for callers that opt in. Resting rows
 * and pages do not place it by default, so a page at rest carries no
 * decorative shapes.
 *
 * - `shape`, `tone` pick the shape and the colour pair.
 * - `path` draws an icon from a path; or put any icon in the default slot.
 * - `arrive` is off by default. Only when a caller sets it does the shape
 *   spin in once when it is first shown, following the "Arrivals" motion
 *   kind and the drama choice; `arrive-delay` waits that many milliseconds
 *   first. Nothing moves under reduced motion, and nothing loops.
 * - The whole graphic is decoration (`aria-hidden`): the row it sits in
 *   carries the words.
 *
 * @cssprop --ha-shaped-icon-size - Width and height, 52px by default.
 * @cssprop --ha-shaped-icon-icon-size - Size of the icon, 24px by default.
 */
@customElement("ha-shaped-icon")
export class HaShapedIcon extends LitElement {
  @property({ reflect: true }) public shape: ShapedIconShape = "circle";

  @property({ reflect: true }) public tone: ShapedIconTone = "primary";

  @property() public path?: string;

  @property({ type: Boolean }) public arrive = false;

  @property({ type: Number, attribute: "arrive-delay" }) public arriveDelay = 0;

  @query(".graphic") private _graphic?: HTMLElement;

  private _arriveTimer?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("aria-hidden", "true");
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._arriveTimer);
  }

  protected firstUpdated(): void {
    if (!this.arrive) {
      return;
    }
    const start = () => playArrival({ shapes: [this._graphic] });
    if (this.arriveDelay > 0) {
      // Hidden until its turn, so it does not show and then spin in.
      const graphic = this._graphic;
      graphic?.style.setProperty("opacity", "0");
      this._arriveTimer = window.setTimeout(() => {
        graphic?.style.removeProperty("opacity");
        start();
      }, this.arriveDelay);
      return;
    }
    start();
  }

  protected render() {
    return html`<div class="graphic">
      <svg viewBox="0 0 52 52" focusable="false">
        ${shapeTemplate(normalizeShape(this.shape))}
      </svg>
      <span class="icon">
        ${
          this.path
            ? html`<ha-svg-icon .path=${this.path}></ha-svg-icon>`
            : nothing
        }
        <slot></slot>
      </span>
    </div>`;
  }

  static styles = css`
    :host {
      --shaped-bg: var(
        --ha-color-primary-container,
        var(--md-sys-color-primary-container, var(--secondary-background-color))
      );
      --shaped-fg: var(
        --ha-color-on-primary-container,
        var(--md-sys-color-on-primary-container, var(--primary-color))
      );
      display: inline-flex;
      flex: none;
      width: var(--ha-shaped-icon-size, 52px);
      height: var(--ha-shaped-icon-size, 52px);
    }
    :host([tone="secondary"]) {
      --shaped-bg: var(
        --md-sys-color-secondary-container,
        var(--secondary-background-color)
      );
      --shaped-fg: var(
        --md-sys-color-on-secondary-container,
        var(--primary-text-color)
      );
    }
    :host([tone="tertiary"]) {
      --shaped-bg: var(
        --ha-color-tertiary-container,
        var(
          --md-sys-color-tertiary-container,
          var(--secondary-background-color)
        )
      );
      --shaped-fg: var(
        --ha-color-on-tertiary-container,
        var(--md-sys-color-on-tertiary-container, var(--primary-text-color))
      );
    }
    :host([tone="success"]) {
      --shaped-bg: var(
        --ha-color-success-container,
        var(--ha-color-fill-success-normal-resting)
      );
      --shaped-fg: var(
        --ha-color-on-success-container,
        var(--ha-color-on-success-normal)
      );
    }
    :host([tone="warning"]) {
      --shaped-bg: var(
        --ha-color-warning-container,
        var(--ha-color-fill-warning-normal-resting)
      );
      --shaped-fg: var(
        --ha-color-on-warning-container,
        var(--ha-color-on-warning-normal)
      );
    }
    :host([tone="error"]) {
      --shaped-bg: var(
        --ha-color-error-container,
        var(
          --md-sys-color-error-container,
          var(--ha-color-fill-danger-normal-resting)
        )
      );
      --shaped-fg: var(
        --ha-color-on-error-container,
        var(--md-sys-color-on-error-container, var(--ha-color-on-danger-normal))
      );
    }
    :host([tone="neutral"]) {
      --shaped-bg: var(
        --md-sys-color-surface-container-highest,
        var(--ha-color-fill-neutral-normal-resting)
      );
      --shaped-fg: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
    }
    .graphic {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .shape {
      fill: var(--shaped-bg);
      stroke: var(--shaped-bg);
    }
    .ring {
      stroke: var(--shaped-fg);
      opacity: 0.45;
    }
    .icon {
      position: relative;
      display: grid;
      place-items: center;
      color: var(--shaped-fg);
      --mdc-icon-size: var(--ha-shaped-icon-icon-size, 24px);
    }
    :host([shape="warning"]) .icon {
      /* The triangle is heavier at the bottom, so its icon sits lower. */
      top: 3px;
      --mdc-icon-size: var(--ha-shaped-icon-icon-size, 20px);
    }
    ::slotted(*) {
      --mdc-icon-size: var(--ha-shaped-icon-icon-size, 24px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-shaped-icon": HaShapedIcon;
  }
}
