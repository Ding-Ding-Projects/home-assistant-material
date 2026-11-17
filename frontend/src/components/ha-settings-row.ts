import { HasSlotController } from "@home-assistant/webawesome/dist/internal/slot";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";

@customElement("ha-settings-row")
export class HaSettingsRow extends LitElement {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean, reflect: true }) public slim = false; // remove padding and min-height

  @property({ type: Boolean, attribute: "three-line" })
  public threeLine = false;

  @property({ type: Boolean, attribute: "wrap-heading", reflect: true })
  public wrapHeading = false;

  @property({ type: Boolean, reflect: true }) public empty = false;

  private readonly _hasSlotController = new HasSlotController(
    this,
    "description"
  );

  protected render(): TemplateResult {
    const hasDescription = this._hasSlotController.test("description");

    return html`
      <div class="prefix-wrap">
        <slot name="prefix"></slot>
        <div
          class="body"
          part="heading"
          ?two-line=${!this.threeLine && hasDescription}
          ?three-line=${this.threeLine}
        >
          <slot name="heading"></slot>
          ${
            hasDescription
              ? html`<span class="secondary"
                  ><slot name="description"></slot
                ></span>`
              : nothing
          }
        </div>
      </div>
      <div class="content">
        <slot></slot>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-wrap: wrap;
      box-sizing: border-box;
      min-height: 60px;
      margin-block: var(--ha-space-1);
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-settings-row-border-radius, 20px);
      background: var(
        --ha-settings-row-background,
        var(--ha-color-fill-neutral-quiet-resting, transparent)
      );
      align-content: normal;
      align-self: auto;
      align-items: center;
    }
    .body {
      padding-top: var(--settings-row-body-padding-top, var(--ha-space-2));
      padding-bottom: var(
        --settings-row-body-padding-bottom,
        var(--ha-space-2)
      );
      padding-left: 0;
      padding-inline-start: 0;
      padding-right: var(--ha-space-4);
      padding-inline-end: var(--ha-space-4);
      overflow: hidden;
      display: var(--layout-vertical_-_display, flex);
      flex-direction: var(--layout-vertical_-_flex-direction, column);
      justify-content: var(--layout-center-justified_-_justify-content, center);
      flex: var(--layout-flex_-_flex, 1);
      flex-basis: var(--layout-flex_-_flex-basis, 0.000000001px);
    }
    .body[three-line] {
      min-height: 88px;
    }
    :host(:not([wrap-heading])) body > * {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .body > .secondary {
      display: block;
      padding-top: var(--ha-space-1);
      font-family: var(--ha-font-family-body);
      font-size: calc(13px * var(--ha-font-size-scale, 1));
      -webkit-font-smoothing: var(--ha-font-smoothing);
      -moz-osx-font-smoothing: var(--ha-moz-osx-font-smoothing);
      font-weight: var(--ha-font-weight-normal);
      line-height: 1.35;
      color: var(--secondary-text-color);
    }
    ::slotted([slot="heading"]) {
      font-size: calc(15.5px * var(--ha-font-size-scale, 1));
      font-weight: var(--ha-font-weight-semibold, 600);
      line-height: 1.3;
    }
    .body[two-line] {
      min-height: calc(72px - 16px);
      flex: 1;
    }
    .content {
      display: contents;
    }
    :host(:not([narrow])) .content {
      display: var(--settings-row-content-display, flex);
      justify-content: flex-end;
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--settings-row-content-padding-block, var(--ha-space-4)) 0;
    }
    :host([empty]) .content {
      display: none;
    }
    .content ::slotted(*) {
      width: var(--settings-row-content-width);
    }
    :host([narrow]) {
      align-items: normal;
      flex-direction: column;
      flex-wrap: nowrap;
      border-top: none;
      padding-bottom: var(--ha-space-2);
    }
    /* Phone: a 56 px row with a 15 px label and 13 px description. */
    :host([narrow]) {
      min-height: 56px;
      padding-inline: var(--ha-space-3);
      border-radius: var(--ha-settings-row-border-radius, 16px);
    }
    :host([narrow]) ::slotted([slot="heading"]) {
      font-size: calc(15px * var(--ha-font-size-scale, 1));
    }
    ::slotted(ha-switch) {
      padding: var(--settings-row-switch-padding-block, var(--ha-space-4)) 0;
    }
    .secondary {
      white-space: normal;
    }
    .prefix-wrap {
      flex: var(--settings-row-prefix-flex, 1 1 220px);
      min-width: 0;
      display: var(--settings-row-prefix-display);
    }
    :host([narrow]) .prefix-wrap {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
    }
    :host([slim]) {
      min-height: 0;
      margin-block: 0;
      border-radius: 0;
      background: none;
    }
    :host([slim]),
    :host([slim]) .content,
    :host([slim]) ::slotted(ha-switch) {
      padding: 0;
    }
    :host([slim]) .body {
      min-height: 0;
    }
  `;
}
declare global {
  interface HTMLElementTagNameMap {
    "ha-settings-row": HaSettingsRow;
  }
}
