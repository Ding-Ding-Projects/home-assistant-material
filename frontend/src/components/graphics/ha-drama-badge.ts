import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, query, queryAll } from "lit/decorators";
import { playFailed, playFinished } from "../../common/motion/drama";

export type DramaBadgeKind = "finished" | "failed";

/** The six rays of the finished moment, 60 degrees apart. */
export const DRAMA_RAY_ANGLES = [0, 60, 120, 180, 240, 300];

/**
 * The badge of a finished or failed moment: a green circle with a tick, or a
 * red warning triangle. It plays its moment once when it is first shown, and
 * again when `replay()` is called:
 *
 * - finished: the badge pops, the tick draws, two rings and six rays leave.
 * - failed: one red flash and one firm shake.
 *
 * It follows the "Celebrations" and "Failures" motion kinds and the drama
 * choice; nothing moves under reduced motion. It is decoration
 * (`aria-hidden`): the words next to it say what happened, and stay on screen.
 *
 * @cssprop --ha-drama-badge-size - Width and height of the badge, 64px.
 */
@customElement("ha-drama-badge")
export class HaDramaBadge extends LitElement {
  @property({ reflect: true }) public kind: DramaBadgeKind = "finished";

  /**
   * An element outside the badge that shakes with it on failure, for example
   * the card it sits in. By default only the badge shakes.
   */
  @property({ attribute: false }) public shakeTarget?: Element;

  @query(".badge") private _badge?: SVGSVGElement;

  @query(".tick") private _tick?: SVGPathElement;

  @query(".flash") private _flash?: HTMLElement;

  @queryAll(".ring") private _rings?: NodeListOf<HTMLElement>;

  @queryAll(".ray") private _rays?: NodeListOf<HTMLElement>;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("aria-hidden", "true");
  }

  protected firstUpdated(): void {
    this.replay();
  }

  /** Plays the moment again, for example when a second try also failed. */
  public replay(): Animation[] {
    if (this.kind === "failed") {
      return playFailed({
        target: this.shakeTarget ?? this._badge,
        flash: this._flash,
      });
    }
    return playFinished({
      badge: this._badge,
      tick: this._tick,
      rings: Array.from(this._rings ?? []),
      rays: Array.from(this._rays ?? []).map((element, index) => ({
        element,
        angle: DRAMA_RAY_ANGLES[index] ?? 0,
      })),
    });
  }

  protected render() {
    const failed = this.kind === "failed";
    return html`<div class="stage">
      ${failed ? html`<div class="flash"></div>` : nothing}
      ${
        failed
          ? nothing
          : html`<div class="ring ring-a"></div>
              <div class="ring ring-b"></div>
              <div class="rays">
                ${DRAMA_RAY_ANGLES.map(
                  (_angle, index) =>
                    html`<div class="ray ray-${index % 3}"></div>`
                )}
              </div>`
      }
      <svg class="badge" viewBox="0 0 130 130" focusable="false">
        ${
          failed
            ? svg`<path
                  class="fill"
                  d="M65 10 L122 112 H8 Z"
                  stroke-width="10"
                  stroke-linejoin="round"
                ></path>
                <path
                  class="mark"
                  d="M65 48 V78"
                  stroke-width="11"
                  stroke-linecap="round"
                ></path>
                <circle class="dot" cx="65" cy="96" r="6.5"></circle>`
            : svg`<circle class="fill" cx="65" cy="65" r="60"></circle>
                <path
                  class="tick mark"
                  d="M38 67 L58 87 L94 46"
                  fill="none"
                  stroke-width="11"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                ></path>`
        }
      </svg>
    </div>`;
  }

  static styles = css`
    :host {
      --drama-fill: var(
        --ha-color-success-container,
        var(--ha-color-fill-success-normal-resting)
      );
      --drama-mark: var(
        --ha-color-on-success-container,
        var(--ha-color-on-success-normal)
      );
      --drama-ring: var(--ha-color-on-success-quiet, var(--success-color));
      display: inline-grid;
      flex: none;
      width: var(--ha-drama-badge-size, 64px);
      height: var(--ha-drama-badge-size, 64px);
    }
    :host([kind="failed"]) {
      --drama-fill: var(
        --ha-color-error-container,
        var(--md-sys-color-error-container, var(--error-color))
      );
      --drama-mark: var(
        --ha-color-on-error-container,
        var(--md-sys-color-on-error-container, var(--text-primary-color))
      );
    }
    .stage {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }
    .badge {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .fill {
      fill: var(--drama-fill);
      stroke: var(--drama-fill);
    }
    .mark {
      stroke: var(--drama-mark);
    }
    .dot {
      fill: var(--drama-mark);
    }
    .ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 4px solid var(--drama-ring);
      opacity: 0;
      pointer-events: none;
    }
    .ring-b {
      border-width: 2px;
    }
    .rays {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 0;
      height: 0;
    }
    .ray {
      position: absolute;
      left: -2px;
      top: -14px;
      width: 4px;
      height: 14px;
      border-radius: 2px;
      opacity: 0;
      transform-origin: 2px 14px;
      pointer-events: none;
    }
    .ray-0 {
      background: var(--ha-color-on-warning-quiet, var(--warning-color));
    }
    .ray-1 {
      background: var(--drama-ring);
    }
    .ray-2 {
      background: var(--primary-color);
    }
    /* A red halo around the badge, kept close so it never covers the words
       next to it. */
    .flash {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--error-color, #db4437);
      box-shadow: 0 0 0 10px var(--error-color, #db4437);
      opacity: 0;
      pointer-events: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-drama-badge": HaDramaBadge;
  }
}
