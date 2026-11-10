import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";

/**
 * The large title of an everyday page, with one line under it that says
 * what the page holds now. Anything in the default slot sits at the end of
 * the row, for example a range switch.
 */
@customElement("ha-panel-heading")
export class HaPanelHeading extends LitElement {
  @property() public heading?: string;

  @property() public summary?: string;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  protected render() {
    return html`
      <div class="titles">
        <h1>${this.heading}</h1>
        ${this.summary && !this.narrow ? html`<p>${this.summary}</p>` : nothing}
      </div>
      <div class="end"><slot></slot></div>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--ha-space-4) var(--ha-space-6);
      padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-2);
      box-sizing: border-box;
      color: var(--primary-text-color);
    }
    .titles {
      flex: 1 1 auto;
      min-width: 0;
    }
    h1 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-4xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    :host([narrow]) h1 {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-normal);
    }
    p {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-l);
      color: var(--secondary-text-color);
    }
    .end {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-heading": HaPanelHeading;
  }
}
