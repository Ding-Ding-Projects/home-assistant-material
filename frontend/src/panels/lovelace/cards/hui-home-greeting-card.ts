import { mdiPalette } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import {
  greetingTime,
  homeFacts,
  homeScenes,
} from "../../../common/home/home-greeting";
import { computeStateName } from "../../../common/entity/compute_state_name";
import type { Localize } from "../../../common/language-mode/language-mode";
import {
  joinForMode,
  textParts,
} from "../../../common/language-mode/language-mode";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import { playArrival } from "../../../common/motion/drama";
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

  @query(".text") private _text?: HTMLElement;

  @query(".scenes") private _scenesRow?: HTMLElement;

  private _arrived = false;

  public setConfig(config: HomeGreetingCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 2;
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    // The greeting and then the scene buttons rise in once, the first time
    // they are drawn, following the Arriving motion kind. Nothing moves under
    // reduced motion or low stimulation.
    if (!this._arrived && this._text) {
      this._arrived = true;
      playArrival({ rows: [this._text, this._scenesRow] });
    }
  }

  private _facts = memoizeOne(homeFacts);

  private _scenes = memoizeOne(homeScenes);

  // Draws the card again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // A string that follows the language mode where it has Cantonese.
  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass!.localize, key, values);
  }

  // The one sentence about the home, built once per language so two languages
  // sit side by side as whole sentences instead of mixed fact by fact.
  private _line(): string {
    const hass = this.hass!;
    const english = this._sentence(hass.localize);
    const mode = this._lang.mode;
    if (mode === "english") {
      return english;
    }
    const cantonese = this._sentence((key, values) => {
      const parts = textParts(hass.localize, key, values);
      return parts.cantonese ?? parts.english;
    });
    return joinForMode({ english, cantonese }, mode, " / ");
  }

  private _sentence(localize: Localize): string {
    const hass = this.hass!;
    const facts = this._facts(hass.states, hass.entities, hass.areas);
    const parts: string[] = [];
    if (facts.lightsOn !== undefined) {
      parts.push(
        localize("ui.panel.lovelace.cards.home_greeting.lights", {
          count: facts.lightsOn,
        })
      );
    }
    if (facts.inside) {
      parts.push(
        localize("ui.panel.lovelace.cards.home_greeting.inside", {
          temperature: `${formatNumber(facts.inside.temperature, hass.locale, {
            maximumFractionDigits: 1,
          })}${facts.inside.unit}`,
        })
      );
    }
    if (facts.locks) {
      parts.push(
        facts.locks.unlocked
          ? localize("ui.panel.lovelace.cards.home_greeting.unlocked", {
              count: facts.locks.unlocked,
            })
          : localize("ui.panel.lovelace.cards.home_greeting.all_locked")
      );
    }
    if (!parts.length) {
      return localize("ui.panel.lovelace.cards.home_greeting.nothing");
    }
    // Facts side by side, the way the summary line of a page reads.
    const sentence = parts.join(" · ");
    return `${sentence.charAt(0).toLocaleUpperCase(hass.locale.language)}${sentence.slice(1)}`;
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
              ? this._t(`ui.panel.lovelace.cards.home_greeting.${time}_user`, {
                  user: name,
                })
              : this._t(`ui.panel.lovelace.cards.home_greeting.${time}`)
          }
        </h1>
        <p>${this._line()}</p>
      </div>
      ${
        scenes.length
          ? html`<div
              class="scenes"
              role="group"
              aria-label=${this._t(
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
                  <span class="label">${computeStateName(stateObj)}</span>
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
      min-width: 0;
    }
    .text {
      min-width: 0;
      max-width: 100%;
    }
    h1,
    p {
      /* The greeting and summary can be in another language than the page. */
      unicode-bidi: plaintext;
      /* Long names and words wrap instead of being cut on a narrow phone. */
      overflow-wrap: anywhere;
    }
    h1 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: clamp(24px, 4.4vw, 56px);
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
      max-width: 100%;
    }
    /* Hover and press follow the Buttons motion kind, so the person's motion
       settings, reduced motion and low stimulation all apply. */
    .scene {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: var(--ha-space-12);
      max-width: 100%;
      box-sizing: border-box;
      padding: 0 var(--ha-space-5);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      text-align: start;
      cursor: pointer;
      transition:
        background-color
          var(--ha-motion-buttons-duration, var(--ha-animation-duration-normal))
          var(--ha-motion-ease, ease-out),
        transform
          var(--ha-motion-buttons-duration, var(--ha-animation-duration-normal))
          var(--ha-motion-buttons-curve, var(--ha-motion-spring, ease-out));
      --mdc-icon-size: 20px;
    }
    .scene ha-svg-icon,
    .scene ha-state-icon {
      flex: none;
    }
    .label {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .scene:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .scene:active {
      transform: scale(0.97);
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
