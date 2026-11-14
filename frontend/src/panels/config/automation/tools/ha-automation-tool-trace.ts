import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import type {
  AutomationTrace,
  AutomationTraceExtended,
} from "../../../../data/trace";
import { loadTrace, loadTraces } from "../../../../data/trace";
import { haStyle } from "../../../../resources/styles";
import { getErrorMessage } from "../run-helpers";
import type { AutomationToolContext } from "./registry";
import { stepKindIcon } from "./step-icons";
import { canShowTraceStep } from "./trace-editor";
import type { TraceFact, TraceRow } from "./trace-overlay";
import { buildTraceRows, formatDuration } from "./trace-overlay";

const MAX_RUNS = 12;

@customElement("ha-automation-tool-trace")
export class HaAutomationToolTrace extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _runs?: AutomationTrace[];

  @state() private _runId?: string;

  @state() private _trace?: AutomationTraceExtended;

  @state() private _loading = false;

  @state() private _error?: string;

  @state() private _selected?: number;

  private _requestId = 0;

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.trace.${key}` as any,
      vars as any
    );
  }

  protected firstUpdated(): void {
    this._loadRuns();
  }

  private async _loadRuns() {
    const { hass, automationId } = this.context;
    if (!automationId) {
      return;
    }
    this._loading = true;
    try {
      const runs = (await loadTraces(hass, "automation", automationId))
        .filter((run) => !run.not_triggered)
        .sort((a, b) => b.timestamp.start.localeCompare(a.timestamp.start))
        .slice(0, MAX_RUNS);
      this._runs = runs;
      if (runs.length) {
        await this._select(runs[0].run_id);
      }
    } catch (err) {
      this._error = getErrorMessage(err);
    } finally {
      this._loading = false;
    }
  }

  private async _select(runId: string) {
    const { hass, automationId } = this.context;
    const requestId = ++this._requestId;
    this._runId = runId;
    this._selected = undefined;
    this._trace = undefined;
    this._error = undefined;
    try {
      const trace = await loadTrace(hass, "automation", automationId!, runId);
      // A slower request must not overwrite a more recently selected run.
      if (this._requestId !== requestId) {
        return;
      }
      this._trace = trace;
      this._error = undefined;
    } catch (err) {
      if (this._requestId !== requestId) {
        return;
      }
      this._trace = undefined;
      this._error = getErrorMessage(err);
    }
  }

  private _runClicked(ev: Event) {
    this._select((ev.currentTarget as HTMLElement & { runId: string }).runId);
  }

  private _rowClicked(ev: Event) {
    this._selected = (
      ev.currentTarget as HTMLElement & { index: number }
    ).index;
  }

  private _showSelectedStep() {
    if (!this._trace || this._selected === undefined) {
      return;
    }
    const row = buildTraceRows(this._trace)[this._selected];
    if (
      row &&
      canShowTraceStep(this._trace.config, this.context.config, row.path)
    ) {
      fireEvent(this, "tool-show-step", { path: row.path });
    }
  }

  private _fact(fact: TraceFact): string {
    return this._t(`fact.${fact.key}` as any, fact.values);
  }

  protected render() {
    if (!this.context.automationId) {
      return html`<ha-alert alert-type="info"
        >${this._t("save_first")}</ha-alert
      >`;
    }
    if (this._loading) {
      return html`<ha-spinner size="small"></ha-spinner>`;
    }
    if (this._error && !this._runs?.length) {
      return html`<ha-alert alert-type="error">${this._error}</ha-alert>`;
    }
    if (!this._runs?.length) {
      return html`<p class="hint">${this._t("no_runs")}</p>`;
    }
    const rows = this._trace ? buildTraceRows(this._trace) : [];
    const total = rows.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
    const selected =
      this._selected === undefined ? undefined : rows[this._selected];
    const canShowSelected =
      selected &&
      this._trace &&
      canShowTraceStep(this._trace.config, this.context.config, selected.path);
    return html`
      <p class="hint">${this._t("note")}</p>
      <div class="runs" role="listbox" aria-label=${this._t("runs")}>
        ${this._runs.map(
          (run) =>
            html`<button
              role="option"
              aria-selected=${run.run_id === this._runId}
              class=${classMap({ run: true, active: run.run_id === this._runId })}
              .runId=${run.run_id}
              @click=${this._runClicked}
            >
              ${new Date(run.timestamp.start).toLocaleString(
                this.context.hass.locale.language
              )}
            </button>`
        )}
      </div>
      ${
        this._trace
          ? html`<p class="summary">
              ${this._t("run_summary", {
                steps: rows.length,
                duration: formatDuration(total),
                state: this._t(
                  `result.${this._trace.script_execution ?? "running"}` as any
                ),
              })}
            </p>`
          : nothing
      }
      ${!this._trace && !this._error ? html`<ha-spinner size="small"></ha-spinner>` : nothing}
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      <div class="grid">
        <ul class="rows">
          ${rows.map((row, index) => this._renderRow(row, index, total))}
        </ul>
        <section class="vars">
          ${
            selected
              ? html`
                  <ha-button
                    appearance="outlined"
                    ?disabled=${!canShowSelected}
                    @click=${this._showSelectedStep}
                  >
                    ${this.context.hass.localize("ui.panel.config.automation.editor.tools.flow.show_step")}
                  </ha-button>
                  ${!canShowSelected ? html`<p class="hint">${this._t("step_changed")}</p>` : nothing}
                `
              : nothing
          }
          <h3>${this._t("variables")}</h3>
          ${
            selected?.variables
              ? html`<pre>${JSON.stringify(selected.variables, null, 2)}</pre>`
              : html`<p class="hint">${this._t("pick_step")}</p>`
          }
        </section>
      </div>
    `;
  }

  private _renderRow(row: TraceRow, index: number, total: number) {
    const share =
      row.durationMs && total ? Math.max(2, (row.durationMs / total) * 100) : 0;
    return html`<li>
      <button
        class=${classMap({ row: true, active: this._selected === index, failed: !!row.error })}
        .index=${index}
        @click=${this._rowClicked}
      >
        <ha-svg-icon .path=${stepKindIcon(row.kind)}></ha-svg-icon>
        <span class="text">
          <b>${row.title}</b>
          ${row.facts.map((f) => html`<span class="hint">${this._fact(f)}</span>`)}
          ${row.error ? html`<span class="error">${row.error}</span>` : nothing}
        </span>
        <span class="bar" aria-hidden="true">
          <span class="fill" style=${styleMap({ width: `${share}%` })}></span>
        </span>
        <span class="time">
          ${row.durationMs === undefined ? "" : formatDuration(row.durationMs)}
        </span>
      </button>
    </li>`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .hint {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .summary {
          margin: var(--ha-space-2) 0;
          font-weight: var(--ha-font-weight-semibold);
        }
        .runs {
          display: flex;
          gap: var(--ha-space-2);
          overflow-x: auto;
          padding: var(--ha-space-2) 0;
        }
        .run {
          flex: none;
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          background: transparent;
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }
        .run.active {
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
          border-color: transparent;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 320px), 1fr)
          );
          gap: var(--ha-space-4);
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
          width: 100%;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) minmax(40px, 120px) auto;
          gap: var(--ha-space-3);
          align-items: center;
          text-align: start;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }
        .row.active {
          outline: 2px solid var(--primary-color);
        }
        .row.failed {
          border-color: var(--error-color);
        }
        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .error {
          color: var(--error-color);
          font-size: var(--ha-font-size-s);
        }
        .bar {
          height: 8px;
          border-radius: 4px;
          background: var(--ha-color-surface-tone-3, var(--divider-color));
          overflow: hidden;
        }
        .fill {
          display: block;
          height: 100%;
          background: var(--primary-color);
        }
        .time {
          font-family: var(--ha-font-family-code, monospace);
          font-size: var(--ha-font-size-s);
        }
        .vars h3 {
          margin: 0 0 var(--ha-space-2);
        }
        pre {
          margin: 0;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          overflow: auto;
          max-height: 360px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-trace": HaAutomationToolTrace;
  }
}
