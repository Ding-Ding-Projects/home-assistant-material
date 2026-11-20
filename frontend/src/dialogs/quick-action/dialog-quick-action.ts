import {
  mdiArrowDown,
  mdiArrowUp,
  mdiContentCopy,
  mdiDelete,
  mdiDotsVertical,
  mdiPlay,
  mdiPlus,
} from "@mdi/js";
import { dump } from "js-yaml";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeStateName } from "../../common/entity/compute_state_name";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import "../../components/entity/ha-entity-picker";
import "../../components/ha-action-result";
import type { HaActionResult } from "../../components/ha-action-result";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-dialog-footer";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-duration-input";
import type { HaDurationData } from "../../components/ha-duration-input";
import "../../components/ha-icon-button";
import "../../components/ha-select";
import type {
  HaSelectOption,
  HaSelectSelectEvent,
} from "../../components/ha-select";
import "../../components/ha-service-control";
import "../../components/ha-svg-icon";
import "../../components/ha-yaml-editor";
import type { HaYamlEditor } from "../../components/ha-yaml-editor";
import { computeServiceLabel } from "../../data/compute-service-info";
import type {
  QuickActionProblem,
  QuickServiceStep,
  QuickStep,
} from "../../data/quick-action";
import {
  delaySeconds,
  duplicateStep,
  firstStepFor,
  isRiskySequence,
  moveStep,
  RISKY_ACTION_DOMAINS,
  removeStep,
  secondsToParts,
  sequenceToSteps,
  stepDomain,
  stepEntityId,
  stepsAreComplete,
  stepsToSequence,
  validateSequence,
  waitStep,
} from "../../data/quick-action";
import { isRiskyEntity } from "../../data/quick-control";
import { showScriptEditor } from "../../data/script";
import type { Action } from "../../data/script";
import { callExecuteScript } from "../../data/service";
import type { HomeAssistant } from "../../types";
import { showConfirmationDialog } from "../generic/show-dialog-box";
import type { HassDialog } from "../make-dialog-manager";
import type { QuickActionDialogParams } from "./show-dialog-quick-action";

type QuickTab = "guided" | "yaml";

type RunState =
  | { phase: "idle" }
  | { phase: "running"; step?: number; total?: number; waiting?: boolean }
  | { phase: "done" }
  | { phase: "failed"; reason: string; step?: number };

interface QuickActionDraft {
  tab: QuickTab;
  steps: QuickStep[];
  yamlText: string;
}

/**
 * Drafts kept in memory only, by entity, so that an accidental close does not
 * lose the steps. Nothing is written to storage; a reload forgets them.
 */
const DRAFTS = new Map<string, QuickActionDraft>();

const PREFIX = "ui.dialogs.quick_action";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const errorText = (err: unknown): string => {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
};

