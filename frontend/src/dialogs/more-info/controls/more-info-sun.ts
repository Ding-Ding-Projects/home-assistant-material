import type { HassConfig, HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatTime } from "../../../common/datetime/format_time";
import { consume } from "../../../common/decorators/consume";
import { transform } from "../../../common/decorators/transform";
import {
  configContext,
  formattersContext,
  internationalizationContext,
} from "../../../data/context";
import type {
  HomeAssistantConfig,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";

const ARC_LEFT = 20;
const ARC_RIGHT = 280;
const ARC_BASE = 100;
const ARC_HEIGHT = 80;

@customElement("more-info-sun")
class MoreInfoSun extends LitElement {
  @property({ attribute: false }) public stateObj?: HassEntity;

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

  private _time(date: Date): string {
    return formatTime(date, this._i18n.locale, this._config);
  }

  private _optionalDate(value: unknown): Date | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private _hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== "";
  }

  protected render() {
    if (!this._i18n || !this.stateObj) {
      return nothing;
    }
    const localize = this._i18n.localize;
    const attrs = this.stateObj.attributes;
    const above = this.stateObj.state === "above_horizon";
    const known = above || this.stateObj.state === "below_horizon";
    const rising = this._optionalDate(attrs.next_rising);
    const setting = this._optionalDate(attrs.next_setting);
    const dawn = this._optionalDate(attrs.next_dawn);
    const dusk = this._optionalDate(attrs.next_dusk);

    const next = above ? setting : rising;
    // The length of the day is only known when the next sunrise comes first
    const daylightMinutes =
      rising && setting && rising < setting
        ? Math.round((setting.getTime() - rising.getTime()) / 60000)
        : undefined;

    return html`
      <div class="sun">
        <h2 class="headline">
          ${this._formatters.formatEntityState(this.stateObj)}
        </h2>
        ${
          next
            ? html`<p class="subline">
                ${localize(
                  above
                    ? "ui.dialogs.more_info_control.sun.set_at"
                    : "ui.dialogs.more_info_control.sun.rise_at",
                  { time: this._time(next) }
                )}
              </p>`
            : nothing
        }
        ${
          known
            ? this._renderArc(above, Number(attrs.azimuth))
            : html`<p class="subline">
                ${localize("ui.dialogs.more_info_control.sun.unavailable")}
              </p>`
        }
        <div class="tiles">
          ${rising ? this._tile("rises", this._time(rising)) : nothing}
          ${setting ? this._tile("sets", this._time(setting)) : nothing}
          ${
            daylightMinutes !== undefined
              ? this._tile("daylight", this._duration(daylightMinutes))
              : nothing
          }
        </div>
        <div class="rows">
          ${dawn ? this._row("dawn", this._time(dawn)) : nothing}
          ${dusk ? this._row("dusk", this._time(dusk)) : nothing}
          ${
            this._hasValue(attrs.elevation)
              ? this._row(
                  "elevation",
                  this._formatters.formatEntityAttributeValue(
                    this.stateObj,
                    "elevation"
                  )
                )
              : nothing
          }
          ${
            this._hasValue(attrs.azimuth)
              ? this._row(
                  "azimuth",
                  this._formatters.formatEntityAttributeValue(
                    this.stateObj,
                    "azimuth"
                  )
                )
              : nothing
          }
        </div>
      </div>
    `;
  }

  private _duration(totalMinutes: number): string {
    const language = this._i18n.locale.language;
    const unit = (value: number, name: "hour" | "minute") =>
      new Intl.NumberFormat(language, {
        style: "unit",
        unit: name,
        unitDisplay: "narrow",
      }).format(value);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return [hours ? unit(hours, "hour") : "", unit(minutes, "minute")]
      .filter(Boolean)
      .join(" ");
  }

  private _tile(key: "rises" | "sets" | "daylight", value: string) {
    return html`
      <div class="tile">
        <span class="label"
          >${this._i18n.localize(
            `ui.dialogs.more_info_control.sun.${key}`
          )}</span
        >
        <span class="value">${value}</span>
      </div>
    `;
  }

  private _row(key: "dawn" | "dusk" | "elevation" | "azimuth", value: string) {
    return html`
      <div class="row">
        <span class="key"
          >${this._i18n.localize(
            `ui.dialogs.more_info_control.sun.${key}`
          )}</span
        >
        <span class="row-value">${value}</span>
      </div>
    `;
  }

  // The sun sits on the arc by its azimuth (east at the left, west at the
  // right) and on the line below it while it is under the horizon.
  private _renderArc(above: boolean, azimuth: number) {
    const turn = Number.isFinite(azimuth)
      ? Math.min(Math.max((azimuth - 90) / 180, 0), 1)
      : 0.5;
    const x = above
      ? ARC_LEFT + (ARC_RIGHT - ARC_LEFT) * turn
      : azimuth > 180
        ? ARC_RIGHT
        : ARC_LEFT;
    const y = above ? ARC_BASE - ARC_HEIGHT * Math.sin(Math.PI * turn) : 112;
    const middle = (ARC_LEFT + ARC_RIGHT) / 2;
    return html`
      <svg class="arc" viewBox="0 0 300 124" aria-hidden="true">
        ${svg`
          <line
            class="horizon"
            x1="0"
            y1=${ARC_BASE}
            x2="300"
            y2=${ARC_BASE}
          />
          <path
            class="path"
            d="M ${ARC_LEFT} ${ARC_BASE} A ${middle - ARC_LEFT} ${ARC_HEIGHT} 0 0 1 ${ARC_RIGHT} ${ARC_BASE}"
          />
          <circle class=${above ? "sun-dot" : "sun-dot below"} cx=${x} cy=${y} r="10" />
        `}
      </svg>
    `;
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      :host {
        display: block;
      }
      .sun {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .headline {
        text-align: start;
      }
      .subline {
        margin: 0;
        text-align: center;
      }
      .arc {
        width: 100%;
        height: auto;
        direction: ltr;
      }
      .horizon {
        stroke: var(--divider-color);
        stroke-width: 1.5;
      }
      .path {
        fill: none;
        stroke: var(--warning-color);
        stroke-width: 3;
        stroke-dasharray: 3 7;
        stroke-linecap: round;
      }
      .sun-dot {
        fill: var(--warning-color);
      }
      .sun-dot.below {
        fill: var(--secondary-text-color);
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: var(--ha-space-4);
      }
      .row-value {
        font-weight: var(--ha-font-weight-medium);
        text-align: end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-sun": MoreInfoSun;
  }
}
