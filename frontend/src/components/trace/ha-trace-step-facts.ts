import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import { formatNumber } from "../../common/number/format_number";
import type { TraceExtended } from "../../data/trace";
import type { HomeAssistant } from "../../types";
import "../../panels/config/automation/target/ha-automation-row-targets";
import { getTraceNodeTarget } from "./get_trace_node_target";
import type { NodeInfo } from "./hat-script-graph";
import { conditionResult, stepDurationSeconds } from "./trace-step-info";

interface Fact {
  label: string | TemplateResult;
  value: string | TemplateResult;
}

const MAX_VALUE_LENGTH = 120;

const show = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  const text = JSON.stringify(value) ?? "";
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH)}…`
    : text;
};

/**
 * What one step of a run did, as rows: when it ran, how long it took, which
 * action it called, on what, and with which settings. Every value comes from
 * the record the run left, never from the automation as it is now.
 */
@customElement("ha-trace-step-facts")
export class HaTraceStepFacts extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public trace!: TraceExtended;

  @property({ attribute: false }) public selected!: NodeInfo;

  @property({ attribute: false }) public trackedNodes!: Record<
    string,
    NodeInfo
  >;

  private _l(key: string, values?: Record<string, string | number>) {
    return this.hass.localize(
      `ui.panel.config.automation.trace.${key}` as any,
      values
    );
  }

  private _facts(): Fact[] {
    const node = this.selected;
    const records = this.trace.trace[node.path];
    if (!records?.length) {
      return [];
    }
    const first = records[0] as any;
    const config = (node.config ?? {}) as Record<string, any>;
    const facts: Fact[] = [];

    facts.push({
      label: this._l("facts.ran_at"),
      value: formatDateTimeWithSeconds(
        new Date(first.timestamp),
        this.hass.locale,
        this.hass.config
      ),
    });

    const seconds = stepDurationSeconds(
      this.trace,
      Object.keys(this.trackedNodes),
      node.path
    );
    if (seconds !== undefined) {
      facts.push({
        label: this._l("facts.took"),
        value: this._l("facts.seconds", {
          seconds: formatNumber(seconds, this.hass.locale, {
            maximumFractionDigits: 2,
          }),
        }),
      });
    }

    if (node.type === "trigger") {
      const description = first.changed_variables?.trigger?.description;
      if (typeof description === "string") {
        facts.push({ label: this._l("facts.trigger"), value: description });
      }
      if (first.result?.reason) {
        facts.push({
          label: this._l("facts.reason"),
          value: String(first.result.reason),
        });
      }
    }

    if (node.type === "condition") {
      const passed = conditionResult(this.trace, node);
      if (passed !== undefined) {
        facts.push({
          label: this._l("facts.result"),
          value: this._l(passed ? "step_true" : "step_false"),
        });
      }
    }

    const service = config.action ?? config.service;
    if (node.type === "action" && typeof service === "string") {
      facts.push({ label: this._l("facts.action"), value: service });
    }

    const target = getTraceNodeTarget(config, node.type);
    if (target) {
      facts.push({
        label: this._l("facts.target"),
        value: html`<ha-automation-row-targets
          .target=${target}
          size="s"
          interactive
        ></ha-automation-row-targets>`,
      });
    }

    // The settings the call was made with, as the run resolved them.
    const data = first.result?.params?.service_data ?? config.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.entries(data as Record<string, unknown>).forEach(([key, value]) =>
        facts.push({ label: html`<code>${key}</code>`, value: show(value) })
      );
    }

    const error = records.find((record) => record.error)?.error;
    if (error) {
      facts.push({ label: this._l("facts.error"), value: error });
    }
    return facts;
  }

  protected render(): TemplateResult | typeof nothing {
    const node = this.selected;
    if (!node) {
      return nothing;
    }
    const facts = this._facts();
    if (!facts.length) {
      return html`<p class="none">
        ${this._l(
          this.trace.trace[node.path]
            ? "facts.no_facts"
            : "path.step_not_executed"
        )}
      </p>`;
    }
    return html`
      <dl>
        ${facts.map(
          (fact) => html`
            <dt>${fact.label}</dt>
            <dd class=${fact.label === this._l("facts.error") ? "error" : ""}>
              ${fact.value}
            </dd>
          `
        )}
      </dl>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      gap: var(--ha-space-2) var(--ha-space-4);
      margin: 0;
    }
    dt {
      color: var(--secondary-text-color);
    }
    dd {
      margin: 0;
      font-weight: var(--ha-font-weight-medium);
      text-align: end;
      overflow-wrap: anywhere;
    }
    dt code {
      font-family: var(--ha-font-family-code, monospace);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    dd.error {
      color: var(--error-color);
    }
    dd ha-automation-row-targets {
      justify-content: flex-end;
    }
    .none {
      margin: 0;
      color: var(--secondary-text-color);
    }
    @media (max-width: 480px) {
      dl {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
      }
      dt {
        margin-top: var(--ha-space-2);
      }
      dd {
        text-align: start;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-trace-step-facts": HaTraceStepFacts;
  }
}
