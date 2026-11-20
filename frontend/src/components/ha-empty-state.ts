import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { playArrival, playPictureFloat } from "../common/motion/drama";
import { playPageEntry } from "../common/motion/page-entry";
import type { EmptyStateTone } from "./empty-state-logic";
import type { EmptyPicture } from "./graphics/empty-pictures";
import { emptyStatePicture, pictureTemplate } from "./graphics/empty-pictures";

/**
 * A calm message for a list or page with nothing to show: an icon in a tonal
 * circle, one sentence and one action.
 *
 * - `tone` picks the colours: "start" (nothing yet), "filtered" (search or
 *   filters hide everything) or "missing".
 * - `picture` is opt-in. An empty page is not an action, so by default it
 *   shows only the icon in a tonal circle. A caller may ask for "shelf",
 *   "list", "search", "repair" or "offline", or "auto" to let the tone choose.
 * - `float` is opt-in too: only then does an opted-in picture float.
 * - `heading` is the one sentence; `description` is optional and smaller.
 * - Slots: `icon` for the icon and `actions` for the one action. With a
 *   picture, the icon sits in a small tonal badge on the picture.
 * - The element has `role="status"`, so a screen reader announces it when it
 *   appears. The picture is decoration and hidden from screen readers.
 * - It rises once when first shown. An opted-in picture draws itself in, and
 *   floats three times only when `float` is set; nothing loops while the page
 *   rests. Nothing moves when the person asks for reduced motion or has
 *   turned motion off.
 */
@customElement("ha-empty-state")
export class HaEmptyState extends LitElement {
  @property({ reflect: true }) public tone: EmptyStateTone = "start";

  @property() public heading = "";

  @property() public description = "";

  @property() public picture?: EmptyPicture | "auto" | "none";

  /** Whether an opted-in picture floats after it arrives. Off by default. */
  @property({ type: Boolean }) public float = false;

  @state() private _hasIcon = false;

  @query(".picture svg") private _pictureSvg?: SVGSVGElement;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "status");
  }

  protected firstUpdated(): void {
    playPageEntry([this]);
    const svg = this._pictureSvg;
    if (!svg) {
      return;
    }
    playArrival({
      lines: Array.from(svg.querySelectorAll<SVGGeometryElement>(".draw")),
    });
    if (this.float) {
      playPictureFloat(svg);
    }
  }

  private get _picture(): EmptyPicture | undefined {
    return emptyStatePicture(this.picture, this.tone);
  }

  private _iconChanged(ev: Event): void {
    this._hasIcon =
      (ev.target as HTMLSlotElement).assignedNodes({ flatten: true }).length >
      0;
  }

  protected render() {
    const picture = this._picture;
    const icon = html`<slot
      name="icon"
      @slotchange=${this._iconChanged}
    ></slot>`;
    return html`
      ${
        picture
          ? html`<div class="picture" aria-hidden="true">
              <svg viewBox="0 0 220 150" focusable="false">
                ${pictureTemplate(picture)}
              </svg>
              <div class="badge" ?hidden=${!this._hasIcon}>${icon}</div>
            </div>`
          : html`<div class="icon" aria-hidden="true">${icon}</div>`
      }
      <p class="heading">${this.heading}</p>
      ${
        this.description
          ? html`<p class="description">${this.description}</p>`
          : nothing
      }
      <div class="actions"><slot name="actions"></slot></div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      box-sizing: border-box;
      max-width: 420px;
      margin: 0 auto;
      padding: var(--ha-space-8, 32px) var(--ha-space-4, 16px);
      text-align: center;
      color: var(--primary-text-color);
      --empty-state-tint: var(--md-sys-color-primary, var(--primary-color));
      --empty-state-tint-bg: var(
        --md-sys-color-primary-container,
        var(--ha-color-fill-primary-quiet-resting)
      );
      --empty-state-base: var(
        --md-sys-color-outline-variant,
        var(--divider-color)
      );
      --empty-state-soft: var(
        --md-sys-color-surface-container-high,
        var(--secondary-background-color)
      );
      --empty-state-leaf: var(
        --ha-color-on-success-quiet,
        var(--success-color, #43a047)
      );
      --empty-state-warm: var(
        --ha-color-on-warning-quiet,
        var(--warning-color, #ffa600)
      );
    }
    :host([tone="filtered"]) {
      --empty-state-tint: var(
        --md-sys-color-tertiary,
        var(--secondary-text-color)
      );
      --empty-state-tint-bg: var(
        --md-sys-color-tertiary-container,
        var(--ha-color-fill-neutral-quiet-resting)
      );
    }
    :host([tone="missing"]) {
      --empty-state-tint: var(--md-sys-color-error, var(--error-color));
      --empty-state-tint-bg: var(
        --md-sys-color-error-container,
        var(--ha-color-fill-danger-quiet-resting)
      );
    }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: var(--empty-state-tint-bg);
      color: var(--empty-state-tint);
      --mdc-icon-size: 48px;
    }
    .picture {
      position: relative;
      width: min(220px, 100%);
      aspect-ratio: 220 / 150;
    }
    .picture svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .picture .base {
      fill: var(--empty-state-base);
    }
    .picture .soft {
      fill: var(--empty-state-soft);
    }
    .picture .accent {
      fill: var(--empty-state-tint);
    }
    .picture .accent-line {
      stroke: var(--empty-state-tint);
    }
    .picture .leaf {
      fill: var(--empty-state-leaf);
    }
    .picture .leaf-line {
      stroke: var(--empty-state-leaf);
    }
    .picture .warm {
      fill: var(--empty-state-warm);
    }
    .picture .dashed {
      stroke: var(--empty-state-tint);
    }
    .badge {
      position: absolute;
      inset-inline-end: 4px;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--empty-state-tint-bg);
      color: var(--empty-state-tint);
      box-shadow: 0 0 0 4px var(--card-background-color, transparent);
      --mdc-icon-size: 24px;
    }
    .badge[hidden] {
      display: none;
    }
    .heading {
      margin: var(--ha-space-2, 8px) 0 0;
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: 700;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .description {
      margin: 0;
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .actions {
      margin-top: var(--ha-space-2, 8px);
      max-width: 100%;
    }
    /* Phone: a smaller picture and icon, an 18 px heading, tighter padding. */
    @media (max-width: 600px) {
      :host {
        padding: var(--ha-space-4, 16px);
      }
      .icon {
        width: 56px;
        height: 56px;
        --mdc-icon-size: 28px;
      }
      .picture {
        width: min(160px, 100%);
      }
      .badge {
        width: 40px;
        height: 40px;
        --mdc-icon-size: 20px;
      }
      .heading {
        font-size: 18px;
      }
      .description {
        font-size: 14px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-empty-state": HaEmptyState;
  }
}