@customElement("dialog-quick-action")
export class DialogQuickAction
  extends LitElement
  implements HassDialog<QuickActionDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: QuickActionDialogParams;

  @state() private _open = false;

  @state() private _tab: QuickTab = "guided";

  @state() private _steps: QuickStep[] = [];

  /** The sequence that Run sends; kept in step with both views. */
  @state() private _sequence: unknown[] = [];

  /** The guided view cannot show the YAML sequence, which is still valid. */
  @state() private _guidedUnsupported = false;

  @state() private _yamlError?: string;

  @state() private _problem?: { problem: QuickActionProblem; step?: number };

  @state() private _run: RunState = { phase: "idle" };

  @query("ha-yaml-editor") private _yamlEditor?: HaYamlEditor;

  @query("ha-action-result") private _result?: HaActionResult;

  @queryAll(".tab") private _tabButtons!: NodeListOf<HTMLElement>;

  private _lang = new LanguageModeController(this);

  private _yamlText = "";

  private _pushYaml = false;

  private get _key(): string {
    return this._params?.entityId ?? "";
  }

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  public async showDialog(params: QuickActionDialogParams): Promise<void> {
    this._params = params;
    this._run = { phase: "idle" };
    const draft = DRAFTS.get(params.entityId ?? "");
    if (draft) {
      this._setSteps(draft.steps);
      this._tab = this._isAdmin ? draft.tab : "guided";
      if (this._isAdmin && draft.yamlText !== this._yamlText) {
        // The text was edited by hand and may not fit the guided view: show
        // it in the YAML view, which reads it again.
        this._yamlText = draft.yamlText;
        this._tab = "yaml";
      }
    } else {
      const stateObj = params.entityId
        ? this.hass.states[params.entityId]
        : undefined;
      this._tab = "guided";
      this._setSteps([
        firstStepFor(params.entityId, stateObj?.state, this.hass.services),
      ]);
    }
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._saveDraft();
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _saveDraft() {
    if (!this._params) {
      return;
    }
    DRAFTS.set(this._key, {
      tab: this._tab,
      steps: this._steps,
      yamlText: this._yamlText,
    });
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  /** Guided steps changed: the sequence and the YAML text follow. */
  private _setSteps(steps: QuickStep[]) {
    this._steps = steps;
    this._sequence = stepsToSequence(steps);
    this._yamlText = this._sequence.length ? dump(this._sequence) : "";
    this._yamlError = undefined;
    this._guidedUnsupported = false;
    this._problem = undefined;
    this._pushYaml = true;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this._pushYaml && this._yamlEditor) {
      this._pushYaml = false;
      this._yamlEditor.setYaml(this._yamlText);
    }
  }

  private _yamlChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const editor = ev.currentTarget as HaYamlEditor;
    this._yamlText = editor.yaml;
    const { value, isValid, errorMsg } = ev.detail as {
      value: unknown;
      isValid: boolean;
      errorMsg?: string;
    };
    if (!isValid) {
      this._yamlError = errorMsg ?? this._t("yaml_invalid");
      this._problem = undefined;
      return;
    }
    this._yamlError = undefined;
    const result = validateSequence(value, this.hass.services);
    if (!result.ok) {
      this._problem = { problem: result.problem, step: result.step };
      this._sequence = [];
      this._guidedUnsupported = false;
      return;
    }
    this._problem = undefined;
    this._sequence = result.sequence;
    const steps = sequenceToSteps(result.sequence, this._params?.entityId);
    this._guidedUnsupported = steps === undefined;
    if (steps) {
      this._steps = steps;
    }
  }

  private _selectTab(ev: Event) {
    const tab = (ev.currentTarget as HTMLElement).dataset.tab as QuickTab;
    if (tab === this._tab) {
      return;
    }
    this._tab = tab;
    if (tab === "yaml") {
      this._pushYaml = true;
    }
  }

  private _tabKeydown(ev: KeyboardEvent) {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") {
      return;
    }
    ev.preventDefault();
    this._tab = this._tab === "guided" ? "yaml" : "guided";
    if (this._tab === "yaml") {
      this._pushYaml = true;
    }
    this.updateComplete.then(() => {
      Array.from(this._tabButtons)
        .find((button) => button.dataset.tab === this._tab)
        ?.focus();
    });
  }

  private _updateStep(index: number, step: QuickStep) {
    const steps = [...this._steps];
    steps[index] = step;
    this._setSteps(steps);
  }

  private _stepMenu(ev: HaDropdownSelectEvent) {
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    switch (ev.detail.item.value) {
      case "up":
        this._setSteps(moveStep(this._steps, index, -1));
        break;
      case "down":
        this._setSteps(moveStep(this._steps, index, 1));
        break;
      case "duplicate":
        this._setSteps(duplicateStep(this._steps, index));
        break;
      case "remove":
        this._setSteps(removeStep(this._steps, index));
        break;
    }
  }

  private _addStep(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    const entityId = this._params?.entityId;
    const step: QuickStep =
      value === "wait"
        ? waitStep()
        : value === "here" && entityId
          ? firstStepFor(
              entityId,
              this.hass.states[entityId]?.state,
              this.hass.services
            )
          : firstStepFor(undefined, undefined, this.hass.services);
    this._setSteps([...this._steps, step]);
  }

  private _actionPicked(ev: HaSelectSelectEvent) {
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    const step = this._steps[index] as QuickServiceStep;
    if (ev.detail.value === step.action) {
      return;
    }
    this._updateStep(index, { ...step, action: ev.detail.value, data: {} });
  }

  private _entityPicked(ev: CustomEvent<{ value?: string }>) {
    ev.stopPropagation();
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    const step = this._steps[index] as QuickServiceStep;
    const entityId = ev.detail.value;
    if (!entityId) {
      this._updateStep(index, { ...step, action: "", target: {}, data: {} });
      return;
    }
    const first = firstStepFor(
      entityId,
      this.hass.states[entityId]?.state,
      this.hass.services
    );
    this._updateStep(index, { ...first, kind: step.kind });
  }

  private _fieldsChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    const step = this._steps[index] as QuickServiceStep;
    const value = ev.detail.value as {
      target?: HassServiceTarget;
      data?: Record<string, unknown>;
    };
    this._updateStep(index, {
      ...step,
      target: value.target ?? {},
      data: value.data ?? {},
    });
  }

  private _waitChanged(ev: CustomEvent<{ value?: HaDurationData }>) {
    ev.stopPropagation();
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    const seconds = delaySeconds(ev.detail.value ?? {}) ?? 0;
    this._updateStep(index, waitStep(seconds));
  }

  private get _canRun(): boolean {
    if (this._run.phase === "running") {
      return false;
    }
    if (this._tab === "yaml" || this._guidedUnsupported) {
      return !this._yamlError && !this._problem && this._sequence.length > 0;
    }
    return stepsAreComplete(this._steps);
  }

  private _isRiskyId = (entityId: string): boolean => {
    const stateObj = this.hass.states[entityId];
    return stateObj
      ? isRiskyEntity(stateObj)
      : RISKY_ACTION_DOMAINS.has(computeDomain(entityId));
  };

  private async _runClicked() {
    if (!this._canRun) {
      return;
    }
    const sequence = this._sequence;
    if (isRiskySequence(sequence, this._isRiskyId)) {
      const confirmed = await showConfirmationDialog(this, {
        title: this._t("risky_title"),
        text: this._t("risky_text"),
        confirmText: this._t("run"),
        dismissText: this.hass.localize("ui.common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    const run = this._isAdmin
      ? this._runOnServer(sequence)
      : this._runFromPage(this._steps);
    if (this._result) {
      this._result.run(run);
    }
    try {
      await run;
      this._run = { phase: "done" };
      DRAFTS.delete(this._key);
    } catch (err) {
      const step = (err as { quickStep?: number }).quickStep;
      this._run = { phase: "failed", reason: errorText(err), step };
    }
  }

  private async _runOnServer(sequence: unknown[]) {
    this._run = { phase: "running" };
    await callExecuteScript(this.hass, sequence as Action[]);
  }

  /**
   * People who are not administrators cannot run a sequence on the server,
   * so each step is sent from this page as an ordinary action call, which the
   * server checks against their permissions. Waits happen in the page.
   */
  private async _runFromPage(steps: QuickStep[]) {
    const total = steps.length;
    for (let index = 0; index < total; index++) {
      const step = steps[index];
      this._run = {
        phase: "running",
        step: index + 1,
        total,
        waiting: step.kind === "wait",
      };
      try {
        if (step.kind === "wait") {
          // eslint-disable-next-line no-await-in-loop
          await sleep(step.seconds * 1000);
        } else {
          const [domain, service] = step.action.split(".", 2);
          // eslint-disable-next-line no-await-in-loop
          await this.hass.callService(
            domain,
            service,
            step.data,
            step.target,
            false
          );
        }
      } catch (err) {
        throw Object.assign(new Error(errorText(err)), {
          quickStep: index + 1,
        });
      }
    }
  }

  private _keepAsScript() {
    const sequence = this._sequence as Action[];
    DRAFTS.delete(this._key);
    this.closeDialog();
    showScriptEditor({ sequence });
  }

  private _actionOptions(step: QuickServiceStep): HaSelectOption[] {
    const domain = stepDomain(step);
    const services = domain ? (this.hass.services[domain] ?? {}) : {};
    const names = Object.keys(services).map((name) => `${domain}.${name}`);
    if (step.action && !names.includes(step.action)) {
      names.push(step.action);
    }
    return names
      .map((action) => ({
        value: action,
        label: computeServiceLabel(
          this.hass.localize,
          this.hass.services,
          action
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private _stepTitle(step: QuickStep, index: number): string {
    if (step.kind === "wait") {
      return this._t(index === 0 ? "step_wait" : "step_then_wait");
    }
    return this._t(index === 0 ? "step_do" : "step_then_do");
  }

  private _renderStep(step: QuickStep, index: number) {
    const number = index + 1;
    return html`<li class="step">
      <div class="step-head">
        <span class="num" aria-hidden="true">${number}</span>
        <h3 class="step-title">
          <span class="visually-hidden"
            >${this._t("step_number", { number })}:
          </span>
          ${this._stepTitle(step, index)}
        </h3>
        <ha-dropdown
          data-index=${index}
          placement="bottom-end"
          @wa-select=${this._stepMenu}
        >
          <ha-icon-button
            slot="trigger"
            .label=${this._t("step_menu", { number })}
            .path=${mdiDotsVertical}
          ></ha-icon-button>
          <ha-dropdown-item value="up" .disabled=${index === 0}>
            <ha-svg-icon slot="icon" .path=${mdiArrowUp}></ha-svg-icon>
            ${this._t("move_up")}
          </ha-dropdown-item>
          <ha-dropdown-item
            value="down"
            .disabled=${index === this._steps.length - 1}
          >
            <ha-svg-icon slot="icon" .path=${mdiArrowDown}></ha-svg-icon>
            ${this._t("move_down")}
          </ha-dropdown-item>
          <ha-dropdown-item value="duplicate">
            <ha-svg-icon slot="icon" .path=${mdiContentCopy}></ha-svg-icon>
            ${this._t("duplicate")}
          </ha-dropdown-item>
          <ha-dropdown-item value="remove" variant="danger">
            <ha-svg-icon slot="icon" .path=${mdiDelete}></ha-svg-icon>
            ${this._t("remove")}
          </ha-dropdown-item>
        </ha-dropdown>
      </div>
      ${
        step.kind === "wait"
          ? html`<ha-duration-input
              data-index=${index}
              .label=${this._t("wait_label")}
              .data=${secondsToParts(step.seconds)}
              enable-second
              @value-changed=${this._waitChanged}
            ></ha-duration-input>`
          : this._renderServiceStep(step, index)
      }
    </li>`;
  }

  private _renderServiceStep(step: QuickServiceStep, index: number) {
    const entityId = stepEntityId(step);
    const options = this._actionOptions(step);
    return html`
      ${
        step.kind === "other"
          ? html`<ha-entity-picker
              data-index=${index}
              .hass=${this.hass}
              .value=${entityId}
              .label=${this._t("entity_label")}
              @value-changed=${this._entityPicked}
            ></ha-entity-picker>`
          : nothing
      }
      ${
        !stepDomain(step)
          ? html`<p class="hint">${this._t("pick_entity_first")}</p>`
          : options.length === 0
            ? html`<p class="hint">${this._t("no_actions")}</p>`
            : html`<ha-select
                data-index=${index}
                .label=${this._t("action_label")}
                .options=${options}
                .value=${step.action}
                @selected=${this._actionPicked}
              ></ha-select>`
      }
      ${
        step.action
          ? html`<ha-service-control
              data-index=${index}
              .hass=${this.hass}
              .value=${{
                action: step.action,
                target: step.target,
                data: step.data,
              }}
              .stringBuilder=${this._isAdmin}
              hide-picker
              hide-description
              narrow
              @value-changed=${this._fieldsChanged}
            ></ha-service-control>`
          : nothing
      }
    `;
  }

  private _renderGuided() {
    if (this._yamlError) {
      return html`<ha-alert alert-type="warning"
        >${this._t("guided_yaml_error")}</ha-alert
      >`;
    }
    if (this._guidedUnsupported) {
      return html`<ha-alert alert-type="info"
        >${this._t("guided_unsupported")}</ha-alert
      >`;
    }
    const entityId = this._params?.entityId;
    return html`
      ${
        this._steps.length
          ? html`<ol class="steps">
              ${this._steps.map((step, index) => this._renderStep(step, index))}
            </ol>`
          : html`<p class="hint">${this._t("empty_steps")}</p>`
      }
      <ha-dropdown placement="bottom-start" @wa-select=${this._addStep}>
        <ha-button slot="trigger" appearance="plain">
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this._t("add_step")}
        </ha-button>
        ${
          entityId
            ? html`<ha-dropdown-item value="here">
                ${this._t("add_action_here", {
                  name: this._entityName(entityId),
                })}
              </ha-dropdown-item>`
            : nothing
        }
        <ha-dropdown-item value="other">
          ${this._t("add_action_other")}
        </ha-dropdown-item>
        <ha-dropdown-item value="wait">${this._t("add_wait")}</ha-dropdown-item>
      </ha-dropdown>
    `;
  }

  private _renderYaml() {
    return html`
      <ha-yaml-editor
        .label=${this._t("yaml_label")}
        .hass=${this.hass}
        in-dialog
        @value-changed=${this._yamlChanged}
      ></ha-yaml-editor>
      ${
        this._yamlError
          ? html`<ha-alert alert-type="error">${this._yamlError}</ha-alert>`
          : this._problem
            ? html`<ha-alert alert-type="error"
                >${this._t(`problem.${this._problem.problem}`, {
                  step: this._problem.step ?? 0,
                })}</ha-alert
              >`
            : nothing
      }
    `;
  }

  private _renderStatus() {
    const run = this._run;
    switch (run.phase) {
      case "running":
        return html`<p class="status" role="status">
          ${
            run.step
              ? this._t(run.waiting ? "waiting_step" : "running_step", {
                  number: run.step,
                  total: run.total ?? run.step,
                })
              : this._t("running")
          }
        </p>`;
      case "done":
        return html`<ha-alert alert-type="success" role="status"
          >${this._t("done")}</ha-alert
        >`;
      case "failed":
        return html`<ha-alert alert-type="error" role="alert"
          >${
            run.step
              ? this._t("failed_step", { number: run.step, reason: run.reason })
              : this._t("failed", { reason: run.reason })
          }</ha-alert
        >`;
      default:
        return nothing;
    }
  }

  private _entityName(entityId: string): string {
    const stateObj = this.hass.states[entityId];
    return stateObj ? computeStateName(stateObj) : entityId;
  }

  protected render() {
    if (!this._params || !this.hass) {
      return nothing;
    }
    const entityId = this._params.entityId;
    const subtitle = entityId
      ? this._t("subtitle_entity", { name: this._entityName(entityId) })
      : this._t("subtitle");
    const admin = this._isAdmin;
    const tab = admin ? this._tab : "guided";
    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        .headerTitle=${this._t("title")}
        .headerSubtitle=${subtitle}
        width="medium"
        @closed=${this._dialogClosed}
      >
        ${
          admin
            ? html`<div
                class="tabs"
                role="tablist"
                aria-label=${this._t("tabs_label")}
                @keydown=${this._tabKeydown}
              >
                ${(["guided", "yaml"] as QuickTab[]).map(
                  (name) =>
                    html`<button
                      type="button"
                      role="tab"
                      class="tab"
                      data-tab=${name}
                      aria-selected=${tab === name ? "true" : "false"}
                      tabindex=${tab === name ? "0" : "-1"}
                      @click=${this._selectTab}
                    >
                      ${this._t(`tab_${name}`)}
                    </button>`
                )}
              </div>`
            : nothing
        }
        <div class="body" role=${admin ? "tabpanel" : nothing}>
          ${tab === "yaml" ? this._renderYaml() : this._renderGuided()}
        </div>
        ${this._renderStatus()}
        <ha-dialog-footer slot="footer">
          <p class="note" slot="secondaryAction">
            ${this._t(admin ? "note_server" : "note_page")}
          </p>
          ${
            admin
              ? html`<ha-button
                  slot="secondaryAction"
                  appearance="outlined"
                  .disabled=${
                    !!this._yamlError ||
                    !!this._problem ||
                    this._sequence.length === 0
                  }
                  @click=${this._keepAsScript}
                >
                  ${this._t("keep_as_script")}
                </ha-button>`
              : nothing
          }
          <ha-button
            slot="primaryAction"
            .disabled=${!this._canRun}
            @click=${this._runClicked}
          >
            <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
            <ha-action-result>${this._t("run")}</ha-action-result>
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  static styles = css`
    .tabs {
      display: flex;
      gap: var(--ha-space-1);
      padding: var(--ha-space-1);
      margin-bottom: var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: var(
        --ha-color-surface-low,
        var(--secondary-background-color)
      );
    }
    .tab {
      flex: 1;
      min-width: 0;
      min-height: 48px;
      border: 0;
      border-radius: var(--ha-border-radius-pill);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: var(--ha-font-weight-bold);
      cursor: pointer;
    }
    .tab[aria-selected="true"] {
      background: var(
        --ha-color-fill-primary-loud-resting,
        var(--primary-color)
      );
      color: var(--ha-color-on-primary-loud, var(--text-primary-color));
    }
    .tab:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .steps {
      list-style: none;
      margin: 0 0 var(--ha-space-3);
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .step {
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-surface-low,
        var(--secondary-background-color)
      );
      padding: var(--ha-space-3);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      min-width: 0;
    }
    .step-head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .num {
      flex: none;
      width: 26px;
      height: 26px;
      border-radius: 13px;
      display: grid;
      place-items: center;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-bold);
      background: var(
        --ha-color-fill-primary-loud-resting,
        var(--primary-color)
      );
      color: var(--ha-color-on-primary-loud, var(--text-primary-color));
    }
    .step-title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-bold);
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .status {
      margin: var(--ha-space-3) 0 0;
      color: var(--secondary-text-color);
    }
    .note {
      margin: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      flex-basis: 100%;
    }
    ha-dialog-footer {
      flex-wrap: wrap;
    }
    ha-select,
    ha-entity-picker,
    ha-duration-input {
      display: block;
      width: 100%;
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
    "dialog-quick-action": DialogQuickAction;
  }
}
