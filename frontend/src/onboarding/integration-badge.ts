import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { brandsAccessTokenContext } from "../data/context";
import { brandsUrl } from "../util/brands-url";

@customElement("integration-badge")
class IntegrationBadge extends LitElement {
  @property() public domain!: string;

  // eslint-disable-next-line lit/no-native-attributes
  @property({ attribute: false }) public title!: string;

  @property({ attribute: "dark-optimized-icon", type: Boolean })
  public darkOptimizedIcon = false;

  @property({ attribute: false })
  public clickable = false;

  // Draw the badge as a wide row with a status tag instead of a tile.
  @property({ type: Boolean, reflect: true }) public row = false;

  @property({ attribute: false }) public status?: string;

  @property({ attribute: false }) public done = false;

  @state()
  @consume({ context: brandsAccessTokenContext, subscribe: true })
  // @ts-ignore re-render trigger only, its value is never read
  private _brandsAccessToken?: string;

  protected render(): TemplateResult {
    return html`
      <div class="icon">
        <img
          alt=""
          src=${brandsUrl(
            {
              domain: this.domain,
              type: "icon",
              darkOptimized: this.darkOptimizedIcon,
            },
            location.origin
          )}
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
        />
      </div>
      <div class="title">${this.title}</div>
      ${
        this.row && this.status
          ? html`<div class="status ${this.done ? "done" : ""}">
              ${this.status}
            </div>`
          : nothing
      }
    `;
  }

  static styles = css`
    :host {
      display: inline-flex;
      flex-direction: column;
      text-align: center;
      color: var(--primary-text-color);
    }

    :host([row]) {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--ha-space-4);
      text-align: start;
      min-height: 64px;
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
    }

    :host([row]) .icon {
      flex: none;
      margin: 0;
      height: 40px;
      width: 40px;
      border-radius: var(--ha-border-radius-lg);
      background: var(--card-background-color);
      padding: var(--ha-space-1);
      box-sizing: border-box;
    }

    :host([row]) .title {
      flex: 1;
      min-width: 0;
      min-height: 0;
      font-weight: var(--ha-font-weight-medium);
    }

    .status {
      flex: none;
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: var(--divider-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }

    .status.done {
      background: var(--success-color);
      color: var(--text-primary-color, #fff);
    }

    img {
      max-width: 100%;
      max-height: 100%;
    }

    .icon {
      position: relative;
      margin: 0 auto 8px;
      height: 40px;
      width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .title {
      min-height: 2.3em;
      word-break: break-word;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "integration-badge": IntegrationBadge;
  }
}
