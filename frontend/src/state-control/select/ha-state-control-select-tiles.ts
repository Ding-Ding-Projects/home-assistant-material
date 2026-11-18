import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";

export interface SelectTileOption {
  value: string;
  label: string;
}

/** Up to this many options are drawn as tiles; more use a list. */
export const SELECT_TILES_MAX_OPTIONS = 5;

declare global {
  interface HASSDomEvents {
    "tile-selected": { value: string };
  }
}

/**
 * A short list of options drawn as tiles, one per option, each at least
 * 44 px tall. Used by the select and input select entity kinds.
 */
@customElement("ha-state-control-select-tiles")
export class HaStateControlSelectTiles extends LitElement {
  @property({ attribute: false }) public options: SelectTileOption[] = [];

  @property() public value?: string;

  @property() public label?: string;

  @property({ type: Boolean }) public disabled = false;

  protected render(): TemplateResult {
    return html`
      <div class="tiles" role="radiogroup" aria-label=${this.label ?? ""}>
        ${this.options.map(
          (option) => html`
            <button
              type="button"
              class="tile"
              role="radio"
              aria-checked=${option.value === this.value ? "true" : "false"}
              .disabled=${this.disabled}
              .optionValue=${option.value}
              @click=${this._clicked}
            >
              ${option.label}
            </button>
          `
        )}
      </div>
    `;
  }

  private _clicked(ev: Event) {
    const value = (ev.currentTarget as HTMLElement & { optionValue: string })
      .optionValue;
    if (value !== this.value) {
      fireEvent(this, "tile-selected", { value });
    }
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .tile {
      appearance: none;
      flex: 1 1 96px;
      min-height: 48px;
      padding: 0 var(--ha-space-4);
      border: 1px solid var(--outline-color, var(--divider-color));
      border-radius: var(--ha-border-radius-xl);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .tile[aria-checked="true"] {
      background: var(--primary-color);
      border-color: transparent;
      color: var(--text-primary-color, #fff);
    }
    .tile:focus-visible {
      outline: 2px solid var(--primary-text-color);
      outline-offset: 2px;
    }
    .tile:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-state-control-select-tiles": HaStateControlSelectTiles;
  }
}
