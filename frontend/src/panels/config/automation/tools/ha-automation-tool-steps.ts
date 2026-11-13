import {
  mdiLockOpenVariantOutline,
  mdiLockOutline,
  mdiSkipNext,
  mdiPlay,
  mdiStop,
} from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { ManualAutomationConfig } from "../../../../data/automation";
import type { BreakpointHit, DebugCommand } from "../../../../data/trace";
import {
  clearBreakpoint,
  debugRun,
  listBreakpoints,
  loadTrace,
  setBreakpoint,
  subscribeBreakpointHits,
} from "../../../../data/trace";
import { haStyle } from "../../../../resources/styles";
import {
  addPausedRun,
  breakpointPathsFor,
  canBreakAt,
  removePausedRun,
  toggleBreakpointPath,
} from "./breakpoints";
import type { PausedRun } from "./breakpoints";
import type { AutomationToolContext } from "./registry";
import { stepKindIcon } from "./step-icons";
import { isDisabled, listSteps, stepDetail, stepTitle } from "./step-model";
import { isLocked, setStepEnabled, setStepLocked } from "./step-toggle";

type BreakpointStatus =
  "starting" | "listening" | "unsaved" | "admin" | "unavailable";

interface PausedVariables {
  rows?: { name: string; value: string }[];
  unreadable?: boolean;
}

const MAX_VARIABLES = 8;
const MAX_VALUE_LENGTH = 80;

