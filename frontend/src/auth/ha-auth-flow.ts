/* eslint-disable lit/prefer-static-styles */
import {
  mdiChevronRight,
  mdiHomeAccount,
  mdiHomeAssistant,
  mdiShieldKey,
} from "@mdi/js";
import { genClientId } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { keyed } from "lit/directives/keyed";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-alert";
import "../components/ha-button";
import "../components/ha-checkbox";
import "../components/ha-svg-icon";
import { computeInitialHaFormData } from "../components/ha-form/compute-initial-ha-form-data";
import type { AuthProvider } from "../data/auth";
import {
  autocompleteLoginFields,
  createLoginFlow,
  deleteLoginFlow,
  redirectWithAuthCode,
  submitLoginFlow,
} from "../data/auth";
import type {
  DataEntryFlowStep,
  DataEntryFlowStepForm,
} from "../data/data_entry_flow";
import "./ha-auth-form";
import type { HaAuthForm } from "./ha-auth-form";
import { consumeLocalize } from "../common/decorators/consume-context-entry";

type State = "loading" | "error" | "step";

@customElement("ha-auth-flow")
export class HaAuthFlow extends LitElement {
  @property({ attribute: false }) public authProvider?: AuthProvider;

  @property({ attribute: false }) public clientId?: string;

  @property({ attribute: false }) public redirectUri?: string;

  @property({ attribute: false }) public oauth2State?: string;

  @property({ attribute: false }) public codeChallenge?: string;

  @property({ attribute: false }) public codeChallengeMethod?: string;

  @property({ attribute: false }) public responseType?: string;

  @property({ attribute: false }) public step?: DataEntryFlowStep;

  @property({ attribute: false }) public initStoreToken = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _storeToken = false;

  @state() private _state: State = "loading";

  @state() private _stepData?: Record<string, any>;

  @state() private _errorMessage?: string;

  @state() private _submitting = false;

  @query("ha-auth-form") private _form?: HaAuthForm;

  @query("ha-form") private _haForm?: HTMLElement;

  createRenderRoot() {
    return this;
  }

  willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (!this.hasUpdated && this.clientId === genClientId()) {
      // Preselect store token when logging in to own instance
      this._storeToken = this.initStoreToken;
    }

    if (!changedProps.has("step")) {
      return;
    }

    if (!this.step) {
      this._stepData = undefined;
      return;
    }

    this._state = "step";

    const oldStep = changedProps.get("step") as HaAuthFlow["step"];

