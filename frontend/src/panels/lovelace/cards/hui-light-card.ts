import { mdiDotsVertical } from "@mdi/js";
import type { HassConfig } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import {
  consumeEntityRegistryEntry,
  consumeEntityState,
} from "../../../common/decorators/consume-context-entry";
import { transform } from "../../../common/decorators/transform";
import { applyThemesOnElement } from "../../../common/dom/apply_themes_on_element";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import {
  DEFAULT_MAX_KELVIN,
  DEFAULT_MIN_KELVIN,
} from "../../../common/color/convert-light-color";
import { stateColorBrightness } from "../../../common/entity/state_color";
import "../../../components/ha-card";
import "../../../components/ha-control-circular-slider";
import "../../../components/ha-control-slider";
import "../../../components/ha-icon-button";
import "../../../components/ha-state-icon";
import {
  apiContext,
  configContext,
  formattersContext,
  internationalizationContext,
  uiContext,
} from "../../../data/context";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import type { EntityRegistryDisplayEntry } from "../../../data/entity/entity_registry";
import type { LightEntity } from "../../../data/light";
import { DOMAIN_ATTRIBUTES_UNITS } from "../../../data/entity/entity_attributes";
import {
  LightColorMode,
  lightSupportsBrightness,
  lightSupportsColorMode,
} from "../../../data/light";
import { generateColorTemperatureGradient } from "../../../dialogs/more-info/components/lights/light-color-temp-picker";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import type { Themes } from "../../../data/ws-themes";
import type {
  HomeAssistant,
  HomeAssistantApi,
  HomeAssistantConfig,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
  HomeAssistantUI,
} from "../../../types";
import { actionHandler } from "../common/directives/action-handler-directive";
import { findEntities } from "../common/find-entities";
import { hasAction } from "../common/has-action";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type { LovelaceCard, LovelaceCardEditor } from "../types";
import type { LightCardConfig } from "./types";

