import { mdiFlask, mdiPlay } from "@mdi/js";
import { type CSSResultGroup, LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { ensureArray } from "../../../../../common/array/ensure-array";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-button";
import "../../../../../components/ha-svg-icon";
import type { Action, ChooseAction, Option } from "../../../../../data/script";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import type { ChooseOutcome, OptionTestResult } from "../../option/choose-run";
import {
  getChooseOutcome,
  runActions,
  testOption,
} from "../../option/choose-run";
import "../../option/ha-automation-option";
import type HaAutomationOption from "../../option/ha-automation-option";
import "../../option/ha-automation-option-row";
import type HaAutomationOptionRow from "../../option/ha-automation-option-row";
import { indentStyle } from "../../styles";
import "../ha-automation-action";
import type { ActionElement } from "../ha-automation-action-row";

@customElement("ha-automation-action-choose")
export class HaChooseAction extends LitElement implements ActionElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public disabled = false;

  @property({ attribute: false }) public action!: ChooseAction;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean }) public indent = false;

  @state() private _showDefault = false;

  @state() private _testing = false;

  @state() private _testResults?: OptionTestResult[];

  @state() private _testOutcome?: ChooseOutcome;

  @state() private _running = false;

  @state() private _runResult?: { variant: "success" | "danger"; text: string };

  @query("ha-automation-option") private _optionElement?: HaAutomationOption;

  @query("ha-automation-option-row")
  private _defaultOptionRowElement?: HaAutomationOptionRow;

  public static get defaultConfig(): ChooseAction {
    return { choose: [{ conditions: [], sequence: [] }] };
  }

  protected render() {
    const action = this.action;

    const options = action.choose ? ensureArray(action.choose) : [];

    return html`
      ${this._renderToolbar()}
      <ha-automation-option
        .options=${options}
        .disabled=${this.disabled}
        @value-changed=${this._optionsChanged}
        .hass=${this.hass}
        .narrow=${this.narrow}
        .optionsInSidebar=${this.indent}
        .showDefaultActions=${this._showDefault || !!action.default}
        @show-default-actions=${this._addDefault}
      ></ha-automation-option>

      ${
        this._showDefault || action.default
          ? html`
              <ha-automation-option-row
                .defaultActions=${(ensureArray(action.default) || []) as Action[]}
                .narrow=${this.narrow}
                .disabled=${this.disabled}
                .hass=${this.hass}
                .optionsInSidebar=${this.indent}
                @value-changed=${this._defaultChanged}
              ></ha-automation-option-row>
            `
          : nothing
      }
    `;
  }

  private _renderToolbar() {
    const localize = this.hass.localize;
    const prefix = "ui.panel.config.automation.editor.actions.type.choose.";
    return html`
      <div class="toolbar">
        <ha-button
          appearance="plain"
          size="s"
          .disabled=${this._testing}
          @click=${this._testAll}
        >
          <ha-svg-icon slot="start" .path=${mdiFlask}></ha-svg-icon>
          ${localize(`${prefix}${this._testing ? "testing" : "test_all"}`)}
        </ha-button>
        <ha-button
          appearance="plain"
          size="s"
          .disabled=${this._running}
          @click=${this._runAll}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${localize(`${prefix}${this._running ? "running" : "run_all"}`)}
        </ha-button>
        <span
          class="status ${this._runResult?.variant ?? ""}"
          role="status"
          aria-live="polite"
          >${this._runResult?.text ?? ""}</span
        >
      </div>
      ${this._renderTestResults()}
    `;
  }

  private _renderTestResults() {
    if (!this._testResults || !this._testOutcome) {
      return nothing;
    }
    const localize = this.hass.localize;
    const prefix = "ui.panel.config.automation.editor.actions.type.choose.";
    const outcome = this._testOutcome;
    let summary: string;
    switch (outcome.kind) {
      case "option":
        summary = localize(`${prefix}outcome_option`, {
          number: outcome.index + 1,
        });
        break;
      case "default":
        summary = localize(`${prefix}outcome_default`);
        break;
      case "unknown":
        summary = localize(`${prefix}outcome_unknown`, {
          number: outcome.index + 1,
        });
        break;
      default:
        summary = localize(`${prefix}outcome_none`);
    }
    return html`
      <div class="results" role="status" aria-live="polite">
        <ul>
          ${this._testResults.map(
            (result, index) => html`
              <li>
                ${localize(`${prefix}option`, { number: index + 1 })}:
                ${localize(`${prefix}result_${result.status}`)}${
                  "message" in result ? html` (${result.message})` : nothing
                }
              </li>
            `
          )}
        </ul>
        <strong>${summary}</strong>
      </div>
    `;
  }

  private async _testAll() {
    const options = (
      this.action.choose ? ensureArray(this.action.choose) : []
    ) as Option[];
    const action = this.action;
    this._testing = true;
    this._testResults = undefined;
    this._testOutcome = undefined;
    const results: OptionTestResult[] = await Promise.all(
      options.map((option) => testOption(this.hass, option))
    );
    this._testing = false;
    if (this.action !== action && this.action?.choose !== action.choose) {
      // The step was edited while testing, so the answer would be stale.
      return;
    }
    this._testResults = results;
    this._testOutcome = getChooseOutcome(
      results,
      ensureArray(action.default ?? []).length > 0
    );
  }

  /** Runs the whole step as the automation would, conditions included. */
  private async _runAll() {
    if (this._running) {
      return;
    }
    const localize = this.hass.localize;
    const { enabled: _enabled, ...step } = this.action;
    this._running = true;
    this._runResult = undefined;
    const result = await runActions(this.hass, step as Action);
    this._running = false;
    this._runResult =
      result.status === "success"
        ? {
            variant: "success",
            text: localize(
              "ui.panel.config.automation.editor.actions.type.choose.run_success"
            ),
          }
        : {
            variant: "danger",
            text: `${localize(
              result.status === "invalid"
                ? "ui.panel.config.automation.editor.actions.invalid_action"
                : "ui.panel.config.automation.editor.actions.run_action_error"
            )}: ${result.message}`,
          };
  }

  private async _addDefault() {
    this._showDefault = true;
    await this._defaultOptionRowElement?.updateComplete;
    this._defaultOptionRowElement?.expand();
  }

  private _optionsChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const value = ev.detail.value as Option[];
    fireEvent(this, "value-changed", {
      value: {
        ...this.action,
        choose: value,
      },
    });
  }

  private _defaultChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._showDefault = true;
    const defaultAction = ev.detail.value as Action[];
    const newValue: ChooseAction = {
      ...this.action,
      default: defaultAction,
    };
    if (defaultAction.length === 0) {
      delete newValue.default;
    }
    fireEvent(this, "value-changed", { value: newValue });
  }

  public expandAll() {
    this._optionElement?.expandAll();
    this._defaultOptionRowElement?.expandAll();
  }

  public collapseAll() {
    this._optionElement?.collapseAll();
    this._defaultOptionRowElement?.collapseAll();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      indentStyle,
      css`
        ha-automation-option-row {
          display: block;
          margin-top: 24px;
        }
        h3 {
          font-size: inherit;
          font-weight: inherit;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-2);
        }
        .status {
          font-size: var(--ha-font-size-s, 0.875rem);
          overflow-wrap: anywhere;
          min-width: 0;
        }
        .status.success {
          color: var(--ha-color-on-success-normal, var(--success-color));
        }
        .status.danger {
          color: var(--ha-color-on-danger-normal, var(--error-color));
        }
        .results {
          margin-bottom: var(--ha-space-3);
          overflow-wrap: anywhere;
        }
        .results ul {
          margin: 0 0 var(--ha-space-1);
          padding-inline-start: var(--ha-space-5, 20px);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-action-choose": HaChooseAction;
  }
}
