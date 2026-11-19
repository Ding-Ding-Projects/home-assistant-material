import { mdiAlert } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { resolveTimeZone } from "../../../common/datetime/resolve-time-zone";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-card";
import "../../../components/ha-svg-icon";
import type { TtcOverview, TtcRoute, TtcStop } from "../../../data/ttc";
import {
  fetchTtcOverview,
  TTC_STATUS_ORDER,
  ttcClock,
  ttcMinutesUntil,
  ttcRouteColor,
  ttcStatusTone,
  ttcUpcoming,
} from "../../../data/ttc";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceCardEditor } from "../types";
import type { TtcCardConfig } from "./types";

export const TTC_CARD_TYPES = [
  "ttc-alert-banner",
  "ttc-subway",
  "ttc-departures",
  "ttc-leave-by",
  "ttc-route-alerts",
  "ttc-step-free",
] as const;

export type TtcCardType = (typeof TTC_CARD_TYPES)[number];

// The cards ask the integration, which reads the agency at its own pace.
const REFRESH_MS = 30000;
const SUBWAY_LINES = ["1", "2", "4", "5", "6"];

abstract class HuiTtcCardBase extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-ttc-card-editor");
    return document.createElement("hui-ttc-card-editor");
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() protected _config?: TtcCardConfig;

  @state() protected _overview?: TtcOverview;

  @state() protected _error?: string;

  @state() protected _now = Date.now();

  private _lang = new LanguageModeController(this);

  private _timer?: number;

  protected get _localize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass!.localize);
  }

  public setConfig(config: TtcCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
  }

  public getCardSize(): number {
    return 3;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
    if (this.hass) {
      this._load();
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._timer) {
      window.clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && !changed.get("hass") && this.hass) {
      this._load();
    }
  }

  private async _load(): Promise<void> {
    if (!this.hass) {
      return;
    }
    try {
      this._overview = await fetchTtcOverview(this.hass);
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
    this._now = Date.now();
  }

  protected _l(key: string, values?: Record<string, string | number>): string {
    return this._localize(`ui.panel.lovelace.cards.ttc.${key}` as any, values);
  }

  protected _clock(iso: string | null, seconds = false): string {
    return ttcClock(
      iso,
      this.hass!.locale.language,
      resolveTimeZone(this.hass!.locale.time_zone, this.hass!.config.time_zone),
      seconds
    );
  }

  protected _badge(route: string, round = false): TemplateResult {
    const color = ttcRouteColor(route);
    return html`<span
      class="badge ${round ? "round" : ""}"
      style=${styleMap({ background: color.bg, color: color.fg })}
      >${route}</span
    >`;
  }

  protected abstract _titleKey: string;

  protected abstract _renderContent(overview: TtcOverview): TemplateResult;

  /** Whether the feeds this card shows are fresh. */
  protected _fresh(overview: TtcOverview): boolean {
    return overview.feeds.alerts?.fresh ?? overview.feeds.lifts?.fresh ?? false;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const overview = this._overview;
    const title =
      this._config.title ?? (this._titleKey ? this._l(this._titleKey) : "");
    return html`<ha-card>
      ${title ? html`<h2 class="label">${title}</h2>` : nothing}
      ${
        this._error
          ? html`<div class="empty">${this._l("not_set_up")}</div>`
          : !overview
            ? html`<div class="empty">${this._l("loading")}</div>`
            : html`<div class=${this._fresh(overview) ? "" : "dim"}>
                  ${this._renderContent(overview)}
                </div>
                ${
                  this._fresh(overview)
                    ? nothing
                    : html`<div class="secondary stale" role="status">
                        ${this._l("stale", {
                          time: this._clock(overview.alerts_read_at),
                        })}
                      </div>`
                }`
      }
    </ha-card>`;
  }

  protected _stop(overview: TtcOverview): TtcStop | undefined {
    return (
      overview.stops.find((stop) => stop.stop === this._config?.stop) ??
      overview.stops[0]
    );
  }

  protected _routes(overview: TtcOverview): TtcRoute[] {
    const wanted = this._config?.routes;
    return wanted?.length
      ? overview.routes.filter((route) => wanted.includes(route.route))
      : overview.routes;
  }

  static styles = css`
    ha-card {
      padding: var(--ha-space-3);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .label {
      margin: 0;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-bold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .dim {
      opacity: 0.5;
    }
    .row {
      min-height: 56px;
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .row + .row {
      border-top: 1px solid var(--divider-color);
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    .strong {
      font-weight: var(--ha-font-weight-medium);
    }
    .ellipsis {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .secondary {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .tone-good {
      color: var(--success-color);
    }
    .tone-warn {
      color: var(--warning-color);
    }
    .tone-bad {
      color: var(--error-color);
    }
    .badge {
      min-width: 36px;
      height: 28px;
      padding: 0 var(--ha-space-1);
      box-sizing: border-box;
      border-radius: 8px;
      display: inline-grid;
      place-items: center;
      font-weight: var(--ha-font-weight-bold);
      flex: none;
    }
    .badge.round {
      min-width: 28px;
      border-radius: 50%;
    }
    .big {
      font-size: 20px;
      font-weight: var(--ha-font-weight-bold);
      color: var(--primary-color);
      text-align: end;
    }
    .huge {
      font-size: 28px;
      line-height: 32px;
      font-weight: var(--ha-font-weight-bold);
    }
    .empty {
      padding: var(--ha-space-3) 0;
      color: var(--secondary-text-color);
    }
    .banner {
      display: flex;
      gap: var(--ha-space-3);
      align-items: center;
      border-radius: var(--ha-border-radius-lg, 12px);
      padding: var(--ha-space-2) var(--ha-space-3);
      background: var(--ha-color-fill-danger-quiet-resting, #3b1512);
      color: var(--error-color);
    }
    .lines {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
      gap: var(--ha-space-2);
    }
    .line {
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(--secondary-background-color);
      padding: var(--ha-space-2) var(--ha-space-1);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-bold);
    }
    .bars {
      display: flex;
      gap: 4px;
    }
    .bar {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--success-color);
    }
    .bar.out {
      background: var(--warning-color);
    }
  `;
}

class HuiTtcAlertBannerCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-alert-banner" };
  }

  protected _titleKey = "";

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const worst = this._routes(overview)
      .flatMap((route) => route.alerts)
      .sort(
        (a, b) =>
          TTC_STATUS_ORDER.indexOf(b.status ?? "regular") -
          TTC_STATUS_ORDER.indexOf(a.status ?? "regular")
      )[0];
    if (!worst || worst.status === "slow") {
      return html`<div class="secondary tone-good">
        ${this._l("no_major")}
      </div>`;
    }
    return html`<div class="banner" role="status">
      <ha-svg-icon .path=${mdiAlert}></ha-svg-icon>
      <div class="text">
        <div class="strong">${worst.text}</div>
        <div class="secondary">
          ${[
            worst.effect_description,
            this._l("since", { time: this._clock(worst.last_updated) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </div>`;
  }
}

class HuiTtcSubwayCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-subway" };
  }

  protected _titleKey = "subway";

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const lines = overview.routes.filter((route) =>
      SUBWAY_LINES.includes(route.route)
    );
    if (!lines.length) {
      return html`<div class="empty">${this._l("no_lines")}</div>`;
    }
    return html`<div class="lines">
      ${lines.map(
        (line) =>
          html`<div class="line">
            ${this._badge(line.route, true)}
            <span class="tone-${ttcStatusTone(line.status)}"
              >${this._l(`status_${line.status ?? "unknown"}`)}</span
            >
          </div>`
      )}
    </div>`;
  }
}

class HuiTtcDeparturesCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-departures" };
  }

  protected _titleKey = "departures";

  protected _fresh(overview: TtcOverview): boolean {
    return this._stop(overview)?.fresh ?? false;
  }

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const stop = this._stop(overview);
    if (!stop) {
      return html`<div class="empty">${this._l("no_stop")}</div>`;
    }
    const upcoming = ttcUpcoming(stop, this._now, this._config?.route);
    const byRoute = new Map<string, typeof upcoming>();
    for (const item of upcoming) {
      const key = `${item.route}|${item.direction}`;
      byRoute.set(key, [...(byRoute.get(key) ?? []), item]);
    }
    const routeStatus = new Map(
      overview.routes.map((route) => [route.route, route])
    );
    return html`<div class="secondary ellipsis">
        ${stop.title ?? ""} · ${this._l("stop", { stop: stop.stop })}
      </div>
      ${
        byRoute.size
          ? [...byRoute.values()].map((items) => {
              const first = items[0];
              const status = routeStatus.get(first.route);
              return html`<div class="row">
                ${this._badge(first.route)}
                <div class="text">
                  <div class="strong ellipsis">${first.direction}</div>
                  <div
                    class="secondary tone-${ttcStatusTone(status?.status ?? null)}"
                  >
                    ${status?.status ? this._l(`status_${status.status}`) : this._l("predicted")}
                  </div>
                </div>
                <div>
                  <div class="big">
                    ${ttcMinutesUntil(first.time, this._now)} ${this._l("min")}
                  </div>
                  ${
                    items.length > 1
                      ? html`<div class="secondary">
                          ${this._l("then", {
                            times: items
                              .slice(1, 3)
                              .map((item) =>
                                ttcMinutesUntil(item.time, this._now)
                              )
                              .join(", "),
                          })}
                        </div>`
                      : nothing
                  }
                </div>
              </div>`;
            })
          : html`<div class="empty">${this._l("no_departures")}</div>`
      }
      ${
        stop.idle_routes.length
          ? html`<div class="secondary">
              ${this._l("no_more", { routes: stop.idle_routes.join(", ") })}
            </div>`
          : nothing
      }
      <div class="secondary">
        ${this._l("read_at", { time: this._clock(stop.read_at, true) })}
      </div>`;
  }
}

class HuiTtcLeaveByCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-leave-by", walk_minutes: 6 };
  }

  protected _titleKey = "leave_by";

  protected _fresh(overview: TtcOverview): boolean {
    return this._stop(overview)?.fresh ?? false;
  }

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const stop = this._stop(overview);
    if (!stop) {
      return html`<div class="empty">${this._l("no_stop")}</div>`;
    }
    const walk = (this._config?.walk_minutes ?? 6) * 60000;
    const next = ttcUpcoming(stop, this._now, this._config?.route).find(
      (item) => new Date(item.time).getTime() - walk >= this._now
    );
    if (!next) {
      return html`<div class="empty">${this._l("no_departures")}</div>`;
    }
    const leave = new Date(new Date(next.time).getTime() - walk).toISOString();
    return html`<div class="row">
      <div class="text">
        <div class="secondary">
          ${this._l("to_catch", {
            route: next.route,
            time: this._clock(next.time),
            walk: this._config?.walk_minutes ?? 6,
          })}
        </div>
        <div class="huge">
          ${this._l("leave_at", { time: this._clock(leave) })}
        </div>
      </div>
      <div>
        <div class="big">
          ${ttcMinutesUntil(leave, this._now)} ${this._l("min")}
        </div>
        <div class="secondary">${this._l("from_now")}</div>
      </div>
    </div>`;
  }
}

class HuiTtcRouteAlertsCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-route-alerts" };
  }

  protected _titleKey = "route_alerts";

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const alerts = this._routes(overview).flatMap((route) =>
      route.alerts.map((alert) => ({ route: route.route, alert }))
    );
    return html`${
        alerts.length
          ? alerts.map(
              ({ route, alert }) =>
                html`<div class="row">
                  ${this._badge(route)}
                  <div class="text">
                    <div class="strong ellipsis">${alert.text}</div>
                    <div class="secondary">
                      ${[alert.cause, this._clock(alert.last_updated)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span class="secondary tone-${ttcStatusTone(alert.status)}"
                    >${this._l(`status_${alert.status ?? "unknown"}`)}</span
                  >
                </div>`
            )
          : html`<div class="empty tone-good">${this._l("no_alerts")}</div>`
      }
      <div class="secondary">
        ${this._l("network_total", { count: overview.alerts.length })}
      </div>`;
  }
}

class HuiTtcStepFreeCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-step-free" };
  }

  protected _titleKey = "step_free";

  protected _fresh(overview: TtcOverview): boolean {
    return overview.feeds.lifts?.fresh ?? false;
  }

  protected _renderContent(overview: TtcOverview): TemplateResult {
    if (!overview.stations.length) {
      return html`<div class="empty">${this._l("no_stations")}</div>`;
    }
    return html`${overview.stations.map(
      (station) =>
        html`<div class="row">
          <div class="text">
            <div class="strong">${station.station}</div>
            ${
              station.elevators.length
                ? html`<div class="bars" aria-hidden="true">
                    ${station.elevators.map(() => html`<span class="bar out"></span>`)}
                  </div>`
                : nothing
            }
          </div>
          <span
            class="secondary tone-${
              station.elevators.length || station.escalators.length
                ? "warn"
                : "good"
            }"
            >${
              station.elevators.length || station.escalators.length
                ? this._l("out_counts", {
                    elevators: station.elevators.length,
                    escalators: station.escalators.length,
                  })
                : this._l("all_working")
            }</span
          >
        </div>`
    )}`;
  }
}

customElements.define("hui-ttc-alert-banner-card", HuiTtcAlertBannerCard);
customElements.define("hui-ttc-subway-card", HuiTtcSubwayCard);
customElements.define("hui-ttc-departures-card", HuiTtcDeparturesCard);
customElements.define("hui-ttc-leave-by-card", HuiTtcLeaveByCard);
customElements.define("hui-ttc-route-alerts-card", HuiTtcRouteAlertsCard);
customElements.define("hui-ttc-step-free-card", HuiTtcStepFreeCard);

declare global {
  interface HTMLElementTagNameMap {
    "hui-ttc-alert-banner-card": HuiTtcAlertBannerCard;
    "hui-ttc-subway-card": HuiTtcSubwayCard;
    "hui-ttc-departures-card": HuiTtcDeparturesCard;
    "hui-ttc-leave-by-card": HuiTtcLeaveByCard;
    "hui-ttc-route-alerts-card": HuiTtcRouteAlertsCard;
    "hui-ttc-step-free-card": HuiTtcStepFreeCard;
  }
}
