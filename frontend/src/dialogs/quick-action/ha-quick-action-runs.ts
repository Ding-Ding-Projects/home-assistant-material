import { mdiStop } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatTime } from "../../common/datetime/format_time";
import { computeStateName } from "../../common/entity/compute_state_name";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-svg-icon";
import type { QuickActionRun } from "../../data/quick-action";
import {
  activeRuns,
  canTrackQuickActions,
  stopQuickAction,
  subscribeQuickActions,
} from "../../data/quick-action";
import { SubscribeMixin } from "../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../types";

const PREFIX = "ui.dialogs.quick_action.runs";

/**
 * "Running quick actions": the quick actions the server is running now, each
 * with Stop. Renders nothing when none is running, when the person is not an
 * administrator, or when the server cannot track quick actions.
 */
@customElement("ha-quick-action-runs")
export class HaQuickActionRuns extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _runs: QuickActionRun[] = [];

  @state() private _stopping = new Set<string>();

  @state() private _error?: string;

  private _lang = new LanguageModeController(this);

  protected hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    if (!this.hass || !canTrackQuickActions(this.hass)) {
      return [];
    }
    return [
      subscribeQuickActions(this.hass, (runs) => {
        this._runs = runs;
      }),
    ];
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass!.localize, `${PREFIX}.${key}`, values);
  }

  private async _stop(ev: Event) {
    const runId = (ev.currentTarget as HTMLElement).dataset.runId!;
    this._error = undefined;
    this._stopping = new Set(this._stopping).add(runId);
    try {
      await stopQuickAction(this.hass!, runId);
    } catch (err) {
      this._error = this._t("stop_failed", {
        reason: err instanceof Error ? err.message : String(err),
      });
    } finally {
      const next = new Set(this._stopping);
      next.delete(runId);
      this._stopping = next;
    }
  }

  private _name(run: QuickActionRun): string {
    if (run.label) {
      return run.label;
    }
    const stateObj = run.entity_id ? this.hass!.states[run.entity_id] : null;
    if (stateObj) {
      return computeStateName(stateObj);
    }
    return run.entity_id ?? this._t("unnamed");
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }
    const running = activeRuns(this._runs);
    if (!running.length) {
      return nothing;
    }
    return html`
      <section class="runs" aria-labelledby="runs-heading">
        <h3 id="runs-heading" class="heading">
          ${this._t("count", { count: running.length })}
        </h3>
        <ul>
          ${running.map((run) => {
            const stopping = this._stopping.has(run.id);
            return html`<li>
              <div class="text">
                <span class="name">${this._name(run)}</span>
                <span class="detail">
                  ${this._t("started", {
                    time: formatTime(
                      new Date(run.started),
                      this.hass!.locale,
                      this.hass!.config
                    ),
                  })}${
                    run.current_step
                      ? html` · ${this._t("now", { step: run.current_step })}`
                      : nothing
                  }
                </span>
              </div>
              <ha-button
                appearance="outlined"
                data-run-id=${run.id}
                .disabled=${stopping}
                @click=${this._stop}
              >
                <ha-svg-icon slot="start" .path=${mdiStop}></ha-svg-icon>
                ${stopping ? this._t("stopping") : this._t("stop")}
                <span class="visually-hidden">${this._name(run)}</span>
              </ha-button>
            </li>`;
          })}
        </ul>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
      </section>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .runs {
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-fill-warning-quiet-resting,
        var(--secondary-background-color)
      );
      padding: var(--ha-space-3);
      margin-bottom: var(--ha-space-3);
    }
    .heading {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-bold);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-width: 0;
      flex-wrap: wrap;
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .detail {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    ha-button {
      min-height: 48px;
    }
    ha-alert {
      display: block;
      margin-top: var(--ha-space-2);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-quick-action-runs": HaQuickActionRuns;
  }
}
