import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { formatDateShort } from "../../../common/datetime/format_date";
import { formatTime } from "../../../common/datetime/format_time";
import { relativeTime } from "../../../common/datetime/relative_time";
import {
  composeForMode,
  currentLanguageMode,
  modeText,
} from "../../../common/language-mode/language-mode";
import { navigate } from "../../../common/navigate";
import { formatNumber } from "../../../common/number/format_number";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/chart/ha-chart-base";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-control-slider";
import "../../../components/ha-switch";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { ConfigEntry } from "../../../data/config_entries";
import { getConfigEntries } from "../../../data/config_entries";
import type {
  DefenderDay,
  DefenderDirection,
  DefenderGuard,
  DefenderInfo,
  DefenderLogEntry,
  DefenderReasonParts,
} from "../../../data/defenders";
import {
  bandErrorKey,
  commandAction,
  commandReason,
  controlDefender,
  DEFENDER_DOMAINS,
  defenderLogLine,
  describeReason,
  fetchDefenderInfo,
  groupGuards,
  guardDescriptionKey,
  guardTitle,
  isStandingDown,
  needsConfirmationToDisable,
  setDefenderFloor,
  setDefenderGuard,
  setDefenderTemperature,
  siblingPath,
  siblingRow,
  splitDuration,
  usageTabKey,
} from "../../../data/defenders";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { ECOption } from "../../../resources/echarts/echarts";
import type { HomeAssistant, ToggleButton } from "../../../types";

type View = "now" | "guards" | "cost" | "log";

const REFRESH_MS = 15000;
const PAUSE_CHOICES = [1, 2, 4, 8];
const GUARD_FILTERS = ["all", "safety", "people", "timing", "money"];
const LATEST_LOG_ROWS = 4;
const DEFAULT_LOW = 7;
const DEFAULT_HIGH = 35;

