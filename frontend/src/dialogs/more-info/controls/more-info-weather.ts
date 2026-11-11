import { mdiEye, mdiGauge, mdiWaterPercent, mdiWeatherWindy } from "@mdi/js";
import type { HassConfig } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { DragScrollController } from "../../../common/controllers/drag-scroll-controller";
import { formatDateWeekdayShort } from "../../../common/datetime/format_date";
import { formatTime } from "../../../common/datetime/format_time";
import { transform } from "../../../common/decorators/transform";
import { formatNumber } from "../../../common/number/format_number";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-relative-time";
import "../../../components/ha-spinner";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tab-group";
import "../../../components/ha-tab-group-tab";
import "../../../components/ha-tooltip";
import {
  configContext,
  connectionContext,
  formattersContext,
  internationalizationContext,
} from "../../../data/context";
import type {
  ForecastAttribute,
  ForecastEvent,
  ModernForecastType,
  WeatherEntity,
} from "../../../data/weather";
import {
  getForecast,
  getSecondaryWeatherAttribute,
  getSupportedForecastTypes,
  getWeatherStateIcon,
  getWeatherUnit,
  getWind,
  subscribeForecast,
  weatherSVGStyles,
} from "../../../data/weather";
import type {
  HomeAssistantConfig,
  HomeAssistantConnection,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../../types";

@customElement("more-info-weather")
class MoreInfoWeather extends LitElement {
  @property({ attribute: false }) public stateObj?: WeatherEntity;

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
  private _config!: HassConfig;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection!: HomeAssistantConnection;

  @state() private _forecastEvent?: ForecastEvent;

  @state() private _forecastType?: ModernForecastType;

  private _subscribed?: Promise<() => void>;

  private _subscribedTo?: string;

  private _dragScrollController = new DragScrollController(this, {
    selector: ".forecast",
    enabled: false,
  });

  private _unsubscribeForecastEvents() {
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub());
      this._subscribed = undefined;
    }
    this._subscribedTo = undefined;
    this._forecastEvent = undefined;
  }

  private _updateForecastSubscription() {
    const stateObj = this.stateObj;
    const forecastType = this._forecastType;

    if (!this.isConnected || !this._connection || !stateObj || !forecastType) {
      this._unsubscribeForecastEvents();
      return;
    }

    const target = `${stateObj.entity_id}-${forecastType}`;
    if (target === this._subscribedTo) {
      return;
    }

    this._unsubscribeForecastEvents();
    this._subscribedTo = target;
    this._subscribed = subscribeForecast(
      this._connection.connection,
      stateObj.entity_id,
      forecastType,
      (event) => {
        this._forecastEvent = event;
      }
    );
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated) {
      this._updateForecastSubscription();
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeForecastEvents();
  }

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);

    this._forecastType = this._selectedForecastType();

    this._updateForecastSubscription();
  }

  protected updated(_changedProps: PropertyValues<this>): void {
    super.updated(_changedProps);

    if (!this.stateObj) {
      this._dragScrollController.enabled = false;
      return;
    }

    this._dragScrollController.enabled = Boolean(
      getForecast(this.stateObj.attributes, this._forecastEvent)?.forecast
        ?.length
    );
  }

  private _supportedForecasts = memoizeOne((stateObj: WeatherEntity) =>
    getSupportedForecastTypes(stateObj)
  );

  private _selectedForecastType(): ModernForecastType | undefined {
    if (!this.stateObj) {
      return undefined;
    }
    const supported = this._supportedForecasts(this.stateObj);
    return (
      supported.find((type) => type === this._forecastType) ?? supported[0]
    );
  }

  private _groupForecastByDay = memoizeOne((forecast: ForecastAttribute[]) => {
    if (!forecast) return [];

    const grouped = new Map<string, NonNullable<typeof forecast>>();

    forecast.forEach((item) => {
      const date = new Date(item.datetime);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(item);
    });

    return Array.from(grouped.values());
  });

  private _stats(stateObj: WeatherEntity) {
    const items: { icon: string; label: string; value: unknown }[] = [];
    const attrs = stateObj.attributes;
    if (this._showValue(attrs.wind_speed)) {
      items.push({
        icon: mdiWeatherWindy,
        label: this._i18n.localize("ui.card.weather.attributes.wind_speed"),
        value: getWind(
          this._formatters.formatEntityAttributeValue,
          this._i18n.localize,
          stateObj,
          attrs.wind_speed!,
          attrs.wind_bearing
        ),
      });
    }
    if (this._showValue(attrs.humidity)) {
      items.push({
        icon: mdiWaterPercent,
        label: this._i18n.localize("ui.card.weather.attributes.humidity"),
        value: this._formatters.formatEntityAttributeValue(
          stateObj,
          "humidity"
        ),
      });
    }
    if (this._showValue(attrs.pressure)) {
      items.push({
        icon: mdiGauge,
        label: this._i18n.localize("ui.card.weather.attributes.air_pressure"),
        value: this._formatters.formatEntityAttributeValue(
          stateObj,
          "pressure"
        ),
      });
    }
    if (this._showValue(attrs.visibility)) {
      items.push({
        icon: mdiEye,
        label: this._i18n.localize("ui.card.weather.attributes.visibility"),
        value: this._formatters.formatEntityAttributeValue(
          stateObj,
          "visibility"
        ),
      });
    }
    return items;
  }

  protected render() {
    if (!this._i18n || !this._formatters || !this._config || !this.stateObj) {
      return nothing;
    }

    const supportedForecasts = this._supportedForecasts(this.stateObj);

    const forecastData = getForecast(
      this.stateObj.attributes,
      this._forecastEvent
    );
    const forecast = forecastData?.forecast;
    const hourly = forecastData?.type === "hourly";
    const dayNight = forecastData?.type === "twice_daily";

    const weatherStateIcon = getWeatherStateIcon(this.stateObj.state, this);

    const stats = this._stats(this.stateObj);

    return html`
      <div class="hero">
        <div class="hero-main">
          <div class="icon-image">
            ${
              weatherStateIcon ||
              html`
                <ha-state-icon
                  class="weather-icon"
                  .stateObj=${this.stateObj}
                ></ha-state-icon>
              `
            }
          </div>
          ${
            this.stateObj.attributes.temperature !== undefined &&
            this.stateObj.attributes.temperature !== null
              ? html`<div class="temp">
                  ${formatNumber(
                    this.stateObj.attributes.temperature,
                    this._i18n.locale
                  )}<span
                    >${getWeatherUnit(
                      this._config,
                      this.stateObj,
                      "temperature"
                    )}</span
                  >
                </div>`
              : nothing
          }
        </div>
        <div class="summary">
          ${this._formatters.formatEntityState(this.stateObj)}.
          ${getSecondaryWeatherAttribute(
            this._formatters.formatEntityAttributeValue,
            this._i18n.localize,
            this.stateObj,
            forecast!
          )}
        </div>
        <div class="time-ago">
          <ha-relative-time
            id="relative-time"
            .datetime=${this.stateObj.last_changed}
            capitalize
          ></ha-relative-time>
          <ha-tooltip for="relative-time">
            <div class="row">
              <span class="column-name">
                ${this._i18n.localize(
                  "ui.dialogs.more_info_control.last_changed"
                )}:
              </span>
              <ha-relative-time
                .datetime=${this.stateObj.last_changed}
                capitalize
              ></ha-relative-time>
            </div>
            <div class="row">
              <span>
                ${this._i18n.localize(
                  "ui.dialogs.more_info_control.last_updated"
                )}:
              </span>
              <ha-relative-time
                .datetime=${this.stateObj.last_updated}
                capitalize
              ></ha-relative-time>
            </div>
          </ha-tooltip>
        </div>
      </div>
      ${
        supportedForecasts?.length
          ? html`
              <div class="section">
                ${this._i18n.localize("ui.card.weather.forecast")}:
              </div>
              ${
                supportedForecasts?.length > 1
                  ? html`<ha-tab-group
                      @wa-tab-show=${this._handleForecastTypeChanged}
                    >
                      ${supportedForecasts.map(
                        (forecastType) =>
                          html`<ha-tab-group-tab
                            slot="nav"
                            .panel=${forecastType}
                            .active=${this._forecastType === forecastType}
                          >
                            ${this._i18n.localize(
                              `ui.card.weather.${forecastType}`
                            )}
                          </ha-tab-group-tab>`
                      )}
                    </ha-tab-group>`
                  : nothing
              }
              <div
                class=${classMap({
                  forecast: true,
                  dragging: this._dragScrollController.scrolling,
                })}
              >
                ${
                  forecast?.length
                    ? this._groupForecastByDay(forecast).map((dayForecast) => {
                        const showDayHeader = hourly || dayNight;
                        return html`
                          <div class="forecast-day">
                            ${
                              showDayHeader
                                ? html`<div class="forecast-day-header">
                                    ${formatDateWeekdayShort(
                                      new Date(dayForecast[0].datetime),
                                      this._i18n.locale,
                                      this._config
                                    )}
                                  </div>`
                                : nothing
                            }
                            <div class="forecast-day-content">
                              ${dayForecast.map((item) =>
                                this._showValue(item.templow) ||
                                this._showValue(item.temperature)
                                  ? html`
                                      <div class="forecast-item">
                                        <div
                                          class="forecast-item-label ${
                                            showDayHeader ? "" : "no-header"
                                          }"
                                        >
                                          ${
                                            hourly
                                              ? formatTime(
                                                  new Date(item.datetime),
                                                  this._i18n.locale,
                                                  this._config
                                                )
                                              : dayNight
                                                ? html`<div class="daynight">
                                                    ${
                                                      item.is_daytime !== false
                                                        ? this._i18n.localize(
                                                            "ui.card.weather.day"
                                                          )
                                                        : this._i18n.localize(
                                                            "ui.card.weather.night"
                                                          )
                                                    }
                                                  </div>`
                                                : formatDateWeekdayShort(
                                                    new Date(item.datetime),
                                                    this._i18n.locale,
                                                    this._config
                                                  )
                                          }
                                        </div>
                                        ${
                                          this._showValue(item.condition)
                                            ? html`
                                                <div
                                                  class="forecast-image-icon"
                                                >
                                                  ${getWeatherStateIcon(
                                                    item.condition!,
                                                    this,
                                                    !(
                                                      item.is_daytime ||
                                                      item.is_daytime ===
                                                        undefined
                                                    )
                                                  )}
                                                </div>
                                              `
                                            : nothing
                                        }
                                        <div class="temp">
                                          ${
                                            this._showValue(item.temperature)
                                              ? html`${formatNumber(
                                                  item.temperature,
                                                  this._i18n.locale
                                                )}°`
                                              : "—"
                                          }
                                        </div>
                                        <div class="templow">
                                          ${
                                            this._showValue(item.templow)
                                              ? html`${formatNumber(
                                                  item.templow!,
                                                  this._i18n.locale
                                                )}°`
                                              : nothing
                                          }
                                        </div>
                                      </div>
                                    `
                                  : nothing
                              )}
                            </div>
                          </div>
                        `;
                      })
                    : html`<div class="loading">
                        <ha-spinner size="medium"></ha-spinner>
                      </div>`
                }
              </div>
            `
          : nothing
      }
      ${
        stats.length
          ? html`<div class="stats">
              ${stats.map(
                (stat) => html`
                  <div class="stat">
                    <ha-svg-icon .path=${stat.icon}></ha-svg-icon>
                    <div class="stat-label">${stat.label}</div>
                    <div class="stat-value">${stat.value}</div>
                  </div>
                `
              )}
            </div>`
          : nothing
      }
      ${
        this.stateObj.attributes.attribution
          ? html`
              <div class="attribution">
                ${this.stateObj.attributes.attribution}
              </div>
            `
          : nothing
      }
    `;
  }

  private _handleForecastTypeChanged(
    ev: HASSDomEvent<{ name: ModernForecastType }>
  ): void {
    this._forecastType = ev.detail.name;
  }

  static get styles(): CSSResultGroup {
    return [
      weatherSVGStyles,
      css`
        :host {
          display: block;
        }

        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--ha-space-2);
          text-align: center;
          margin-bottom: var(--ha-space-4);
        }

        .hero-main {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-4);
        }

        .icon-image {
          display: flex;
          align-items: center;
        }

        .icon-image > * {
          flex: 0 0 64px;
          width: 64px;
          height: 64px;
        }

        .weather-icon {
          --mdc-icon-size: 64px;
        }

        .temp {
          position: relative;
          direction: ltr;
          font-size: 56px;
          line-height: 64px;
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-text-color);
        }

        .temp span {
          position: absolute;
          font-size: var(--ha-font-size-2xl);
          top: 6px;
        }

        .hero .temp span {
          position: static;
          display: inline-block;
          vertical-align: top;
          margin-top: 6px;
          margin-inline-start: var(--ha-space-1);
        }

        .hero-main {
          flex-wrap: wrap;
          max-width: 100%;
        }

        .summary {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .time-ago {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        .section {
          margin: var(--ha-space-4) 0 var(--ha-space-2) 0;
          font-size: 1.2em;
        }

        ha-tab-group {
          margin-bottom: var(--ha-space-2);
        }

        ha-tab-group-tab {
          flex: 1;
        }

        ha-tab-group-tab::part(base) {
          width: 100%;
          justify-content: center;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-4);
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-container,
            var(--secondary-background-color)
          );
        }

        .stat ha-svg-icon {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--secondary-text-color);
        }

        .stat-label {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        .stat-value {
          direction: ltr;
          text-align: start;
          font-weight: var(--ha-font-weight-semi-bold);
        }

        .attribution {
          text-align: center;
          margin-top: var(--ha-space-4);
          direction: ltr;
        }

        .attribution,
        .templow,
        .daynight {
          color: var(--secondary-text-color);
        }

        .forecast {
          display: flex;
          justify-content: space-around;
          padding: var(--ha-space-4);
          padding-bottom: 0px;
          overflow-x: auto;
          scrollbar-color: var(--scrollbar-thumb-color) transparent;
          scrollbar-width: thin;
          mask-image: linear-gradient(
            90deg,
            transparent 0%,
            black 5%,
            black 94%,
            transparent 100%
          );
          user-select: none;
          cursor: grab;
        }

        .forecast.dragging {
          cursor: grabbing;
        }

        .forecast.dragging * {
          pointer-events: none;
        }

        .forecast-day {
          display: flex;
          flex-direction: column;
        }

        .forecast-day-header {
          position: sticky;
          top: 0;
          left: 0;
          color: var(--primary-text-color);
          z-index: 1;
          padding: 0 var(--ha-space-3) var(--ha-space-1) var(--ha-space-3);
          width: fit-content;
          width: 40px;
          text-align: center;
          font-weight: var(--ha-font-weight-semi-bold);
        }

        .forecast-day-content {
          display: flex;
          flex-direction: row;
        }

        .forecast-item {
          text-align: center;
          padding: var(--ha-space-3);
          margin: 0 var(--ha-space-1);
          min-width: 56px;
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-container,
            var(--secondary-background-color)
          );
        }

        .forecast-item-label {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
        }

        .forecast-item-label.no-header {
          color: var(--primary-text-color);
        }

        .forecast .icon,
        .forecast .temp {
          margin: var(--ha-space-1) 0;
        }

        .forecast .temp {
          font-size: var(--ha-font-size-l);
        }

        .forecast-image-icon {
          padding-top: var(--ha-space-1);
          padding-bottom: var(--ha-space-1);
          display: flex;
          justify-content: center;
        }

        .forecast-image-icon > * {
          width: 40px;
          height: 40px;
          --mdc-icon-size: 40px;
        }

        .forecast-icon {
          --mdc-icon-size: 40px;
        }

        .forecast .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 120px;
        }
      `,
    ];
  }

  private _showValue(item: number | string | undefined): boolean {
    return typeof item !== "undefined" && item !== null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-weather": MoreInfoWeather;
  }
}
