import { mdiFlask, mdiPlay } from "@mdi/js";
import {
  type CSSResultGroup,
  LitElement,
  type PropertyValues,
  css,
  html,
  nothing,
} from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { ensureArray } from "../../../../../common/array/ensure-array";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-button";
import "../../../../../components/ha-svg-icon";
import type { Action, ChooseAction, Option } from "../../../../../data/script";
import { showConfirmationDialog } from "../../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import type { ChooseOutcome, OptionTestResult } from "../../option/choose-run";
import {
  areTestResultsCurrent,
  getChooseOutcome,
  getConditionsKey,
  getConfigKey,
  getUnreachableOptions,
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

  // Conditions each stored test result was computed from.
  private _testedKeys?: string[];

  // The step a stored run result was produced for.
  private _ranKey?: string;

  @state() private _running = false;

  @state() private _runResult?: {
    variant: "success" | "danger" | "neutral";
    text: string;
  };

  // Whether the default actions existed when the stored test was computed.
  private _testedHasDefault = false;

  // Synchronous guards; state updates are asynchronous.
  private _testRequest = 0;

  private _runBusy = false;

  @query("ha-automation-option") private _optionElement?: HaAutomationOption;

  @query("ha-automation-option-row")
  private _defaultOptionRowElement?: HaAutomationOptionRow;

  public static get defaultConfig(): ChooseAction {
    return { choose: [{ conditions: [], sequence: [] }] };
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (!changedProperties.has("action")) {
      return;
    }
    const options = (
      this.action?.choose ? ensureArray(this.action.choose) : []
    ) as Option[];
    if (
      this._testResults &&
      (!areTestResultsCurrent(this._testedKeys ?? [], options) ||
        this._testedHasDefault !== this._hasDefault())
    ) {
      this._testResults = undefined;
      this._testOutcome = undefined;
      this._testedKeys = undefined;
    }
    if (
      this._runResult &&
      this._ranKey !== getConfigKey(this._stepWithoutEnabled())
    ) {
      this._runResult = undefined;
      this._ranKey = undefined;
    }
  }

  private _hasDefault() {
    return ensureArray(this.action?.default ?? []).length > 0;
  }

  private _stepWithoutEnabled() {
    const { enabled: _enabled, ...step } = this.action;
    return step;
  }

  protected render() {
    const action = this.action;

    const options = action.choose ? ensureArray(action.choose) : [];

    return html`
      ${this._renderToolbar()}
      <ha-automation-option
        .options=${options}
        .unreachable=${this._unreachable(options)}
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

  private _unreachableCache?: {
    options: Option[];
    value: ReturnType<typeof getUnreachableOptions>;
  };

  private _unreachable(options: Option[]) {
    if (this._unreachableCache?.options !== options) {
      this._unreachableCache = {
        options,
        value: getUnreachableOptions(options),
      };
    }
    return this._unreachableCache.value;
  }

  private _renderToolbar() {
    const localize = this.hass.localize;
    const prefix = "ui.panel.config.automation.editor.actions.type.choose.";
    if (!this.hass.user?.is_admin) {
      // Testing and running call admin-only services.
      return nothing;
    }
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
      <p class="note">${localize(`${prefix}run_note`)}</p>
      ${this._renderTestResults()}
    `;
  }

  private _renderTestResults() {
    // The live region always exists, so filling it is announced.
    return html`<div class="results" role="status" aria-live="polite">
      ${
        this._testResults && this._testOutcome
          ? this._renderResultList(this._testResults, this._testOutcome)
          : nothing
      }
    </div>`;
  }

  private _renderResultList(
    testResults: OptionTestResult[],
    outcome: ChooseOutcome
  ) {
    const localize = this.hass.localize;
    const prefix = "ui.panel.config.automation.editor.actions.type.choose.";
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
      <div>
        <ul>
          ${testResults.map(
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
    if (this._testing || !this.hass.user?.is_admin) {
      return;
    }
    const request = ++this._testRequest;
    this._testing = true;
    this._testResults = undefined;
    this._testOutcome = undefined;
    this._runResult = undefined;
    const testedKeys = options.map(getConditionsKey);
    const hadDefault = this._hasDefault();
    const results: OptionTestResult[] = await Promise.all(
      options.map((option) => testOption(this.hass, option))
    );
    if (request !== this._testRequest) {
      return;
    }
    this._testing = false;
    const current = (
      this.action?.choose ? ensureArray(this.action.choose) : []
    ) as Option[];
    if (
      !areTestResultsCurrent(testedKeys, current) ||
      hadDefault !== this._hasDefault()
    ) {
      // The step was edited while testing, so the answer would be stale.
      this._runResult = {
        variant: "neutral",
        text: this.hass.localize(
          "ui.panel.config.automation.editor.actions.type.choose.config_changed"
        ),
      };
      return;
    }
    this._testResults = results;
    this._testedKeys = testedKeys;
    this._testedHasDefault = hadDefault;
    this._testOutcome = getChooseOutcome(results, hadDefault);
  }

  /** Runs the whole step as the automation would, conditions included. */
  private async _runAll() {
    if (this._runBusy || !this.hass.user?.is_admin) {
      return;
    }
    const localize = this.hass.localize;
    const prefix = "ui.panel.config.automation.editor.actions.type.choose.";
    // Run performs the actions for real, so it is confirmed first.
    this._runBusy = true;
    const confirmed = await showConfirmationDialog(this, {
      title: localize(`${prefix}run_confirm_title`),
      text:
        this.action.enabled === false
          ? `${localize(`${prefix}run_confirm_text`)} ${localize(`${prefix}run_confirm_switched_off`)}`
          : localize(`${prefix}run_confirm_text`),
      confirmText: localize(`${prefix}run_all`),
      dismissText: localize("ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      this._runBusy = false;
      return;
    }
    const step = this._stepWithoutEnabled();
    const stepKey = getConfigKey(step);
    this._running = true;
    this._runResult = undefined;
    const result = await runActions(this.hass, step as Action);
    this._running = false;
    this._runBusy = false;
    if (stepKey !== getConfigKey(this._stepWithoutEnabled())) {
      // The step was edited while it ran, so the answer would be stale.
      this._runResult = {
        variant: "neutral",
        text: localize(`${prefix}config_changed`),
      };
      return;
    }
    this._ranKey = stepKey;
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
        .note {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-s, 0.875rem);
          color: var(--secondary-text-color);
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
