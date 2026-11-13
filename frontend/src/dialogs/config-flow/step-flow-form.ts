import { mdiCheck, mdiEyeOffOutline } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { createRef, ref } from "lit/directives/ref";
import memoizeOne from "memoize-one";
import { consume } from "../../common/decorators/consume";
import { dynamicElement } from "../../common/dom/dynamic-element-directive";
import { fireEvent, type HASSDomEvent } from "../../common/dom/fire_event";
import { isNavigationClick } from "../../common/dom/is-navigation-click";
import "../../components/ha-alert";
import { computeInitialHaFormData } from "../../components/ha-form/compute-initial-ha-form-data";
import { getHiddenSchemaFields } from "../../components/ha-form/conditions";
import "../../components/ha-form/ha-form";
import type {
  HaFormSchema,
  HaFormSelector,
} from "../../components/ha-form/types";
import "../../components/ha-markdown";
import "../../components/ha-svg-icon";
import "./step-flow-description-note";
import "../../components/ha-spinner";
import { autocompleteLoginFields } from "../../data/auth";
import {
  dirtyStateContext,
  type DirtyStateContext,
} from "../../data/context/dirty-state";
import type { DataEntryFlowStepForm } from "../../data/data_entry_flow";
import { previewModule } from "../../data/preview";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../types";
import type { FlowConfig } from "./show-dialog-data-entry-flow";
import {
  MULTI_FIELD_THRESHOLD,
  buildStepChips,
  buildSummary,
  changedFieldNames,
  countConditionallyHidden,
  countSummaryFields,
  flattenFields,
  parseLiveErrorId,
  splitFormSegments,
  toLiveErrorId,
  validateTouchedFields,
} from "./step-flow-form-helpers";
import { configFlowContentStyles } from "./styles";

