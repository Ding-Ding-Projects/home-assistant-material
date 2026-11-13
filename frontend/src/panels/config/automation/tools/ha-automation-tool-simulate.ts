import { mdiClose, mdiPlus } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import "../../../../components/ha-svg-icon";
import "../../../../components/entity/ha-entity-picker";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-spinner";
import "../../../../components/input/ha-input";
import { haStyle } from "../../../../resources/styles";
import type { DryRunResult, DryRunStep } from "../automation-dry-run";
import { dryRunAutomation } from "../automation-dry-run";
import type { AutomationToolContext } from "./registry";
import type { Situation } from "./simulate";
import { buildSimulationHass, UNSUPPORTED_PREFIX, WEEKDAYS } from "./simulate";
import { iconForKindName } from "./step-icons";
import type { StepKind } from "./step-model";
import { isRec, stepTitle } from "./step-model";

const DRY = "ui.panel.config.automation.editor.dry_run.";

const pad = (n: number) => String(n).padStart(2, "0");

@customElement("ha-automation-tool-simulate")
export class HaAutomationToolSimulate extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _time = (() => {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  })();

  @state() private _weekday = "";

  @state() private _overrides: { entityId: string; state: string }[] = [];

  @state() private _running = false;

  @state() private _result?: DryRunResult;

  @state() private _error?: string;

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.simulate.${key}` as any,
      vars as any
    );
  }

  private _dry(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(`${DRY}${key}` as any, vars as any);
  }

  protected render() {
    return html`
      <div class="grid">
        <section class="card">
          <h3>${this._t("situation")}</h3>
          <ha-alert alert-type="info">${this._t("safe")}</ha-alert>
          <ha-input
            type="time"
            .label=${this._t("time")}
            .value=${this._time}
            @input=${this._timeChanged}
          ></ha-input>
          <label class="field">
            <span>${this._t("weekday")}</span>
            <select @change=${this._weekdayChanged}>
              <option value="" ?selected=${this._weekday === ""}>
                ${this._t("weekday_any")}
              </option>
              ${WEEKDAYS.map(
                (_d, i) =>
                  html`<option
                    value=${String(i)}
                    ?selected=${this._weekday === String(i)}
                  >
                    ${this._t(`weekday_${i}`)}
                  </option>`
              )}
            </select>
          </label>
          <h4>${this._t("states")}</h4>
          ${this._overrides.map((row, index) => this._renderRow(row, index))}
          <ha-button appearance="plain" @click=${this._addRow}>
            <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
            ${this._t("add_state")}
          </ha-button>
          <p class="hint">${this._t("limits")}</p>
          <ha-button @click=${this._simulate} .disabled=${this._running}>
            ${this._t("simulate")}
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

  private _renderRow(row: { entityId: string; state: string }, index: number) {
    return html`<div class="row">
      <ha-entity-picker
        .hass=${this.context.hass}
        .value=${row.entityId}
        .index=${index}
        @value-changed=${this._rowEntityChanged}
      ></ha-entity-picker>
      <ha-input
        .label=${this._t("state")}
        .value=${row.state}
        .index=${index}
        @input=${this._rowStateChanged}
      ></ha-input>
      <ha-icon-button
        .label=${this._t("remove_state")}
        .path=${mdiClose}
        .index=${index}
        @click=${this._removeRow}
      ></ha-icon-button>
    </div>`;
  }

  private _renderResult() {
    const result = this._result;
    if (!result) {
      return html`<p class="hint">${this._t("empty")}</p>`;
    }
    const verdict = this._dry(`conditions_${result.conditions}`);
    return html`
      <p class="summary">${verdict}</p>
      <p class="hint">
        ${this._dry("counts", {
          run: result.counts.would_run,
          skip: result.counts.would_skip,
          unknown: result.counts.cannot_tell,
        })}
      </p>
      <ul class="steps">
        ${result.steps.map((step) => this._renderStep(step))}
      </ul>
    `;
  }

  private _stepLabel(step: DryRunStep): string {
    const raw = step.item as unknown;
    const kind = (
      step.kind === "condition" ? "condition" : step.kind
    ) as StepKind;
    if (
      step.kind === "choose" ||
      step.kind === "if" ||
      step.kind === "repeat"
    ) {
      return stepTitle({
        path: "",
        kind,
        section: "action",
        depth: step.depth,
        raw,
      });
    }
    if (step.kind === "option") {
      return this._dry("step_option", {
        number: (step.index ?? 0) + 1,
        alias: isRec(raw) && typeof raw.alias === "string" ? raw.alias : "",
      });
    }
    if (step.kind === "default") {
      return this._dry("step_default");
    }
    if (step.kind === "then" || step.kind === "else") {
      return this._dry(`step_${step.kind}`);
    }
    const base = stepTitle({
      path: "",
      kind,
      section: step.section,
      depth: step.depth,
      raw,
    });
    return step.targets?.length
      ? `${base}: ${step.targets.map((t) => t.name).join(", ")}`
      : base;
  }

  private _reason(step: DryRunStep): string {
    if (step.detail?.startsWith(UNSUPPORTED_PREFIX)) {
      return this._t("unsupported", {
        kind: step.detail.slice(UNSUPPORTED_PREFIX.length),
      });
    }
    if (!step.reason) {
      return "";
    }
    return this._dry(`reason_${step.reason}`, { detail: step.detail ?? "" });
  }

  private _renderStep(step: DryRunStep) {
    const reason = this._reason(step);
    return html`<li
      class=${classMap({ step: true, [step.verdict]: true })}
      style=${styleMap({ "--depth": String(step.depth) })}
    >
      <ha-svg-icon .path=${iconForKindName(step.kind)}></ha-svg-icon>
      <span class="text">
        <span class="label">${this._stepLabel(step)}</span>
        ${reason ? html`<span class="hint">${reason}</span>` : nothing}
      </span>
      <span class="pill">${this._dry(`verdict_${step.verdict}`)}</span>
    </li>`;
  }

  private _timeChanged(ev: Event) {
    this._time = (ev.target as HTMLInputElement).value;
  }

  private _weekdayChanged(ev: Event) {
    this._weekday = (ev.target as HTMLSelectElement).value;
  }

  private _addRow() {
    this._overrides = [...this._overrides, { entityId: "", state: "" }];
  }

  private _removeRow(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._overrides = this._overrides.filter((_r, i) => i !== index);
  }

  private _rowEntityChanged(ev: CustomEvent) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._setRow(index, { entityId: ev.detail.value ?? "" });
  }

  private _rowStateChanged(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._setRow(index, { state: (ev.target as HTMLInputElement).value });
  }

  private _setRow(
    index: number,
    patch: Partial<{ entityId: string; state: string }>
  ) {
    this._overrides = this._overrides.map((r, i) =>
      i === index ? { ...r, ...patch } : r
    );
  }

  private async _simulate() {
    const { hass, config } = this.context;
    const situation: Situation = {
      overrides: this._overrides.filter((r) => r.entityId),
      time: this._time,
      weekday: this._weekday === "" ? undefined : Number(this._weekday),
    };
    this._running = true;
    this._error = undefined;
    try {
      const simulated = buildSimulationHass(hass.states, situation);
      this._result = await dryRunAutomation(simulated, {
        conditions: config.conditions ?? config.condition ?? [],
        actions: config.actions ?? config.action ?? [],
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
        .row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
          gap: var(--ha-space-2);
          align-items: center;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        select {
          font: inherit;
          padding: var(--ha-space-2);
          border-radius: var(--ha-border-radius-md);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          background: var(--card-background-color);
          color: var(--primary-text-color);
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
        .steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .step {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding-inline-start: calc(var(--depth, 0) * var(--ha-space-4));
        }
        .step .text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
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
        .would_run .pill {
          background: var(
            --ha-color-success-container,
            var(--ha-color-primary-container)
          );
        }
        .cannot_tell .pill {
          background: var(
            --ha-color-warning-container,
            var(--ha-color-primary-container)
          );
        }
        .would_skip {
          opacity: 0.75;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-simulate": HaAutomationToolSimulate;
  }
}
