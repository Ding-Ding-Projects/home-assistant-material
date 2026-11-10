import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { lightsByArea } from "../../../common/home/home-hero";
import "../../../components/ha-control-slider";
import "../../../components/ha-switch";
import { summariseRoomLights } from "../../light/room-lights";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { RoomLightsCardConfig } from "./types";

/**
 * The lights of one room on the Lights page: how many are on, one switch for
 * all of them, a brightness slider when any can be dimmed, and a chip for each
 * light. Every control acts on the real lights.
 */
@customElement("hui-room-lights-card")
export class HuiRoomLightsCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: RoomLightsCardConfig;

  public setConfig(config: RoomLightsCardConfig): void {
    if (!config.area) {
      throw new Error("An area is required");
    }
    this._config = config;
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 6, rows: "auto" };
  }

  private _byArea = memoizeOne(lightsByArea);

  private _ids(ev: Event, key: string): string[] {
    return ((ev.currentTarget as HTMLElement).dataset[key] ?? "")
      .split(",")
      .filter(Boolean);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const hass = this.hass;
    const localize = hass.localize;
    const areaId = this._config.area;
    const lights = this._byArea(hass.states, hass.entities, hass.devices)[
      areaId
    ];
    if (!lights?.length) {
      return nothing;
    }
    const room = summariseRoomLights(lights);
    const name = hass.areas[areaId]?.name ?? areaId;
    const anyOn = room.on.length > 0;
    return html`
      <section class=${classMap({ room: true, on: anyOn })}>
        <header>
          <div class="heading">
            <h2>${name}</h2>
            <span>
              ${localize("ui.panel.lovelace.cards.room_lights.of_on", {
                total: room.lights.length,
                on: room.on.length,
              })}
            </span>
          </div>
          <ha-switch
            .checked=${anyOn}
            .ariaLabel=${localize("ui.panel.lovelace.cards.room_lights.all", {
              room: name,
            })}
            data-lights=${room.lights.join(",")}
            @change=${this._toggleRoom}
          ></ha-switch>
        </header>
        ${
          room.dimmable.length
            ? html`<ha-control-slider
                .value=${room.brightness ?? 0}
                min="1"
                max="100"
                .locale=${hass.locale}
                .label=${localize("ui.panel.lovelace.cards.room_lights.brightness")}
                unit="%"
                data-lights=${room.dimmable.join(",")}
                @value-changed=${this._setBrightness}
              ></ha-control-slider>`
            : nothing
        }
        <div class="chips">
          ${room.lights.map((entityId) => {
            const on = hass.states[entityId].state === "on";
            return html`<button
              type="button"
              class=${classMap({ chip: true, on })}
              aria-pressed=${on ? "true" : "false"}
              data-entity=${entityId}
              @click=${this._toggleLight}
            >
              ${computeStateName(hass.states[entityId])}
            </button>`;
          })}
        </div>
      </section>
    `;
  }

  private _toggleRoom(ev: Event): void {
    const on = (ev.currentTarget as HTMLInputElement).checked;
    this.hass!.callService("light", on ? "turn_on" : "turn_off", {
      entity_id: this._ids(ev, "lights"),
    });
  }

  private _setBrightness(ev: CustomEvent<{ value: number }>): void {
    this.hass!.callService("light", "turn_on", {
      entity_id: this._ids(ev, "lights"),
      brightness_pct: ev.detail.value,
    });
  }

  private _toggleLight(ev: Event): void {
    this.hass!.callService("light", "toggle", {
      entity_id: this._ids(ev, "entity"),
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .room {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      min-width: 0;
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .heading {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .heading span {
      font-size: var(--ha-font-size-m);
      color: var(--secondary-text-color);
    }
    h2 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-2xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    ha-control-slider {
      --control-slider-thickness: 48px;
      --control-slider-border-radius: var(--ha-border-radius-pill);
      --control-slider-color: var(--primary-color);
      --control-slider-background: var(--primary-background-color);
      --control-slider-background-opacity: 1;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .chip {
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-4);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-lg);
      background: none;
      font-weight: var(--ha-font-weight-medium);
    }
    .chip.on {
      border-color: transparent;
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--primary-background-color)
      );
    }
    button:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-room-lights-card": HuiRoomLightsCard;
  }
}