    if (
      !oldStep ||
      this.step.flow_id !== oldStep.flow_id ||
      (this.step.type === "form" &&
        oldStep.type === "form" &&
        this.step.step_id !== oldStep.step_id)
    ) {
      this._stepData =
        this.step.type === "form"
          ? computeInitialHaFormData(this.step.data_schema)
          : undefined;
    }
  }

  protected render() {
    return html`
      <style>
        a.forgot-password {
          color: var(--primary-color);
          text-decoration: none;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .space-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        form {
          text-align: start;
          max-width: 336px;
          width: 100%;
        }
        ha-auth-flow .step-icon {
          display: grid;
          place-items: center;
          width: 56px;
          height: 56px;
          border-radius: var(--ha-border-radius-2xl);
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          opacity: 0.92;
          --mdc-icon-size: 28px;
        }
        ha-auth-flow h1 {
          margin-top: var(--ha-space-4);
          margin-bottom: var(--ha-space-2);
        }
        ha-auth-flow .step-description {
          margin: 0 0 var(--ha-space-2);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        ha-auth-form {
          display: block;
          margin-top: 16px;
        }
        ha-auth-flow .options {
          margin-top: var(--ha-space-2);
        }
        ha-auth-flow .actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--ha-space-4);
          margin-top: var(--ha-space-5);
        }
        ha-auth-flow .actions.end {
          justify-content: flex-end;
        }
        ha-auth-flow .user-list {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          margin: var(--ha-space-4) 0 var(--ha-space-2);
        }
        ha-auth-flow .user-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          width: 100%;
          min-height: 64px;
          padding: var(--ha-space-2) var(--ha-space-4);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        ha-auth-flow .user-row:hover:not([disabled]),
        ha-auth-flow .user-row:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: -2px;
        }
        ha-auth-flow .user-row[disabled] {
          opacity: 0.6;
          cursor: default;
        }
        ha-auth-flow .user-initial {
          display: grid;
          place-items: center;
          flex: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font-weight: var(--ha-font-weight-medium);
          opacity: 0.85;
        }
        ha-auth-flow .user-name {
          flex: 1;
          min-width: 0;
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        ha-auth-flow .user-row ha-svg-icon {
          color: var(--secondary-text-color);
        }
      </style>
      <form @submit=${this._handleSubmit}>${this._renderForm()}</form>
    `;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    if (this.clientId == null || this.redirectUri == null) {
      // eslint-disable-next-line no-console
      console.error(
        "clientId and redirectUri must not be null",
        this.clientId,
        this.redirectUri
      );
      this._state = "error";
      this._errorMessage = this._unknownError();
      return;
    }

    this.addEventListener("keypress", (ev) => {
      if (ev.key === "Enter") {
        this._handleSubmit(ev);
      }
    });
  }

  protected updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);
    if (changedProps.has("authProvider")) {
      this._providerChanged(this.authProvider);
    }

    if (!changedProps.has("step") || this.step?.type !== "form") {
      return;
    }

    // 100ms to give all the form elements time to initialize.
    setTimeout(() => {
      if (this._haForm) {
        (this._haForm as any).focus();
      }
    }, 100);
  }

  private _renderForm() {
    switch (this._state) {
      case "step":
        if (this.step == null) {
          return nothing;
        }

        return html`
          ${this._renderStep(this.step)} ${this._renderActions(this.step)}
        `;
      case "error":
        return html`
          <ha-alert alert-type="error">
            ${this._localize("ui.panel.page-authorize.form.error", {
              error: this._errorMessage,
            })}
          </ha-alert>
          <div class="actions end">
            <ha-button @click=${this._startOver}>
              ${this._localize("ui.panel.page-authorize.form.start_over")}
            </ha-button>
          </div>
        `;
      case "loading":
        return html`
          <ha-alert alert-type="info">
            ${this._localize("ui.panel.page-authorize.form.working")}
          </ha-alert>
        `;
      default:
        return nothing;
    }
  }

  private _isSecondStep(step: DataEntryFlowStepForm) {
    return ["select_mfa_module", "mfa"].includes(step.step_id);
  }

  // The trusted-network provider asks for one choice from a list of users.
  // That choice is drawn as a list of people instead of a drop-down.
  private _userChoices(step: DataEntryFlowStepForm) {
    if (
      step.handler[0] !== "trusted_networks" ||
      step.step_id !== "init" ||
      step.data_schema.length !== 1
    ) {
      return undefined;
    }
    const field = step.data_schema[0];
    if (
      field.name !== "user" ||
      !("type" in field) ||
      field.type !== "select"
    ) {
      return undefined;
    }
    return field.options;
  }

  private _stepIcon(step: DataEntryFlowStepForm) {
    if (this._isSecondStep(step)) {
      return mdiShieldKey;
    }
    return this._userChoices(step) ? mdiHomeAccount : mdiHomeAssistant;
  }

  private _renderForgotPassword() {
    return html`<a
      class="forgot-password"
      href="https://www.home-assistant.io/docs/locked_out/#forgot-password"
      target="_blank"
      rel="noreferrer noopener"
      >${this._localize("ui.panel.page-authorize.forgot_password")}</a
    >`;
  }

  private _renderActions(step: DataEntryFlowStep) {
    if (step.type !== "form") {
      return html`<div class="actions end">
        <ha-button @click=${this._handleSubmit} .loading=${this._submitting}>
          ${this._localize("ui.panel.page-authorize.form.start_over")}
        </ha-button>
      </div>`;
    }
    return html`<div class="actions">
      ${this._renderForgotPassword()}
      ${
        this._userChoices(step)
          ? nothing
          : html`<ha-button
              @click=${this._handleSubmit}
              .loading=${this._submitting}
            >
              ${this._localize(
                this._isSecondStep(step)
                  ? "ui.panel.page-authorize.form.verify"
                  : "ui.panel.page-authorize.form.next"
              )}
            </ha-button>`
      }
    </div>`;
  }

  private _renderUserChoices(options: readonly (readonly [string, string])[]) {
    return html`<div class="user-list" role="list">
      ${options.map(
        ([id, name]) => html`
          <div role="listitem">
            <button
              type="button"
              class="user-row"
              .disabled=${this._submitting}
              .userId=${id}
              @click=${this._handleUserClick}
            >
              <span class="user-initial" aria-hidden="true"
                >${(name || id).charAt(0).toUpperCase()}</span
              >
              <span class="user-name">${name}</span>
              <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
            </button>
          </div>
        `
      )}
    </div>`;
  }

  private _renderStep(step: DataEntryFlowStep) {
    switch (step.type) {
      case "abort":
        return html`
          ${this._localize("ui.panel.page-authorize.abort_intro")}:
          ${this._localize(
            `ui.panel.page-authorize.form.providers.${step.handler[0]}.abort.${step.reason}`
          )}
        `;
      case "form": {
        const userChoices = this._userChoices(step);
        const description = this._computeStepDescription(step);
        const secondStep = this._isSecondStep(step);
        return html`
          <div class="step-icon" aria-hidden="true">
            <ha-svg-icon .path=${this._stepIcon(step)}></ha-svg-icon>
          </div>
          <h1>
            ${
              !secondStep
                ? this._localize("ui.panel.page-authorize.welcome_home")
                : this._localize("ui.panel.page-authorize.just_checking")
            }
          </h1>
          ${
            description
              ? html`<p class="step-description">${description}</p>`
              : step.step_id === "init" && !userChoices
                ? html`<p class="step-description">
                    ${this._localize("ui.panel.page-authorize.sign_in_to", {
                      host: location.host,
                    })}
                  </p>`
                : nothing
          }
          ${
            userChoices
              ? this._renderUserChoices(userChoices)
              : keyed(
                  step.step_id,
                  html`<ha-auth-form
                    .data=${this._stepData!}
                    .schema=${autocompleteLoginFields(step.data_schema)}
                    .error=${step.errors ?? undefined}
                    .disabled=${this._submitting}
                    .computeLabel=${this._computeLabelCallback(step)}
                    .computeError=${this._computeErrorCallback(step)}
                    @value-changed=${this._stepDataChanged}
                  ></ha-auth-form>`
                )
          }
          ${
            this.clientId === genClientId() && !secondStep
              ? html`<div class="options">
                  <ha-checkbox
                    .checked=${this._storeToken}
                    @change=${this._storeTokenChanged}
                  >
                    ${this._localize("ui.panel.page-authorize.store_token")}
                  </ha-checkbox>
                </div>`
              : nothing
          }
        `;
      }
      default:
        return nothing;
    }
  }

  private _storeTokenChanged(e: CustomEvent<HTMLInputElement>) {
    this._storeToken = (e.currentTarget as HTMLInputElement).checked;
  }

  private async _providerChanged(newProvider?: AuthProvider) {
    if (this.step && this.step.type === "form") {
      deleteLoginFlow(this.step.flow_id).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Error delete obsoleted auth flow", err);
      });
    }

    if (newProvider == null) {
      // eslint-disable-next-line no-console
      console.error("No auth provider");
      this._state = "error";
      this._errorMessage = this._unknownError();
      return;
    }

    try {
      const response = await createLoginFlow(
        this.clientId,
        this.redirectUri,
        [newProvider.type, newProvider.id],
        this.codeChallenge,
        this.codeChallengeMethod,
        this.responseType
      );

      const data = await response.json();

      if (response.ok) {
        // allow auth provider bypass the login form
        if (data.type === "create_entry") {
          redirectWithAuthCode(
            this.redirectUri!,
            data.result,
            this.oauth2State,
            this._storeToken
          );
          return;
        }

        this.step = data;
        this._state = "step";
      } else {
        this._state = "error";
        this._errorMessage = data.message;
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Error starting auth flow", err);
      this._state = "error";
      this._errorMessage = this._unknownError();
    }
  }

  private _stepDataChanged(ev: CustomEvent) {
    this._stepData = ev.detail.value;
  }

  private _computeStepDescription(step: DataEntryFlowStepForm) {
    const resourceKey =
      `ui.panel.page-authorize.form.providers.${step.handler[0]}.step.${step.step_id}.description` as const;
    return this._localize(resourceKey, step.description_placeholders);
  }

  private _computeLabelCallback(step: DataEntryFlowStepForm) {
    // Returns a callback for ha-form to calculate labels per schema object
    return (schema) =>
      this._localize(
        `ui.panel.page-authorize.form.providers.${step.handler[0]}.step.${step.step_id}.data.${schema.name}`
      );
  }

  private _computeErrorCallback(step: DataEntryFlowStepForm) {
    // Returns a callback for ha-form to calculate error messages
    return (error) =>
      this._localize(
        `ui.panel.page-authorize.form.providers.${step.handler[0]}.error.${error}`
      );
  }

  private _unknownError() {
    return this._localize("ui.panel.page-authorize.form.unknown_error");
  }

  private _startOver() {
    this._providerChanged(this.authProvider);
  }

  private async _handleSubmit(ev: Event) {
    ev.preventDefault();
    if (this.step == null) {
      return;
    }
    if (this.step.type !== "form") {
      this._providerChanged(this.authProvider);
      return;
    }

    if (!this._form?.reportValidity()) {
      return;
    }

    await this._submitStep(this.step);
  }

  private async _handleUserClick(ev: Event) {
    if (this.step?.type !== "form") {
      return;
    }
    const userId = (ev.currentTarget as HTMLElement & { userId: string })
      .userId;
    this._stepData = { ...this._stepData, user: userId };
    await this._submitStep(this.step);
  }

  private async _submitStep(step: DataEntryFlowStepForm) {
    this._submitting = true;

    const postData = { ...this._stepData, client_id: this.clientId };

    try {
      const response = await submitLoginFlow(step.flow_id, postData);

      const newStep = await response.json();

      if (response.status === 403) {
        this._state = "error";
        this._errorMessage = newStep.message;
        return;
      }

      if (newStep.type === "create_entry") {
        redirectWithAuthCode(
          this.redirectUri!,
          newStep.result,
          this.oauth2State,
          this._storeToken
        );
        return;
      }
      this.step = newStep;
      this._state = "step";
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Error submitting step", err);
      this._state = "error";
      this._errorMessage = this._unknownError();
    } finally {
      this._submitting = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-auth-flow": HaAuthFlow;
  }
}
