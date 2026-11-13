import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import type { AutomationCheckResult } from "../automation-check";
import { checkAutomation } from "../automation-check";
import { computeHealth, HEALTH_PENALTIES } from "./automation-health";
import type { AutomationToolContext } from "./registry";

@customElement("ha-automation-tool-health")
export class HaAutomationToolHealth extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _check?: AutomationCheckResult;

  @state() private _checking = false;

  private _checkedConfig?: unknown;

  private async _runCheck() {
    this._checking = true;
    this._checkedConfig = this.context.config;
    this._check = await checkAutomation(this.context.hass, this.context.config);
    this._checking = false;
  }

  protected willUpdate(): void {
    if (this.context && this._checkedConfig !== this.context.config) {
      this._runCheck();
    }
  }

  private _fix(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    const report = computeHealth(
      this.context.config,
      this.context.hass.states,
      this._check
    );
    const fix = report.findings.find((f) => f.id === id)?.fix;
    if (fix) {
      this.context.applyConfig?.(fix);
    }
  }

  private _t(key: string, values?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools_more.health.${key}` as any,
      values
    );
  }

  protected render() {
    if (!this.context) {
      return nothing;
    }
    const report = computeHealth(
      this.context.config,
      this.context.hass.states,
      this._check
    );
    const tone =
      report.score >= 80 ? "good" : report.score >= 50 ? "warn" : "bad";
    return html`
      <ha-card .header=${this._t("title", { score: report.score })}>
        <div class="content">
          <div
            class="score ${tone}"
            role="img"
            aria-label=${this._t("score_label", { score: report.score })}
          >
            ${report.score}
          </div>
          <p class="hint">
            ${
              this._checking
                ? this._t("checking")
                : this._t("summary", { count: report.findings.length })
            }
          </p>
          <p class="hint">
            ${this._t("formula", {
              invalid: HEALTH_PENALTIES.invalid,
              entity: HEALTH_PENALTIES.unavailable_entity,
              cap: HEALTH_PENALTIES.unavailable_entity_cap,
              deprecated: HEALTH_PENALTIES.deprecated,
              guard: HEALTH_PENALTIES.no_conditions,
            })}
          </p>
        </div>
      </ha-card>
      <ha-card .header=${this._t("findings")}>
        <ul class="content">
          ${report.findings.map(
            (finding) =>
              html`<li class="finding ${finding.severity}">
                <div class="grow">
                  <b>${this._t(`finding_${finding.id}`, finding.values)}</b>
                  <div class="hint">
                    ${this._t(`finding_${finding.id}_hint`, finding.values)} ·
                    ${this._t("penalty", { points: finding.penalty })}
                  </div>
                </div>
                ${
                  finding.fix && this.context.applyConfig
                    ? html`<ha-button
                        size="s"
                        data-id=${finding.id}
                        @click=${this._fix}
                      >
                        ${this._t("fix")}
                      </ha-button>`
                    : nothing
                }
              </li>`
          )}
          ${report.passed.map(
            (id) =>
              html`<li class="finding passed">
                <b>${this._t(`passed_${id}`)}</b>
              </li>`
          )}
        </ul>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: grid;
      gap: var(--ha-space-4);
    }
    .content {
      padding: var(--ha-space-4);
      margin: 0;
      display: grid;
      gap: var(--ha-space-3);
      list-style: none;
    }
    .score {
      justify-self: center;
      display: grid;
      place-items: center;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      font-size: var(--ha-font-size-3xl, 2.5rem);
      font-weight: var(--ha-font-weight-title, 700);
      background: var(
        --ha-color-success-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-success-container, var(--primary-text-color));
    }
    .score.warn {
      background: var(
        --ha-color-warning-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-warning-container, var(--primary-text-color));
    }
    .score.bad {
      background: var(
        --ha-color-error-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-error-container, var(--primary-text-color));
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      margin: 0;
    }
    .finding {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
      border-inline-start: 4px solid var(--divider-color);
    }
    .finding.error {
      border-inline-start-color: var(--error-color);
    }
    .finding.warning {
      border-inline-start-color: var(--warning-color);
    }
    .finding.passed {
      border-inline-start-color: var(--success-color);
    }
    .grow {
      flex: 1;
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-health": HaAutomationToolHealth;
  }
}