@customElement("step-flow-form")
class StepFlowForm extends LitElement {
  @property({ attribute: false }) public flowConfig!: FlowConfig;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean, attribute: "autofocus" }) public autoFocus = false;

  @property({ attribute: false }) public step!: DataEntryFlowStepForm;

  @property({ attribute: false }) public hass!: HomeAssistant;

  // The integration domain this flow belongs to. Unlike `step.handler`, this is
  // the domain even for options flows (where the handler is the config entry id).
  @property({ attribute: false }) public domain?: string;

  // How many steps the user has seen in this flow, set by the dialog. The
  // flow reports no total, so no total is ever shown.
  @property({ attribute: false }) public stepNumber?: number;

  @state() private _loading = false;

  // Fields the user has changed (or that a failed submit pointed at); live
  // validation messages only show for these.
  private _touched = new Set<string>();

  @state() private _liveErrors?: Record<string, string>;

  @state() private _stepData?: Record<string, any>;

  @state() private _previewErrors?: Record<string, string>;

  @state() private _submitErrors?: Record<string, string>;

  @state() private _errorMsg?: string;

  @consume({ context: dirtyStateContext, subscribe: true })
  @state()
  private _dirtyState?: DirtyStateContext<Record<string, unknown>, "form">;

  private _errors?: Record<string, string>;

  private _formRef = createRef<HTMLElementTagNameMap["ha-form"]>();

  static shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this._handleKeyDown);
  }

  private handleReadOnlyFields = memoizeOne((schema) => {
    function handleReadOnlyField(field: HaFormSchema) {
      return {
        ...field,
        ...(Object.values((field as HaFormSelector)?.selector ?? {})[0]
          ?.read_only
          ? { disabled: true }
          : {}),
      };
    }
    return schema?.map((field: HaFormSchema) =>
      field.type === "expandable" && field.schema
        ? {
            ...field,
            schema: field.schema.map((sectionField) =>
              handleReadOnlyField(sectionField)
            ),
          }
        : handleReadOnlyField(field)
    );
  });

  private _renderDescription() {
    const description = this.flowConfig.renderShowFormStepDescription(
      this.hass,
      this.step
    );
    return description
      ? html`<step-flow-description-note
          .hass=${this.hass}
          .domain=${this.domain ?? this.step.handler}
          >${description}</step-flow-description-note
        >`
      : nothing;
  }

  protected render(): TemplateResult {
    const step = this.step;
    const stepData = this._stepDataProcessed;

    return html`
      <div class="content" @click=${this._clickHandler}>
        ${this._renderStepIndicator()} ${this._renderDescription()}
        ${
          this._errorMsg
            ? html`<ha-alert alert-type="error">${this._errorMsg}</ha-alert>`
            : nothing
        }
        ${this._renderForm(step, stepData)} ${this._renderHiddenNote(stepData)}
        <div class="visually-hidden" role="status" aria-live="polite">
          ${this._liveAnnouncement()}
        </div>
        ${this._renderSummary(stepData)}
      </div>
      ${
        step.preview
          ? html`<div class="preview" @set-flow-errors=${this._setError}>
              <h3>
                ${this.hass.localize(
                  "ui.panel.config.integrations.config_flow.preview"
                )}:
              </h3>
              ${dynamicElement(`flow-preview-${previewModule(step.preview)}`, {
                hass: this.hass,
                domain: step.preview,
                flowType: this.flowConfig.flowType,
                handler: step.handler,
                stepId: step.step_id,
                flowId: step.flow_id,
                stepData,
              })}
            </div>`
          : nothing
      }
    `;
  }

  // The schema as the form draws it: read-only fields disabled and the login
  // fields marked for password managers.
  private _processedSchema = memoizeOne((schema: HaFormSchema[]) =>
    autocompleteLoginFields(this.handleReadOnlyFields(schema))
  );

  private _renderForm(
    step: DataEntryFlowStepForm,
    stepData: Record<string, any> | undefined
  ) {
    if (!step.data_schema.length && !this._errors) {
      return nothing;
    }
    const schema = this._processedSchema(step.data_schema);
    const hidden = getHiddenSchemaFields(schema, stepData ?? {});
    const segments = splitFormSegments(schema, hidden);
    // Without a row of short fields the form is drawn as one, as it always was.
    if (!segments.some((segment) => segment.kind === "columns")) {
      return this._renderFormPart(schema, stepData, true);
    }
    // A part only sees the fields that are shown, so a condition inside it is
    // judged without the values of fields that are hidden.
    const visibleData = stepData
      ? Object.fromEntries(
          Object.entries(stepData).filter(([name]) => !hidden.has(name))
        )
      : stepData;
    return segments.map((segment, index) =>
      segment.kind === "columns"
        ? html`<div class="columns">
            ${segment.fields.map((field, fieldIndex) =>
              this._renderFormPart(
                [field],
                visibleData,
                index === 0 && fieldIndex === 0
              )
            )}
          </div>`
        : this._renderFormPart(segment.fields, visibleData, index === 0)
    );
  }

  private _renderFormPart(
    schema: readonly HaFormSchema[],
    data: Record<string, any> | undefined,
    first: boolean
  ) {
    return html`<ha-form
      ${first ? ref(this._formRef) : nothing}
      ?autofocus=${first && this.autoFocus}
      .hass=${this.hass}
      .narrow=${this.narrow}
      .data=${data}
      .disabled=${this._loading}
      @value-changed=${this._stepDataChanged}
      .schema=${schema}
      .error=${this._errors}
      .computeLabel=${this._labelCallback}
      .computeHelper=${this._helperCallback}
      .computeError=${this._errorCallback}
      .localizeValue=${this._localizeValueCallback}
      .context=${{ handler: this.step.handler, domain: this.domain }}
    ></ha-form>`;
  }

  // Tells that some fields are not shown because of what was chosen, so a
  // missing field is never a mystery.
  private _renderHiddenNote(stepData: Record<string, any> | undefined) {
    const schema = this.step.data_schema ?? [];
    const count = countConditionallyHidden(
      schema,
      getHiddenSchemaFields(schema, stepData ?? {})
    );
    if (!count) {
      return nothing;
    }
    return html`<p class="hidden-note" role="status">
      <ha-svg-icon .path=${mdiEyeOffOutline}></ha-svg-icon>
      ${this.hass.localize(
        "ui.panel.config.integrations.config_flow.fields_hidden",
        { count }
      )}
    </p>`;
  }

  private _renderStepIndicator() {
    const chips = buildStepChips(this.stepNumber, this.step.last_step);
    if (!chips.length) {
      return nothing;
    }
    const localize = this.hass.localize;
    const base = "ui.panel.config.integrations.config_flow";
    return html`<ol
      class="step-chips"
      aria-label=${localize(`${base}.steps_label`)}
    >
      ${chips.map((chip) => {
        switch (chip.kind) {
          case "earlier":
            return html`<li class="chip earlier" aria-hidden="true">…</li>`;
          case "done":
            return html`<li class="chip done">
              <span class="badge"
                ><ha-svg-icon .path=${mdiCheck}></ha-svg-icon
              ></span>
              <span
                >${localize(`${base}.step_done`, { number: chip.number })}</span
              >
            </li>`;
          case "current":
            return html`<li class="chip current" aria-current="step">
              <span class="badge">${chip.number}</span>
              <span
                >${localize(`${base}.step_number`, {
                  number: chip.number,
                })}</span
              >
            </li>`;
          default:
            return html`<li class="chip ${chip.kind}">
              ${localize(
                `${base}.${chip.kind === "final" ? "step_final" : "step_more_follow"}`
              )}
            </li>`;
        }
      })}
    </ol>`;
  }

  // Short polite announcement of how many fields need attention. The
  // messages beside the fields carry the detail; no values are ever included.
  private _liveAnnouncement(): string {
    const count = this._liveErrors ? Object.keys(this._liveErrors).length : 0;
    return count
      ? this.hass.localize(
          "ui.panel.config.integrations.config_flow.fields_need_attention",
          { count }
        )
      : "";
  }

  private _renderSummary(stepData: Record<string, any> | undefined) {
    const schema = this.step.data_schema;
    const hidden = getHiddenSchemaFields(schema ?? [], stepData ?? {});
    if (countSummaryFields(schema, hidden) < MULTI_FIELD_THRESHOLD) {
      return nothing;
    }
    const entries = buildSummary(schema, stepData, hidden);
    if (!entries.length) {
      return nothing;
    }
    const localize = this.hass.localize;
    const fields = flattenFields(schema);
    return html`<details class="summary">
      <summary>
        ${localize("ui.panel.config.integrations.config_flow.summary_title")}
        (${entries.length})
      </summary>
      <dl>
        ${entries.map((entry) => {
          const field = fields.find((item) => item.name === entry.name)!;
          const label = this._labelCallback(field, undefined, {});
          return html`<div class="summary-row">
            <dt>${label}</dt>
            <dd>
              ${
                entry.kind === "secret"
                  ? localize(
                      "ui.panel.config.integrations.config_flow.summary_secret_set"
                    )
                  : entry.kind === "entries"
                    ? localize(
                        "ui.panel.config.integrations.config_flow.summary_entries",
                        { count: entry.count ?? 0 }
                      )
                    : entry.kind === "boolean"
                      ? localize(`ui.common.${entry.bool ? "yes" : "no"}`)
                      : entry.text
              }
            </dd>
          </div>`;
        })}
      </dl>
    </details>`;
  }

  private _setError(ev: HASSDomEvent<DataEntryFlowStepForm["errors"]>) {
    this._previewErrors = ev.detail ?? undefined;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.addEventListener("keydown", this._handleKeyDown);
    this._dirtyState?.setState(this._stepDataProcessed, "form");
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has("_loading")) {
      fireEvent(this, "flow-step-footer-state-changed", {
        loading: this._loading,
      });
    }
  }

  public override focus(_options?: FocusOptions): void {
    this._formRef.value?.focus();
  }

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (changedProps.has("step") && this.step?.preview) {
      import(`./previews/flow-preview-${previewModule(this.step.preview)}`);
    }

    if (
      changedProps.has("step") ||
      changedProps.has("_previewErrors") ||
      changedProps.has("_submitErrors") ||
      changedProps.has("_liveErrors")
    ) {
      // Live messages first, so the server's own errors win for a field.
      this._errors =
        this.step.errors ||
        this._previewErrors ||
        this._submitErrors ||
        this._liveErrors
          ? {
              ...this._liveErrors,
              ...this.step.errors,
              ...this._previewErrors,
              ...this._submitErrors,
            }
          : undefined;
    }
  }

  private _clickHandler(ev: MouseEvent) {
    if (isNavigationClick(ev, false)) {
      fireEvent(this, "flow-update", {
        step: undefined,
      });
    }
  }

  private _handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter") {
      // Enter on the summary toggle opens or closes it, it does not submit.
      const origin = ev.composedPath()[0] as HTMLElement | undefined;
      if (origin?.localName === "summary") {
        return;
      }
      this._submitStep();
    }
  };

  // Recompute the live validation messages for the touched fields.
  private _updateLiveErrors(data: Record<string, any> | undefined) {
    const hidden = getHiddenSchemaFields(
      this.step.data_schema ?? [],
      data ?? {}
    );
    const issues = validateTouchedFields(
      this.step.data_schema,
      data,
      this._touched,
      hidden
    );
    const names = Object.keys(issues);
    this._liveErrors = names.length
      ? Object.fromEntries(
          names.map((name) => [name, toLiveErrorId(issues[name])])
        )
      : undefined;
  }

  private get _stepDataProcessed() {
    if (this._stepData !== undefined) {
      return this._stepData;
    }

    this._stepData = computeInitialHaFormData(this.step.data_schema);
    return this._stepData;
  }

  private async _submitStep(): Promise<void> {
    const stepData = this._stepData || {};

    const checkAllRequiredFields = (
      schema: readonly HaFormSchema[],
      data: Record<string, any>
    ) => {
      const hidden = getHiddenSchemaFields(schema, data);
      return schema.every(
        (field) =>
          hidden.has(field.name) ||
          ((!field.required || !["", undefined].includes(data[field.name])) &&
            (field.type !== "expandable" ||
              (!field.required && data[field.name] === undefined) ||
              checkAllRequiredFields(field.schema, data[field.name])))
      );
    };

    const allRequiredInfoFilledIn =
      stepData === undefined
        ? // If no data filled in, just check that any field is required
          this.step.data_schema.find((field) => field.required) === undefined
        : // If data is filled in, make sure all required fields are
          checkAllRequiredFields(this.step.data_schema, stepData);

    if (!allRequiredInfoFilledIn) {
      // Point at the fields that are missing, beside the fields themselves.
      flattenFields(this.step.data_schema).forEach((field) =>
        this._touched.add(field.name)
      );
      this._updateLiveErrors(stepData);
      this._errorMsg = this.hass.localize(
        "ui.panel.config.integrations.config_flow.not_all_required_fields"
      );
      return;
    }

    this._loading = true;
    this._errorMsg = undefined;
    this._submitErrors = undefined;

    const flowId = this.step.flow_id;

    const hiddenFields = getHiddenSchemaFields(this.step.data_schema, stepData);

    const toSendData: Record<string, unknown> = {};
    Object.keys(stepData).forEach((key) => {
      if (hiddenFields.has(key)) {
        // Hidden fields are not part of the submitted config
        return;
      }
      const value = stepData[key];
      const isEmpty = [undefined, ""].includes(value);
      const field = this.step.data_schema?.find((f) => f.name === key);
      const selector = (field as HaFormSelector)?.selector ?? {};
      const read_only = (
        Object.values(selector)[0] as { read_only?: boolean } | null | undefined
      )?.read_only;
      if (!isEmpty && !read_only) {
        toSendData[key] = value;
      }
    });

    try {
      const step = await this.flowConfig.handleFlowStep(
        this.hass,
        this.step.flow_id,
        toSendData
      );

      // make sure we're still showing the same step as when we
      // fired off request.
      if (!this.step || flowId !== this.step.flow_id) {
        return;
      }

      this._previewErrors = undefined;
      fireEvent(this, "flow-update", {
        step,
      });
    } catch (err: any) {
      if (err && err.body) {
        if (err.body.message) {
          this._errorMsg = err.body.message;
        }
        if (err.body.errors) {
          this._submitErrors = err.body.errors;
        }
        if (!err.body.message && !err.body.errors) {
          this._errorMsg = "Unknown error occurred";
        }
      } else {
        this._errorMsg = "Unknown error occurred";
      }
    } finally {
      this._loading = false;
    }
  }

  public submit(): Promise<void> {
    return this._submitStep();
  }

  private _stepDataChanged(
    ev: ValueChangedEvent<Record<string, unknown>>
  ): void {
    changedFieldNames(this._stepData, ev.detail.value).forEach((name) =>
      this._touched.add(name)
    );
    // A part of the form only reports the fields it shows, so keep the rest.
    this._stepData = { ...this._stepData, ...ev.detail.value };
    this._updateLiveErrors(this._stepData);
    this._dirtyState?.setState(this._stepData, "form");
  }

  private _labelCallback = (field: HaFormSchema, _data, options): string =>
    this.flowConfig.renderShowFormStepFieldLabel(
      this.hass,
      this.step,
      field,
      options
    );

  private _helperCallback = (
    field: HaFormSchema,
    options
  ): string | TemplateResult =>
    this.flowConfig.renderShowFormStepFieldHelper(
      this.hass,
      this.step,
      field,
      options
    );

  private _errorCallback = (error: string) => {
    const live = parseLiveErrorId(error);
    if (live) {
      return this.hass.localize(
        `ui.panel.config.integrations.config_flow.field_${live.code}` as "ui.panel.config.integrations.config_flow.field_required",
        { min: live.min, max: live.max }
      );
    }
    return this.flowConfig.renderShowFormStepFieldError(
      this.hass,
      this.step,
      error
    );
  };

  private _localizeValueCallback = (
    key: string,
    values?: Record<string, string>
  ) =>
    this.flowConfig.renderShowFormStepFieldLocalizeValue(
      this.hass,
      this.step,
      key,
      values
    );

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      configFlowContentStyles,
      css`
        .error {
          color: red;
        }

        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }

        .step-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin: var(--ha-space-2) 0 0;
          padding: 0;
          list-style: none;
          font-size: var(--ha-font-size-s);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 32px;
          padding: 0 var(--ha-space-3);
          border-radius: 999px;
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
          color: var(--secondary-text-color);
        }
        .chip .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-semibold);
          background: var(--card-background-color);
          --mdc-icon-size: 14px;
        }
        .chip.done {
          background: var(
            --ha-color-success-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-success-container,
            var(--primary-text-color)
          );
        }
        .chip.current {
          background: var(
            --ha-color-primary-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-primary-container,
            var(--primary-text-color)
          );
          font-weight: var(--ha-font-weight-medium);
        }
        .chip.current .badge {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }

        .columns {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 220px), 1fr)
          );
          column-gap: var(--ha-space-4);
        }
        .hidden-note {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          margin: var(--ha-space-4) 0 0;
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          background: var(
            --ha-color-primary-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-primary-container,
            var(--primary-text-color)
          );
          font-size: var(--ha-font-size-s);
        }

        .summary {
          margin-top: var(--ha-space-4);
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
        }
        .summary summary {
          display: flex;
          align-items: center;
          min-height: 44px;
          padding: 0 var(--ha-space-4);
          cursor: pointer;
          font-weight: var(--ha-font-weight-medium);
          border-radius: var(--ha-border-radius-xl);
        }
        .summary summary:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: -2px;
        }
        .summary dl {
          margin: 0;
          padding: 0 var(--ha-space-4) var(--ha-space-3);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .summary-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: var(--ha-space-1) var(--ha-space-4);
        }
        .summary dt {
          color: var(--secondary-text-color);
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .summary dd {
          margin: 0;
          min-width: 0;
          overflow-wrap: anywhere;
          font-weight: var(--ha-font-weight-medium);
        }

        ha-alert,
        ha-form {
          margin-top: var(--ha-space-6);
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HASSDomEvents {
    "set-flow-errors": { errors: DataEntryFlowStepForm["errors"] };
  }
  interface HTMLElementTagNameMap {
    "step-flow-form": StepFlowForm;
  }
}
