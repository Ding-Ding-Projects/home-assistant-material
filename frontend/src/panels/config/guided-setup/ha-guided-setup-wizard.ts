import { mdiOpenInNew } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-form/ha-form";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-yaml-editor";
import type {
  GuidedSetupApply,
  GuidedSetupEntry,
  GuidedSetupError,
  GuidedSetupField,
  GuidedSetupForm,
  GuidedSetupIntegration,
} from "../../../data/guided_setup";
import {
  fetchGuidedSetupForm,
  pruneGuidedSetupData,
  saveGuidedSetup,
  validateGuidedSetup,
} from "../../../data/guided_setup";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";

type Step = "about" | "options" | "review" | "done";

const STEPS: Step[] = ["about", "options", "review", "done"];

declare global {
  interface HASSDomEvents {
    "guided-setup-closed": undefined;
    "guided-setup-changed": undefined;
  }
}

@customElement("ha-guided-setup-wizard")
export class HaGuidedSetupWizard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public integration!: GuidedSetupIntegration;

  /** Set when an entry made here is edited. */
  @property({ attribute: false }) public entry?: GuidedSetupEntry;

  @state() private _step: Step = "about";

  @state() private _entityDomain: string | null = null;

  @state() private _form?: GuidedSetupForm;

  @state() private _data: Record<string, any> = {};

  @state() private _errors: GuidedSetupError[] = [];

  @state() private _yaml = "";

  @state() private _busy = false;

  @state() private _loadError?: string;

  @state() private _yamlValid = true;

  @state() private _apply?: GuidedSetupApply;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("integration") || changed.has("entry")) {
      this._reset();
    }
  }

  private _reset(): void {
    this._form = undefined;
    this._errors = [];
    this._loadError = undefined;
    this._apply = undefined;
    this._yamlValid = true;
    if (this.entry) {
      this._entityDomain = this.entry.entity_domain;
      this._data = { ...this.entry.data };
      this._step = "options";
      this._loadForm();
      return;
    }
    this._data = {};
    this._step = "about";
    const targets = this._targets();
    this._entityDomain = targets.length === 1 ? targets[0] : null;
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.guided_setup.${key}` as any,
      values
    );
  }

  /** The things that can be added: an entity domain, or null for settings. */
  private _targets(): (string | null)[] {
    const targets: (string | null)[] = [...this.integration.entity_domains];
    if (this.integration.has_domain_schema) {
      targets.push(null);
    }
    return targets;
  }

  private _targetLabel(target: string | null): string {
    return target === null
      ? this._l("target_domain")
      : this._l("target_platform", {
          domain: this.hass.localize(`component.${target}.title`) || target,
        });
  }

  private async _loadForm(): Promise<void> {
    this._busy = true;
    this._loadError = undefined;
    try {
      this._form = await fetchGuidedSetupForm(this.hass, {
        domain: this.integration.domain,
        entity_domain: this._entityDomain,
      });
    } catch (err: any) {
      this._form = undefined;
      this._loadError = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private _humanize(name: string): string {
    const text = name.replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private _computeLabel = (schema: GuidedSetupField): string =>
    schema.label ?? this._humanize(schema.name);

  private _computeHelper = (schema: GuidedSetupField): string | undefined => {
    const parts: string[] = [
      this._l(schema.required ? "required" : "optional"),
    ];
    if (schema.default !== undefined && schema.default !== null) {
      parts.push(
        this._l("default", {
          value:
            typeof schema.default === "object"
              ? JSON.stringify(schema.default)
              : String(schema.default),
        })
      );
    }
    return parts.join(". ");
  };

  private _computeError = (_schema: unknown, error: string): string => error;

  private _fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const error of this._errors) {
      const name = error.path[0];
      if (name && !result[name]) {
        result[name] = error.message;
      }
    }
    return result;
  }

  private _dataChanged(ev: ValueChangedEvent<Record<string, any>>): void {
    this._data = ev.detail.value;
    this._errors = [];
  }

  private _yamlChanged(
    ev: ValueChangedEvent<Record<string, any>> & {
      detail: { isValid?: boolean };
    }
  ): void {
    ev.stopPropagation();
    this._yamlValid = ev.detail.isValid !== false;
    this._data =
      ev.detail.value && typeof ev.detail.value === "object"
        ? ev.detail.value
        : {};
    this._errors = [];
  }

  private _pickTarget(ev: Event): void {
    const value = (ev.currentTarget as HTMLElement).dataset.target ?? "";
    this._entityDomain = value === "" ? null : value;
  }

  private async _next(): Promise<void> {
    if (this._step === "about") {
      this._step = "options";
      await this._loadForm();
      return;
    }
    if (this._step === "options") {
      await this._review();
    }
  }

  private _back(): void {
    this._errors = [];
    if (this._step === "review") {
      this._step = "options";
    } else if (this._step === "options" && !this.entry) {
      this._step = "about";
    } else {
      this._close();
    }
  }

  private async _review(): Promise<void> {
    this._busy = true;
    try {
      const data = pruneGuidedSetupData(this._data);
      const result = await validateGuidedSetup(
        this.hass,
        {
          domain: this.integration.domain,
          entity_domain: this._entityDomain,
        },
        data
      );
      this._errors = result.errors;
      this._yaml = result.yaml;
      if (result.valid) {
        this._step = "review";
      }
    } catch (err: any) {
      this._errors = [{ path: [], message: err?.message ?? String(err) }];
    } finally {
      this._busy = false;
    }
  }

  private async _save(): Promise<void> {
    this._busy = true;
    try {
      const result = await saveGuidedSetup(
        this.hass,
        {
          domain: this.integration.domain,
          entity_domain: this._entityDomain,
        },
        pruneGuidedSetupData(this._data),
        this.entry?.id
      );
      if (!result.saved) {
        this._errors = result.errors;
        this._step = "options";
        return;
      }
      this._apply = result.entry?.apply;
      this._step = "done";
      fireEvent(this, "guided-setup-changed");
    } catch (err: any) {
      this._errors = [{ path: [], message: err?.message ?? String(err) }];
      this._step = "options";
    } finally {
      this._busy = false;
    }
  }

  private _close(): void {
    fireEvent(this, "guided-setup-closed");
  }

  protected render(): TemplateResult {
    const index = STEPS.indexOf(this._step);
    const title = this.entry
      ? this._l("edit_title", { name: this.integration.name })
      : this.integration.name;
    return html`
      <div class="wizard">
        <h2>${title}</h2>
        <ol
          class="steps"
          aria-label=${this._l("step_of", {
            current: index + 1,
            total: STEPS.length,
          })}
        >
          ${STEPS.map(
            (step, position) =>
              html`<li
                class=${classMap({
                  current: step === this._step,
                  done: position < index,
                })}
                aria-current=${step === this._step ? "step" : "false"}
              >
                <span class="number">${position + 1}</span>
                <span class="name">${this._l(`step_${step}`)}</span>
              </li>`
          )}
        </ol>
        ${this._step === "about" ? this._renderAbout() : nothing}
        ${this._step === "options" ? this._renderOptions() : nothing}
        ${this._step === "review" ? this._renderReview() : nothing}
        ${this._step === "done" ? this._renderDone() : nothing}
      </div>
    `;
  }

  private _renderAbout(): TemplateResult {
    const targets = this._targets();
    return html`
      <section>
        <h3>${this._l("about_title")}</h3>
        <p>${this._l("about_text", { name: this.integration.name })}</p>
        <ha-button
          appearance="plain"
          href=${this.integration.documentation}
          target="_blank"
          rel="noreferrer noopener"
        >
          <ha-svg-icon slot="end" .path=${mdiOpenInNew}></ha-svg-icon>
          ${this._l("documentation")}
        </ha-button>
        <h3>${this._l("before_title")}</h3>
        <p>${this._l("before_text")}</p>
        ${
          targets.length > 1
            ? html`<h3 id="target-label">${this._l("choose_target")}</h3>
                <div role="radiogroup" aria-labelledby="target-label">
                  ${targets.map(
                    (target) =>
                      html`<button
                        type="button"
                        role="radio"
                        class=${classMap({
                          choice: true,
                          selected: this._entityDomain === target,
                        })}
                        aria-checked=${
                          this._entityDomain === target ? "true" : "false"
                        }
                        data-target=${target ?? ""}
                        @click=${this._pickTarget}
                      >
                        ${this._targetLabel(target)}
                      </button>`
                  )}
                </div>`
            : nothing
        }
        <p class="note">${this._l("managed_note")}</p>
        ${this._renderActions(false)}
      </section>
    `;
  }

  private _renderOptions(): TemplateResult {
    if (this._busy && !this._form) {
      return html`<div class="center"><ha-spinner></ha-spinner></div>`;
    }
    if (this._loadError) {
      return html`<ha-alert alert-type="error">
          ${this._l("load_error", { error: this._loadError })}
        </ha-alert>
        ${this._renderActions(true)}`;
    }
    const form = this._form;
    if (!form) {
      return html`${nothing}`;
    }
    return html`
      <section>
        ${this._renderErrors()}
        ${
          form.serializable
            ? html`<ha-form
                .hass=${this.hass}
                .narrow=${this.narrow}
                .data=${this._data}
                .schema=${form.fields}
                .error=${this._fieldErrors()}
                .computeLabel=${this._computeLabel}
                .computeHelper=${this._computeHelper}
                .computeError=${this._computeError}
                @value-changed=${this._dataChanged}
              ></ha-form>`
            : html`<h3>${this._l("free_form_title")}</h3>
                <p>
                  ${this._l("free_form_reason", { reason: form.reason ?? "" })}
                </p>
                <ha-yaml-editor
                  .hass=${this.hass}
                  .label=${this._l("free_form_title")}
                  .defaultValue=${this._data}
                  @value-changed=${this._yamlChanged}
                ></ha-yaml-editor>
                ${
                  this._yamlValid
                    ? nothing
                    : html`<ha-alert alert-type="error"
                        >${this._l("yaml_invalid")}</ha-alert
                      >`
                }`
        }
        <p class="note">${this._l("plain_text_note")}</p>
        ${this._renderActions(form.serializable ? false : !this._yamlValid)}
      </section>
    `;
  }

  private _renderErrors(): TemplateResult | typeof nothing {
    if (!this._errors.length) {
      return nothing;
    }
    return html`<ha-alert alert-type="error" .title=${this._l("errors_title")}>
      <ul>
        ${this._errors.map(
          (error) =>
            html`<li>
              ${
                error.path.length
                  ? this._l("error_line", {
                      field: error.path.join("."),
                      message: error.message,
                    })
                  : error.message
              }
            </li>`
        )}
      </ul>
    </ha-alert>`;
  }

  private _renderReview(): TemplateResult {
    return html`
      <section>
        <h3>${this._l("review_title")}</h3>
        <p>${this._l("review_text")}</p>
        <pre class="yaml" tabindex="0">${this._yaml}</pre>
        <p class="note">${this._l("plain_text_note")}</p>
        <div class="actions">
          <ha-button appearance="plain" @click=${this._back}>
            ${this._l("back")}
          </ha-button>
          <ha-button @click=${this._save} .disabled=${this._busy}>
            ${this._l("save")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderDone(): TemplateResult {
    const apply = this._apply;
    return html`
      <section>
        <ha-alert alert-type="success" .title=${this._l("saved_title")}>
          ${this._l("saved_text")}
        </ha-alert>
        ${
          apply
            ? html`<p role="status">
                ${
                  apply.mode === "reload"
                    ? this._l("apply_reload", { service: apply.service ?? "" })
                    : this._l("apply_restart")
                }
              </p>`
            : nothing
        }
        <div class="actions">
          <ha-button @click=${this._close}>
            ${this._l("back_to_list")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderActions(nextDisabled: boolean): TemplateResult {
    return html`<div class="actions">
      <ha-button appearance="plain" @click=${this._back}>
        ${
          this._step === "about" || this.entry
            ? this._l("cancel")
            : this._l("back")
        }
      </ha-button>
      <ha-button
        @click=${this._next}
        .disabled=${nextDisabled || this._busy || this._noTargetChosen()}
      >
        ${this._l("next")}
      </ha-button>
    </div>`;
  }

  /** The about step needs a choice when there is more than one target. */
  private _noTargetChosen(): boolean {
    return (
      this._step === "about" &&
      this._targets().length > 1 &&
      !this._targets().includes(this._entityDomain)
    );
  }

  static styles = [
    haStyle,
    css`
      .wizard {
        max-width: 720px;
        margin: 0 auto;
        padding: var(--ha-space-4);
        box-sizing: border-box;
      }
      h2 {
        margin: 0 0 var(--ha-space-3);
        overflow-wrap: anywhere;
      }
      h3 {
        margin: var(--ha-space-4) 0 var(--ha-space-1);
      }
      .steps {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        list-style: none;
        margin: 0 0 var(--ha-space-4);
        padding: 0;
      }
      .steps li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        color: var(--secondary-text-color);
      }
      .steps li.current {
        color: var(--primary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .steps .number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid var(--divider-color);
        font-size: var(--ha-font-size-s);
      }
      .steps li.current .number {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--text-primary-color);
      }
      .steps li.done .number {
        border-color: var(--primary-color);
      }
      .note {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .actions {
        display: flex;
        justify-content: space-between;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-4);
      }
      .center {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-6);
      }
      .choice {
        display: block;
        width: 100%;
        margin-bottom: var(--ha-space-2);
        padding: var(--ha-space-3) var(--ha-space-4);
        text-align: start;
        font: inherit;
        color: var(--primary-text-color);
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
        cursor: pointer;
      }
      .choice.selected {
        border-color: var(--primary-color);
        outline: 1px solid var(--primary-color);
      }
      .choice:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      pre.yaml {
        margin: 0;
        padding: var(--ha-space-3);
        overflow: auto;
        max-width: 100%;
        box-sizing: border-box;
        background: var(--secondary-background-color);
        border-radius: var(--ha-border-radius-lg);
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
      }
      ha-alert ul {
        margin: 0;
        padding-inline-start: var(--ha-space-5);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-guided-setup-wizard": HaGuidedSetupWizard;
  }
}