/** One page for both defenders, driven by the direction: cool or heat. */
@customElement("ha-defender-page")
export class HaDefenderPage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property() public direction: DefenderDirection = "cool";

  @state() private _entries?: ConfigEntry[];

  @state() private _entryId?: string;

  @state() private _info?: DefenderInfo;

  @state() private _error?: string;

  @state() private _view: View = "now";

  @state() private _filter = "";

  @state() private _guardFilter = "all";

  @state() private _pauseHours = 2;

  @state() private _draft?: number;

  @state() private _floorDraft?: number;

  private _timer?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._load();
    this._timer = window.setInterval(() => this._refresh(), REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return modeText(
      this.hass.localize,
      `ui.panel.config.defenders.${key}`,
      values
    );
  }

  private get _path(): string {
    return this.direction === "cool"
      ? "/config/ac-defender"
      : "/config/heat-defender";
  }

  private async _load(): Promise<void> {
    try {
      this._entries = await getConfigEntries(this.hass, {
        domain: DEFENDER_DOMAINS[this.direction],
      });
    } catch (err: any) {
      this._error = err?.message ?? String(err);
      return;
    }
    const wanted = new URLSearchParams(location.search).get("entry");
    this._entryId ??=
      this._entries.find((entry) => entry.entry_id === wanted)?.entry_id ??
      this._entries[0]?.entry_id;
    await this._refresh();
  }

  private async _refresh(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    const entryId = this._entryId;
    try {
      const info = await fetchDefenderInfo(this.hass, entryId);
      if (entryId === this._entryId) {
        this._info = info;
        this._error = undefined;
      }
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  protected render(): TemplateResult {
    const title = this._t(`title_${this.direction}`);
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${title}
        back-path="/config"
      >
        <div class="content">
          <p class="intro">${this._t(`intro_${this.direction}`)}</p>
          ${this._body()}
        </div>
      </hass-subpage>
    `;
  }

  private _body(): TemplateResult | typeof nothing {
    if (this._error && !this._info) {
      return html`<ha-alert alert-type="error"
        >${this._t("error", { error: this._error })}</ha-alert
      >`;
    }
    if (this._entries && !this._entries.length) {
      return html`<p>${this._t("none")}</p>`;
    }
    if (!this._info) {
      return html`<p>${this._t("loading")}</p>`;
    }
    const tabs: ToggleButton[] = (
      ["now", "guards", "cost", "log"] as View[]
    ).map((value) => ({
      value,
      label: this._t(
        value === "cost" ? usageTabKey(this.direction) : `tabs.${value}`
      ),
    }));
    return html`
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      ${
        this._entries && this._entries.length > 1
          ? html`<ha-button-toggle-group
              size="s"
              .buttons=${this._entries.map((e) => ({
                value: e.entry_id,
                label: e.title,
              }))}
              .active=${this._entryId}
              @value-changed=${this._entryChanged}
            ></ha-button-toggle-group>`
          : nothing
      }
      ${this._siblingRow()}
      <ha-button-toggle-group
        full-width
        size="s"
        .buttons=${tabs}
        .active=${this._view}
        @value-changed=${this._viewChanged}
      ></ha-button-toggle-group>
      ${
        this._view === "now"
          ? this._now(this._info)
          : this._view === "guards"
            ? this._guards(this._info)
            : this._view === "cost"
              ? this._cost(this._info)
              : this._log(this._info)
      }
    `;
  }

  private _reason(
    parts: DefenderReasonParts | null | undefined,
    text: string
  ): string {
    const sentence = composeForMode(this.hass.localize, (part) =>
      describeReason(parts, text, (key, values) =>
        part(`ui.panel.config.defenders.${key}`, values)
      )
    );
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  private _openSibling(ev: Event): void {
    const path = (ev.currentTarget as HTMLElement).dataset.path;
    if (path) {
      navigate(path);
    }
  }

  private _siblingRow(): TemplateResult | typeof nothing {
    const sibling = this._info?.sibling;
    if (!sibling) {
      return nothing;
    }
    const row = siblingRow(sibling);
    const temp =
      row.temperature === undefined
        ? this._t("now.heat_off")
        : `${row.temperature.toFixed(1)}°`;
    const standing = isStandingDown(sibling.state);
    const parts = [
      this._t(row.stateKey),
      ...(sibling.paused && !standing ? [this._t("sibling.paused")] : []),
      temp,
    ];
    return html`<div
      class=${classMap({
        row: true,
        sibling: true,
        brother: sibling.role === "ac",
        sister: sibling.role === "heat",
      })}
      role="status"
    >
      <span class="grow"
        ><strong>${this._t(row.nameKey)}</strong><br /><span class="detail"
          >${parts.join(", ")}</span
        ></span
      >
      <ha-button
        appearance="plain"
        size="small"
        data-path=${siblingPath(sibling)}
        @click=${this._openSibling}
        >${this._t("sibling.open")}</ha-button
      >
    </div>`;
  }

  private _climate() {
    const id = this._info?.climate_entity_id;
    return id ? this.hass.states[id] : undefined;
  }

  private _degrees(value: unknown): string {
    return typeof value === "number" && !Number.isNaN(value)
      ? `${value.toFixed(1)}°`
      : "-";
  }

  private _headline(info: DefenderInfo): string {
    if (isStandingDown(info.state)) {
      return this._t(`state.${info.state}`);
    }
    if (this.direction === "cool") {
      return this._t("now.headline_cool", {
        temp: info.my_temperature.toFixed(1),
      });
    }
    if (info.state === "heating_allowed") {
      return this._t("now.headline_heating");
    }
    return info.heat_mode === "cap"
      ? this._t("now.headline_cap", { temp: info.my_temperature.toFixed(1) })
      : this._t("now.headline_off");
  }

  private _title(): string {
    return (
      this._entries?.find((entry) => entry.entry_id === this._entryId)?.title ??
      ""
    );
  }

  private _now(info: DefenderInfo): TemplateResult {
    const heat = this.direction === "heat";
    const standing = isStandingDown(info.state);
    const climate = this._climate();
    const limits = {
      low: Number(climate?.attributes.min_temp ?? DEFAULT_LOW),
      high: Number(climate?.attributes.max_temp ?? DEFAULT_HIGH),
    };
    const value = this._draft ?? info.my_temperature;
    const showCap = !heat || info.heat_mode === "cap";
    const floor = this._floorDraft ?? info.floor;
    const heating = climate?.attributes.hvac_action === "heating";
    const stats: [string, string, boolean][] = heat
      ? [
          [
            this._t("now.room"),
            this._degrees(climate?.attributes.current_temperature),
            false,
          ],
          [
            this._t("now.heating"),
            this._t(heating ? "now.on" : "now.off"),
            false,
          ],
          [this._t("now.floor"), this._degrees(info.floor), true],
        ]
      : [
          [
            this._t("now.room"),
            this._degrees(climate?.attributes.current_temperature),
            false,
          ],
          [
            this._t("now.set_now"),
            this._degrees(climate?.attributes.temperature),
            false,
          ],
          [this._t("now.my_temp"), this._degrees(info.my_temperature), true],
        ];
    const pauseButtons: ToggleButton[] = PAUSE_CHOICES.map((hours) => ({
      value: String(hours),
      label: this._t("now.hours", { hours }),
    }));
    return html`
      <ha-card
        class=${classMap({
          status: true,
          floor: info.state === "heating_allowed",
        })}
      >
        <div class="status-head">
          <span class="grow detail">${this._title()}</span>
          <span class=${classMap({ pill: true, off: standing })}
            >${this._t(`state.${info.state}`)}</span
          >
        </div>
        <div class="big">${this._headline(info)}</div>
        <div class="stats">
          ${stats.map(
            ([label, text, accent]) =>
              html`<div class=${classMap({ stat: true, accent })}>
                <span class="detail">${label}</span>
                <strong>${text}</strong>
              </div>`
          )}
        </div>
        <div class="why">
          ${this._reason(info.reason_parts, info.reason)}${
            info.next_check
              ? html` · ${this._t("now.next_check")}
                ${relativeTime(new Date(info.next_check), this.hass.locale)}`
              : nothing
          }${
            info.paused_until
              ? html` ·
                ${this._t("now.until", {
                  time: formatTime(
                    new Date(info.paused_until),
                    this.hass.locale,
                    this.hass.config
                  ),
                })}`
              : nothing
          }
        </div>
        ${
          info.gated
            ? html`<div class="detail">${this._t("now.gated")}</div>`
            : nothing
        }
        ${
          heat &&
          info.effective_floor !== null &&
          info.effective_floor !== info.floor
            ? html`<div class="detail">
                ${this._t("now.floor_in_force", {
                  floor: info.effective_floor.toFixed(1),
                })}
              </div>`
            : nothing
        }
      </ha-card>
      ${this._bandBar(info)}
      <div class="buttons">
        ${
          standing
            ? html`<ha-button class="grow" @click=${this._resume}
                >${this._t("now.resume")}</ha-button
              >`
            : html`<ha-button class="grow" @click=${this._pause}
                >${this._t("now.pause_for_hours", {
                  hours: this._pauseHours,
                })}</ha-button
              >`
        }
        <ha-button
          class="grow"
          appearance="outlined"
          variant="danger"
          @click=${this._stop}
          >${this._t("now.stop")}</ha-button
        >
      </div>
      ${
        standing
          ? nothing
          : html`<ha-button-toggle-group
              size="s"
              aria-label=${this._t("now.pause_for")}
              .buttons=${pauseButtons}
              .active=${String(this._pauseHours)}
              @value-changed=${this._pauseChanged}
            ></ha-button-toggle-group>`
      }
      <div class="detail">
        ${this._t(info.state === "stopped" ? "now.stop_hint" : "now.pause_hint")}
      </div>
      <ha-card>
        ${
          showCap
            ? html`<div class="row column">
                <span class="slider-head"
                  ><span>${this._t(`now.hold_${this.direction}`)}</span
                  ><strong class="value">${value.toFixed(1)}°</strong></span
                >
                <ha-control-slider
                  .label=${this._t(`now.hold_${this.direction}`)}
                  .value=${value}
                  .min=${heat ? 10 : limits.low}
                  .max=${limits.high}
                  .step=${0.5}
                  @slider-moved=${this._moved}
                  @value-changed=${this._commit}
                ></ha-control-slider>
                <span class="slider-limits detail"
                  ><span>${heat ? 10 : limits.low}°</span
                  ><span>${limits.high}°</span></span
                >
              </div>`
            : html`<div class="row detail">${this._t("now.heat_off")}</div>`
        }
        ${
          heat && floor !== null
            ? html`<div class="row column floor">
                <span class="slider-head"
                  ><span>${this._t("now.floor")}</span
                  ><strong class="value">${floor.toFixed(1)}°</strong></span
                >
                <ha-control-slider
                  .label=${this._t("now.floor")}
                  .value=${floor}
                  .min=${10}
                  .max=${24}
                  .step=${0.5}
                  @slider-moved=${this._floorMoved}
                  @value-changed=${this._floorCommit}
                ></ha-control-slider>
                <span class="detail">${this._t("now.floor_hint")}</span>
              </div>`
            : nothing
        }
      </ha-card>
      <div class="section">${this._t("now.what_happened")}</div>
      ${this._logCard(info, LATEST_LOG_ROWS)} ${this._costSummary(info)}
    `;
  }

  private _bandBar(info: DefenderInfo): TemplateResult | typeof nothing {
    if (!info.band) {
      return nothing;
    }
    const sibling = info.sibling;
    const floor = info.floor ?? sibling?.floor ?? null;
    const safety =
      info.safety_temperature ?? sibling?.safety_temperature ?? null;
    const room = this._climate()?.attributes.current_temperature;
    const points: number[] = [info.band.low, info.band.high];
    for (const value of [floor, safety]) {
      if (value !== null) {
        points.push(value);
      }
    }
    const lo = Math.floor(Math.min(...points) - 1);
    const hi = Math.ceil(Math.max(...points) + 1);
    const pos = (value: number) =>
      `${Math.min(100, Math.max(0, ((value - lo) / (hi - lo)) * 100))}%`;
    const marker = (
      kind: string,
      value: number | null,
      label: string
    ): TemplateResult | typeof nothing =>
      value === null
        ? nothing
        : html`<span
            class=${`mark ${kind}`}
            style=${styleMap({ insetInlineStart: pos(value) })}
            ><span class="tick"></span
            ><span class="cap"
              >${label}
              ${
                Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
              }</span
            ></span
          >`;
    return html`<ha-card class="band-card">
      <div class="band" role="img" aria-label=${this._t("now.band_label")}>
        <span
          class="zone"
          style=${styleMap({
            insetInlineStart: pos(info.band.low),
            width: `calc(${pos(info.band.high)} - ${pos(info.band.low)})`,
          })}
        ></span>
        ${marker("floor", floor, this._t("now.band_floor"))}
        ${marker("low", info.band.low, "")}
        ${marker("high", info.band.high, "")}
        ${marker("safety", safety, this._t("now.band_safety"))}
        ${
          typeof room === "number"
            ? html`<span
                class="room"
                style=${styleMap({ insetInlineStart: pos(room) })}
              ></span>`
            : nothing
        }
      </div>
      <div class="detail">
        ${this._t("now.band_text", {
          low: info.band.low.toFixed(1),
          high: info.band.high.toFixed(1),
        })}
      </div>
    </ha-card>`;
  }

  private _guards(info: DefenderInfo): TemplateResult {
    const search = this._t("guards.search");
    const matcher = searchMatcher(this._filter);
    const match = (guard: DefenderGuard) =>
      matcher(guard.id, guardTitle(guard.id, this.direction), guard.family);
    const groupOf = (guard: DefenderGuard) =>
      guard.safety ? "safety" : guard.group;
    const groups = groupGuards(
      info.guards,
      (guard) =>
        match(guard) &&
        (this._guardFilter === "all" || groupOf(guard) === this._guardFilter)
    );
    const present = new Set(info.guards.map(groupOf));
    const chips: ToggleButton[] = GUARD_FILTERS.filter(
      (value) => value === "all" || present.has(value)
    ).map((value) => ({
      value,
      label: this._t(`guards.${value}`),
    }));
    return html`
      <ha-input-search
        appearance="outlined"
        .placeholder=${search}
        .accessibleLabel=${search}
        .value=${this._filter}
        .patternSamples=${info.guards.map((g) => g.id)}
        @input=${this._filterChanged}
      ></ha-input-search>
      <ha-button-toggle-group
        size="s"
        aria-label=${this._t("guards.filter")}
        .buttons=${chips}
        .active=${this._guardFilter}
        @value-changed=${this._guardFilterChanged}
      ></ha-button-toggle-group>
      ${this.direction === "heat" ? this._heatSafetyCard(info) : nothing}
      ${
        this.direction === "heat" && groups.some((g) => g.group !== "safety")
          ? html`<div class="section">${this._t("guards.sister_section")}</div>`
          : nothing
      }
      ${
        groups.length
          ? groups.map(
              (group) =>
                html`<ha-card
                  class=${classMap({ safety: group.group === "safety" })}
                  .header=${this._t(`guards.${group.group}`)}
                >
                  ${group.guards.map((guard) => this._guardRow(guard))}
                </ha-card>`
            )
          : html`<p>${this._t("guards.none")}</p>`
      }
      <p class="detail">${this._t("guards.explain")}</p>
    `;
  }

  private _heatSafetyCard(info: DefenderInfo): TemplateResult {
    const floor = info.floor ?? 0;
    const rows: [string, string, string][] = [
      [
        this._t("guards.floor_title"),
        this._t("guards.floor_note", { floor: floor.toFixed(0) }),
        this._t("guards.cannot_off"),
      ],
      [
        this._t("guards.freeze_title"),
        this._t("guards.freeze_note"),
        this._t("guards.two_keys"),
      ],
      [
        this._t("guards.silent_title"),
        this._t("guards.silent_note"),
        this._t("guards.cannot_off"),
      ],
    ];
    return html`<div class="section">${this._t("guards.always_on")}</div>
      <ha-card class="safety">
        ${rows.map(
          ([name, note, lock]) =>
            html`<div class="row safety">
              <span class="grow"
                >${name}<br /><span class="detail">${note}</span></span
              >
              <span class="detail lock">${lock}</span>
            </div>`
        )}
      </ha-card>`;
  }

  private _guardRow(guard: DefenderGuard): TemplateResult {
    const description = this._t(guardDescriptionKey(guard.id, this.direction));
    return html`<div class=${classMap({ row: true, safety: guard.safety })}>
      <span class="grow">
        ${guardTitle(guard.id, this.direction)}<br />
        <span
          class=${classMap({
            detail: true,
            desc: true,
            both: currentLanguageMode() === "bilingual",
          })}
          title=${description}
          >${description}</span
        >
        <span class="detail"
          >${
            guard.last_acted
              ? this._t("guards.last_acted", {
                  time: relativeTime(
                    new Date(guard.last_acted),
                    this.hass.locale
                  ),
                })
              : this._t("guards.never_acted")
          }${
            guard.reason
              ? `: ${this._reason(guard.reason_parts, guard.reason)}`
              : ""
          }</span
        >
      </span>
      <ha-switch
        .checked=${guard.enabled}
        .guardId=${guard.id}
        aria-label=${guardTitle(guard.id, this.direction)}
        @change=${this._guardChanged}
      ></ha-switch>
    </div>`;
  }

  private _money(value: number | null): string {
    if (value === null) {
      return "";
    }
    const currency = this.hass.config.currency;
    return currency
      ? formatNumber(value, this.hass.locale, { style: "currency", currency })
      : formatNumber(value, this.hass.locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }

  private _duration(seconds: number): string {
    const { hours, minutes } = splitDuration(seconds);
    return hours
      ? this._t("cost.hours_minutes", { hours, minutes })
      : this._t("cost.minutes", { minutes });
  }

  private _costSummary(info: DefenderInfo): TemplateResult {
    const cost = info.cost;
    return html`<ha-card class="cost-summary">
      <div class="row">
        <span class="grow">
          <span class="detail">${this._t(`cost.today_${this.direction}`)}</span
          ><br /><strong
            >${this._duration(cost.seconds_today)}${
              cost.cost_today !== null
                ? ` · ${this._t("cost.about", { cost: this._money(cost.cost_today) })}`
                : ""
            }</strong
          >
        </span>
        <span class="detail"
          >${
            cost.cost_today === null
              ? this._t("cost.no_meter")
              : this._t("cost.estimate_short")
          }</span
        >
      </div>
    </ha-card>`;
  }

  private _cost(info: DefenderInfo): TemplateResult {
    const cost = info.cost;
    return html`${this._costSummary(info)}
      <ha-card>
        <div class="row">
          <span class="grow">${this._t("cost.month")}</span>
          <span
            >${this._duration(cost.seconds_month)}${
              cost.cost_month !== null
                ? `, ${this._money(cost.cost_month)}`
                : ""
            }</span
          >
        </div>
        <div class="row column">
          <span>${this._t("cost.chart_title")}</span>
          ${
            cost.days.length
              ? html`<ha-chart-base
                  .height=${"150px"}
                  .data=${this._chartData(cost.days)}
                  .options=${this._chartOptions(cost.days)}
                ></ha-chart-base>`
              : html`<span class="detail">${this._t("cost.chart_empty")}</span>`
          }
        </div>
        <div class="row detail">
          ${
            cost.cost_today === null
              ? this._t("cost.no_power")
              : this._t("cost.note")
          }
        </div>
        ${
          this.direction === "heat"
            ? html`<div class="row detail">
                ${this._t("cost.not_measured_heat")}
              </div>`
            : nothing
        }
      </ha-card>`;
  }

  private _chartData = memoizeOne((days: DefenderDay[]) => [
    {
      id: "minutes",
      type: "bar" as const,
      name: this._t("cost.chart_series"),
      data: days.map((day) => Math.round(day.seconds / 60)),
      itemStyle: { borderRadius: [4, 4, 0, 0] },
    },
  ]);

  private _chartOptions = memoizeOne((days: DefenderDay[]): ECOption => ({
    xAxis: {
      type: "category",
      data: days.map((day) =>
        formatDateShort(
          new Date(`${day.day}T12:00:00`),
          this.hass.locale,
          this.hass.config
        )
      ),
    },
    yAxis: { type: "value", min: 0 },
    grid: { top: 12, bottom: 24, left: 8, right: 8, containLabel: true },
    tooltip: { trigger: "axis" },
  }));

  private _logText(entry: DefenderLogEntry, plain: boolean): string {
    const line = defenderLogLine(entry, plain);
    if (line) {
      return modeText(this.hass.localize, line.key, line.values);
    }
    return entry.kind === "command"
      ? this._reason(entry.values.reason_parts, commandReason(entry.message))
      : this._t(`log.${entry.kind}`);
  }

  private _logSub(entry: DefenderLogEntry): string {
    if (entry.kind === "command") {
      return `${guardTitle(entry.guard, this.direction)} · ${commandAction(entry)}`;
    }
    return "";
  }

  private _speaker(
    entry: DefenderLogEntry,
    plain: boolean
  ): TemplateResult | typeof nothing {
    const { who, to, code } = entry.values;
    if (
      entry.kind !== "handover" ||
      !who ||
      !to ||
      plain ||
      entry.values.plain === true ||
      (code !== "paused" && code !== "resumed")
    ) {
      return nothing;
    }
    const name = (role: string) =>
      html`<strong
        class=${classMap({ ac: role === "ac", heat: role === "heat" })}
        >${this._t(`log.role.${role}`)}</strong
      >`;
    return html`${name(who)} ${this._t("log.to")} ${name(to)}:`;
  }

  private _logCard(
    info: DefenderInfo,
    limit?: number
  ): TemplateResult | typeof nothing {
    if (!info.log.length) {
      return html`<p>${this._t("log.empty")}</p>`;
    }
    const rows = limit ? info.log.slice(0, limit) : info.log;
    return html`<ha-card>
      ${rows.map((entry) => {
        const sub = this._logSub(entry);
        const when = new Date(entry.time);
        return html`<div class="row log">
          <span class="time"
            >${formatTime(when, this.hass.locale, this.hass.config)}</span
          >
          <span class="grow"
            >${this._speaker(entry, info.plain_log)}
            ${this._logText(entry, info.plain_log)}${
              sub ? html`<br /><span class="detail">${sub}</span>` : nothing
            }</span
          >
        </div>`;
      })}
    </ha-card>`;
  }

  private _log(info: DefenderInfo): TemplateResult | typeof nothing {
    return this._logCard(info);
  }

  private _entryChanged(ev: CustomEvent<{ value: string }>): void {
    this._entryId = ev.detail.value;
    this._info = undefined;
    navigate(`${this._path}?entry=${ev.detail.value}`, { replace: true });
    this._refresh();
  }

  private _viewChanged(ev: CustomEvent<{ value: string }>): void {
    this._view = ev.detail.value as View;
  }

  private _guardFilterChanged(ev: CustomEvent<{ value: string }>): void {
    this._guardFilter = ev.detail.value;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _moved(ev: CustomEvent<{ value?: number }>): void {
    this._draft = ev.detail.value;
  }

  private async _commit(ev: CustomEvent<{ value?: number }>): Promise<void> {
    const value = ev.detail.value;
    this._draft = undefined;
    if (value === undefined || !this._entryId) {
      return;
    }
    try {
      await setDefenderTemperature(this.hass, this._entryId, value);
      this._error = undefined;
    } catch (err: any) {
      this._error = this._saveError(err);
    }
    await this._refresh();
  }

  private _saveError(err: { message?: string }): string {
    const key = bandErrorKey(err?.message);
    return key
      ? this._t(key)
      : this._t("now.save_failed", { error: err?.message ?? "" });
  }

  private _floorMoved(ev: CustomEvent<{ value?: number }>): void {
    this._floorDraft = ev.detail.value;
  }

  private async _floorCommit(
    ev: CustomEvent<{ value?: number }>
  ): Promise<void> {
    const value = ev.detail.value;
    this._floorDraft = undefined;
    if (value === undefined || !this._entryId) {
      return;
    }
    try {
      await setDefenderFloor(this.hass, this._entryId, value);
      this._error = undefined;
    } catch (err: any) {
      this._error = this._saveError(err);
    }
    await this._refresh();
  }

  private _pauseChanged(ev: CustomEvent<{ value: string }>): void {
    this._pauseHours = Number(ev.detail.value) || 2;
  }

  private async _guardChanged(ev: Event): Promise<void> {
    const target = ev.target as HTMLElement & {
      checked: boolean;
      guardId: string;
    };
    const guard = this._info?.guards.find((g) => g.id === target.guardId);
    if (!guard || !this._entryId) {
      return;
    }
    const enabled = target.checked;
    let confirmed = false;
    if (!enabled && needsConfirmationToDisable(guard)) {
      confirmed = await showConfirmationDialog(this, {
        title: this._t("guards.confirm_title"),
        text: this._t("guards.confirm_text", {
          guard: guardTitle(guard.id, this.direction),
        }),
        confirmText: this._t("guards.confirm_second"),
        destructive: true,
        confirmName: guardTitle(guard.id, this.direction),
      });
      if (!confirmed) {
        target.checked = true;
        return;
      }
    }
    try {
      await setDefenderGuard(
        this.hass,
        this._entryId,
        guard.id,
        enabled,
        confirmed
      );
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
    await this._refresh();
  }

  private async _alsoSibling(): Promise<boolean> {
    if (!this._info?.sibling) {
      return false;
    }
    return showConfirmationDialog(this, {
      title: this._t("now.also_title"),
      text: this._t("now.also_body"),
      confirmText: this._t("now.also_yes"),
      dismissText: this._t("now.also_no"),
    });
  }

  private async _pause(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    const also = await this._alsoSibling();
    await controlDefender(this.hass, this._entryId, "pause", {
      hours: this._pauseHours,
      alsoSibling: also,
    });
    await this._refresh();
  }

  private async _stop(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    const also = await this._alsoSibling();
    await controlDefender(this.hass, this._entryId, "stop", {
      alsoSibling: also,
    });
    await this._refresh();
  }

  private async _resume(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    await controlDefender(this.hass, this._entryId, "resume");
    await this._refresh();
  }

  static styles: CSSResultGroup = [
    haStyle,
    css`
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3);
        max-width: 640px;
        margin: 0 auto;
      }
      .intro,
      p {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 52px;
        padding: var(--ha-space-2) var(--ha-space-4);
      }
      .row.column {
        flex-direction: column;
        align-items: stretch;
        gap: var(--ha-space-2);
      }
      .row.log {
        align-items: flex-start;
        border-top: 1px solid var(--divider-color);
      }
      .row.log:first-child {
        border-top: none;
      }
      .time {
        flex: none;
        min-width: 44px;
        color: var(--secondary-text-color);
        font-family: var(--ha-font-family-code);
        font-size: var(--ha-font-size-s);
        padding-top: 2px;
      }
      strong.ac {
        color: var(--info-color, var(--primary-color));
      }
      strong.heat {
        color: var(--warning-color, var(--primary-color));
      }
      .row.sibling {
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
        background: var(--card-background-color);
      }
      .row.safety {
        border-inline-start: 3px solid var(--primary-color);
      }
      ha-card.safety {
        background: var(--ha-color-fill-danger-quiet-resting);
      }
      .grow {
        flex: 1;
        min-width: 0;
      }
      .desc {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Both languages: the Cantonese half gets its own line */
      .desc.both {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        white-space: normal;
      }
      .status {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-3) var(--ha-space-4);
      }
      .status.floor {
        background: var(--ha-color-fill-danger-quiet-resting);
      }
      .status-head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .pill {
        flex: none;
        padding: 2px var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill, 14px);
        background: var(--ha-color-fill-primary-quiet-resting);
        color: var(--ha-color-on-primary-container, var(--primary-text-color));
        font-size: var(--ha-font-size-s);
        font-weight: 700;
      }
      .pill.off {
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      .big {
        font-size: 22px;
        line-height: 1.25;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--ha-space-2);
      }
      .stat {
        display: flex;
        flex-direction: column;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-md, 12px);
        background: var(--secondary-background-color);
      }
      .stat strong {
        font-size: 22px;
        line-height: 1.2;
      }
      .stat.accent {
        background: var(--ha-color-fill-primary-quiet-resting);
      }
      .why {
        color: var(--primary-text-color);
      }
      .buttons {
        display: flex;
        gap: var(--ha-space-2);
      }
      .buttons ha-button {
        min-width: 0;
      }
      .section {
        margin-top: var(--ha-space-2);
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .slider-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--ha-space-2);
      }
      .slider-head .value {
        font-size: 22px;
      }
      .slider-limits {
        display: flex;
        justify-content: space-between;
      }
      .row.floor {
        background: var(--ha-color-fill-danger-quiet-resting);
      }
      .lock {
        flex: none;
        max-width: 40%;
        text-align: end;
      }
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      ha-input-search {
        display: block;
      }
      ha-card {
        overflow: hidden;
      }
      .band-card {
        padding: var(--ha-space-3) var(--ha-space-4);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .band {
        position: relative;
        height: 72px;
        margin: 0 var(--ha-space-6);
      }
      .band::before {
        content: "";
        position: absolute;
        inset-inline: 0;
        top: 32px;
        height: 8px;
        border-radius: 4px;
        background: var(--secondary-background-color);
      }
      .zone {
        position: absolute;
        top: 32px;
        height: 8px;
        border-radius: 4px;
        background: var(--primary-color);
      }
      .mark {
        position: absolute;
        top: 0;
        width: 0;
        height: 72px;
      }
      .mark .tick {
        position: absolute;
        top: 24px;
        inset-inline-start: -1px;
        width: 2px;
        height: 24px;
        background: var(--primary-text-color);
      }
      .mark.floor .tick {
        background: var(--info-color, var(--primary-color));
      }
      .mark.safety .tick {
        background: var(--error-color);
      }
      .mark .cap {
        position: absolute;
        top: 52px;
        transform: translateX(-50%);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .mark.low .cap,
      .mark.high .cap {
        top: 4px;
        color: var(--primary-text-color);
        font-weight: 600;
      }
      .room {
        position: absolute;
        top: 28px;
        width: 16px;
        height: 16px;
        margin-inline-start: -8px;
        border-radius: 50%;
        border: 3px solid var(--primary-text-color);
        background: var(--card-background-color);
        box-sizing: border-box;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-defender-page": HaDefenderPage;
  }
}