@customElement("hui-light-card")
export class HuiLightCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-light-card-editor");
    return document.createElement("hui-light-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): LightCardConfig {
    const includeDomains = ["light"];
    const maxEntities = 1;
    const foundEntities = findEntities(
      hass,
      maxEntities,
      entities,
      entitiesFallback,
      includeDomains
    );

    return { type: "light", entity: foundEntities[0] || "" };
  }

  @state() private _config?: LightCardConfig;

  @state()
  @consumeEntityState({ entityIdPath: ["_config", "entity"] })
  private _stateObj?: LightEntity;

  @state()
  @consumeEntityRegistryEntry({ entityIdPath: ["_config", "entity"] })
  _entity?: EntityRegistryDisplayEntry;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: HomeAssistantInternationalization;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _hassConfig!: HassConfig;

  @state()
  @consume({ context: uiContext, subscribe: true })
  @transform<HomeAssistantUI, Themes>({
    transformer: ({ themes }) => themes,
  })
  private _themes!: Themes;

  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  private _brightnessTimout?: number;

  private _temperatureGradient = memoizeOne((min: number, max: number) =>
    generateColorTemperatureGradient(min, max)
  );

  public getCardSize(): number {
    return (
      5 +
      (this._config?.show_brightness_slider ? 1 : 0) +
      (this._config?.show_color_temp_slider ? 1 : 0)
    );
  }

  public setConfig(config: LightCardConfig): void {
    if (!config.entity || config.entity.split(".")[0] !== "light") {
      throw new Error("Specify an entity from within the light domain");
    }

    this._config = {
      tap_action: { action: "toggle" },
      hold_action: { action: "more-info" },
      ...config,
    };
  }

  protected render() {
    if (!this._config) {
      return nothing;
    }

    const stateObj = this._stateObj;

    if (!stateObj) {
      return html`
        <hui-warning>
          ${createEntityNotFoundWarning(this._i18n.localize, this._hassConfig)}
        </hui-warning>
      `;
    }

    const brightness = Math.round(
      ((stateObj.attributes.brightness || 0) / 255) * 100
    );

    const name = this._formatters.formatEntityName(stateObj, this._config.name);

    return html`
      <ha-card>
        <ha-icon-button
          class="more-info"
          .label=${this._i18n.localize(
            "ui.panel.lovelace.cards.show_more_info"
          )}
          .path=${mdiDotsVertical}
          @click=${this._handleMoreInfo}
          tabindex="0"
        ></ha-icon-button>

        <div class="content">
          <div id="controls">
            <div id="slider">
              <ha-control-circular-slider
                mode="start"
                .min=${1}
                .max=${100}
                .step=${1}
                .value=${brightness}
                .disabled=${stateObj.state === UNAVAILABLE}
                prevent-interaction-on-scroll
                @value-changing=${this._dragEvent}
                @value-changed=${this._setBrightness}
                style=${styleMap({
                  visibility: lightSupportsBrightness(stateObj)
                    ? "visible"
                    : "hidden",
                })}
              ></ha-control-circular-slider>
              <ha-icon-button
                class="light-button ${classMap({
                  "slider-center": lightSupportsBrightness(stateObj),
                  "state-on": stateObj.state === "on",
                  "state-unavailable": stateObj.state === UNAVAILABLE,
                })}"
                .disabled=${stateObj.state === UNAVAILABLE}
                style=${styleMap({
                  filter: this._computeBrightness(stateObj),
                  color: this._computeColor(stateObj),
                })}
                @action=${this._handleAction}
                .actionHandler=${actionHandler({
                  hasHold: hasAction(this._config!.hold_action),
                  hasDoubleClick: hasAction(this._config!.double_tap_action),
                })}
                tabindex="0"
              >
                <ha-state-icon
                  .icon=${this._config.icon}
                  .stateObj=${stateObj}
                ></ha-state-icon>
              </ha-icon-button>
            </div>
          </div>

          <div id="info" .title=${name}>
            ${
              stateObj.state === UNAVAILABLE || stateObj.state === UNKNOWN
                ? html`
                    <div>${this._formatters.formatEntityState(stateObj)}</div>
                  `
                : html` <div class="brightness">%</div> `
            }
            ${name}
          </div>
          ${this._renderSliders(stateObj)}
        </div>
      </ha-card>
    `;
  }

  private _renderSliders(stateObj: LightEntity) {
    const config = this._config!;
    const showBrightness =
      !!config.show_brightness_slider && lightSupportsBrightness(stateObj);
    const showTemperature =
      !!config.show_color_temp_slider &&
      lightSupportsColorMode(stateObj, LightColorMode.COLOR_TEMP);
    if (!showBrightness && !showTemperature) {
      return nothing;
    }
    const disabled = stateObj.state === UNAVAILABLE;
    const active = stateObj.state === "on";
    const locale = this._i18n.locale;

    const brightness =
      stateObj.attributes.brightness != null
        ? Math.max(Math.round((stateObj.attributes.brightness * 100) / 255), 1)
        : undefined;

    const minKelvin =
      stateObj.attributes.min_color_temp_kelvin ?? DEFAULT_MIN_KELVIN;
    const maxKelvin =
      stateObj.attributes.max_color_temp_kelvin ?? DEFAULT_MAX_KELVIN;

    return html`
      <div class="sliders">
        ${
          showBrightness
            ? html`
                <ha-control-slider
                  class="brightness-slider"
                  .value=${brightness}
                  min="1"
                  max="100"
                  unit="%"
                  .showHandle=${active}
                  .disabled=${disabled}
                  .locale=${locale}
                  .label=${this._i18n.localize("ui.card.light.brightness")}
                  prevent-interaction-on-scroll
                  @value-changed=${this._setBrightness}
                ></ha-control-slider>
              `
            : nothing
        }
        ${
          showTemperature
            ? html`
                <ha-control-slider
                  class=${classMap({
                    "temperature-slider": true,
                    inactive: !active && !disabled,
                  })}
                  mode="cursor"
                  .value=${stateObj.attributes.color_temp_kelvin ?? undefined}
                  .min=${minKelvin}
                  .max=${maxKelvin}
                  .unit=${DOMAIN_ATTRIBUTES_UNITS.light.color_temp_kelvin}
                  .showHandle=${active}
                  .disabled=${disabled}
                  .locale=${locale}
                  .label=${this._i18n.localize(
                    "ui.card.light.color_temperature"
                  )}
                  style=${styleMap({
                    "--gradient": this._temperatureGradient(
                      minKelvin,
                      maxKelvin
                    ),
                  })}
                  prevent-interaction-on-scroll
                  @value-changed=${this._setColorTemperature}
                ></ha-control-slider>
              `
            : nothing
        }
      </div>
    `;
  }

  private _setColorTemperature(
    ev: HASSDomEvent<HASSDomEvents["value-changed"]>
  ): void {
    ev.stopPropagation();
    const { value } = ev.detail;
    if (typeof value !== "number" || isNaN(value)) return;
    this._api.callService("light", "turn_on", {
      entity_id: this._config!.entity,
      color_temp_kelvin: value,
    });
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._config || !this._themes || !this._stateObj) {
      return;
    }

    const oldThemes = changedProps.get("_themes") as Themes | undefined;
    const oldConfig = changedProps.get("_config") as
      LightCardConfig | undefined;

    if (
      !oldThemes ||
      !oldConfig ||
      oldThemes !== this._themes ||
      oldConfig.theme !== this._config.theme
    ) {
      applyThemesOnElement(this, this._themes, this._config.theme);
    }
  }

  private _dragEvent(ev: HASSDomEvent<HASSDomEvents["value-changing"]>): void {
    const { value } = ev.detail;
    if (typeof value !== "number" || isNaN(value)) return;
    this.shadowRoot!.querySelector(".brightness")!.innerHTML = `${value} %`;
    this._showBrightness();
    this._hideBrightness();
  }

  private _showBrightness(): void {
    clearTimeout(this._brightnessTimout);
    this.shadowRoot!.querySelector(".brightness")!.classList.add(
      "show_brightness"
    );
  }

  private _hideBrightness(): void {
    this._brightnessTimout = window.setTimeout(() => {
      this.shadowRoot!.querySelector(".brightness")!.classList.remove(
        "show_brightness"
      );
    }, 500);
  }

  private _setBrightness(
    ev: HASSDomEvent<HASSDomEvents["value-changed"]>
  ): void {
    const { value } = ev.detail;
    if (typeof value !== "number" || isNaN(value)) return;
    this._api.callService("light", "turn_on", {
      entity_id: this._config!.entity,
      brightness_pct: value,
    });
  }

  private _computeBrightness(stateObj: LightEntity): string {
    if (stateObj.state === "off" || !stateObj.attributes.brightness) {
      return "";
    }
    return stateColorBrightness(stateObj);
  }

  private _computeColor(stateObj: LightEntity): string {
    if (stateObj.state === "off") {
      return "";
    }
    return stateObj.attributes.rgb_color
      ? `rgb(${stateObj.attributes.rgb_color.join(",")})`
      : "";
  }

  private _handleAction(ev: ActionHandlerEvent) {
    fireEvent(this, "hass-action", {
      config: this._config!,
      action: ev.detail.action,
    });
  }

  private _handleMoreInfo() {
    fireEvent(this, "hass-more-info", {
      entityId: this._config!.entity,
    });
  }

  static styles = css`
    ha-card {
      height: 100%;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      text-align: center;
      --name-font-size: 1.2rem;
      --brightness-font-size: 1.2rem;
    }

    .more-info {
      position: absolute;
      cursor: pointer;
      top: 0;
      right: 0;
      inset-inline-start: initial;
      inset-inline-end: 0;
      border-radius: var(--ha-border-radius-pill);
      color: var(--secondary-text-color);
      z-index: 1;
      direction: var(--direction);
    }

    .content {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    #controls {
      display: flex;
      justify-content: center;
      padding: 16px;
      position: relative;
    }

    #slider {
      height: 100%;
      width: 100%;
      position: relative;
      max-width: 200px;
      min-width: 100px;
    }

    ha-control-circular-slider {
      width: 100%;
      --control-circular-slider-color: var(--primary-color);
      --control-circular-slider-background: var(--slider-track-color);
      --control-circular-slider-background-opacity: 1;
    }

    .light-button {
      color: var(--state-icon-color);
      width: 60%;
      height: auto;
      position: absolute;
      max-width: calc(100% - 40px);
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-pill);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      --ha-icon-button-size: 100%;
      --mdc-icon-size: 100%;
    }

    .light-button.state-on {
      color: var(--state-light-active-color);
    }

    .light-button.state-unavailable {
      color: var(--state-unavailable-color);
    }

    .sliders {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: 0 var(--ha-space-4) var(--ha-space-4);
    }

    .sliders ha-control-slider {
      --control-slider-thickness: 36px;
      --control-slider-border-radius: var(--ha-border-radius-lg);
      --control-slider-color: var(
        --state-light-active-color,
        var(--primary-color)
      );
    }

    .temperature-slider {
      --control-slider-background: linear-gradient(to right, var(--gradient));
      --control-slider-background-opacity: 1;
    }

    .temperature-slider.inactive {
      filter: saturate(0.5);
      --control-slider-background-opacity: 0.4;
    }

    .temperature-slider:dir(rtl) {
      --control-slider-background: linear-gradient(to left, var(--gradient));
    }

    #info {
      text-align: center;
      margin-top: -56px;
      padding: 16px;
      font-size: var(--name-font-size);
    }

    .brightness {
      font-size: var(--brightness-font-size);
      opacity: 0;
      transition: opacity 0.5s ease-in-out;
    }

    .show_brightness {
      opacity: 1;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-light-card": HuiLightCard;
  }
}
