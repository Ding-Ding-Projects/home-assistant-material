import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";

/** How long the celebration stays, from first frame to removal. */
export const WORDING_CELEBRATION_MS = 3000;

/**
 * Full-window confirmation after a wording file is applied. It shows a
 * headline and a count, never takes focus or input, and ignores the pointer
 * so the page stays usable underneath. With `still` set it only fades.
 */
@customElement("ha-wording-celebration")
export class HaWordingCelebration extends LitElement {
  @property() public headline = "";

  @property() public detail = "";

  @property({ type: Boolean, reflect: true }) public still = false;

  // The live region exists first and receives its text one update later, so
  // a screen reader announces it once.
  @state() private _announce = false;

  protected firstUpdated() {
    this._announce = true;
  }

  protected render(): TemplateResult {
    return html`
      <div
        class=${classMap({ stage: true, still: this.still })}
        aria-hidden="true"
      >
        <div class="panel">
          <div class="badge">★</div>
          <div class="headline">${this.headline}</div>
          <div class="detail">${this.detail}</div>
        </div>
      </div>
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        ${this._announce ? `${this.headline}. ${this.detail}` : ""}
      </div>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      overflow: hidden;
      pointer-events: none;
    }
    .stage {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--ha-space-4, 16px);
      background: rgba(0, 0, 0, 0.45);
      animation: backdrop 3000ms ease-in-out both;
    }
    .panel {
      box-sizing: border-box;
      width: min(480px, 100%);
      max-height: 100%;
      overflow: hidden;
      padding: 40px 24px;
      border-radius: 28px;
      background: #2b2d31;
      color: #f1f2f6;
      text-align: center;
      font-family: var(--ha-font-family-body, sans-serif);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      animation: panel 3000ms cubic-bezier(0.2, 0, 0, 1) both;
    }
    .badge {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      border-radius: 20px;
      background: #ffdf7a;
      color: #5c4200;
      font-size: 32px;
      line-height: 64px;
    }
    .headline {
      font-size: 32px;
      line-height: 40px;
      font-weight: 500;
      margin-bottom: 12px;
      overflow-wrap: anywhere;
    }
    .detail {
      font-size: 16px;
      line-height: 24px;
      opacity: 0.85;
    }
    /* In for 300 ms, hold, out for the last 300 ms. */
    @keyframes backdrop {
      0% {
        opacity: 0;
      }
      10%,
      90% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    @keyframes panel {
      0% {
        opacity: 0;
        transform: scale(0.9) translateY(24px);
      }
      10% {
        opacity: 1;
        transform: none;
      }
      90% {
        opacity: 1;
        transform: none;
      }
      100% {
        opacity: 0;
        transform: scale(0.96);
      }
    }
    @keyframes fade {
      0% {
        opacity: 0;
      }
      8%,
      92% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    .stage.still,
    .stage.still .panel {
      animation: fade 3000ms linear both;
    }
    @media (prefers-reduced-motion: reduce) {
      .stage,
      .stage .panel {
        animation: fade 3000ms linear both;
      }
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-wording-celebration": HaWordingCelebration;
  }
}
