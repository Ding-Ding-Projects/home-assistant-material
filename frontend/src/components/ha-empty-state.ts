import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { playPageEntry } from "../common/motion/page-entry";
import type { EmptyStateTone } from "./empty-state-logic";

/**
 * A calm message for a list or page with nothing to show: a large icon, one
 * sentence and one action.
 *
 * - `tone` picks the colour of the icon: "start" (nothing yet), "filtered"
 *   (search or filters hide everything) or "missing".
 * - `heading` is the one sentence; `description` is optional and smaller.
 * - Slots: `icon` for the icon and `actions` for the one action.
 * - The element has `role="status"`, so a screen reader announces it when it
 *   appears.
 * - It rises once when first shown, and not at all when the person asks for
 *   reduced motion or has turned motion off.
 */
@customElement("ha-empty-state")
export class HaEmptyState extends LitElement {
  @property({ reflect: true }) public tone: EmptyStateTone = "start";

  @property() public heading = "";

  @property() public description = "";

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "status");
  }

  protected firstUpdated(): void {
    playPageEntry([this]);
  }

  protected render() {
    return html`
      <div class="icon" aria-hidden="true"><slot name="icon"></slot></div>
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
    }
    /* Phone: a 56 px icon circle, an 18 px heading and tighter padding. */
    @media (max-width: 600px) {
      :host {
        padding: var(--ha-space-4, 16px);
      }
      .icon {
        width: 56px;
        height: 56px;
        --mdc-icon-size: 28px;
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
