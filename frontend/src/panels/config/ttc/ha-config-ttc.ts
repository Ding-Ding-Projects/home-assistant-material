import {
  mdiAlertCircleOutline,
  mdiElevatorPassengerOff,
  mdiEscalator,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import { resolveTimeZone } from "../../../common/datetime/resolve-time-zone";
import { navigate } from "../../../common/navigate";
import { searchMatcher } from "../../../common/regex/filter";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { searchCountText } from "../../../components/ha-top-bar-search";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type {
  TtcAlert,
  TtcFeedState,
  TtcOverview,
  TtcRoute,
  TtcStop,
} from "../../../data/ttc";
import {
  fetchTtcOverview,
  ttcClock,
  ttcMinutesUntil,
  ttcRouteColor,
  ttcStatusTone,
  ttcUpcoming,
} from "../../../data/ttc";
import { saveConfig } from "../../../data/lovelace/config/types";
import { createDashboard } from "../../../data/lovelace/dashboard";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

type Tab = "now" | "alerts" | "lifts" | "stops";

const TABS: Tab[] = ["now", "alerts", "lifts", "stops"];

// The page asks the integration, which reads the agency at its own polite pace.
const REFRESH_MS = 30000;

@customElement("ha-config-ttc")
class HaConfigTtc extends LitElement {
  private _lang = new LanguageModeController(this);

  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _overview?: TtcOverview;

  @state() private _error?: string;

  @state() private _filter = "";

  @state() private _tab: Tab = "now";

  @state() private _now = Date.now();

  @state() private _dashboardState?: "adding" | "added" | "failed";

  private _timer?: number;

  private async _addDashboard(): Promise<void> {
    const overview = this._overview;
    if (!overview || this._dashboardState === "adding") {
      return;
    }
    this._dashboardState = "adding";
    try {
      const urlPath = `transit-${Date.now().toString(36)}`;
      await createDashboard(this.hass, {
        url_path: urlPath,
        mode: "storage",
        title: this._l("dashboard_title"),
        icon: "mdi:bus-clock",
        require_admin: false,
        show_in_sidebar: true,
      });
      await saveConfig(this.hass, urlPath, {
        // The strategy rebuilds the cards whenever the chosen routes change.
        strategy: { type: "transit" },
      });
      this._dashboardState = "added";
      navigate(`/${urlPath}`);
    } catch (_err) {
      this._dashboardState = "failed";
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._timer) {
      window.clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  protected firstUpdated(): void {
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      this._overview = await fetchTtcOverview(this.hass);
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
    this._now = Date.now();
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._modeLocalize(`ui.panel.config.ttc.${key}` as any, values);
  }

  private _clock(iso: string | null, seconds = false): string {
    return ttcClock(
      iso,
      this.hass.locale.language,
      resolveTimeZone(this.hass.locale.time_zone, this.hass.config.time_zone),
      seconds
    );
  }

  private _tabClicked(ev: Event): void {
    const tab = (ev.currentTarget as HTMLElement).dataset.tab as Tab;
    if (TABS.includes(tab)) {
      this._tab = tab;
    }
  }

  private _filterChanged(ev: CustomEvent<{ value: string }>): void {
    this._filter = ev.detail.value;
  }

  private _matches(...values: (string | null | undefined)[]): boolean {
    return searchMatcher(this._filter)(...values.map((value) => value ?? ""));
  }

  private _searchable(): string[] {
    const overview = this._overview;
    if (!overview) {
      return [];
    }
    return [
      ...overview.routes.map((route) => route.name),
      ...overview.stations.map((station) => station.station),
      ...overview.stops.map((stop) => stop.title ?? stop.stop),
      ...overview.alerts.map((alert) => alert.text),
    ];
  }

  protected render(): TemplateResult {
    const items = this._searchable();
    const shown = items.filter((item) => this._matches(item)).length;
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/integrations/integration/ttc"
        .header=${this._l("title")}
        searchable
        .searchLabel=${this._l("search")}
        .searchValue=${this._filter}
        .searchCountText=${
          this._filter.trim() !== ""
            ? searchCountText(this._modeLocalize, {
                current: shown,
                total: items.length,
              })
            : undefined
        }
        .searchSamples=${items}
        @top-bar-search-input=${this._filterChanged}
      >
        <div class="content">${this._renderBody()}</div>
      </hass-subpage>
    `;
  }

  private _renderBody(): TemplateResult {
    if (this._error) {
      return html`<ha-alert alert-type="error">${this._error}</ha-alert>
        <ha-button appearance="plain" @click=${this._load}
          >${this._l("retry")}</ha-button
        >`;
    }
    const overview = this._overview;
    if (!overview) {
      return html`<div class="center">
        <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
      </div>`;
    }
    const lifts = overview.stations.reduce(
      (total, station) =>
        total + station.elevators.length + station.escalators.length,
      0
    );
    return html`
      <p class="updated">
        ${this._l("updated", {
          time: this._clock(overview.alerts_read_at ?? overview.now, true),
        })}
      </p>
      <div class="tabs" role="tablist" aria-label=${this._l("sections")}>
        ${TABS.map(
          (tab) =>
            html`<button
              role="tab"
              class="tab"
              aria-selected=${this._tab === tab ? "true" : "false"}
              data-tab=${tab}
              @click=${this._tabClicked}
            >
              ${this._l(`tab_${tab}`)}
              ${
                tab === "alerts" && overview.alerts.length
                  ? html`<span class="count bad"
                      >${overview.alerts.length}</span
                    >`
                  : nothing
              }
              ${
                tab === "lifts" && lifts
                  ? html`<span class="count warn">${lifts}</span>`
                  : nothing
              }
            </button>`
        )}
      </div>
      ${this._renderStale(overview)}
      ${
        this._tab === "now"
          ? this._renderNow(overview)
          : this._tab === "alerts"
            ? this._renderAlerts(overview)
            : this._tab === "lifts"
              ? this._renderLifts(overview)
              : this._renderStops(overview)
      }
      <div class="actions">
        <ha-button
          appearance="filled"
          .loading=${this._dashboardState === "adding"}
          @click=${this._addDashboard}
          >${this._l("add_dashboard")}</ha-button
        >
        ${
          this._dashboardState === "failed"
            ? html`<span class="secondary" role="alert"
                >${this._l("add_dashboard_failed")}</span
              >`
            : nothing
        }
      </div>
      <p class="note">${overview.attribution}. ${this._l("rules")}</p>
    `;
  }

  private _renderStale(overview: TtcOverview): TemplateResult | typeof nothing {
    const stale = Object.values(overview.feeds).find(
      (feed): feed is TtcFeedState => !!feed && !feed.fresh
    );
    if (!stale) {
      return nothing;
    }
    const retry = stale.next_attempt
      ? Math.max(
          0,
          Math.round(
            (new Date(stale.next_attempt).getTime() - this._now) / 1000
          )
        )
      : undefined;
    return html`<div class="stale" role="status">
      <span class="dot"></span>
      <div>
        <div class="strong">
          ${
            stale.read_at
              ? this._l("stale_since", { time: this._clock(stale.read_at) })
              : this._l("stale_never")
          }
        </div>
        <div class="secondary">
          ${this._l("stale_detail")}
          ${
            retry !== undefined
              ? this._l("stale_retry", {
                  time: `${Math.floor(retry / 60)}:${String(retry % 60).padStart(2, "0")}`,
                })
              : nothing
          }
        </div>
      </div>
    </div>`;
  }

  private _badge(route: string, label?: string): TemplateResult {
    const color = ttcRouteColor(route);
    return html`<span
      class="badge"
      style=${styleMap({ background: color.bg, color: color.fg })}
      >${label ?? route}</span
    >`;
  }

  private _statusText(route: TtcRoute): string {
    if (!route.status) {
      return this._l("status_unknown");
    }
    const label = this._l(`status_${route.status}`);
    const first = route.alerts[0];
    return first ? `${label} · ${first.text}` : label;
  }

  private _renderNow(overview: TtcOverview): TemplateResult {
    const alertsFresh = overview.feeds.alerts?.fresh ?? false;
    const routes = overview.routes.filter((route) =>
      this._matches(route.name, route.route, ...route.alerts.map((a) => a.text))
    );
    const outages = overview.stations.flatMap((station) =>
      [...station.elevators, ...station.escalators].map((alert) => ({
        station: station.station,
        alert,
      }))
    );
    return html`
      ${
        overview.watch.alerts
          ? html`<h2 class="label">${this._l("your_routes")}</h2>
              <div class="card ${alertsFresh ? "" : "dim"}">
                ${
                  routes.length
                    ? routes.map(
                        (route) =>
                          html`<div class="row">
                            ${this._badge(route.route)}
                            <div class="text">
                              <div class="strong">${route.name}</div>
                              <div
                                class="secondary ellipsis tone-${ttcStatusTone(route.status)}"
                              >
                                ${this._statusText(route)}
                              </div>
                            </div>
                            ${
                              route.alerts[0]?.last_updated
                                ? html`<span class="time"
                                    >${this._clock(route.alerts[0].last_updated)}</span
                                  >`
                                : nothing
                            }
                          </div>`
                      )
                    : html`<div class="empty">${this._l("no_routes")}</div>`
                }
              </div>`
          : nothing
      }
      ${
        overview.watch.departures
          ? html`<h2 class="label">${this._l("next_departures")}</h2>
              ${overview.stops
                .filter((stop) => this._matches(stop.title, stop.stop))
                .map((stop) => this._renderStopTiles(stop))}`
          : nothing
      }
      ${
        overview.watch.lifts
          ? html`<h2 class="label">${this._l("lifts")}</h2>
              <div class="card ${overview.feeds.lifts?.fresh ? "" : "dim"}">
                ${
                  outages.length
                    ? outages
                        .filter((item) =>
                          this._matches(item.station, item.alert.text)
                        )
                        .map((item) =>
                          this._renderOutage(item.station, item.alert)
                        )
                    : html`<div class="empty">${this._l("all_working")}</div>`
                }
              </div>`
          : nothing
      }
    `;
  }

  private _renderStopTiles(stop: TtcStop): TemplateResult {
    const upcoming = ttcUpcoming(stop, this._now).slice(0, 3);
    return html`<div class="card pad ${stop.fresh ? "" : "dim"}">
      <div class="stop-head">
        <span class="strong ellipsis"
          >${stop.title ?? this._l("stop", { stop: stop.stop })}</span
        >
        <span class="secondary">${this._l("stop", { stop: stop.stop })}</span>
      </div>
      ${
        upcoming.length
          ? html`<div class="tiles">
              ${upcoming.map(
                (item, index) =>
                  html`<div class="tile ${index === 0 ? "first" : ""}">
                    <div class="minutes">
                      ${ttcMinutesUntil(item.time, this._now)}<span
                        class="unit"
                      >
                        ${this._l("min")}</span
                      >
                    </div>
                    <div class="time">
                      ${item.route} · ${this._clock(item.time)}
                    </div>
                  </div>`
              )}
            </div>`
          : html`<div class="empty">${this._l("no_departures")}</div>`
      }
      <div class="secondary">
        ${this._l("predicted", { time: this._clock(stop.read_at, true) })}
      </div>
    </div>`;
  }

  private _renderOutage(station: string, alert: TtcAlert): TemplateResult {
    return html`<div class="row">
      <span class="icon-box warn" aria-hidden="true">
        <ha-svg-icon
          .path=${alert.kind === "elevator" ? mdiElevatorPassengerOff : mdiEscalator}
        ></ha-svg-icon>
      </span>
      <div class="text">
        <div class="strong">
          ${station} ·
          ${this._l(alert.kind === "elevator" ? "elevator" : "escalator")}
          ${alert.equipment ? html`<span class="secondary">${alert.equipment}</span>` : nothing}
        </div>
        <div class="secondary">${alert.text}</div>
        ${
          alert.start
            ? html`<div class="secondary">
                ${this._l("out_since", { time: this._clock(alert.start) })}
              </div>`
            : nothing
        }
      </div>
    </div>`;
  }

  private _renderAlerts(overview: TtcOverview): TemplateResult {
    const alerts = overview.alerts.filter((alert) =>
      this._matches(alert.text, alert.routes.join(" "), alert.station)
    );
    const fresh = overview.feeds.alerts?.fresh ?? overview.feeds.lifts?.fresh;
    return html`<div class="card ${fresh ? "" : "dim"}">
      ${
        alerts.length
          ? alerts.map(
              (alert) =>
                html`<div class="row">
                  ${
                    alert.routes[0]
                      ? this._badge(alert.routes[0])
                      : html`<span class="icon-box warn" aria-hidden="true"
                          ><ha-svg-icon
                            .path=${mdiAlertCircleOutline}
                          ></ha-svg-icon
                        ></span>`
                  }
                  <div class="text">
                    <div>${alert.text}</div>
                    <div class="secondary">
                      ${[
                        alert.effect_description,
                        alert.cause,
                        this._clock(alert.last_updated),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  ${
                    alert.severity
                      ? html`<span
                          class="pill ${alert.severity === "Critical" ? "bad" : "warn"}"
                          >${alert.severity}</span
                        >`
                      : nothing
                  }
                </div>`
            )
          : html`<div class="empty">${this._l("no_alerts")}</div>`
      }
    </div>`;
  }

  private _renderLifts(overview: TtcOverview): TemplateResult {
    if (!overview.watch.lifts) {
      return html`<div class="card">
        <div class="empty">${this._l("lifts_off")}</div>
      </div>`;
    }
    const fresh = overview.feeds.lifts?.fresh;
    return html`${overview.stations
      .filter((station) =>
        this._matches(
          station.station,
          ...station.elevators.map((a) => a.text),
          ...station.escalators.map((a) => a.text)
        )
      )
      .map(
        (station) =>
          html`<div class="card ${fresh ? "" : "dim"}">
            <div class="row">
              <div class="text">
                <div class="strong">${station.station}</div>
                <div
                  class="secondary tone-${
                    station.step_free === null
                      ? "unknown"
                      : station.step_free
                        ? "good"
                        : "warn"
                  }"
                >
                  ${
                    station.step_free === null
                      ? this._l("status_unknown")
                      : station.step_free
                        ? this._l("step_free")
                        : this._l("not_step_free")
                  }
                </div>
              </div>
              <span class="secondary"
                >${this._l("out_counts", {
                  elevators: station.elevators.length,
                  escalators: station.escalators.length,
                })}</span
              >
            </div>
            ${[...station.elevators, ...station.escalators].map((alert) =>
              this._renderOutage(station.station, alert)
            )}
          </div>`
      )}`;
  }

  private _renderStops(overview: TtcOverview): TemplateResult {
    if (!overview.watch.departures) {
      return html`<div class="card">
        <div class="empty">${this._l("stops_off")}</div>
      </div>`;
    }
    return html`${overview.stops
      .filter((stop) => this._matches(stop.title, stop.stop))
      .map((stop) => {
        const upcoming = ttcUpcoming(stop, this._now);
        return html`<h2 class="label">
            ${stop.title ?? ""} · ${this._l("stop", { stop: stop.stop })}
          </h2>
          <div class="card ${stop.fresh ? "" : "dim"}">
            ${
              upcoming.length
                ? upcoming.map(
                    (item) =>
                      html`<div class="row">
                        ${this._badge(item.route)}
                        <div class="text">
                          <div class="ellipsis">${item.direction}</div>
                          <div class="secondary">
                            ${this._clock(item.time)}
                            ${item.vehicle ? html` · ${this._l("vehicle", { vehicle: item.vehicle })}` : nothing}
                          </div>
                        </div>
                        <span class="strong"
                          >${ttcMinutesUntil(item.time, this._now)}
                          ${this._l("min")}</span
                        >
                      </div>`
                  )
                : html`<div class="empty">${this._l("no_departures")}</div>`
            }
          </div>`;
      })}`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          max-width: 720px;
          margin: 0 auto;
          padding: var(--ha-space-3);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .center {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8);
        }
        .updated,
        .note {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .tabs {
          display: flex;
          gap: var(--ha-space-2);
          overflow-x: auto;
        }
        .tab {
          min-height: 36px;
          padding: 0 var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          border: 1px solid var(--divider-color);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          cursor: pointer;
        }
        .tab[aria-selected="true"] {
          background: var(--secondary-background-color);
          font-weight: var(--ha-font-weight-bold);
        }
        .count {
          min-width: 20px;
          height: 20px;
          border-radius: 10px;
          display: inline-grid;
          place-items: center;
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-bold);
        }
        .bad {
          background: var(--ha-color-fill-danger-normal-resting, #7a1f1a);
          color: var(--ha-color-on-danger-normal, #ffdad6);
        }
        .warn {
          background: var(--ha-color-fill-warning-normal-resting, #3a2e12);
          color: var(--ha-color-on-warning-normal, #ffdf9e);
        }
        .label {
          margin: var(--ha-space-2) var(--ha-space-1) 0;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .card {
          border-radius: var(--ha-border-radius-xl, 16px);
          background: var(--card-background-color);
          padding: 0 var(--ha-space-3);
        }
        .card.pad {
          padding: var(--ha-space-3);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .dim {
          opacity: 0.5;
        }
        .row {
          min-height: 56px;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-1) 0;
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
        .secondary {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .ellipsis {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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
          border-radius: var(--ha-border-radius-md, 8px);
          display: inline-grid;
          place-items: center;
          font-weight: var(--ha-font-weight-bold);
          flex: none;
        }
        .icon-box {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex: none;
          font-weight: var(--ha-font-weight-bold);
        }
        .time {
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .stop-head {
          display: flex;
          gap: var(--ha-space-2);
          align-items: center;
        }
        .stop-head .strong {
          flex: 1;
        }
        .tiles {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--ha-space-2);
        }
        .tile {
          border-radius: var(--ha-border-radius-lg, 12px);
          background: var(--secondary-background-color);
          padding: var(--ha-space-1) var(--ha-space-2);
        }
        .tile.first {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .tile.first .time {
          color: inherit;
        }
        .minutes {
          font-size: 20px;
          line-height: 32px;
          font-weight: var(--ha-font-weight-bold);
        }
        .tile.first .minutes {
          font-size: 28px;
        }
        .unit {
          font-size: var(--ha-font-size-s);
        }
        .pill {
          height: 24px;
          padding: 0 var(--ha-space-2);
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-bold);
        }
        .empty {
          padding: var(--ha-space-4) 0;
          color: var(--secondary-text-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-2);
        }
        .stale {
          display: flex;
          gap: var(--ha-space-3);
          align-items: flex-start;
          border-radius: var(--ha-border-radius-xl, 16px);
          background: var(--card-background-color);
          padding: var(--ha-space-3);
        }
        .dot {
          width: 8px;
          height: 8px;
          margin-top: 6px;
          border-radius: 50%;
          background: var(--warning-color);
          flex: none;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-ttc": HaConfigTtc;
  }
}
