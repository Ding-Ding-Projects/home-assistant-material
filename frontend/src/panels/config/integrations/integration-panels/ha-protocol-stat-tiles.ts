import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../../components/ha-svg-icon";

export type ProtocolStatTone = "primary" | "tertiary" | "success" | "warning";

export interface ProtocolStatTile {
  /** What the number counts, for example "Devices". */
  label: string;
  /** The number, or text that is already formatted. */
  value: number | string;
  /** Optional icon path shown beside the label. */
  icon?: string;
  /** Tint of the tile. Defaults to primary. */
  tone?: ProtocolStatTone;
}

/**
 * A row of tinted number tiles shown at the top of a protocol page, for
 * example the number of devices, how many are ready and how many are asleep.
 * Only values the page really has should be passed in.
 */
@customElement("ha-protocol-stat-tiles")
export class HaProtocolStatTiles extends LitElement {
  @property({ attribute: false }) public tiles: ProtocolStatTile[] = [];

  protected render(): TemplateResult | typeof nothing {
    if (!this.tiles.length) {
      return nothing;
    }
    return html`
      <ul>
        ${this.tiles.map(
          (tile) => html`
            <li class=${tile.tone ?? "primary"}>
              <span class="label">
                ${
                  tile.icon
                    ? html`<ha-svg-icon .path=${tile.icon}></ha-svg-icon>`
                    : nothing
                }
                ${tile.label}
              </span>
              <span class="value">${tile.value}</span>
            </li>
          `
        )}
      </ul>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--ha-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      min-width: 0;
      padding: var(--ha-space-4) var(--ha-space-5);
      border-radius: var(--ha-border-radius-2xl, 20px);
      background: var(--tile-bg);
      color: var(--tile-fg);
    }
    li.primary {
      --tile-bg: var(
        --ha-color-primary-container,
        var(--secondary-background-color)
      );
      --tile-fg: var(
        --ha-color-on-primary-container,
        var(--primary-text-color)
      );
    }
    li.tertiary {
      --tile-bg: var(
        --ha-color-tertiary-container,
        var(--secondary-background-color)
      );
      --tile-fg: var(
        --ha-color-on-tertiary-container,
        var(--primary-text-color)
      );
    }
    li.success {
      --tile-bg: var(
        --ha-color-success-container,
        var(--secondary-background-color)
      );
      --tile-fg: var(
        --ha-color-on-success-container,
        var(--primary-text-color)
      );
    }
    li.warning {
      --tile-bg: var(
        --ha-color-warning-container,
        var(--secondary-background-color)
      );
      --tile-fg: var(
        --ha-color-on-warning-container,
        var(--primary-text-color)
      );
    }
    .label {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .label ha-svg-icon {
      --mdc-icon-size: 18px;
      width: 18px;
      height: 18px;
    }
    .value {
      font-size: var(--ha-font-size-3xl);
      line-height: var(--ha-line-height-condensed);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-protocol-stat-tiles": HaProtocolStatTiles;
  }
}