const shortValue = (value: unknown): string => {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch (_err) {
    text = String(value);
  }
  text = text ?? "";
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH)}...`
    : text;
};

@customElement("ha-automation-tool-steps")
export class HaAutomationToolSteps extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _status: BreakpointStatus = "starting";

  @state() private _breakpoints: string[] = [];

  @state() private _paused: PausedRun[] = [];

  @state() private _variables: Record<string, PausedVariables> = {};

  @state() private _error?: string;

  private _unsub?: () => Promise<void>;

  private _subscribing = false;

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.steps.${key}` as any,
      vars as any
    );
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._listen();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopListening();
  }

  protected willUpdate(): void {
    const { hass, entityId } = this.context;
    // A run that ended without a command from here no longer waits.
    if (
      this._paused.length &&
      entityId &&
      hass.states[entityId]?.attributes.current === 0
    ) {
      this._paused = [];
    }
  }

  private async _listen() {
    if (this._unsub || this._subscribing || !this.context) {
      return;
    }
    const { hass, automationId } = this.context;
    if (!automationId) {
      this._status = "unsaved";
      return;
    }
    if (!hass.user?.is_admin) {
      this._status = "admin";
      return;
    }
    this._subscribing = true;
    try {
      const unsub = await subscribeBreakpointHits(hass, (hit) =>
        this._hit(hit)
      );
      if (!this.isConnected) {
        // The tool was closed while the subscription was being made.
        await unsub();
        return;
      }
      this._unsub = unsub;
      this._breakpoints = breakpointPathsFor(
        await listBreakpoints(hass),
        automationId
      );
      this._status = "listening";
    } catch (_err) {
      this._status = "unavailable";
    } finally {
      this._subscribing = false;
    }
  }

  /** Removes the breakpoints set here and ends the subscription. */
  private _stopListening() {
    const unsub = this._unsub;
    this._unsub = undefined;
    if (!unsub || !this.context) {
      return;
    }
    const { hass, automationId } = this.context;
    if (automationId) {
      for (const path of this._breakpoints) {
        clearBreakpoint(hass, "automation", automationId, path).catch(
          () => undefined
        );
      }
    }
    unsub().catch(() => undefined);
    this._breakpoints = [];
    this._paused = [];
    this._variables = {};
    this._status = "starting";
  }

  private _hit(hit: BreakpointHit) {
    const { automationId } = this.context;
    if (!automationId) {
      return;
    }
    this._paused = addPausedRun(this._paused, hit, automationId);
    this._loadVariables(hit);
  }

  private async _loadVariables(hit: BreakpointHit) {
    const { hass } = this.context;
    try {
      const trace = await loadTrace(
        hass,
        "automation",
        hit.item_id,
        hit.run_id
      );
      const elements = trace.trace[hit.node];
      const changed = elements?.[elements.length - 1]?.changed_variables;
      const rows = Object.entries(changed ?? {})
        .slice(0, MAX_VARIABLES)
        .map(([name, value]) => ({ name, value: shortValue(value) }));
      this._variables = { ...this._variables, [hit.run_id]: { rows } };
    } catch (_err) {
      this._variables = {
        ...this._variables,
        [hit.run_id]: { unreadable: true },
      };
    }
  }

  protected render() {
    const steps = listSteps(this.context.config);
    const off = steps.filter((s) => isDisabled(s.raw)).length;
    const pausedPaths = new Set(this._paused.map((run) => run.node));
    return html`
      <ha-alert alert-type="info">${this._t("honest")}</ha-alert>
      ${this._renderStatus()}
      ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
      <p class="summary">
        ${
          steps.length
            ? this._t("summary", { off, total: steps.length })
            : this._t("empty")
        }
      </p>
      <div class="layout">
        <ul class="steps">
          ${steps.map((step) => {
            const disabled = isDisabled(step.raw);
            const locked = isLocked(step.raw);
            const paused = pausedPaths.has(step.path);
            const detail = stepDetail(step);
            const title = stepTitle(step);
            const breakpoint = this._breakpoints.includes(step.path);
            return html`<li
              class=${classMap({ step: true, disabled, paused })}
              style=${styleMap({ "--depth": String(step.depth) })}
            >
              ${
                canBreakAt(step.path) && this._status === "listening"
                  ? html`<button
                      class=${classMap({ dot: true, on: breakpoint })}
                      type="button"
                      aria-pressed=${breakpoint}
                      aria-label=${this._t(
                        breakpoint ? "breakpoint_clear" : "breakpoint_set",
                        { step: title }
                      )}
                      .stepPath=${step.path}
                      @click=${this._toggleBreakpoint}
                    ></button>`
                  : html`<span class="dot-space"></span>`
              }
              <span class="tile"
                ><ha-svg-icon .path=${stepKindIcon(step.kind)}></ha-svg-icon
              ></span>
              <span class="text">
                <span class="label">
                  <span class="role"
                    >${this._t(`section.${step.section}`)}</span
                  >
                  ${title}
                </span>
                ${detail ? html`<span class="hint">${detail}</span>` : ""}
              </span>
              ${
                paused
                  ? html`<span class="pill paused-pill"
                      >${this._t("paused_here")}</span
                    >`
                  : disabled
                    ? html`<span class="pill">${this._t("off_badge")}</span>`
                    : nothing
              }
              <ha-icon-button
                class=${classMap({ lock: true, locked })}
                .path=${locked ? mdiLockOutline : mdiLockOpenVariantOutline}
                .label=${this._t(locked ? "unlock" : "lock", { step: title })}
                .disabled=${!this.context.applyConfig}
                .stepPath=${step.path}
                .locked=${locked}
                @click=${this._toggleLock}
              ></ha-icon-button>
              <ha-switch
                .checked=${!disabled}
                .disabled=${!this.context.applyConfig || locked}
                aria-label=${this._t("switch_label", { step: title })}
                .stepPath=${step.path}
                @change=${this._toggle}
              ></ha-switch>
            </li>`;
          })}
        </ul>
        ${
          this._paused.length
            ? html`<div class="paused-column">
                ${this._paused.map((run) => this._renderPaused(run, steps))}
              </div>`
            : nothing
        }
      </div>
      <p class="hint lock-note">${this._t("lock_note")}</p>
    `;
  }

  private _renderStatus() {
    switch (this._status) {
      case "unsaved":
        return html`<ha-alert alert-type="info"
          >${this._t("needs_save")}</ha-alert
        >`;
      case "admin":
        return html`<ha-alert alert-type="info"
          >${this._t("admin_only")}</ha-alert
        >`;
      case "unavailable":
        return html`<ha-alert alert-type="warning"
          >${this._t("not_available")}</ha-alert
        >`;
      case "listening":
        return html`<p class="hint listening">
          ${
            this._paused.length
              ? this._t("live_paused", { count: this._paused.length })
              : this._t("listening", { count: this._breakpoints.length })
          }
        </p>`;
      default:
        return nothing;
    }
  }

  private _renderPaused(run: PausedRun, steps: ReturnType<typeof listSteps>) {
    const step = steps.find((s) => s.path === run.node);
    const vars = this._variables[run.runId];
    return html`<section class="paused-card" role="status">
      <h3>${this._t("paused_title")}</h3>
      <p class="hint">${this._t("paused_waiting")}</p>
      <dl>
        <dt>${this._t("paused_run")}</dt>
        <dd>${run.runId.slice(0, 8)}</dd>
        <dt>${this._t("paused_step")}</dt>
        <dd>${step ? stepTitle(step) : run.node}</dd>
      </dl>
      <h4>${this._t("variables")}</h4>
      ${
        vars?.unreadable
          ? html`<p class="hint">${this._t("variables_unreadable")}</p>`
          : vars?.rows?.length
            ? html`<dl>
                ${vars.rows.map(
                  (row) =>
                    html`<dt>${row.name}</dt>
                      <dd>${row.value}</dd>`
                )}
              </dl>`
            : html`<p class="hint">${this._t("variables_none")}</p>`
      }
      <div class="commands">
        <ha-button
          .runId=${run.runId}
          .command=${"continue"}
          @click=${this._runCommand}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this._t("continue")}
        </ha-button>
        <ha-button
          appearance="outlined"
          .runId=${run.runId}
          .command=${"step"}
          @click=${this._runCommand}
        >
          <ha-svg-icon slot="start" .path=${mdiSkipNext}></ha-svg-icon>
          ${this._t("step")}
        </ha-button>
        <ha-button
          appearance="plain"
          variant="danger"
          .runId=${run.runId}
          .command=${"stop"}
          @click=${this._runCommand}
        >
          <ha-svg-icon slot="start" .path=${mdiStop}></ha-svg-icon>
          ${this._t("stop")}
        </ha-button>
      </div>
    </section>`;
  }

  private async _toggleBreakpoint(ev: Event) {
    const path = (ev.currentTarget as HTMLElement & { stepPath: string })
      .stepPath;
    const { hass, automationId } = this.context;
    if (!automationId) {
      return;
    }
    const next = toggleBreakpointPath(this._breakpoints, path);
    this._error = undefined;
    try {
      if (next.set) {
        await setBreakpoint(hass, "automation", automationId, path);
      } else {
        await clearBreakpoint(hass, "automation", automationId, path);
      }
      this._breakpoints = next.paths;
    } catch (err: any) {
      this._error = this._t("command_failed", {
        error: err?.message ?? String(err),
      });
    }
  }

  private async _runCommand(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      runId: string;
      command: DebugCommand;
    };
    const { hass, automationId } = this.context;
    if (!automationId) {
      return;
    }
    this._error = undefined;
    try {
      await debugRun(
        hass,
        target.command,
        "automation",
        automationId,
        target.runId
      );
      this._paused = removePausedRun(this._paused, target.runId);
    } catch (err: any) {
      this._error = this._t("command_failed", {
        error: err?.message ?? String(err),
      });
    }
  }

  private _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement & { stepPath: string };
    const next = setStepEnabled(
      this.context.config,
      target.stepPath,
      target.checked
    );
    if (next) {
      this.context.applyConfig?.(next as ManualAutomationConfig);
    }
  }

  private _toggleLock(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      stepPath: string;
      locked: boolean;
    };
    const next = setStepLocked(
      this.context.config,
      target.stepPath,
      !target.locked
    );
    if (next) {
      this.context.applyConfig?.(next as ManualAutomationConfig);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .summary {
          font-weight: var(--ha-font-weight-semibold);
          margin: var(--ha-space-3) 0;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: var(--ha-space-4);
          align-items: start;
        }
        .layout:has(.paused-column) {
          grid-template-columns: minmax(0, 1fr) minmax(240px, 340px);
        }
        @media (max-width: 720px) {
          .layout:has(.paused-column) {
            grid-template-columns: minmax(0, 1fr);
          }
          .paused-column {
            order: -1;
          }
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
          padding: var(--ha-space-2) var(--ha-space-3);
          margin-inline-start: calc(var(--depth, 0) * var(--ha-space-5));
          border-radius: var(--ha-border-radius-xl);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          box-shadow: var(--ha-shadow-card, none);
        }
        .step.disabled {
          opacity: 0.55;
        }
        .step.paused {
          border-color: var(--primary-color);
          outline: 2px solid var(--primary-color);
          opacity: 1;
        }
        .dot,
        .dot-space {
          flex: none;
          width: 20px;
          height: 20px;
          box-sizing: border-box;
        }
        .dot {
          padding: 0;
          border-radius: 50%;
          border: 2px solid var(--ha-color-error, var(--error-color));
          background: transparent;
          cursor: pointer;
        }
        .dot.on {
          background: var(--ha-color-error, var(--error-color));
        }
        .dot:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .tile {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
        }
        .text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .label {
          font-weight: var(--ha-font-weight-semibold);
        }
        .role {
          font-size: var(--ha-font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--secondary-text-color);
          margin-inline-end: var(--ha-space-2);
        }
        .hint {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
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
        .paused-pill {
          background: var(
            --ha-color-warning-container,
            var(--ha-color-primary-container)
          );
          color: var(--ha-color-on-warning-container, inherit);
        }
        .lock.locked {
          color: var(--primary-color);
        }
        .listening {
          margin: var(--ha-space-2) 0 0;
        }
        .lock-note {
          margin: var(--ha-space-3) 0 0;
        }
        .paused-column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .paused-card {
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          box-shadow: var(--ha-shadow-card, none);
        }
        .paused-card h3,
        .paused-card h4 {
          margin: 0 0 var(--ha-space-2);
        }
        .paused-card p {
          margin: 0 0 var(--ha-space-3);
        }
        dl {
          display: grid;
          grid-template-columns: max-content minmax(0, 1fr);
          gap: var(--ha-space-1) var(--ha-space-3);
          margin: 0 0 var(--ha-space-3);
        }
        dt {
          color: var(--secondary-text-color);
        }
        dd {
          margin: 0;
          overflow-wrap: anywhere;
        }
        .commands {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-steps": HaAutomationToolSteps;
  }
}
