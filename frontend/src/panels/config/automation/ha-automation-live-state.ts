import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  expandConditionWithShorthand,
  testCondition,
} from "../../../data/automation";
import type { ConditionWithShorthand } from "../../../data/automation";
import type { HomeAssistant } from "../../../types";
import type { ConditionVerdict, UnknownReason } from "./live-state";
import {
  conditionCannotBeJudged,
  throttleDelay,
  watchedEntityIds,
} from "./live-state";

/** Minimum spacing between two test calls from any row. */
const CALL_SPACING_MS = 200;
/** Conditions that watch no entity are tested again after this long. */
const IDLE_REFRESH_MS = 30000;

let queue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run
    .catch(() => undefined)
    .then(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, CALL_SPACING_MS);
        })
    );
  return run;
};

interface LiveResult {
  verdict: ConditionVerdict;
  reason?: UnknownReason;
}

/**
 * Shows the current state of the entities a trigger or condition watches and,
 * for a condition, whether it passes right now. The test uses the same
 * server call as the condition test button, runs at most once every few
 * seconds per row, and says "cannot tell" instead of guessing.
 */
@customElement("ha-automation-live-state")
export class HaAutomationLiveState extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: unknown;

  @property() public kind: "trigger" | "condition" = "trigger";

  @state() private _result?: LiveResult;

  private _lastRun?: number;

  private _timer?: number;

  private _idleTimer?: number;

  private _token = 0;

  private _lastSignature = "";

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this._timer);
    clearInterval(this._idleTimer);
    this._timer = undefined;
    this._idleTimer = undefined;
    this._token++;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (this.kind === "condition" && this.hasUpdated) {
      this._evaluateSoon();
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (this.kind !== "condition" || !this.hass || !this.config) {
      return;
    }
    const ids = watchedEntityIds(this.config);
    const signature = `${JSON.stringify(this.config)}|${ids
      .map((id) => this.hass.states[id]?.last_updated ?? "missing")
      .join(",")}`;
    if (signature !== this._lastSignature || changed.has("kind")) {
      this._lastSignature = signature;
      this._evaluateSoon();
    }
  }

  protected firstUpdated(): void {
    if (this.kind === "condition" && !this._idleTimer) {
      this._idleTimer = window.setInterval(() => {
        if (watchedEntityIds(this.config).length === 0) {
          this._evaluateSoon();
        }
      }, IDLE_REFRESH_MS);
    }
  }

  private _evaluateSoon(): void {
    if (this._timer !== undefined) {
      return;
    }
    const cannot = conditionCannotBeJudged(this.config);
    if (cannot) {
      this._result = { verdict: "unknown", reason: cannot };
      return;
    }
    const delay = throttleDelay(this._lastRun, Date.now());
    this._timer = window.setTimeout(() => {
      this._timer = undefined;
      this._evaluate();
    }, delay);
  }

  private async _evaluate(): Promise<void> {
    const token = ++this._token;
    this._lastRun = Date.now();
    let condition;
    try {
      const { enabled: _enabled, ...rest } = expandConditionWithShorthand(
        this.config as ConditionWithShorthand
      ) as { enabled?: boolean };
      condition = rest;
    } catch (_err) {
      this._result = { verdict: "unknown", reason: "server_error" };
      return;
    }
    let result: LiveResult;
    try {
      const response = await enqueue(() =>
        testCondition(this.hass, condition as any)
      );
      result = response.template_errors?.length
        ? { verdict: "unknown", reason: "template_error" }
        : { verdict: response.result ? "pass" : "fail" };
    } catch (_err) {
      result = { verdict: "unknown", reason: "server_error" };
    }
    if (token === this._token) {
      this._result = result;
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.automation.editor.live_state.${key}` as any,
      values
    );
  }

  protected render() {
    if (!this.hass || !this.config) {
      return nothing;
    }
    const ids = watchedEntityIds(this.config);
    const first = ids[0];
    const stateObj = first ? this.hass.states[first] : undefined;
    const stateText = first
      ? stateObj
        ? this.hass.formatEntityState(stateObj)
        : this._t("not_found")
      : undefined;
    return html`
      ${
        first
          ? html`<span
              class="chip state ${classMap({ missing: !stateObj })}"
              title=${`${first}: ${stateText}`}
            >
              <span class="label">${stateText}</span>
              ${
                ids.length > 1
                  ? html`<span class="more"
                      >${this._t("more", { count: ids.length - 1 })}</span
                    >`
                  : nothing
              }
            </span>`
          : nothing
      }
      ${this.kind === "condition" ? this._renderVerdict() : nothing}
    `;
  }

  private _renderVerdict() {
    const result = this._result;
    if (!result) {
      return nothing;
    }
    const text =
      result.verdict === "unknown"
        ? `${this._t("unknown")}${
            result.reason ? `: ${this._t(`reason_${result.reason}`)}` : ""
          }`
        : this._t(result.verdict);
    return html`<span
      class="chip verdict ${result.verdict}"
      role="status"
      aria-live="polite"
      >${text}</span
    >`;
  }

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
      margin-inline-start: var(--ha-space-2);
      vertical-align: middle;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill, 999px);
      font-size: var(--ha-font-size-s);
      background: var(
        --ha-color-surface-tone-2,
        var(--secondary-background-color)
      );
      color: var(--secondary-text-color);
      white-space: nowrap;
      max-width: 14em;
    }
    .label {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .more {
      opacity: 0.7;
    }
    .state.missing {
      background: var(--ha-color-warning-container, transparent);
      color: var(--ha-color-on-warning-container, var(--primary-text-color));
    }
    .verdict.pass {
      background: var(
        --ha-color-success-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-success-container, var(--primary-text-color));
    }
    .verdict.fail {
      background: var(
        --ha-color-warning-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-warning-container, var(--primary-text-color));
    }
    @media all and (max-width: 450px) {
      .state {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-live-state": HaAutomationLiveState;
  }
}
