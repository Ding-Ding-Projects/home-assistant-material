import { mdiAlert } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { resolveTimeZone } from "../../../common/datetime/resolve-time-zone";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-card";
import "../../../components/ha-svg-icon";
import "../../../components/map/ha-map";
import { subscribeHistoryStatesTimeWindow } from "../../../data/history";
import type {
  TtcOverview,
  TtcRoute,
  TtcRouteStatus,
  TtcStatusSegment,
  TtcStop,
  TtcVehiclePositions,
} from "../../../data/ttc";
import {
  fetchTtcOverview,
  subscribeTtcVehicles,
  TTC_STATUS_ORDER,
  ttcClock,
  ttcDistance,
  ttcMinutesUntil,
  ttcRouteColor,
  ttcStatusSegments,
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
  "ttc-vehicles",
  "ttc-line-history",
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

  static styles: CSSResultGroup = css`
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
    /* The agency's own words: three lines, and a tap shows all of them. */
    .alert-text {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: normal;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .alert-text.expanded {
      -webkit-line-clamp: unset;
      display: block;
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
  @state() private _expandedAlerts = new Set<string>();

  private _toggleAlert(ev: Event) {
    const key = (ev.currentTarget as HTMLElement).dataset.alertKey!;
    const next = new Set(this._expandedAlerts);
    if (!next.delete(key)) {
      next.add(key);
    }
    this._expandedAlerts = next;
  }

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
                    <div
                      class=${`strong alert-text${
                        this._expandedAlerts.has(`${route}|${alert.text}`)
                          ? " expanded"
                          : ""
                      }`}
                      title=${alert.text}
                      data-alert-key=${`${route}|${alert.text}`}
                      @click=${this._toggleAlert}
                    >
                      ${alert.text}
                    </div>
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
                      ${station.elevators.map(
                        () => html`<span class="bar out"></span>`
                      )}
                    </div>
                    ${station.elevators.map(
                      (alert) =>
                        html`<div class="secondary">
                          ${
                            alert.destination
                              ? this._l("not_step_free_to", {
                                  place: alert.destination,
                                })
                              : this._l("not_step_free")
                          }
                        </div>`
                    )}`
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

// Vehicles further than this from the stop are left off the strip.
const NEAR_METRES = 2500;

class HuiTtcVehiclesCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-vehicles" };
  }

  protected _titleKey = "vehicles";

  @state() private _positions?: TtcVehiclePositions;

  @state() private _expanded = false;

  private _unsubscribe?: Promise<UnsubscribeFunc>;

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // Closing the subscription is what stops the integration asking the agency.
    this._unsubscribe
      ?.then((unsubscribe) => unsubscribe())
      .catch(() => undefined);
    this._unsubscribe = undefined;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has("hass") && !changed.get("hass")) {
      this._subscribe();
    }
  }

  private _subscribe(): void {
    if (this._unsubscribe || !this.hass || !this.isConnected) {
      return;
    }
    this._unsubscribe = subscribeTtcVehicles(this.hass, (positions) => {
      this._positions = positions;
      this._now = Date.now();
    });
    this._unsubscribe.catch(() => {
      this._unsubscribe = undefined;
    });
  }

  protected _fresh(): boolean {
    return this._positions?.fresh ?? false;
  }

  private _toggle(): void {
    this._expanded = !this._expanded;
  }

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const positions = this._positions;
    const stop = this._stop(overview);
    const place = stop ? positions?.stops[stop.stop] : undefined;
    if (!positions || !stop) {
      return html`<div class="empty">
        ${stop ? this._l("loading") : this._l("no_stop")}
      </div>`;
    }
    if (!place || place.latitude === null || place.longitude === null) {
      return html`<div class="empty">${this._l("no_stop_place")}</div>`;
    }
    const lat = place.latitude;
    const lon = place.longitude;
    const near = positions.vehicles.filter(
      (vehicle) =>
        (!this._config?.route || vehicle.route === this._config.route) &&
        ttcDistance(lat, lon, vehicle.latitude, vehicle.longitude) <=
          NEAR_METRES
    );
    const age =
      Math.min(...near.map((vehicle) => vehicle.seconds_since_report), 9999) +
      Math.round(
        (this._now - new Date(positions.read_at ?? this._now).getTime()) / 1000
      );
    const x = (vehicleLon: number) =>
      50 +
      (((vehicleLon - lon) * Math.cos((lat * Math.PI) / 180) * 111320) /
        NEAR_METRES) *
        46;
    const y = (vehicleLat: number) =>
      50 - (((vehicleLat - lat) * 110540) / NEAR_METRES) * 40;
    return html`<button
        class="strip"
        aria-expanded=${this._expanded ? "true" : "false"}
        aria-label=${this._l("open_map")}
        @click=${this._toggle}
      >
        <span class="road h"></span><span class="road v"></span>
        <span
          class="here"
          style=${styleMap({ left: "50%", top: "50%" })}
        ></span>
        ${near.map((vehicle) => {
          const color = ttcRouteColor(vehicle.route);
          return html`<span
            class="vehicle"
            style=${styleMap({
              left: `${Math.min(96, Math.max(4, x(vehicle.longitude)))}%`,
              top: `${Math.min(92, Math.max(8, y(vehicle.latitude)))}%`,
              background: color.bg,
              color: color.fg,
            })}
            >${vehicle.route}</span
          >`;
        })}
      </button>
      ${
        this._expanded
          ? html`<ha-map
              class="map"
              .hass=${this.hass}
              .paths=${[
                {
                  name: place.title,
                  points: [{ point: [lat, lon], timestamp: new Date() }],
                },
                ...near.map((vehicle) => ({
                  name: `${vehicle.route} · ${vehicle.vehicle}`,
                  color: ttcRouteColor(vehicle.route).bg,
                  points: [
                    {
                      point: [vehicle.latitude, vehicle.longitude],
                      timestamp: new Date(
                        Date.now() - vehicle.seconds_since_report * 1000
                      ),
                    },
                  ],
                })),
              ]}
              auto-fit
            ></ha-map>`
          : nothing
      }
      <div class="secondary">
        ${
          near.length
            ? this._l("positions_age", { seconds: age })
            : this._l("no_vehicles")
        }
        · ${this._l(this._expanded ? "close_map" : "tap_for_map")}
      </div>`;
  }

  static styles = [
    HuiTtcCardBase.styles,
    css`
      .strip {
        position: relative;
        display: block;
        width: 100%;
        height: 110px;
        border: none;
        padding: 0;
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
        overflow: hidden;
        cursor: pointer;
      }
      .road {
        position: absolute;
        background: var(--divider-color);
      }
      .road.h {
        left: 0;
        right: 0;
        top: calc(50% - 1px);
        height: 3px;
      }
      .road.v {
        top: 0;
        bottom: 0;
        left: calc(50% - 1px);
        width: 3px;
      }
      .here {
        position: absolute;
        width: 18px;
        height: 18px;
        margin: -9px 0 0 -9px;
        border-radius: 50%;
        background: var(--primary-color);
        box-shadow: 0 0 0 4px
          color-mix(in srgb, var(--primary-color) 25%, transparent);
      }
      .vehicle {
        position: absolute;
        transform: translate(-50%, -50%);
        height: 22px;
        padding: 0 6px;
        border-radius: 6px;
        display: grid;
        place-items: center;
        font-size: var(--ha-font-size-xs);
        font-weight: var(--ha-font-weight-bold);
      }
      .map {
        height: 260px;
        border-radius: var(--ha-border-radius-lg, 12px);
        overflow: hidden;
      }
    `,
  ];
}

