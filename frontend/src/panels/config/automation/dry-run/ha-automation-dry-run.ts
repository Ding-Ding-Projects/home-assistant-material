import { mdiPlay } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { useAmPm } from "../../../../common/datetime/use_am_pm";
import { modeText } from "../../../../common/language-mode/language-mode";
import { playPageEntry } from "../../../../common/motion/page-entry";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import type {
  Condition,
  ManualAutomationConfig,
  Trigger,
} from "../../../../data/automation";
import {
  describeCondition,
  describeTrigger,
} from "../../../../data/automation_i18n";
import { fetchDateWS } from "../../../../data/history";
import type { Action } from "../../../../data/script";
import { describeAction } from "../../../../data/script_i18n";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import {
  entitiesToFetch,
  referencedEntities,
  timelinesFrom,
} from "../tools/replay";
import type { Timelines } from "../tools/replay";
import { configParts } from "../tools/step-model";
import type { Rec } from "../tools/step-model";
import {
  conditionAtPath,
  DAY_MS,
  MAX_FIRINGS,
  MAX_PERIOD_MS,
  periodWindow,
  replayDryRun,
} from "./dry-run-replay";
import type {
  ConditionLeaf,
  DryRunFiring,
  DryRunReplayResult,
  PeriodKind,
  Seen,
} from "./dry-run-replay";

const K = "ui.panel.config.automation.editor.dry_run_replay.";
const MAX_ENTITIES = 100;
const MAX_ACTIONS_SHOWN = 6;

const pad = (n: number) => String(n).padStart(2, "0");

const dateValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const dayStart = (value: string): number => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

/**
 * Replays recorded history against the automation as it is on screen, saved or
 * not, and shows when it would have run and when a condition would have
 * stopped it. No action is ever called.
 */
