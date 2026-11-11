import { mdiAlert, mdiCheck } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type {
  MinecraftEdition,
  MinecraftFieldError,
  MinecraftHost,
  MinecraftVersionLists,
  MinecraftServerDraft,
  MinecraftTarget,
  MinecraftTargetStatus,
} from "../../../data/minecraft_manager";
import {
  createMinecraftServer,
  emptyMinecraftDraft,
  isMinecraftFailure,
  MINECRAFT_EDITIONS,
  MINECRAFT_FLAVOURS,
  MINECRAFT_LIMITS,
  MINECRAFT_TARGETS,
  parseMinecraftNumber,
  refreshMinecraftVersions,
  validateMinecraftDraft,
  versionsForFlavour,
} from "../../../data/minecraft_manager";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import "./ha-minecraft-version-picker";

const STEPS = ["basics", "version", "target", "review"] as const;
type Step = (typeof STEPS)[number];

/** Errors about the whole request carry this field instead of a setting. */
const SERVER_FIELD = "server";

/** The fields each step is responsible for. */
const STEP_FIELDS: Record<Step, string[]> = {
  basics: ["name", "edition", "port", "memory_mb"],
  version: ["flavour", "version"],
  target: ["target", "host_id"],
  review: [],
};

@customElement("ha-minecraft-wizard")
class HaMinecraftWizard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public targets: MinecraftTargetStatus[] = [];

  @property({ attribute: false }) public hosts: MinecraftHost[] = [];

  /** The cached version lists; a refresh happens only on request. */
  @property({ attribute: false }) public versions?: MinecraftVersionLists;

  @state() private _versions?: MinecraftVersionLists;

  @state() private _versionsBusy = false;

  @state() private _versionsError?: string;

  @state() private _draft: MinecraftServerDraft = emptyMinecraftDraft();

  @state() private _step: Step = "basics";

  /** Fields the person has already left, so errors do not show too early. */
  @state() private _touched = new Set<string>();

  @state() private _serverErrors: MinecraftFieldError[] = [];

  @state() private _busy = false;

  @state() private _failure?: string;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.${key}` as any,
      values
    );
  }

  private _status(id: MinecraftTarget): MinecraftTargetStatus | undefined {
    return this.targets.find((item) => item.id === id);
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("versions") && this.versions && !this._versions) {
      this._versions = this.versions;
    }
    if (changed.has("hosts") && !this._draft.host_id && this.hosts.length) {
      this._draft = { ...this._draft, host_id: this.hosts[0].id };
    }
  }

  private _errors(): MinecraftFieldError[] {
    const errors = [
      ...validateMinecraftDraft(this._draft),
      ...this._serverErrors,
    ];
    if (this._draft.target === "ssh_docker" && !this._draft.host_id) {
      errors.push({ field: "host_id", code: "host_required" });
    }
    return errors;
  }

  /** Errors tied to a setting; the ones about the whole request are separate. */
  private _fieldErrors(): MinecraftFieldError[] {
    return this._errors().filter((error) => error.field !== SERVER_FIELD);
  }

  private _requestErrors(): MinecraftFieldError[] {
    return this._serverErrors.filter((error) => error.field === SERVER_FIELD);
  }

  private _errorFor(field: string): string | undefined {
    if (!this._touched.has(field)) {
      return undefined;
    }
    const error = this._errors().find((item) => item.field === field);
    if (!error) {
      return undefined;
    }
    if (error.code === "out_of_range") {
      const range =
        field === "port"
          ? [MINECRAFT_LIMITS.portMin, MINECRAFT_LIMITS.portMax]
          : [MINECRAFT_LIMITS.memoryMin, MINECRAFT_LIMITS.memoryMax];
      return this._l("error.out_of_range", { min: range[0], max: range[1] });
    }
    return this._l(`error.${error.code}`, { max: MINECRAFT_LIMITS.nameMax });
  }

  private _touch(field: string): void {
    this._touched = new Set([...this._touched, field]);
  }

  private _set(changes: Partial<MinecraftServerDraft>): void {
    this._draft = { ...this._draft, ...changes };
    this._serverErrors = [];
    this._failure = undefined;
  }

  private _stepValid(step: Step): boolean {
    const fields = STEP_FIELDS[step];
    return !this._errors().some((error) => fields.includes(error.field));
  }

  private _go(step: Step): void {
    // Only steps whose earlier steps are valid can be reached.
    const target = STEPS.indexOf(step);
    for (const earlier of STEPS.slice(0, target)) {
      if (!this._stepValid(earlier)) {
        this._touchStep(earlier);
        this._step = earlier;
        return;
      }
    }
    this._step = step;
  }

  private _touchStep(step: Step): void {
    this._touched = new Set([...this._touched, ...STEP_FIELDS[step]]);
  }

  private _next(): void {
    this._touchStep(this._step);
    if (!this._stepValid(this._step)) {
      return;
    }
    this._step = STEPS[STEPS.indexOf(this._step) + 1];
  }

  private _back(): void {
    this._step = STEPS[STEPS.indexOf(this._step) - 1];
  }

  private _cancel(): void {
    fireEvent(this, "minecraft-wizard-closed", { created: false });
  }

  private async _create(): Promise<void> {
    this._busy = true;
    this._failure = undefined;
    try {
      const result = await createMinecraftServer(this.hass, this._draft);
      if (result.saved) {
        fireEvent(this, "minecraft-wizard-closed", { created: true });
        return;
      }
      this._serverErrors = result.errors;
      this._touchStep("basics");
      this._touchStep("version");
      if (result.errors.every((e) => e.field === SERVER_FIELD)) {
        // Nothing to fix in a field: stay here and show the message.
        this._step = "review";
        return;
      }
      this._step = result.errors.some((e) =>
        STEP_FIELDS.target.includes(e.field)
      )
        ? "target"
        : result.errors.some((e) => STEP_FIELDS.version.includes(e.field))
          ? "version"
          : "basics";
    } catch (err: any) {
      this._failure = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  protected render(): TemplateResult {
    return html`
      <div class="wizard">
        ${this._renderRail()}
        <div class="main">
          <section
            class="step"
            aria-labelledby="step-title"
            @keydown=${this._keydown}
          >
            <h2 id="step-title">${this._l(`step.${this._step}`)}</h2>
            ${this._renderStep()}
            ${
              this._failure
                ? html`<ha-alert alert-type="error">${this._failure}</ha-alert>`
                : nothing
            }
            ${this._renderActions()}
          </section>
          ${this._renderSummary()}
        </div>
      </div>
    `;
  }

  private _keydown(ev: KeyboardEvent): void {
    if (
      ev.key === "Enter" &&
      this._step !== "review" &&
      (ev.target as HTMLElement).localName === "ha-input"
    ) {
      ev.preventDefault();
      this._next();
    }
  }

  private _renderRail(): TemplateResult {
    const current = STEPS.indexOf(this._step);
    return html`<ol class="rail" aria-label=${this._l("steps")}>
      ${STEPS.map((step, index) => {
        const done = index < current;
        return html`<li>
          <button
            type="button"
            class=${classMap({ item: true, active: step === this._step, done })}
            aria-current=${step === this._step ? "step" : "false"}
            data-step=${step}
            @click=${this._railClicked}
          >
            <span class="num" aria-hidden="true">
              ${done ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>` : index + 1}
            </span>
            <span class="label">${this._l(`step.${step}`)}</span>
          </button>
        </li>`;
      })}
    </ol>`;
  }

  private _renderStep(): TemplateResult {
    switch (this._step) {
      case "basics":
        return this._renderBasics();
      case "version":
        return this._renderVersion();
      case "target":
        return this._renderTarget();
      default:
        return this._renderReview();
    }
  }

  private _field(
    field: string,
    label: string,
    value: string,
    options: { type?: "text" | "number"; hint?: string } = {}
  ): TemplateResult {
    const error = this._errorFor(field);
    return html`<div class="field">
      <ha-input
        data-field=${field}
        .label=${label}
        .value=${value}
        .type=${options.type ?? "text"}
        .invalid=${Boolean(error)}
        .hint=${error ?? options.hint ?? ""}
        @input=${this._fieldInput}
        @blur=${this._fieldBlur}
      ></ha-input>
    </div>`;
  }

  private _fieldInput(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const value = target.value ?? "";
    switch (target.dataset.field) {
      case "name":
        this._set({ name: value });
        break;
      case "port":
        this._set({ port: parseMinecraftNumber(value) });
        break;
      case "memory_mb":
        this._set({ memory_mb: parseMinecraftNumber(value) });
        break;
      case "version":
        this._set({ version: value.trim() });
        break;
    }
  }

  private _fieldBlur(ev: Event): void {
    this._touch((ev.target as HTMLElement).dataset.field ?? "");
  }

  private _editionChanged(ev: Event): void {
    this._setEdition(
      (ev.target as HTMLElement).dataset.value as MinecraftEdition
    );
  }

  private _flavourChanged(ev: Event): void {
    this._set({ flavour: (ev.target as HTMLElement).dataset.value! });
  }

  private _targetChanged(ev: Event): void {
    this._set({
      target: (ev.target as HTMLElement).dataset.value as MinecraftTarget,
    });
  }

  private _railClicked(ev: Event): void {
    this._go((ev.currentTarget as HTMLElement).dataset.step as Step);
  }

  private _renderBasics(): TemplateResult {
    return html`
      ${this._field("name", this._l("field.name"), this._draft.name, {
        hint: this._l("hint.name"),
      })}
      <fieldset class="choices">
        <legend>${this._l("field.edition")}</legend>
        ${MINECRAFT_EDITIONS.map(
          (edition) =>
            html`<label class="choice">
              <input
                type="radio"
                name="edition"
                data-value=${edition}
                .checked=${this._draft.edition === edition}
                @change=${this._editionChanged}
              />
              <span class="choice-text">
                <span>${this._l(`edition.${edition}`)}</span>
                <span class="detail"
                  >${this._l(`edition.${edition}_hint`)}</span
                >
              </span>
            </label>`
        )}
      </fieldset>
      <div class="pair">
        ${this._field(
          "port",
          this._l("field.port"),
          this._draft.port === undefined ? "" : String(this._draft.port),
          { type: "number", hint: this._l("hint.port") }
        )}
        ${this._field(
          "memory_mb",
          this._l("field.memory"),
          this._draft.memory_mb === undefined
            ? ""
            : String(this._draft.memory_mb),
          { type: "number", hint: this._l("hint.memory") }
        )}
      </div>
    `;
  }

  private _setEdition(edition: MinecraftEdition): void {
    const flavours = MINECRAFT_FLAVOURS[edition];
    this._set({
      edition,
      flavour: flavours.includes(this._draft.flavour)
        ? this._draft.flavour
        : flavours[0],
      port: edition === "bedrock" ? 19132 : 25565,
    });
  }

  private _renderVersion(): TemplateResult {
    return html`
      <fieldset class="choices">
        <legend>${this._l("field.flavour")}</legend>
        ${MINECRAFT_FLAVOURS[this._draft.edition].map(
          (flavour) =>
            html`<label class="choice">
              <input
                type="radio"
                name="flavour"
                data-value=${flavour}
                .checked=${this._draft.flavour === flavour}
                @change=${this._flavourChanged}
              />
              <span class="choice-text">
                <span>${this._l(`flavour.${flavour}`)}</span>
                <span class="detail"
                  >${this._l(`flavour.${flavour}_hint`)}</span
                >
              </span>
            </label>`
        )}
      </fieldset>
      <ha-minecraft-version-picker
        .hass=${this.hass}
        .value=${this._draft.version}
        .versions=${versionsForFlavour(this._versions, this._draft.flavour)}
        .fetchedAt=${this._versions?.fetched_at ?? null}
        .busy=${this._versionsBusy}
        .error=${this._versionsError}
        .hint=${this._l("hint.version")}
        .invalidText=${this._errorFor("version")}
        @value-changed=${this._versionChanged}
        @refresh-versions=${this._refreshVersions}
      ></ha-minecraft-version-picker>
      <ha-alert alert-type="info">${this._l("version_note")}</ha-alert>
    `;
  }

  private _versionChanged(ev: CustomEvent<{ value: string }>): void {
    ev.stopPropagation();
    this._set({ version: ev.detail.value });
    this._touch("version");
  }

  private async _refreshVersions(): Promise<void> {
    this._versionsBusy = true;
    this._versionsError = undefined;
    try {
      const result = await refreshMinecraftVersions(this.hass);
      if (isMinecraftFailure(result)) {
        this._versionsError = this._l(`op_error.${result.code}`);
      } else {
        this._versions = result;
      }
    } catch (err: any) {
      this._versionsError = err?.message ?? String(err);
    } finally {
      this._versionsBusy = false;
    }
  }

  private _hostChanged(ev: Event): void {
    this._set({ host_id: (ev.target as HTMLSelectElement).value });
    this._touch("host_id");
  }

  private _openHosts(): void {
    fireEvent(this, "minecraft-wizard-open-hosts");
  }

  private _renderHostChoice(): TemplateResult | typeof nothing {
    if (this._draft.target !== "ssh_docker") {
      return nothing;
    }
    const error = this._errorFor("host_id");
    return html`<div class="field host-choice">
      <label for="host-select">${this._l("field.host")}</label>
      ${
        this.hosts.length
          ? html`<select
              id="host-select"
              .value=${this._draft.host_id ?? ""}
              @change=${this._hostChanged}
            >
              ${this.hosts.map(
                (host) =>
                  html`<option
                    value=${host.id}
                    ?selected=${host.id === this._draft.host_id}
                  >
                    ${host.name} (${host.user}@${host.address})
                  </option>`
              )}
            </select>`
          : nothing
      }
      <span class="detail">${error ?? this._l("hint.host")}</span>
      <div>
        <ha-button appearance="plain" @click=${this._openHosts}
          >${this._l("manage_hosts")}</ha-button
        >
      </div>
    </div>`;
  }

  private _renderTarget(): TemplateResult {
    return html`
      <p class="lead">${this._l("target_intro")}</p>
      <div
        class="cards"
        role="radiogroup"
        aria-label=${this._l("field.target")}
      >
        ${MINECRAFT_TARGETS.map((id, index) => this._renderTargetCard(id, index))}
      </div>
      ${this._renderHostChoice()}
    `;
  }

  private _renderTargetCard(
    id: MinecraftTarget,
    index: number
  ): TemplateResult {
    const status = this._status(id);
    const available = status?.available ?? false;
    const selected = this._draft.target === id;
    return html`<label
      class=${classMap({ card: true, selected, unavailable: !available })}
    >
      <span class="card-head">
        <input
          type="radio"
          name="target"
          .checked=${selected}
          .disabled=${!available}
          data-value=${id}
          @change=${this._targetChanged}
        />
        <span class="card-title">${this._l(`target.${id}.name`)}</span>
        ${
          index === 0
            ? html`<span class="tag">${this._l("recommended")}</span>`
            : nothing
        }
      </span>
      <span class="detail">${this._l(`target.${id}.needs`)}</span>
      ${
        id === "docker_socket"
          ? html`<span class="warning"
              ><ha-svg-icon .path=${mdiAlert}></ha-svg-icon>
              ${this._l("target.docker_socket.warning")}</span
            >`
          : nothing
      }
      ${
        id === "local_process"
          ? html`<span class="warning"
              ><ha-svg-icon .path=${mdiAlert}></ha-svg-icon>
              ${this._l("target.local_process.warning")}</span
            >`
          : nothing
      }
      <span class="detail status">
        ${
          status
            ? available
              ? this._l(`reason.${status.reason}`)
              : this._l("unavailable", {
                  reason: this._l(`reason.${status.reason}`),
                })
            : this._l("unknown_target")
        }
      </span>
    </label>`;
  }

  private _summaryRows(): [string, string][] {
    const d = this._draft;
    return [
      [this._l("field.name"), d.name.trim() || "-"],
      [this._l("field.edition"), this._l(`edition.${d.edition}`)],
      [this._l("field.flavour"), this._l(`flavour.${d.flavour}`)],
      [this._l("field.version"), d.version || "-"],
      [this._l("field.port"), d.port === undefined ? "-" : String(d.port)],
      [
        this._l("field.memory"),
        d.memory_mb === undefined ? "-" : `${d.memory_mb} MB`,
      ],
      [this._l("field.target"), this._l(`target.${d.target}.name`)],
      ...(d.target === "ssh_docker"
        ? ([
            [
              this._l("field.host"),
              this.hosts.find((host) => host.id === d.host_id)?.name ?? "-",
            ],
          ] as [string, string][])
        : []),
    ];
  }

  private _renderSummary(): TemplateResult {
    return html`<aside class="summary" aria-label=${this._l("summary")}>
      <h3>${this._l("summary")}</h3>
      <dl>
        ${this._summaryRows().map(
          ([label, value]) =>
            html`<dt>${label}</dt>
              <dd>${value}</dd>`
        )}
      </dl>
    </aside>`;
  }

  private _renderReview(): TemplateResult {
    const errors = this._fieldErrors();
    return html`
      <p class="lead">${this._l("review_intro")}</p>
      ${this._requestErrors().map(
        (error) =>
          html`<ha-alert alert-type="error"
            >${this._l(`error.${error.code}`, {
              max: MINECRAFT_LIMITS.nameMax,
            })}</ha-alert
          >`
      )}
      <ha-alert alert-type="warning">${this._l("review_note")}</ha-alert>
      ${
        errors.length
          ? html`<ha-alert alert-type="error"
              >${this._l("review_errors")}</ha-alert
            >`
          : nothing
      }
    `;
  }

  private _renderActions(): TemplateResult {
    const first = this._step === STEPS[0];
    const last = this._step === "review";
    return html`<div class="actions">
      <ha-button appearance="plain" @click=${this._cancel}
        >${this._l("cancel")}</ha-button
      >
      <span class="grow"></span>
      ${
        first
          ? nothing
          : html`<ha-button appearance="plain" @click=${this._back}
              >${this._l("back")}</ha-button
            >`
      }
      ${
        last
          ? html`<ha-button
              @click=${this._create}
              .disabled=${this._busy || this._fieldErrors().length > 0}
              >${this._l("create")}</ha-button
            >`
          : html`<ha-button @click=${this._next}>${this._l("next")}</ha-button>`
      }
    </div>`;
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .wizard {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: var(--ha-space-4);
        padding: var(--ha-space-4);
        max-width: 1000px;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 240px;
        gap: var(--ha-space-4);
        align-items: start;
      }
      @media (max-width: 900px) {
        .main {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 640px) {
        .wizard {
          grid-template-columns: minmax(0, 1fr);
          padding: var(--ha-space-2);
        }
      }
      .rail {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      @media (max-width: 640px) {
        .rail {
          flex-direction: row;
          flex-wrap: wrap;
        }
      }
      .rail .item {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
        min-width: 44px;
        width: 100%;
        padding: 0 var(--ha-space-3);
        border: 0;
        border-radius: 22px;
        background: none;
        font: inherit;
        color: var(--secondary-text-color);
        cursor: pointer;
        text-align: start;
      }
      .rail .item.active {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }
      .rail .item:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid currentColor;
        font-size: var(--ha-font-size-s);
        --mdc-icon-size: 16px;
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        min-width: 0;
      }
      h2 {
        margin: 0;
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
      }
      h3 {
        margin: 0 0 var(--ha-space-2);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .lead {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .field ha-input {
        width: 100%;
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--ha-space-3);
      }
      fieldset.choices {
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg, 12px);
        margin: 0;
        padding: var(--ha-space-2) var(--ha-space-3);
        display: flex;
        flex-direction: column;
      }
      legend {
        padding: 0 var(--ha-space-1);
        color: var(--secondary-text-color);
      }
      .choice {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-3);
        min-height: 44px;
        padding: var(--ha-space-2) 0;
        cursor: pointer;
      }
      .choice input,
      .card-head input {
        width: 20px;
        height: 20px;
        margin: 2px 0 0;
        flex: none;
      }
      .choice-text {
        display: flex;
        flex-direction: column;
      }
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .cards {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        padding: var(--ha-space-3);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg, 12px);
        cursor: pointer;
      }
      .card.selected {
        border-color: var(--primary-color);
        background: var(--secondary-background-color);
      }
      .card.unavailable {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .card:focus-within {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .card-head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 44px;
      }
      .card-title {
        font-weight: var(--ha-font-weight-medium);
        flex: 1;
        min-width: 0;
      }
      .tag {
        flex: none;
        padding: 0 var(--ha-space-2);
        border-radius: 12px;
        background: var(--secondary-background-color);
        font-size: var(--ha-font-size-xs, 12px);
        color: var(--secondary-text-color);
      }
      .host-choice {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .host-choice select {
        min-height: 44px;
        padding: 0 var(--ha-space-3);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font: inherit;
      }
      .warning {
        display: flex;
        gap: var(--ha-space-2);
        align-items: flex-start;
        color: var(--warning-color);
        font-size: var(--ha-font-size-s);
        --mdc-icon-size: 18px;
      }
      .status {
        font-style: italic;
      }
      .summary {
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
        min-width: 0;
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--ha-space-1) var(--ha-space-3);
      }
      dt {
        color: var(--secondary-text-color);
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        align-items: center;
      }
      .grow {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-minecraft-wizard": HaMinecraftWizard;
  }
  interface HASSDomEvents {
    "minecraft-wizard-closed": { created: boolean };
    "minecraft-wizard-open-hosts": undefined;
  }
}