const HISTORY_HOURS = 24;

class HuiTtcLineHistoryCard extends HuiTtcCardBase {
  public static getStubConfig(): TtcCardConfig {
    return { type: "ttc-line-history", route: "1" };
  }

  protected _titleKey = "line_history";

  @state() private _segments?: TtcStatusSegment[];

  private _historyEntity?: string;

  private _unsubscribeHistory?: Promise<() => Promise<void>>;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopHistory();
  }

  private _stopHistory(): void {
    this._unsubscribeHistory
      ?.then((unsubscribe) => unsubscribe())
      .catch(() => undefined);
    this._unsubscribeHistory = undefined;
    this._historyEntity = undefined;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const route = this._overview?.routes.find(
      (item) => item.route === (this._config?.route ?? "1")
    );
    const entity = route?.status_entity ?? undefined;
    if (!this.hass || !entity || entity === this._historyEntity) {
      return;
    }
    this._stopHistory();
    this._historyEntity = entity;
    this._unsubscribeHistory = subscribeHistoryStatesTimeWindow(
      this.hass,
      (history) => {
        const end = Date.now();
        this._segments = ttcStatusSegments(
          history[entity] ?? [],
          end - HISTORY_HOURS * 3600000,
          end
        );
      },
      HISTORY_HOURS,
      [entity],
      true
    );
  }

  protected _renderContent(overview: TtcOverview): TemplateResult {
    const route = overview.routes.find(
      (item) => item.route === (this._config?.route ?? "1")
    );
    if (!route?.status_entity) {
      return html`<div class="empty">${this._l("no_history_route")}</div>`;
    }
    const segments = this._segments;
    if (!segments) {
      return html`<div class="empty">${this._l("loading")}</div>`;
    }
    if (!segments.length) {
      return html`<div class="empty">${this._l("no_history")}</div>`;
    }
    const totals = new Map<string, number>();
    for (const segment of segments) {
      totals.set(
        segment.status,
        (totals.get(segment.status) ?? 0) + segment.end - segment.start
      );
    }
    const end = Date.now();
    const start = end - HISTORY_HOURS * 3600000;
    const ticks = [0, 6, 12, 18, 24].map((hour) =>
      new Date(start + hour * 3600000).toISOString()
    );
    return html`<div class="secondary">${route.name}</div>
      <div class="history" role="img" aria-label=${this._l("line_history")}>
        ${segments.map(
          (segment) =>
            html`<span
              class="segment tone-bg-${ttcStatusTone(segment.status as TtcRouteStatus)}"
              style=${styleMap({ flex: String(segment.end - segment.start) })}
              title=${this._l(`status_${segment.status}`)}
            ></span>`
        )}
      </div>
      <div class="ticks">
        ${ticks.map((tick) => html`<span>${this._clock(tick)}</span>`)}
      </div>
      <div class="secondary">
        ${[...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([status, ms]) =>
              `${this._l(`status_${status}`)} ${this._l("duration", {
                hours: Math.floor(ms / 3600000),
                minutes: Math.round((ms % 3600000) / 60000),
              })}`
          )
          .join(" · ")}
      </div>`;
  }

  static styles = [
    HuiTtcCardBase.styles,
    css`
      .history {
        display: flex;
        gap: 2px;
        height: 20px;
        border-radius: 4px;
        overflow: hidden;
      }
      .segment {
        min-width: 1px;
      }
      .tone-bg-good {
        background: var(--success-color);
      }
      .tone-bg-warn {
        background: var(--warning-color);
      }
      .tone-bg-bad {
        background: var(--error-color);
      }
      .tone-bg-unknown {
        background: var(--disabled-color);
      }
      .ticks {
        display: flex;
        justify-content: space-between;
        font-family: var(--ha-font-family-code);
        font-size: var(--ha-font-size-xs);
        color: var(--secondary-text-color);
      }
    `,
  ];
}

customElements.define("hui-ttc-vehicles-card", HuiTtcVehiclesCard);
customElements.define("hui-ttc-line-history-card", HuiTtcLineHistoryCard);
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
    "hui-ttc-vehicles-card": HuiTtcVehiclesCard;
    "hui-ttc-line-history-card": HuiTtcLineHistoryCard;
  }
}