@customElement("ha-automation-dry-run")
export class HaAutomationDryRun extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The automation as it is in the editor, including unsaved edits. */
  @property({ attribute: false }) public config!: ManualAutomationConfig;

  @state() private _period: PeriodKind = "day";

  @state() private _from = dateValue(new Date(Date.now() - 2 * DAY_MS));

  @state() private _to = dateValue(new Date());

  @state() private _running = false;

  @state() private _result?: DryRunReplayResult;

  @state() private _clamped = false;

  @state() private _error?: string;

  @queryAll(".block") private _blocks!: HTMLElement[];

  private _token = 0;

  private _t(key: string, values?: Record<string, string | number>) {
    return modeText(this.hass.localize as any, `${K}${key}`, values as any);
  }

  protected firstUpdated(changed: PropertyValues) {
    super.firstUpdated(changed);
    playPageEntry(this._blocks);
    void this._replay();
  }

  private _time(t: number, withDate: boolean): string {
    const locale = this.hass.locale;
    const options: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
      hourCycle: useAmPm(locale) ? "h12" : "h23",
    };
    if (withDate) {
      options.month = "short";
      options.day = "numeric";
    }
    return new Intl.DateTimeFormat(locale.language, options).format(
      new Date(t)
    );
  }

  private _reasonText(leaf: ConditionLeaf): string {
    const [key, detail] = (leaf.reason ?? "").split(/:(.*)/s);
    return this._t(`reason_${key}`, { detail: detail ?? leaf.type });
  }

  private _seenText(seen?: Seen): string {
    if (!seen) {
      return "";
    }
    if (!seen.entityId) {
      return this._t("seen_value", { value: seen.value });
    }
    const name =
      (this.hass.states[seen.entityId]?.attributes?.friendly_name as
        string | undefined) ?? seen.entityId;
    return this._t("seen", { entity: name, value: seen.value });
  }

  private _conditionLabel(leaf: ConditionLeaf): string {
    const cond = conditionAtPath(this.config, leaf.path);
    return cond
      ? describeCondition(cond as unknown as Condition, this.hass, [])
      : leaf.type;
  }

  private _triggerLabel(path: string): string {
    const trigger = configParts(this.config).triggers[
      Number(path.split("/")[1])
    ] as Rec | undefined;
    return trigger
      ? describeTrigger(trigger as unknown as Trigger, this.hass, [])
      : path;
  }

  protected render() {
    return html`
      <div class="page">
        <div class="block head">
          <div class="kicker">${this._t("kicker")}</div>
          <h2>${this._t("title")}</h2>
        </div>
        <div class="block controls">
          <div class="pills" role="group" aria-label=${this._t("period_label")}>
            ${(["day", "week", "custom"] as PeriodKind[]).map(
              (kind) =>
                html`<button
                  type="button"
                  class=${classMap({ pill: true, active: this._period === kind })}
                  aria-pressed=${this._period === kind ? "true" : "false"}
                  data-kind=${kind}
                  @click=${this._pick}
                >
                  ${this._t(`period_${kind}`)}
                </button>`
            )}
          </div>
          ${
            this._period === "custom"
              ? html`<div class="dates">
                  <ha-input
                    type="date"
                    .label=${this._t("from")}
                    .value=${this._from}
                    max=${this._to}
                    @input=${this._fromChanged}
                  ></ha-input>
                  <ha-input
                    type="date"
                    .label=${this._t("to")}
                    .value=${this._to}
                    max=${dateValue(new Date())}
                    @input=${this._toChanged}
                  ></ha-input>
                  <ha-button @click=${this._replay} .disabled=${this._running}>
                    <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
                    ${this._t("run")}
                  </ha-button>
                </div>`
              : nothing
          }
        </div>
        ${this._renderBody()}
        <p class="block limits">${this._t("limits_history")}</p>
        <p class="block limits">
          ${this._t("limits_excluded")}
          ${this._t("limits_cap", { max: MAX_FIRINGS })}
        </p>
      </div>
    `;
  }

  private _renderBody() {
    if (this._running) {
      return html`<div class="block status" role="status">
        <ha-spinner size="small"></ha-spinner>
        <span>${this._t("running")}</span>
      </div>`;
    }
    if (this._error) {
      return html`<ha-alert alert-type="error">${this._error}</ha-alert>`;
    }
    const result = this._result;
    if (!result) {
      return html`<p class="block limits">${this._t("empty")}</p>`;
    }
    const { counts } = result;
    const fired = result.total;
    return html`
      ${
        this._clamped
          ? html`<ha-alert alert-type="info"
              >${this._t("clamped", { days: MAX_PERIOD_MS / DAY_MS })}</ha-alert
            >`
          : nothing
      }
      <section class="block hero">
        <div class="count">${counts.would_run}</div>
        <div class="grow">
          <div class="big">
            ${this._t(counts.would_run === 1 ? "hero_one" : "hero_other")}
          </div>
          <div>
            ${
              fired
                ? this._t("hero_detail", {
                    fired,
                    stopped: counts.stopped,
                    unknown: counts.cannot_tell,
                  })
                : this._t("hero_none")
            }
          </div>
        </div>
        <div class="chip">${this._t("safe_chip")}</div>
      </section>
      ${this._renderTimeline(result)} ${this._renderTriggerNotes(result)}
      ${
        result.missingHistory.length
          ? html`<ha-alert alert-type="warning"
              >${this._t("missing_history", {
                entities: result.missingHistory.join(", "),
              })}</ha-alert
            >`
          : nothing
      }
      <ul class="block rows">
        ${[...result.firings].reverse().map((f) => this._renderFiring(f, result))}
      </ul>
      ${
        result.truncated
          ? html`<p class="block limits">
              ${this._t("truncated", { max: MAX_FIRINGS, total: result.total })}
            </p>`
          : nothing
      }
    `;
  }

  private _renderTriggerNotes(result: DryRunReplayResult) {
    const notes = result.triggers.filter((t) => t.status === "unsupported");
    if (!notes.length) {
      return nothing;
    }
    return html`<ul class="block notes">
      ${notes.map(
        (trigger) =>
          html`<li>
            ${this._t("trigger_cannot", {
              trigger: this._triggerLabel(trigger.path),
            })}
          </li>`
      )}
    </ul>`;
  }

  private _renderTimeline(result: DryRunReplayResult) {
    const { start, end } = result.window;
    const span = end - start;
    const multiDay = span > DAY_MS;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => start + span * f);
    return html`<div class="block timeline">
      <div class="kicker">${this._t("timeline_title")}</div>
      <div class="track" aria-hidden="true">
        ${result.firings.map(
          (f) =>
            html`<span
              class=${classMap({ mark: true, [f.outcome]: true })}
              style=${styleMap({
                left: `${(((f.time - start) / span) * 100).toFixed(2)}%`,
              })}
            ></span>`
        )}
      </div>
      <div class="ticks" aria-hidden="true">
        ${ticks.map((t) => html`<span>${this._time(t, multiDay)}</span>`)}
      </div>
      <div class="legend">
        <span class="mark-key would_run"></span>${this._t("legend_run")}
        <span class="mark-key stopped"></span>${this._t("legend_stopped")}
        <span class="mark-key cannot_tell"></span>${this._t("legend_unknown")}
      </div>
    </div>`;
  }

  private _actionLines(): string[] {
    const actions = configParts(this.config).actions as Action[];
    const lines = actions
      .slice(0, MAX_ACTIONS_SHOWN)
      .map((action) => describeAction(this.hass, [], action));
    if (actions.length > MAX_ACTIONS_SHOWN) {
      lines.push(
        this._t("more_actions", { count: actions.length - MAX_ACTIONS_SHOWN })
      );
    }
    return lines;
  }

  private _renderFiring(firing: DryRunFiring, result: DryRunReplayResult) {
    const multiDay = result.window.end - result.window.start > DAY_MS;
    const time = this._time(firing.time, multiDay);
    const badge =
      firing.outcome === "would_run"
        ? "badge_run"
        : firing.outcome === "stopped"
          ? "badge_stopped"
          : "badge_unknown";
    const why = this._triggerLabel(firing.triggerPath);
    const because = this._seenText(firing.because);
    return html`<li class="row">
      <span class=${classMap({ badge: true, [firing.outcome]: true })}
        >${this._t(badge, { time })}</span
      >
      <div class="grow">
        <div class="why">${this._t("fired_because", { trigger: why })}</div>
        ${because ? html`<div class="sub">${because}</div>` : nothing}
        ${
          firing.stoppedBy
            ? html`<div class="sub">
                ${this._t("stopped_at", {
                  condition: this._conditionLabel(firing.stoppedBy),
                  seen: this._seenText(firing.stoppedBy.seen),
                })}
              </div>`
            : nothing
        }
        ${
          firing.unknownAt
            ? html`<div class="sub">
                ${this._t("unknown_at", {
                  condition: this._conditionLabel(firing.unknownAt),
                  reason: this._reasonText(firing.unknownAt),
                })}
              </div>`
            : nothing
        }
        ${
          firing.outcome === "would_run"
            ? html`<div class="sub">
                ${
                  this._actionLines().length
                    ? html`${this._t("would_do")}
                        <ul class="actions">
                          ${this._actionLines().map((l) => html`<li>${l}</li>`)}
                        </ul>`
                    : this._t("no_actions")
                }
              </div>`
            : nothing
        }
      </div>
    </li>`;
  }

  private _pick(ev: Event) {
    const kind = (ev.currentTarget as HTMLElement).dataset.kind as PeriodKind;
    this._period = kind;
    if (kind !== "custom") {
      void this._replay();
    }
  }

  private _fromChanged(ev: Event) {
    this._from = (ev.target as HTMLInputElement).value;
  }

  private _toChanged(ev: Event) {
    this._to = (ev.target as HTMLInputElement).value;
  }

  private async _replay() {
    const token = ++this._token;
    const now = Date.now();
    const window = periodWindow(
      this._period,
      now,
      this._period === "custom" && this._from && this._to
        ? {
            start: dayStart(this._from),
            end: dayStart(this._to) + DAY_MS,
          }
        : undefined
    );
    this._error = undefined;
    if (!window) {
      this._result = undefined;
      this._error = this._t("invalid_range");
      return;
    }
    this._running = true;
    try {
      const ids = entitiesToFetch(this.config).slice(0, MAX_ENTITIES);
      // An empty list would ask for the history of every entity.
      const history = ids.length
        ? await fetchDateWS(
            this.hass,
            new Date(window.start),
            new Date(window.end),
            ids
          )
        : {};
      if (token !== this._token) {
        return;
      }
      const timelines: Timelines = timelinesFrom(history);
      const missing = referencedEntities(this.config).filter(
        (id) => !timelines[id] || !timelines[id].length
      );
      this._clamped = window.clamped;
      this._result = replayDryRun(
        this.config,
        timelines,
        window,
        this._zoneNames(),
        missing
      );
    } catch (err: unknown) {
      if (token === this._token) {
        this._error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (token === this._token) {
        this._running = false;
      }
    }
  }

  /** The state a person has inside each zone is the zone's name. */
  private _zoneNames(): Record<string, string> {
    const names: Record<string, string> = {};
    for (const [id, stateObj] of Object.entries(this.hass.states)) {
      if (id.startsWith("zone.")) {
        const friendly = stateObj.attributes.friendly_name;
        if (typeof friendly === "string" && friendly) {
          names[id] = friendly;
        }
      }
    }
    return names;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .page {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          max-width: 1180px;
          margin: 0 auto;
          min-width: 0;
        }
        h2 {
          margin: 0;
          font-size: var(--ha-font-size-2xl);
          font-weight: 800;
          font-stretch: 116%;
          letter-spacing: -0.02em;
          line-height: 1.1;
          overflow-wrap: anywhere;
        }
        .kicker {
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .pills {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 4px;
          border-radius: 30px;
          background: var(
            --md-sys-color-surface-container-high,
            var(--divider-color)
          );
          align-self: flex-start;
          width: fit-content;
          max-width: 100%;
        }
        .pill {
          min-height: 48px;
          padding: 0 var(--ha-space-5);
          border-radius: 24px;
          border: none;
          background: transparent;
          color: var(--primary-text-color);
          font: inherit;
          font-weight: var(--ha-font-weight-bold);
          cursor: pointer;
        }
        .pill.active {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .pill:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .controls {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .dates {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
          align-items: flex-end;
        }
        .dates ha-input {
          flex: 1 1 160px;
          min-width: 0;
        }
        .status {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .hero {
          border-radius: 48px;
          background: var(
            --md-sys-color-primary-container,
            var(--primary-color)
          );
          color: var(
            --md-sys-color-on-primary-container,
            var(--text-primary-color)
          );
          padding: var(--ha-space-5) var(--ha-space-6);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-5);
        }
        .count {
          font-size: 96px;
          line-height: 0.8;
          font-weight: 800;
          font-stretch: 126%;
        }
        .grow {
          flex: 1 1 240px;
          min-width: 0;
        }
        .big {
          font-size: var(--ha-font-size-xl);
          font-weight: 800;
          font-stretch: 112%;
        }
        .chip {
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: 22px;
          background: var(
            --md-sys-color-on-primary-container,
            var(--primary-text-color)
          );
          color: var(
            --md-sys-color-primary-container,
            var(--card-background-color)
          );
          font-weight: 800;
        }
        .timeline {
          border-radius: 32px;
          background: var(--card-background-color);
          padding: var(--ha-space-5);
        }
        .track {
          position: relative;
          height: 56px;
          margin-top: var(--ha-space-3);
          border-radius: 16px;
          background: var(
            --md-sys-color-surface-container,
            var(--secondary-background-color)
          );
        }
        .mark {
          position: absolute;
          top: 8px;
          bottom: 8px;
          width: 6px;
          margin-inline-start: -3px;
          border-radius: 3px;
        }
        .mark.would_run,
        .mark-key.would_run {
          background: var(--primary-color);
        }
        .mark.stopped,
        .mark-key.stopped {
          background: var(--disabled-text-color);
        }
        .mark.cannot_tell,
        .mark-key.cannot_tell {
          background: var(--warning-color);
        }
        .ticks {
          display: flex;
          justify-content: space-between;
          gap: var(--ha-space-2);
          margin-top: 6px;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .legend {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-3);
          margin-top: var(--ha-space-3);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .mark-key {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .row {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
          align-items: flex-start;
          border-radius: 20px;
          background: var(--card-background-color);
          padding: var(--ha-space-3) var(--ha-space-4);
        }
        .badge {
          flex: none;
          padding: 6px var(--ha-space-3);
          border-radius: 16px;
          font-size: var(--ha-font-size-s);
          font-weight: 800;
          background: var(
            --md-sys-color-surface-container-high,
            var(--divider-color)
          );
          font-variant-numeric: tabular-nums;
        }
        .badge.would_run {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .badge.cannot_tell {
          background: var(
            --md-sys-color-tertiary-container,
            var(--warning-color)
          );
          color: var(
            --md-sys-color-on-tertiary-container,
            var(--primary-text-color)
          );
        }
        .why {
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .sub {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .actions {
          margin: 2px 0 0;
          padding-inline-start: var(--ha-space-5);
        }
        .notes {
          margin: 0;
          padding-inline-start: var(--ha-space-5);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .limits {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media (max-width: 480px) {
          .count {
            font-size: 72px;
          }
          .hero {
            border-radius: 32px;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-dry-run": HaAutomationDryRun;
  }
}
