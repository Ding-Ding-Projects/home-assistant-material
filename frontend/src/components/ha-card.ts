import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import {
  haMotionKeyframes,
  haMotionTransition,
} from "../resources/motion-styles";

@customElement("ha-card")
export class HaCard extends LitElement {
  @property() public header?: string;

  @property({ type: Boolean, reflect: true }) public raised = false;

  static styles = css`
    ${haMotionKeyframes}

    :host {
      background: var(
        --ha-card-background,
        var(--card-background-color, white)
      );
      backdrop-filter: var(--ha-card-backdrop-filter, none);
      box-shadow: var(--ha-card-box-shadow, var(--ha-shadow-card, none));
      box-sizing: border-box;
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-4xl));
      border-width: var(--ha-card-border-width, 0px);
      border-style: solid;
      border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
      color: var(--primary-text-color);
      display: block;
      ${haMotionTransition}
      animation: ha-rise var(--ha-animation-duration-enter, 1ms)
        var(--ha-motion-spring, ease) backwards;
      position: relative;
    }

    :host([raised]) {
      border: none;
      box-shadow: var(--ha-card-box-shadow, var(--ha-shadow-overlay, none));
    }

    .card-header,
    :host ::slotted(.card-header) {
      color: var(--ha-card-header-color, var(--primary-text-color));
      font-family: var(--ha-card-header-font-family, inherit);
      font-size: var(--ha-card-header-font-size, var(--ha-font-size-2xl));
      letter-spacing: -0.012em;
      line-height: var(--ha-line-height-condensed);
      padding: var(--ha-space-5) var(--ha-space-4) var(--ha-space-6);
      display: block;
      margin-block-start: 0;
      margin-block-end: 0;
      font-weight: var(--ha-font-weight-title, var(--ha-font-weight-normal));
    }

    /* clean-css ignore:start */
    :host
      ::slotted(
        .card-content:not(:nth-child(1 of .card-content, .card-header))
      ),
    slot:not(:first-child)::slotted(.card-content) {
      padding-top: 0;
      margin-top: calc(var(--ha-space-2) * -1);
    }
    /* clean-css ignore:end */

    :host ::slotted(.card-content) {
      padding: var(--ha-space-4);
    }

    :host ::slotted(.card-actions) {
      border-top: 1px solid var(--divider-color, #e8e8e8);
      padding: var(--ha-space-2);
    }
  `;

  protected render() {
    return html`
      ${
        this.header
          ? html`<h1 class="card-header">${this.header}</h1>`
          : nothing
      }
      <slot></slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-card": HaCard;
  }
}
