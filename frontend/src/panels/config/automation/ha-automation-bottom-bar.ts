import {
  mdiCheckCircleOutline,
  mdiClose,
  mdiContentSave,
  mdiFlask,
  mdiHelpCircleOutline,
  mdiMinusCircleOutline,
  mdiPlay,
  mdiTestTube,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type {
  Condition,
  ManualAutomationConfig,
} from "../../../data/automation";
import { describeCondition } from "../../../data/automation_i18n";
import type { Action } from "../../../data/script";
import { describeAction } from "../../../data/script_i18n";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type { AutomationCheckResult } from "./automation-check";
import { checkAutomation } from "./automation-check";
import type {
  DryRunReason,
  DryRunResult,
  DryRunStep,
  DryRunStepKind,
  DryRunVerdict,
} from "./automation-dry-run";
import { dryRunAutomation } from "./automation-dry-run";
import { isSaveDisabled } from "./run-helpers";

const PREFIX = "ui.panel.config.automation.editor.bottom_bar.";
const DRY = "ui.panel.config.automation.editor.dry_run.";
const CHECK = "ui.panel.config.automation.editor.status_bar.";

/** The keyboard is up when the visible height drops by more than this. */
const KEYBOARD_PX = 150;

const VERDICT_ICON: Record<DryRunVerdict, string> = {
  would_run: mdiCheckCircleOutline,
  would_skip: mdiMinusCircleOutline,
  cannot_tell: mdiHelpCircleOutline,
};

type VerdictKey = DryRunVerdict | "pass" | "fail" | "taken" | "not_taken";

const CONDITION_VERDICT: Record<DryRunVerdict, VerdictKey> = {
  would_run: "pass",
  would_skip: "fail",
  cannot_tell: "cannot_tell",
};

const BRANCH_VERDICT: Record<DryRunVerdict, VerdictKey> = {
  would_run: "taken",
  would_skip: "not_taken",
  cannot_tell: "cannot_tell",
};

const BRANCH_KINDS = new Set<DryRunStepKind>([
  "option",
  "default",
  "then",
  "else",
]);

declare global {
  interface HASSDomEvents {
    "automation-bar-save": undefined;
    "automation-bar-run": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-automation-bottom-bar": HaAutomationBottomBar;
  }
}

/**
 * The bar at the bottom of the automation editor, in every mode. It holds
 * Save, Check, Dry run and Run now. It saves and runs nothing itself: it fires
 * `automation-bar-save` and `automation-bar-run` and the editor does what it
 * always did. Check and Dry run only read; the dry run lists, step by step,
 * what the automation on screen would do against the live states.
 */
@customElement("ha-automation-bottom-bar")
export class HaAutomationBottomBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config?: ManualAutomationConfig;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @property({ type: Boolean }) public dirty = false;

  @property({ type: Boolean }) public saving = false;

  @property({ type: Boolean, attribute: "read-only" }) public readOnly = false;

  /** True while the on-screen keyboard is up. */
  @property({ type: Boolean, reflect: true }) public keyboard = false;

  @state() private _checking = false;

  @state() private _dryRunning = false;

  @state() private _checkResult?: AutomationCheckResult;

  @state() private _dryResult?: DryRunResult;

  private _resultKey?: string;

  public connectedCallback() {
    super.connectedCallback();
    window.visualViewport?.addEventListener("resize", this._handleViewport);
    this._handleViewport();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.visualViewport?.removeEventListener("resize", this._handleViewport);
  }

  private _handleViewport = () => {
    const viewport = window.visualViewport;
    if (viewport) {
      this.keyboard = window.innerHeight - viewport.height > KEYBOARD_PX;
    }
  };

  private _configKey() {
    const { triggers, conditions, actions } = this.config ?? {};
    return JSON.stringify([triggers, conditions, actions]);
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      changedProps.has("config") &&
      (this._checkResult || this._dryResult) &&
      this._resultKey !== this._configKey()
    ) {
      // A result must never describe a config that is no longer on screen.
      this._checkResult = undefined;
      this._dryResult = undefined;
      this._resultKey = undefined;
    }
  }

  protected render() {
    const t = this.hass.localize;
    const runDisabled = !this.stateObj || this.dirty;
    return html`
      ${this._renderDryRun()}
      <div class="bar" role="group" aria-label=${t(`${PREFIX}label`)}>
        <span class="status" role="status" aria-live="polite">
          ${this._statusText()}
        </span>
        <div class="buttons">
          <ha-button
            appearance="plain"
            .disabled=${runDisabled}
            title=${t(
              `ui.panel.config.automation.editor.status_bar.${this.dirty ? "run_dirty" : "run_now_hint"}`
            )}
            @click=${this._run}
          >
            <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
            ${t(`${CHECK}run_now`)}
          </ha-button>
          <ha-button
            appearance="plain"
            .disabled=${this._checking || !this.config}
            title=${t(`${CHECK}check_hint`)}
            @click=${this._check}
          >
            <ha-svg-icon slot="start" .path=${mdiFlask}></ha-svg-icon>
            ${t(`${CHECK}${this._checking ? "checking" : "check"}`)}
          </ha-button>
          <ha-button
            appearance="plain"
            .disabled=${this._dryRunning || !this.config}
            title=${t(`${DRY}hint`)}
            @click=${this._dryRun}
          >
            <ha-svg-icon slot="start" .path=${mdiTestTube}></ha-svg-icon>
            ${t(`${DRY}${this._dryRunning ? "running" : "button"}`)}
          </ha-button>
          <ha-button
            .disabled=${isSaveDisabled({
              readOnly: this.readOnly,
              saving: this.saving,
              dirty: this.dirty,
            })}
            .loading=${this.saving}
            @click=${this._save}
          >
            <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
            ${t("ui.common.save")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _statusText(): string {
    const t = this.hass.localize;
    const result = this._checkResult;
    if (result) {
      switch (result.status) {
        case "invalid":
          return t(`${CHECK}check_invalid`, {
            part: t(`${CHECK}check_part_${result.part}`),
            message: result.message,
          });
        case "error":
          return t(`${CHECK}check_error`, { message: result.message });
        default:
          return t(`${CHECK}check_ok_${result.conditions}`);
      }
    }
    if (this.readOnly) {
      return t(`${PREFIX}read_only`);
    }
    return t(
      `${PREFIX}${this.saving ? "saving" : this.dirty ? "unsaved" : "saved"}`
    );
  }

  private _renderDryRun() {
    const result = this._dryResult;
    if (!result) {
      return nothing;
    }
    const t = this.hass.localize;
    return html`
      <section class="dry" aria-label=${t(`${DRY}title`)}>
        <div class="dry-head">
          <strong>${t(`${DRY}title`)}</strong>
          <ha-icon-button
            .label=${t(`${DRY}close`)}
            .path=${mdiClose}
            @click=${this._closeDryRun}
          ></ha-icon-button>
        </div>
        <p class="note">${t(`${DRY}note`)}</p>
        <p class="summary" role="status">
          ${t(`${DRY}conditions_${result.conditions}`)}
          ${t(`${DRY}counts`, {
            run: result.counts.would_run,
            skip: result.counts.would_skip,
            unknown: result.counts.cannot_tell,
          })}
        </p>
        <ol class="steps">
          ${result.steps.map((step) => this._renderStep(step))}
        </ol>
      </section>
    `;
  }

  private _renderStep(step: DryRunStep) {
    const t = this.hass.localize;
    const verdictKey: VerdictKey =
      step.kind === "condition"
        ? CONDITION_VERDICT[step.verdict]
        : BRANCH_KINDS.has(step.kind)
          ? BRANCH_VERDICT[step.verdict]
          : step.verdict;
    return html`
      <li
        class="step ${step.verdict}"
        style=${styleMap({ "--dry-run-depth": String(step.depth) })}
      >
        <ha-svg-icon
          .path=${VERDICT_ICON[step.verdict]}
          aria-hidden="true"
        ></ha-svg-icon>
        <span class="step-text">
          <span class="verdict">${t(`${DRY}verdict_${verdictKey}`)}</span>
          <span class="title">${this._stepTitle(step)}</span>
          ${
            step.reason
              ? html`<span class="reason"
                  >${this._reasonText(step.reason, step.detail)}</span
                >`
              : nothing
          }
        </span>
      </li>
    `;
  }

  private _reasonText(reason: DryRunReason, detail?: string): string {
    return this.hass.localize(`${DRY}reason_${reason}`, {
      detail: detail ?? "",
    });
  }

  private _stepTitle(step: DryRunStep): string {
    const t = this.hass.localize;
    switch (step.kind) {
      case "option": {
        const alias = (step.item as { alias?: string } | undefined)?.alias;
        return t(`${DRY}step_option`, {
          number: (step.index ?? 0) + 1,
          alias: alias ?? "",
        });
      }
      case "default":
      case "then":
      case "else":
        return t(`${DRY}step_${step.kind}`);
      default:
    }
    if (!step.item) {
      return t(`${DRY}step_unknown`);
    }
    if (step.section === "condition" || step.kind === "condition") {
      return describeCondition(step.item as Condition, this.hass, []);
    }
    return describeAction(this.hass, [], step.item as Action);
  }

  private async _check() {
    if (this._checking || !this.config) {
      return;
    }
    const key = this._configKey();
    this._checking = true;
    this._checkResult = undefined;
    const result = await checkAutomation(this.hass, this.config);
    this._checking = false;
    if (key !== this._configKey()) {
      return;
    }
    this._resultKey = key;
    this._checkResult = result;
  }

  private async _dryRun() {
    if (this._dryRunning || !this.config) {
      return;
    }
    const key = this._configKey();
    this._dryRunning = true;
    this._dryResult = undefined;
    const result = await dryRunAutomation(this.hass, this.config);
    this._dryRunning = false;
    if (key !== this._configKey()) {
      return;
    }
    this._resultKey = key;
    this._dryResult = result;
  }

  private _closeDryRun() {
    this._dryResult = undefined;
  }

  private _save() {
    fireEvent(this, "automation-bar-save");
  }

  private _run() {
    fireEvent(this, "automation-bar-run");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
          position: sticky;
          /* With the tab strip docked to the bottom, the bar sits in the room
             the page keeps for the strip, so it rests on the page footer. */
          bottom: calc(-1 * var(--ha-page-tabs-bottom-inset, 0px));
          z-index: 2;
          box-sizing: border-box;
          /* The page already ends above the phone bottom navigation, so only
             the device's own inset is added here. The layout's inset counts
             the navigation, which would double its height again. */
          padding-bottom: var(
            --ha-automation-bottom-bar-padding-bottom,
            max(
              0px,
              var(--safe-area-inset-bottom, 0px) - var(
                  --ha-phone-bar-height,
                  0px
                ) - var(--ha-page-tabs-bottom-inset, 0px)
            )
          );
          background: var(
            --ha-color-surface-container,
            var(--card-background-color)
          );
          border-top: var(--ha-border-width-sm, 1px) solid var(--divider-color);
        }
        :host([keyboard]) {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          width: 100%;
          padding: var(--ha-space-3) var(--ha-space-4);
        }
        .status {
          flex: 1 1 200px;
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: var(--ha-font-size-s, 0.875rem);
          color: var(--secondary-text-color);
        }
        .buttons {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: var(--ha-space-2);
          margin-inline-start: auto;
        }
        ha-button {
          min-height: 44px;
          min-width: 44px;
        }
        ha-icon-button {
          min-width: 44px;
          min-height: 44px;
        }
        /* On a phone the bar is two short rows: the status beside Save, and
           the three other buttons under them. Every button keeps its 44 px
           touch target, and the bar stays near 120 px high. */
        @media (max-width: 480px) {
          .bar {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            align-items: center;
            gap: var(--ha-space-2);
            padding: var(--ha-space-2) var(--ha-space-3);
          }
          .status {
            grid-column: 1 / 3;
            grid-row: 1;
            flex: none;
          }
          .buttons {
            display: contents;
          }
          .buttons ha-button {
            min-width: 0;
            --wa-form-control-padding-inline: var(--ha-space-2);
          }
          .buttons ha-button[appearance="plain"] {
            grid-row: 2;
          }
          .buttons ha-button:not([appearance="plain"]) {
            grid-column: 3;
            grid-row: 1;
          }
        }
        .dry {
          box-sizing: border-box;
          max-height: 50dvh;
          overflow-y: auto;
          padding: var(--ha-space-3) var(--ha-space-4);
          border-bottom: var(--ha-border-width-sm, 1px) solid
            var(--divider-color);
        }
        .dry-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
        .note,
        .summary {
          margin: var(--ha-space-1) 0;
          font-size: var(--ha-font-size-s, 0.875rem);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .summary {
          color: var(--primary-text-color);
        }
        .steps {
          list-style: none;
          margin: var(--ha-space-2) 0 0;
          padding: 0;
        }
        .step {
          display: flex;
          gap: var(--ha-space-2);
          align-items: flex-start;
          padding: var(--ha-space-1) 0;
          padding-inline-start: calc(var(--dry-run-depth, 0) * 16px);
        }
        .step ha-svg-icon {
          flex: none;
          --mdc-icon-size: 20px;
        }
        .step.would_run ha-svg-icon {
          color: var(--success-color, var(--primary-color));
        }
        .step.cannot_tell ha-svg-icon {
          color: var(--warning-color, var(--primary-color));
        }
        .step.would_skip ha-svg-icon {
          color: var(--secondary-text-color);
        }
        .step-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .verdict {
          font-weight: var(--ha-font-weight-medium, 500);
          font-size: var(--ha-font-size-s, 0.875rem);
        }
        .reason {
          font-size: var(--ha-font-size-s, 0.875rem);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}
