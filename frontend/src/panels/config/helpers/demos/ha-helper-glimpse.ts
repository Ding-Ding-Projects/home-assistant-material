import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { HELPER_DEMO_KINDS, hasHelperDemo } from "./helper-demo";

/**
 * A small static picture of what a helper looks like in use, for the kind
 * chooser. It is decoration: the kind's name next to it is the accessible
 * label, so the whole picture is hidden from assistive technology.
 */
@customElement("ha-helper-glimpse")
export class HaHelperGlimpse extends LitElement {
  @property() public domain?: string;

  protected render() {
    if (!this.domain || !hasHelperDemo(this.domain)) {
      return nothing;
    }
    return html`<span class="glimpse" aria-hidden="true"
      >${this._picture()}</span
    >`;
  }

  private _picture(): TemplateResult | typeof nothing {
    switch (HELPER_DEMO_KINDS[this.domain as keyof typeof HELPER_DEMO_KINDS]) {
      case "switch":
        return html`<span class="switch"><span class="knob"></span></span>`;
      case "press":
        return html`<span class="button"></span>`;
      case "number":
        return html`<span class="num">42</span
          ><span class="track"><span class="thumb"></span></span>`;
      case "text":
        return html`<span class="field"><span class="caret"></span></span>`;
      case "choice":
        return html`<span class="chip on"></span><span class="chip"></span
          ><span class="chip"></span>`;
      case "datetime":
        return html`<span class="clock"
          ><span class="hand h"></span><span class="hand m"></span
        ></span>`;
      case "counter":
        return html`<span class="step">−</span><span class="num">7</span
          ><span class="step">+</span>`;
      case "timer":
        return html`<span class="num">0:42</span>`;
      case "week":
        return html`<span class="week"
          ><span></span><span class="on"></span><span></span
          ><span class="on"></span><span></span
        ></span>`;
      default:
        return nothing;
    }
  }

  static styles = css`
    :host {
      display: inline-flex;
      flex: none;
    }
    .glimpse {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      block-size: 28px;
      color: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
      pointer-events: none;
    }
    .switch {
      position: relative;
      inline-size: 36px;
      block-size: 20px;
      border-radius: 10px;
      background: var(--md-sys-color-primary, var(--primary-color));
    }
    .knob {
      position: absolute;
      inset-block-start: 3px;
      inset-inline-end: 3px;
      inline-size: 14px;
      block-size: 14px;
      border-radius: 50%;
      background: var(--md-sys-color-on-primary, #fff);
    }
    .button {
      inline-size: 40px;
      block-size: 20px;
      border-radius: 10px;
      background: var(--md-sys-color-secondary-container, var(--divider-color));
    }
    .num {
      font-weight: var(--ha-font-weight-bold, 700);
      font-variant-numeric: tabular-nums;
      color: var(--md-sys-color-on-surface, var(--primary-text-color));
    }
    .track {
      position: relative;
      inline-size: 32px;
      block-size: 4px;
      border-radius: 2px;
      background: var(
        --md-sys-color-surface-container-highest,
        var(--divider-color)
      );
    }
    .thumb {
      position: absolute;
      inset-block-start: -4px;
      inset-inline-start: 12px;
      inline-size: 12px;
      block-size: 12px;
      border-radius: 50%;
      background: var(--md-sys-color-primary, var(--primary-color));
    }
    .field {
      display: inline-flex;
      align-items: center;
      inline-size: 52px;
      block-size: 20px;
      padding-inline: 6px;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1.5px solid var(--md-sys-color-outline, var(--divider-color));
    }
    .caret {
      inline-size: 1.5px;
      block-size: 10px;
      background: currentColor;
    }
    .chip {
      inline-size: 14px;
      block-size: 20px;
      border-radius: 6px;
      border: 1.5px solid var(--md-sys-color-outline, var(--divider-color));
      box-sizing: border-box;
    }
    .chip.on {
      background: var(--md-sys-color-secondary-container, var(--divider-color));
      border-color: transparent;
    }
    .clock {
      position: relative;
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      border: 2px solid var(--md-sys-color-primary, var(--primary-color));
      box-sizing: border-box;
    }
    .hand {
      position: absolute;
      inset-inline-start: 8px;
      inset-block-end: 8px;
      inline-size: 2px;
      background: currentColor;
      transform-origin: bottom center;
    }
    .hand.h {
      block-size: 5px;
    }
    .hand.m {
      block-size: 7px;
      transform: rotate(90deg);
    }
    .step {
      inline-size: 18px;
      block-size: 18px;
      line-height: 18px;
      text-align: center;
      border-radius: 50%;
      background: var(--md-sys-color-secondary-container, var(--divider-color));
    }
    .week {
      display: inline-flex;
      gap: 3px;
    }
    .week span {
      inline-size: 6px;
      block-size: 20px;
      border-radius: 3px;
      background: var(
        --md-sys-color-surface-container-highest,
        var(--divider-color)
      );
    }
    .week span.on {
      background: var(--md-sys-color-primary, var(--primary-color));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-helper-glimpse": HaHelperGlimpse;
  }
}
