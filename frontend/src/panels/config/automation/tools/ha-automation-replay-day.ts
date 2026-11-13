import { mdiPlay } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { useAmPm } from "../../../../common/datetime/use_am_pm";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import { fetchDateWS } from "../../../../data/history";
import { haStyle } from "../../../../resources/styles";
import { buildFlowGraph } from "./flow-graph";
import { flowNodeLabel } from "./node-label";
import type { AutomationToolContext } from "./registry";
import type { ReplayFiring, ReplayResult, TriggerReplay } from "./replay";
import {
  entitiesToFetch,
  MAX_ENTITIES,
  MAX_FIRINGS,
  MAX_WINDOW_MS,
  replayDay,
  timelinesFrom,
} from "./replay";
import { stepKindIcon } from "./step-icons";
import { listSteps, stepTitle } from "./step-model";

const pad = (n: number) => String(n).padStart(2, "0");

const dateValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Replays a recorded day against the automation on screen. Nothing runs. */
@customElement("ha-automation-replay-day")
export class HaAutomationReplayDay extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _date = dateValue(new Date());

  @state() private _running = false;

  @state() private _result?: ReplayResult;

  @state() private _error?: string;

  private _graph = memoizeOne((config: unknown) => buildFlowGraph(config));

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.simulate.${key}` as any,
      vars as any
    );
  }

  private _formatTime(t: number): string {
    const locale = this.context.hass.locale;
    return new Intl.DateTimeFormat(locale.language, {
      hour: "numeric",
      minute: "2-digit",
      hourCycle: useAmPm(locale) ? "h12" : "h23",
    }).format(new Date(t));
  }

  private _triggerLabel(path: string): string {
    const step = listSteps(this.context.config).find((s) => s.path === path);
    return step ? stepTitle(step) : path;
  }

  private _branchLabel(path: string): string {
    const nodes = this._graph(this.context.config).nodes;
    const node = nodes.find((n) => n.path === path);
    return node ? flowNodeLabel(this.context.hass, nodes, node) : path;
  }

  protected render() {
    const today = dateValue(new Date());
    return html`
      <div class="grid">
        <section class="card">
          <h3>${this._t("replay_title")}</h3>
          <ha-alert alert-type="info">${this._t("replay_safe")}</ha-alert>
          <ha-input
            type="date"
            .label=${this._t("replay_day")}
            .value=${this._date}
            max=${today}
            @input=${this._dateChanged}
          ></ha-input>
          <p class="hint">${this._t("replay_limits")}</p>
          <ha-button
            @click=${this._replay}
            .disabled=${this._running || !this._date}
          >
            <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
            ${this._t("replay")}
          </ha-button>
        </section>
        <section class="card">
          <h3>${this._t("result")}</h3>
          ${
            this._running
              ? html`<ha-spinner size="small"></ha-spinner>`
              : this._error
                ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
                : this._renderResult()
          }
        </section>
      </div>
    `;
  }

  private _renderResult() {
    const result = this._result;
    if (!result) {
      return html`<p class="hint">${this._t("replay_empty")}</p>`;
    }
    const count = (outcome: ReplayFiring["outcome"]) =>
      result.firings.filter((f) => f.outcome === outcome).length;
    return html`
      <p class="summary">
        ${
          result.firings.length
            ? this._t("replay_summary", {
                count: result.firings.length,
                run: count("would_run"),
                stopped: count("conditions_fail"),
                unknown: count("cannot_tell"),
              })
            : this._t("replay_none")
        }
      </p>
      <ul class="rows">
        ${result.triggers.map((trigger) => this._renderTrigger(trigger))}
      </ul>
      ${
        result.firings.length
          ? html`<h4>${this._t("replay_firings")}</h4>
              <ul class="rows">
                ${result.firings.map((firing) => this._renderFiring(firing))}
              </ul>`
          : nothing
      }
      ${
        result.truncated
          ? html`<p class="hint">
              ${this._t("replay_truncated", { max: MAX_FIRINGS })}
            </p>`
          : nothing
      }
      ${
        result.usedLive.length
          ? html`<p class="hint">
              ${this._t("replay_used_live", {
                entities: result.usedLive.join(", "),
              })}
            </p>`
          : nothing
      }
    `;
  }

  private _reasonText(trigger: TriggerReplay): string {
    const reason = trigger.reason ?? "";
    const [key, detail] = reason.split(/:(.*)/s);
    return this._t(`replay_reason_${key}`, {
      kind: detail ?? trigger.type,
      entity: detail ?? "",
    });
  }

  private _renderTrigger(trigger: TriggerReplay) {
    const status =
      trigger.status === "replayed"
        ? trigger.firings.length
          ? "run"
          : "none"
        : "unknown";
    return html`<li class="row">
      <ha-svg-icon .path=${stepKindIcon("trigger")}></ha-svg-icon>
      <span class="text">
        <span class="label"
          >${this._t("replay_trigger", {
            trigger: this._triggerLabel(trigger.path),
          })}</span
        >
        ${
          trigger.status === "unsupported"
            ? html`<span class="hint">${this._reasonText(trigger)}</span>`
            : nothing
        }
      </span>
      <span class=${classMap({ pill: true, [status]: true })}>
        ${
          trigger.status === "disabled"
            ? this._t("replay_off")
            : trigger.status === "unsupported"
              ? this._t("replay_cannot")
              : trigger.firings.length
                ? this._t("replay_fires", { count: trigger.firings.length })
                : this._t("replay_not_fire")
        }
      </span>
    </li>`;
  }

  private _renderFiring(firing: ReplayFiring) {
    const branches = firing.branches.map((p) => this._branchLabel(p));
    return html`<li class="row">
      <span class="time">${this._formatTime(firing.time)}</span>
      <span class="text">
        <span class="label">${this._triggerLabel(firing.triggerPath)}</span>
        ${
          firing.outcome === "would_run" && branches.length
            ? html`<span class="hint">${branches.join(", ")}</span>`
            : nothing
        }
        ${
          firing.undecided
            ? html`<span class="hint"
                >${this._t("replay_undecided", { count: firing.undecided })}</span
              >`
            : nothing
        }
      </span>
      <span class=${classMap({ pill: true, [firing.outcome]: true })}>
        ${this._t(`replay_outcome_${firing.outcome}`)}
      </span>
    </li>`;
  }

  private _dateChanged(ev: Event) {
    this._date = (ev.target as HTMLInputElement).value;
  }

  private async _replay() {
    const { hass, config } = this.context;
    const [y, m, d] = this._date.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const end = Math.min(start + MAX_WINDOW_MS, Date.now());
    this._running = true;
    this._error = undefined;
    this._result = undefined;
    try {
      if (!(end > start)) {
        throw new Error(this._t("replay_future"));
      }
      const ids = entitiesToFetch(config).slice(0, MAX_ENTITIES);
      // An empty list would ask for the history of every entity.
      const history = ids.length
        ? await fetchDateWS(hass, new Date(start), new Date(end), ids)
        : {};
      this._result = await replayDay(hass, config, timelinesFrom(history), {
        start,
        end,
      });
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    } finally {
      this._running = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 320px), 1fr)
          );
          gap: var(--ha-space-4);
        }
        .card {
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          align-items: stretch;
        }
        h3,
        h4 {
          margin: 0;
        }
        .hint {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .summary {
          margin: 0;
          font-weight: var(--ha-font-weight-semibold);
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
          align-items: center;
          gap: var(--ha-space-3);
        }
        .text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .label {
          overflow-wrap: anywhere;
        }
        .time {
          flex: none;
          min-width: 48px;
          font-variant-numeric: tabular-nums;
          font-weight: var(--ha-font-weight-semibold);
        }
        .pill {
          flex: none;
          padding: 2px var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          background: var(
            --ha-color-surface-tone-3,
            var(--secondary-background-color)
          );
          font-size: var(--ha-font-size-s);
        }
        .pill.run,
        .pill.would_run {
          background: var(
            --ha-color-success-container,
            var(--ha-color-primary-container)
          );
        }
        .pill.unknown,
        .pill.cannot_tell,
        .pill.conditions_fail {
          background: var(
            --ha-color-warning-container,
            var(--ha-color-primary-container)
          );
        }
        ha-input {
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-replay-day": HaAutomationReplayDay;
  }
}
