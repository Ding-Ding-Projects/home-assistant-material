import {
  mdiLightbulb,
  mdiLock,
  mdiLockOpenVariant,
  mdiMinus,
  mdiPause,
  mdiPlay,
  mdiPlus,
  mdiSkipNext,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeStateName } from "../../../common/entity/compute_state_name";
import {
  featuredClimate,
  featuredRoom,
  lockFacts,
  playingMedia,
} from "../../../common/home/home-hero";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/ha-control-slider";
import "../../home/components/ha-home-power-tile";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { HomeHeroCardConfig } from "./types";

/**
 * The large cards on the Home page: the lights of the room that has the
 * most, the first thermostat, the locks, and whatever is playing. Each one
 * is shown only when the home has such a thing, and each control acts on
 * the real entities.
 */
@customElement("hui-home-hero-card")
export class HuiHomeHeroCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: HomeHeroCardConfig;

  public setConfig(config: HomeHeroCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  private _room = memoizeOne(featuredRoom);

  private _climate = memoizeOne(featuredClimate);

  private _locks = memoizeOne(lockFacts);

  private _media = memoizeOne(playingMedia);

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const hass = this.hass;
    const room = this._room(hass.states, hass.entities, hass.devices);
    const climateId = this._climate(hass.states, hass.entities);
    const locks = this._locks(hass.states, hass.entities);
    const mediaId = this._media(hass.states, hass.entities);
    if (!room && !climateId && !locks && !mediaId) {
      return nothing;
    }
    return html`
      <div class="heroes">
        ${room ? this._renderRoom(room) : nothing}
        ${climateId ? this._renderClimate(hass.states[climateId]) : nothing}
        <ha-home-power-tile .hass=${hass}></ha-home-power-tile>
        ${locks ? this._renderLocks(locks) : nothing}
        ${mediaId ? this._renderMedia(hass.states[mediaId]) : nothing}
      </div>
    `;
  }

  private _renderRoom(room: NonNullable<ReturnType<typeof featuredRoom>>) {
    const hass = this.hass!;
    const localize = hass.localize;
    const anyOn = room.on.length > 0;
    return html`
      <section class=${classMap({ hero: true, room: true, on: anyOn })}>
        <header>
          <span class="tile"
            ><ha-svg-icon .path=${mdiLightbulb}></ha-svg-icon
          ></span>
          <div class="heading">
            <h2>${hass.areas[room.areaId]?.name ?? room.areaId}</h2>
            <span
              >${localize("ui.panel.lovelace.cards.home_hero.lights_on", {
                count: room.lights.length,
                on: room.on.length,
              })}</span
            >
          </div>
          <ha-switch
            .checked=${anyOn}
            .ariaLabel=${localize(
              "ui.panel.lovelace.cards.home_hero.all_lights",
              {
                room: hass.areas[room.areaId]?.name ?? room.areaId,
              }
            )}
            data-lights=${room.lights.join(",")}
            @change=${this._toggleRoom}
          ></ha-switch>
        </header>
        <div class="big">
          ${
            room.brightness !== undefined
              ? `${room.brightness}%`
              : localize(
                  anyOn
                    ? "ui.panel.lovelace.cards.home_hero.on"
                    : "ui.panel.lovelace.cards.home_hero.off"
                )
          }
        </div>
        <span class="caption"
          >${
            room.brightness !== undefined
              ? localize("ui.panel.lovelace.cards.home_hero.brightness")
              : localize("ui.panel.lovelace.cards.home_hero.lights_on", {
                  count: room.lights.length,
                  on: room.on.length,
                })
          }</span
        >
        ${
          room.dimmable.length
            ? html`<ha-control-slider
                .value=${room.brightness ?? 0}
                min="1"
                max="100"
                .locale=${hass.locale}
                .label=${localize("ui.panel.lovelace.cards.home_hero.brightness")}
                unit="%"
                data-lights=${room.dimmable.join(",")}
                @value-changed=${this._setBrightness}
              ></ha-control-slider>`
            : nothing
        }
        <div class="chips">
          ${room.lights.map((entityId) => {
            const stateObj = hass.states[entityId];
            const on = stateObj.state === "on";
            return html`<button
              type="button"
              class=${classMap({ chip: true, on })}
              aria-pressed=${on ? "true" : "false"}
              data-entity=${entityId}
              @click=${this._toggleLight}
            >
              ${computeStateName(stateObj)}
            </button>`;
          })}
        </div>
      </section>
    `;
  }

  private _renderClimate(stateObj: HassEntity) {
    const hass = this.hass!;
    const localize = hass.localize;
    const current = Number(stateObj.attributes.current_temperature);
    const target = Number(stateObj.attributes.temperature);
    const action = stateObj.attributes.hvac_action as string | undefined;
    const unit = hass.config.unit_system.temperature;
    const number = (value: number) =>
      formatNumber(value, hass.locale, { maximumFractionDigits: 1 });
    return html`
      <section class="hero climate">
        <header>
          <div class="heading">
            <button
              type="button"
              class="name"
              data-entity=${stateObj.entity_id}
              @click=${this._moreInfo}
            >
              ${computeStateName(stateObj)}
            </button>
          </div>
          ${
            action && action !== "off" && action !== "idle"
              ? html`<span class="badge"
                  >${hass.formatEntityAttributeValue(
                    stateObj,
                    "hvac_action"
                  )}</span
                >`
              : nothing
          }
        </header>
        <div class="row">
          <div class="big">
            ${Number.isFinite(current) ? `${number(current)}°` : "—"}
          </div>
          ${
            Number.isFinite(target)
              ? html`<div class="steps">
                  <ha-icon-button
                    class="step"
                    .label=${localize("ui.panel.lovelace.cards.home_hero.cooler")}
                    .path=${mdiMinus}
                    data-entity=${stateObj.entity_id}
                    data-direction="-1"
                    @click=${this._stepTemperature}
                  ></ha-icon-button>
                  <ha-icon-button
                    class="step plus"
                    .label=${localize("ui.panel.lovelace.cards.home_hero.warmer")}
                    .path=${mdiPlus}
                    data-entity=${stateObj.entity_id}
                    data-direction="1"
                    @click=${this._stepTemperature}
                  ></ha-icon-button>
                </div>`
              : nothing
          }
        </div>
        <span class="caption"
          >${
            Number.isFinite(target)
              ? localize("ui.panel.lovelace.cards.home_hero.target", {
                  temperature: `${number(target)}${unit}`,
                  mode: hass.formatEntityState(stateObj),
                })
              : hass.formatEntityState(stateObj)
          }</span
        >
      </section>
    `;
  }

  private _renderLocks(locks: NonNullable<ReturnType<typeof lockFacts>>) {
    const localize = this.hass!.localize;
    const open = locks.unlocked.length;
    return html`
      <section class=${classMap({ hero: true, locks: true, open: open > 0 })}>
        <span class="tile"
          ><ha-svg-icon
            .path=${open ? mdiLockOpenVariant : mdiLock}
          ></ha-svg-icon
        ></span>
        <h2>
          ${
            open
              ? localize("ui.panel.lovelace.cards.home_hero.not_locked", {
                  count: open,
                })
              : localize("ui.panel.lovelace.cards.home_hero.all_locked")
          }
        </h2>
        <span class="caption"
          >${localize("ui.panel.lovelace.cards.home_hero.doors", {
            count: locks.locks.length,
          })}</span
        >
        ${
          open
            ? html`<button
                type="button"
                class="chip on"
                data-locks=${locks.unlocked.join(",")}
                @click=${this._lockAll}
              >
                ${localize("ui.panel.lovelace.cards.home_hero.lock_all")}
              </button>`
            : nothing
        }
      </section>
    `;
  }

  private _renderMedia(stateObj: HassEntity) {
    const localize = this.hass!.localize;
    const playing = stateObj.state === "playing";
    return html`
      <section class="hero media">
        <button
          type="button"
          class="name"
          data-entity=${stateObj.entity_id}
          @click=${this._moreInfo}
        >
          ${computeStateName(stateObj)}
        </button>
        <h2>
          ${
            stateObj.attributes.media_title ||
            this.hass!.formatEntityState(stateObj)
          }
        </h2>
        <div class="steps">
          <ha-icon-button
            class="step plus"
            .label=${localize(
              playing
                ? "ui.panel.lovelace.cards.home_hero.pause"
                : "ui.panel.lovelace.cards.home_hero.play"
            )}
            .path=${playing ? mdiPause : mdiPlay}
            data-entity=${stateObj.entity_id}
            data-service="media_play_pause"
            @click=${this._mediaAction}
          ></ha-icon-button>
          <ha-icon-button
            class="step"
            .label=${localize("ui.panel.lovelace.cards.home_hero.next")}
            .path=${mdiSkipNext}
            data-entity=${stateObj.entity_id}
            data-service="media_next_track"
            @click=${this._mediaAction}
          ></ha-icon-button>
        </div>
      </section>
    `;
  }

  private _ids(ev: Event, key: string): string[] {
    return ((ev.currentTarget as HTMLElement).dataset[key] ?? "")
      .split(",")
      .filter(Boolean);
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

  private _stepTemperature(ev: Event): void {
    const { entity, direction } = (ev.currentTarget as HTMLElement).dataset;
    const stateObj = entity ? this.hass!.states[entity] : undefined;
    if (!stateObj) {
      return;
    }
    const step = Number(stateObj.attributes.target_temp_step) || 0.5;
    const target = Number(stateObj.attributes.temperature);
    const min = Number(stateObj.attributes.min_temp);
    const max = Number(stateObj.attributes.max_temp);
    let next = target + step * Number(direction);
    if (Number.isFinite(min)) {
      next = Math.max(min, next);
    }
    if (Number.isFinite(max)) {
      next = Math.min(max, next);
    }
    this.hass!.callService("climate", "set_temperature", {
      entity_id: entity,
      temperature: Math.round(next * 10) / 10,
    });
  }

  private _lockAll(ev: Event): void {
    this.hass!.callService("lock", "lock", {
      entity_id: this._ids(ev, "locks"),
    });
  }

  private _mediaAction(ev: Event): void {
    const { entity, service } = (ev.currentTarget as HTMLElement).dataset;
    if (entity && service) {
      this.hass!.callService("media_player", service, { entity_id: entity });
    }
  }

  private _moreInfo(ev: Event): void {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .heroes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--ha-space-3);
    }
    .hero {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      min-width: 0;
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
    }
    .hero.room {
      grid-column: span 2;
    }
    .hero.room.on {
      background: color-mix(
        in srgb,
        var(--primary-color) 20%,
        var(--primary-background-color)
      );
    }
    .hero.locks {
      background: color-mix(
        in srgb,
        var(--success-color) 28%,
        var(--primary-background-color)
      );
    }
    .hero.locks.open {
      background: color-mix(
        in srgb,
        var(--warning-color) 40%,
        var(--primary-background-color)
      );
    }
    .hero.media {
      background: color-mix(
        in srgb,
        var(--accent-color) 22%,
        var(--primary-background-color)
      );
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
    .heading span,
    .caption {
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
    .tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: var(--ha-border-radius-xl);
      background: var(--primary-background-color);
      --mdc-icon-size: 26px;
    }
    .big {
      font-family: var(--ha-font-family-heading, inherit);
      font-size: clamp(40px, 5vw, 64px);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
    }
    .steps {
      display: flex;
      gap: var(--ha-space-2);
    }
    .step {
      --ha-icon-button-size: 48px;
      border-radius: var(--ha-border-radius-circle);
      background: var(--primary-background-color);
    }
    .step.plus {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .badge {
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: color-mix(
        in srgb,
        var(--warning-color) 45%,
        var(--primary-background-color)
      );
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    ha-control-slider {
      --control-slider-thickness: 48px;
      --control-slider-border-radius: var(--ha-border-radius-pill);
      --control-slider-color: var(--primary-color);
      --control-slider-background: var(--primary-background-color);
      --control-slider-background-opacity: 1;
      margin-top: var(--ha-space-2);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .chip {
      align-self: flex-start;
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-4);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-lg);
      background: none;
      font-weight: var(--ha-font-weight-medium);
    }
    .chip.on {
      border-color: transparent;
      background: var(--primary-background-color);
    }
    .name {
      align-self: flex-start;
      padding: 0;
      border: none;
      background: none;
      font-weight: var(--ha-font-weight-medium);
      text-align: start;
    }
    button:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    @media (max-width: 600px) {
      .hero.room {
        grid-column: auto;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-home-hero-card": HuiHomeHeroCard;
  }
}
