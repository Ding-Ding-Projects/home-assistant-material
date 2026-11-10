import { mdiPalette } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import {
  greetingTime,
  homeFacts,
  homeScenes,
} from "../../../common/home/home-greeting";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard } from "../types";
import type { HomeGreetingCardConfig } from "./types";

/**
 * The top of the Home page: a greeting for the time of day, one sentence
 * about the home as it is now, and buttons for the scenes used most.
 */
@customElement("hui-home-greeting-card")
export class HuiHomeGreetingCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: HomeGreetingCardConfig;

  /** The scene a person just started, shown as chosen. */
  @state() private _started?: string;

  public setConfig(config: HomeGreetingCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 2;
  }

  private _facts = memoizeOne(homeFacts);

  private _scenes = memoizeOne(homeScenes);

  private _sentence(): string {
    const hass = this.hass!;
    const facts = this._facts(hass.states, hass.entities, hass.areas);
    const parts: string[] = [];
    if (facts.lightsOn !== undefined) {
      parts.push(
        hass.localize("ui.panel.lovelace.cards.home_greeting.lights", {
          count: facts.lightsOn,
        })
      );
    }
    if (facts.inside) {
      parts.push(
        hass.localize("ui.panel.lovelace.cards.home_greeting.inside", {
          temperature: `${formatNumber(facts.inside.temperature, hass.locale, {
            maximumFractionDigits: 1,
          })}${facts.inside.unit}`,
        })
      );
    }
    if (facts.locks) {
      parts.push(
        facts.locks.unlocked
          ? hass.localize("ui.panel.lovelace.cards.home_greeting.unlocked", {
              count: facts.locks.unlocked,
            })
          : hass.localize("ui.panel.lovelace.cards.home_greeting.all_locked")
      );
    }
    if (!parts.length) {
      return hass.localize("ui.panel.lovelace.cards.home_greeting.nothing");
    }
    let sentence: string;
    try {
      sentence = new Intl.ListFormat(hass.locale.language, {
        style: "long",
        type: "conjunction",
      }).format(parts);
    } catch (_err) {
      sentence = parts.join(", ");
    }
    return `${sentence.charAt(0).toLocaleUpperCase(hass.locale.language)}${sentence.slice(1)}.`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const hass = this.hass;
    const time = greetingTime(new Date().getHours());
    const name = hass.user?.name;
    const scenes = this._config.hide_scenes
      ? []
      : this._scenes(hass.states, hass.entities);
    return html`
      <div class="text">
        <h1>
          ${
            name
              ? hass.localize(
                  `ui.panel.lovelace.cards.home_greeting.${time}_user`,
                  { user: name }
                )
              : hass.localize(`ui.panel.lovelace.cards.home_greeting.${time}`)
          }
        </h1>
        <p>${this._sentence()}</p>
      </div>
      ${
        scenes.length
          ? html`<div
              class="scenes"
              role="group"
              aria-label=${hass.localize(
                "ui.panel.lovelace.cards.home_greeting.scenes"
              )}
            >
              ${scenes.map((entityId, index) => {
                const stateObj = hass.states[entityId];
                return html`<button
                  type="button"
                  class=${classMap({
                    scene: true,
                    on: this._started
                      ? this._started === entityId
                      : index === 0 && !!Date.parse(stateObj.state),
                  })}
                  data-entity=${entityId}
                  @click=${this._startScene}
                >
                  ${
                    stateObj.attributes.icon
                      ? html`<ha-state-icon
                          .hass=${hass}
                          .stateObj=${stateObj}
                        ></ha-state-icon>`
                      : html`<ha-svg-icon .path=${mdiPalette}></ha-svg-icon>`
                  }
                  ${computeStateName(stateObj)}
                </button>`;
              })}
            </div>`
          : nothing
      }
    `;
  }

  private async _startScene(ev: Event): Promise<void> {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (!entityId || !this.hass) {
      return;
    }
    this._started = entityId;
    try {
      await this.hass.callService("scene", "turn_on", { entity_id: entityId });
    } catch (_err) {
      this._started = undefined;
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--ha-space-4) var(--ha-space-6);
      padding: var(--ha-space-2) 0 var(--ha-space-4);
    }
    .text {
      min-width: 0;
    }
    h1 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: clamp(32px, 4.4vw, 56px);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: var(--primary-text-color);
    }
    p {
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-l);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    .scenes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .scene {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: var(--ha-space-12);
      padding: 0 var(--ha-space-5);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      --mdc-icon-size: 20px;
    }
    .scene:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .scene.on {
      border-color: transparent;
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--primary-background-color)
      );
    }
    .scene:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-home-greeting-card": HuiHomeGreetingCard;
  }
}
