import { mdiChevronDown, mdiOpenInNew } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import { modeText } from "../../../common/language-mode/language-mode";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-form/ha-form";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-yaml-editor";
import "../../../components/setting-info/ha-setting-info";
import type { HaFormSchema } from "../../../components/ha-form/types";
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
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../resources/styles";
import { restartCore } from "../../../data/supervisor/core";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";
import type {
  DraftStorage,
  FieldMessage,
  GuidedDraft,
  GuidedStep,
  LeafField,
  SummaryLine,
} from "./guided-setup-logic";
import {
  buildSummary,
  canJumpTo,
  clearDraft,
  decorateField,
  defaultText,
  draftKey,
  fieldHint,
  getAt,
  GUIDED_STEPS,
  hasContent,
  humanize,
  leafFields,
  loadDraft,
  maskYaml,
  pathKey,
  saveDraft,
  stepStatus,
  validateAll,
} from "./guided-setup-logic";

const STEPS = GUIDED_STEPS;
const CHECK_DELAY = 600;
const DRAFT_DELAY = 500;

declare global {
  interface HASSDomEvents {
    "guided-setup-closed": undefined;
    "guided-setup-changed": undefined;
  }
}

const browserStorage = (): DraftStorage | undefined => {
  try {
    return window.localStorage;
  } catch (_err) {
    return undefined;
  }
};

@customElement("ha-guided-setup-wizard")
export class HaGuidedSetupWizard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public integration!: GuidedSetupIntegration;

  /** Set when an entry made here is edited. */
  @property({ attribute: false }) public entry?: GuidedSetupEntry;

  @state() private _step: GuidedStep = "about";

  @state() private _furthest: GuidedStep = "about";

  @state() private _entityDomain: string | null = null;

  @state() private _form?: GuidedSetupForm;

  @state() private _data: Record<string, any> = {};

  /** The kind of item chosen first, for integrations whose items are keyed by kind. */
  @state() private _kind?: string;

  /** Errors the server reported for the whole options step. */
  @state() private _errors: GuidedSetupError[] = [];

  @state() private _yaml = "";

  @state() private _busy = false;

  @state() private _checking = false;

  @state() private _loadError?: string;

  @state() private _yamlValid = true;

  @state() private _apply?: GuidedSetupApply;

  @state() private _applyError?: string;

  /** Fields the person has edited, so they are not told off before they try. */
  @state() private _touched = new Set<string>();

  /** True once Next was pressed on the options, so every problem shows. */
  @state() private _attempted = false;

  @state() private _draft?: GuidedDraft;

  /** Secrets to ask for again after a draft was resumed. */
  @state() private _resumedSecrets: string[] = [];

  @state() private _saved = false;

  @query("ha-alert.errors") private _errorsAlert?: HTMLElement;

  private _checkTimer?: number;

  private _draftTimer?: number;

  private _checkRun = 0;

  private _reviewRun = 0;

  private _initialData = "{}";

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("beforeunload", this._beforeUnload);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("beforeunload", this._beforeUnload);
    window.clearTimeout(this._checkTimer);
    window.clearTimeout(this._draftTimer);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("integration") || changed.has("entry")) {
      this._reset();
    }
  }

  protected updated(changed: PropertyValues): void {
    if (
      changed.has("_attempted") &&
      this._attempted &&
      this._step === "options" &&
      this._allMessages().length
    ) {
      this._errorsAlert?.focus();
    }
  }

  private _beforeUnload = (ev: BeforeUnloadEvent): void => {
    if (this._dirty()) {
      ev.preventDefault();
    }
  };

  private _reset(): void {
    // A timer from the previous integration must not store or check anything
    // for the new one, and a reply still on its way is stale.
    window.clearTimeout(this._checkTimer);
    window.clearTimeout(this._draftTimer);
    this._checkRun++;
    this._reviewRun++;
    this._checking = false;
    this._form = undefined;
    this._kind = undefined;
    this._errors = [];
    this._loadError = undefined;
    this._apply = undefined;
    this._yamlValid = true;
    this._touched = new Set();
    this._attempted = false;
    this._draft = undefined;
    this._resumedSecrets = [];
    this._saved = false;
    if (this.entry) {
      this._entityDomain = this.entry.entity_domain;
      this._data = { ...this.entry.data };
      this._initialData = JSON.stringify(this._data);
      this._step = "options";
      this._furthest = "options";
      this._loadForm();
      return;
    }
    this._data = {};
    this._initialData = "{}";
    this._step = "about";
    this._furthest = "about";
    const targets = this._targets();
    this._entityDomain = targets.length === 1 ? targets[0] : null;
    this._draft = this._findDraft(targets);
  }

  private _findDraft(targets: (string | null)[]): GuidedDraft | undefined {
    const storage = browserStorage();
    let found: GuidedDraft | undefined;
    for (const target of targets) {
      const draft = loadDraft(
        storage,
        draftKey(this.integration.domain, target)
      );
      if (
        draft &&
        hasContent(draft.data) &&
        (!found || draft.savedAt > found.savedAt)
      ) {
        found = draft;
      }
    }
    return found;
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.guided_setup.${key}` as any,
      values
    );
  }

  private _msg(message: FieldMessage): string {
    return this._l(message.key, message.params);
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
      if (this._form.kinds && this.entry && this._kind === undefined) {
        const [kind] = Object.keys(this.entry.data);
        this._kind = kind;
        this._data = { ...(this.entry.data[kind] ?? {}) };
        this._initialData = JSON.stringify(this._data);
      }
    } catch (err: any) {
      this._form = undefined;
      this._loadError = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private _fields(form: GuidedSetupForm): GuidedSetupField[] {
    if (!form.kinds) {
      return form.fields;
    }
    return form.kinds.find((kind) => kind.name === this._kind)?.fields ?? [];
  }

  private _leaves(): LeafField[] {
    return this._form ? leafFields(this._fields(this._form)) : [];
  }

  private _labelOf = (leaf: LeafField): string =>
    leaf.label ?? humanize(leaf.name);

  /** What is wrong, by path key, from the form's own rules. */
  private _localMessages(): Record<string, FieldMessage> {
    const all = validateAll(this._leaves(), this._data);
    if (this._attempted) {
      return all;
    }
    return Object.fromEntries(
      Object.entries(all).filter(
        ([key]) => this._touched.has(key) && all[key].key !== "field_required"
      )
    );
  }

  /** Server errors, with the chosen kind taken off the front of the path. */
  private _serverMessages(): { key: string; message: string }[] {
    return this._errors.map((error) => {
      const path =
        this._kind && error.path[0] === this._kind
          ? error.path.slice(1)
          : error.path;
      return { key: pathKey(path), message: error.message };
    });
  }

  private _allMessages(): { key: string; label: string; message: string }[] {
    const leaves = this._leaves();
    const label = (key: string) => {
      const leaf = leaves.find((item) => pathKey(item.path) === key);
      return leaf ? this._labelOf(leaf) : key;
    };
    const seen = new Set<string>();
    const result: { key: string; label: string; message: string }[] = [];
    for (const [key, message] of Object.entries(this._localMessages())) {
      seen.add(key);
      result.push({ key, label: label(key), message: this._msg(message) });
    }
    for (const { key, message } of this._serverMessages()) {
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, label: key ? label(key) : "", message });
      }
    }
    return result;
  }

  /** ha-form draws errors by top-level name. */
  private _fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { key, message } of this._allMessages()) {
      const name = key.split(".")[0];
      if (name && !result[name]) {
        result[name] = message;
      }
    }
    return result;
  }

  private _computeLabel = (schema: GuidedSetupField): string =>
    (schema as any).label ?? humanize((schema as any).name);

  private _computeHelper = (schema: GuidedSetupField): string | undefined => {
    const loose = schema as any;
    const leaf = this._leaves().find((item) => item.name === loose.name);
    // One short line under the field; the longer explanation, with the
    // default, is in the information button for the field in the help list.
    const parts: string[] = [this._l(loose.required ? "required" : "optional")];
    if (leaf) {
      parts.push(this._msg(fieldHint(leaf)));
    }
    return parts.join(". ");
  };

  private _computeError = (_schema: unknown, error: string): string => error;

  private _dataChanged(ev: ValueChangedEvent<Record<string, any>>): void {
    const next = ev.detail.value;
    for (const leaf of this._leaves()) {
      if (
        JSON.stringify(getAt(next, leaf.path)) !==
        JSON.stringify(getAt(this._data, leaf.path))
      ) {
        this._touched = new Set(this._touched).add(pathKey(leaf.path));
      }
    }
    this._data = next;
    this._errors = [];
    this._dataEdited();
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
    this._dataEdited();
  }

  private _dataEdited(): void {
    // Anything still on its way was asked about older data.
    this._checkRun++;
    this._reviewRun++;
    this._checking = false;
    this._scheduleCheck();
    this._scheduleDraft();
  }

  /** Asks the server about the options a moment after typing stops. */
  private _scheduleCheck(): void {
    window.clearTimeout(this._checkTimer);
    if (this._step !== "options" || !this._yamlValid) {
      return;
    }
    this._checkTimer = window.setTimeout(() => this._liveCheck(), CHECK_DELAY);
  }

  private async _liveCheck(): Promise<void> {
    if (
      this._step !== "options" ||
      Object.keys(validateAll(this._leaves(), this._data)).length
    ) {
      return;
    }
    const run = ++this._checkRun;
    const payload = this._payload();
    const sent = JSON.stringify(payload);
    this._checking = true;
    try {
      const result = await validateGuidedSetup(
        this.hass,
        {
          domain: this.integration.domain,
          entity_domain: this._entityDomain,
        },
        payload
      );
      // Only a reply to the data that is on screen now may paint errors.
      if (run === this._checkRun && sent === JSON.stringify(this._payload())) {
        this._errors = result.errors;
      }
    } catch (_err) {
      // A failed check is not an error in the options; Next checks again.
    } finally {
      if (run === this._checkRun) {
        this._checking = false;
      }
    }
  }

  private _scheduleDraft(): void {
    window.clearTimeout(this._draftTimer);
    // Typed YAML is free-form and can hold a secret under any key, so a form
    // that is not serializable never gets a draft in browser storage.
    if (this.entry || this._saved || !this._form?.serializable) {
      return;
    }
    this._draftTimer = window.setTimeout(() => this._storeDraft(), DRAFT_DELAY);
  }

  private _storeDraft(): void {
    if (!this._form?.serializable) {
      return;
    }
    const key = draftKey(this.integration.domain, this._entityDomain);
    if (!hasContent(this._data)) {
      clearDraft(browserStorage(), key);
      return;
    }
    saveDraft(
      browserStorage(),
      key,
      {
        step: this._step === "done" ? "options" : this._step,
        kind: this._kind,
        entityDomain: this._entityDomain,
        data: this._data,
      },
      this._leaves()
    );
  }

  private _dirty(): boolean {
    if (this._saved || this._step === "done") {
      return false;
    }
    if (this.entry) {
      return JSON.stringify(this._data) !== this._initialData;
    }
    return hasContent(this._data);
  }

  /** The options as they are written: wrapped in the chosen kind, if any. */
  private _payload(): Record<string, any> {
    const data = pruneGuidedSetupData(this._data);
    return this._kind ? { [this._kind]: data } : data;
  }

  /** Runs of short numeric fields sit side by side where there is room. */
  private _drawnSchema(form: GuidedSetupForm): HaFormSchema[] {
    const result: HaFormSchema[] = [];
    let run: GuidedSetupField[] = [];
    const flush = () => {
      if (run.length > 1) {
        result.push({
          name: "",
          type: "grid",
          flatten: true,
          column_min_width: "200px",
          schema: run,
        });
      } else {
        result.push(...run);
      }
      run = [];
    };
    for (const field of this._fields(form).map(decorateField)) {
      const selector = (field as any).selector;
      if (
        !(field as any).free_form &&
        selector?.number &&
        selector.number.mode !== "slider"
      ) {
        run.push(field);
      } else {
        flush();
        result.push(field);
      }
    }
    flush();
    return result;
  }

  private async _applyChange(): Promise<void> {
    const apply = this._apply;
    if (!apply) {
      return;
    }
    this._busy = true;
    this._applyError = undefined;
    try {
      if (apply.mode === "reload" && apply.service) {
        const [domain, service] = apply.service.split(".");
        await this.hass.callService(domain, service);
      } else {
        await restartCore(this.hass);
      }
      this._close();
    } catch (err: any) {
      this._applyError = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private _pickKind(ev: Event): void {
    this._kind = (ev.currentTarget as HTMLElement).dataset.kind;
    this._data = {};
    this._errors = [];
    this._touched = new Set();
    this._attempted = false;
  }

  private _pickTarget(ev: Event): void {
    const value = (ev.currentTarget as HTMLElement).dataset.target ?? "";
    this._entityDomain = value === "" ? null : value;
  }

  private _bump(step: GuidedStep): void {
    if (STEPS.indexOf(step) > STEPS.indexOf(this._furthest)) {
      this._furthest = step;
    }
  }

  private async _next(): Promise<void> {
    if (this._step === "about") {
      this._step = "options";
      this._bump("options");
      await this._loadForm();
      return;
    }
    if (this._step === "options") {
      this._attempted = true;
      if (Object.keys(validateAll(this._leaves(), this._data)).length) {
        return;
      }
      await this._review();
    }
  }

  private _back(): void {
    this._errors = [];
    if (this._step === "review") {
      this._step = "options";
    } else if (this._step === "options" && this._kind && !this.entry) {
      this._kind = undefined;
    } else if (this._step === "options" && !this.entry) {
      this._step = "about";
    } else {
      this._requestClose();
    }
  }

  private _ctx() {
    return {
      current: this._step,
      furthest: this._furthest,
      errorCount: this._allMessages().length,
      saved: this._saved,
    };
  }

  private async _jump(ev: Event): Promise<void> {
    const step = (ev.currentTarget as HTMLElement).dataset.step as GuidedStep;
    if (!canJumpTo(step, this._ctx())) {
      return;
    }
    if (step === "review") {
      this._attempted = true;
      if (Object.keys(validateAll(this._leaves(), this._data)).length) {
        this._step = "options";
        return;
      }
      await this._review();
      return;
    }
    this._step = step;
    if (step === "options" && !this._form) {
      await this._loadForm();
    }
  }

  private async _review(): Promise<void> {
    this._busy = true;
    const run = ++this._reviewRun;
    try {
      const data = this._payload();
      const sent = JSON.stringify(data);
      const result = await validateGuidedSetup(
        this.hass,
        {
          domain: this.integration.domain,
          entity_domain: this._entityDomain,
        },
        data
      );
      // The options changed while the server was asked: this reply and its
      // YAML belong to older data, so it must not move the wizard on.
      if (run !== this._reviewRun || sent !== JSON.stringify(this._payload())) {
        return;
      }
      this._errors = result.errors;
      this._yaml = result.yaml;
      if (result.valid) {
        this._step = "review";
        this._bump("review");
      } else {
        this._attempted = true;
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
        this._payload(),
        this.entry?.id
      );
      if (!result.saved) {
        this._errors = result.errors;
        this._step = "options";
        return;
      }
      window.clearTimeout(this._draftTimer);
      clearDraft(
        browserStorage(),
        draftKey(this.integration.domain, this._entityDomain)
      );
      this._saved = true;
      this._apply = result.entry?.apply;
      this._step = "done";
      this._bump("done");
      fireEvent(this, "guided-setup-changed");
    } catch (err: any) {
      this._errors = [{ path: [], message: err?.message ?? String(err) }];
      this._step = "options";
    } finally {
      this._busy = false;
    }
  }

  private async _resumeDraft(): Promise<void> {
    const draft = this._draft;
    if (!draft) {
      return;
    }
    this._entityDomain = draft.entityDomain;
    this._kind = draft.kind;
    this._data = draft.data;
    this._resumedSecrets = draft.clearedSecrets;
    this._draft = undefined;
    this._step = "options";
    this._bump("options");
    this._touched = new Set();
    await this._loadForm();
    const form = this._form;
    if (form?.kinds && draft.kind && !this._kind) {
      this._kind = draft.kind;
    }
    if (draft.step === "review" || draft.step === "options") {
      this._step = "options";
    }
  }

  private _startAgain(): void {
    const draft = this._draft;
    if (draft) {
      clearDraft(
        browserStorage(),
        draftKey(this.integration.domain, draft.entityDomain)
      );
    }
    this._draft = undefined;
  }

  private async _requestClose(): Promise<void> {
    if (this._dirty()) {
      const leave = await showConfirmationDialog(this, {
        title: this._l("leave_title"),
        text: this.entry ? this._l("leave_text_entry") : this._l("leave_text"),
        confirmText: this._l("leave_confirm"),
        dismissText: this._l("leave_stay"),
        destructive: this.entry !== undefined,
      });
      if (!leave) {
        return;
      }
      window.clearTimeout(this._draftTimer);
      if (!this.entry) {
        this._storeDraft();
      }
    }
    this._close();
  }

  private _close(): void {
    fireEvent(this, "guided-setup-closed");
  }

  private _summaryValue(line: SummaryLine): string {
    if (line.secret) {
      return this._l("summary_set");
    }
    if (line.entries !== undefined) {
      return this._l("summary_entries", { count: line.entries });
    }
    return line.value ?? "";
  }

  private _formatWhen(time: number): string {
    return new Date(time).toLocaleString(this.hass.locale?.language);
  }

  protected render(): TemplateResult {
    const title = this.entry
      ? this._l("edit_title", { name: this.integration.name })
      : this.integration.name;
    const showSummary = this._step === "options" && !!this._form?.serializable;
    return html`
      <div
        class=${classMap({ wizard: true, wide: !this.narrow && showSummary })}
      >
        <h2>${title}</h2>
        ${this._renderRail()}
        <div class="body">
          <div class="main">
            ${this._step === "about" ? this._renderAbout() : nothing}
            ${this._step === "options" ? this._renderOptions() : nothing}
            ${this._step === "review" ? this._renderReview() : nothing}
            ${this._step === "done" ? this._renderDone() : nothing}
          </div>
          ${showSummary ? this._renderSummary() : nothing}
        </div>
      </div>
    `;
  }

  private _renderRail(): TemplateResult {
    const ctx = this._ctx();
    const index = STEPS.indexOf(this._step);
    return html`<nav aria-label=${this._l("steps_nav")}>
      <ol class="rail">
        ${STEPS.map((step, position) => {
          const status = stepStatus(step, ctx);
          const jumpable = canJumpTo(step, ctx);
          return html`<li>
            <button
              type="button"
              class=${classMap({
                [status]: true,
                step: true,
              })}
              data-step=${step}
              aria-current=${step === this._step ? "step" : "false"}
              ?disabled=${!jumpable && step !== this._step}
              @click=${this._jump}
            >
              <span class="bar" aria-hidden="true"></span>
              <span class="label"
                >${position + 1}. ${this._l(`step_${step}`)}</span
              >
              <span class="sr-only">${this._l(`step_status_${status}`)}</span>
            </button>
          </li>`;
        })}
      </ol>
      <p class="step-name sr-only" role="status">
        ${this._l("step_of", { current: index + 1, total: STEPS.length })},
        ${this._l(`step_${this._step}`)}
      </p>
    </nav>`;
  }

  private _renderAbout(): TemplateResult {
    const targets = this._targets();
    const draft = this._draft;
    return html`
      <section>
        ${
          draft
            ? html`<ha-alert alert-type="info" .title=${this._l("draft_found")}>
                ${this._l("draft_found_text", {
                  when: this._formatWhen(draft.savedAt),
                })}
                ${
                  draft.clearedSecrets.length
                    ? html`<br />${this._l("draft_secrets_note")}`
                    : nothing
                }
                <div class="inline-actions">
                  <ha-button @click=${this._resumeDraft}
                    >${this._l("draft_resume")}</ha-button
                  >
                  <ha-button appearance="plain" @click=${this._startAgain}
                    >${this._l("draft_restart")}</ha-button
                  >
                </div>
              </ha-alert>`
            : nothing
        }
        <h3>${this._l("about_title")}</h3>
        <p>${this._l("about_text", { name: this.integration.name })}</p>
        <ha-button appearance="plain" href=${this.integration.documentation}>
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
    if (form.kinds && !this._kind) {
      return this._renderKinds(form);
    }
    const leaves = this._leaves();
    const noneRequired = !leaves.some((leaf) => leaf.required);
    return html`
      <section>
        ${
          this._resumedSecrets.length
            ? html`<ha-alert alert-type="warning">
                ${this._l("draft_secrets", {
                  names: this._resumedSecrets
                    .map((key) => {
                      const leaf = leaves.find(
                        (item) => pathKey(item.path) === key
                      );
                      return leaf ? this._labelOf(leaf) : humanize(key);
                    })
                    .join(", "),
                })}
              </ha-alert>`
            : nothing
        }
        ${this._renderErrors()}
        ${
          form.serializable
            ? html`<ha-form
                  .hass=${this.hass}
                  .narrow=${this.narrow}
                  .data=${this._data}
                  .schema=${this._drawnSchema(form)}
                  .error=${this._fieldErrors()}
                  .computeLabel=${this._computeLabel}
                  .computeHelper=${this._computeHelper}
                  .computeError=${this._computeError}
                  @value-changed=${this._dataChanged}
                ></ha-form>
                ${this._renderGuidance(leaves)}`
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
        <p class="note live" role="status">
          ${this._checking ? this._l("checking") : nothing}
        </p>
        <p class="note">${this._l("plain_text_note")}</p>
        ${this._renderActions(
          form.serializable ? false : !this._yamlValid,
          form.serializable && noneRequired && !hasContent(this._data)
        )}
      </section>
    `;
  }

  /** An expandable explanation of every option, always on the page. */
  private _renderGuidance(
    leaves: LeafField[]
  ): TemplateResult | typeof nothing {
    if (!leaves.length) {
      return nothing;
    }
    return html`<h3>${this._l("help_title")}</h3>
      <div class="guidance">
        ${leaves.map(
          (leaf) =>
            html`<div class="guidance-row">
              <span>${this._labelOf(leaf)}</span>
              <ha-setting-info
                .hass=${this.hass}
                .label=${this._labelOf(leaf)}
                .description=${`${this._l(leaf.required ? "required" : "optional")}. ${this._msg(fieldHint(leaf))}`}
                .defaultText=${defaultText(leaf.default, leaf.secret) ?? ""}
                .reach=${modeText(
                  this.hass.localize as any,
                  "ui.components.setting_info.guided_reach",
                  { file: `guided_setup/${this.integration.domain}.yaml` }
                )}
              ></ha-setting-info>
            </div>`
        )}
      </div>`;
  }

  private _renderSummary(): TemplateResult {
    const lines = buildSummary(this._leaves(), this._data, this._labelOf);
    const body = lines.length
      ? html`<dl>
          ${lines.map(
            (line) =>
              html`<div class="line">
                <dt>${line.label}</dt>
                <dd>${this._summaryValue(line)}</dd>
              </div>`
          )}
        </dl>`
      : html`<p class="note">${this._l("summary_empty")}</p>`;
    const file = this._l("summary_file", {
      file: `guided_setup/${this.integration.domain}.yaml`,
    });
    if (this.narrow) {
      return html`<details class="summary">
        <summary>
          ${this._l("summary_title")} (${lines.length})
          <ha-svg-icon .path=${mdiChevronDown}></ha-svg-icon>
        </summary>
        <p class="note">${file}</p>
        ${body}
      </details>`;
    }
    return html`<aside class="summary" aria-label=${this._l("summary_title")}>
      <h3>${this._l("summary_title")}</h3>
      <p class="note">${file}</p>
      ${body}
    </aside>`;
  }

  private _renderKinds(form: GuidedSetupForm): TemplateResult {
    return html`<section>
      <h3 id="kind-label">${this._l("choose_kind")}</h3>
      <div role="radiogroup" aria-labelledby="kind-label">
        ${(form.kinds ?? []).map(
          (kind) =>
            html`<button
              type="button"
              role="radio"
              class="choice"
              aria-checked="false"
              data-kind=${kind.name}
              @click=${this._pickKind}
            >
              ${humanize(kind.name)}
            </button>`
        )}
      </div>
      ${this._renderActions(true)}
    </section>`;
  }

  private _renderErrors(): TemplateResult | typeof nothing {
    const messages = this._allMessages();
    if (!messages.length || (!this._attempted && !this._errors.length)) {
      return html`<div class="sr-only" role="status" aria-live="polite">
        ${
          messages.length
            ? this._l("errors_count", { count: messages.length })
            : ""
        }
      </div>`;
    }
    return html`<ha-alert
        class="errors"
        tabindex="-1"
        alert-type="error"
        .title=${this._l("errors_title")}
      >
        <ul>
          ${messages.map(
            (error) =>
              html`<li>
                ${
                  error.label
                    ? this._l("error_line", {
                        field: error.label,
                        message: error.message,
                      })
                    : error.message
                }
              </li>`
          )}
        </ul>
      </ha-alert>
      <div class="sr-only" role="status" aria-live="polite">
        ${this._l("errors_count", { count: messages.length })}
      </div>`;
  }

  private _renderReview(): TemplateResult {
    const leaves = this._leaves();
    const lines = buildSummary(leaves, this._data, this._labelOf);
    return html`
      <section>
        <h3>${this._l("review_title")}</h3>
        <p>
          ${this._l("review_text", {
            file: `guided_setup/${this.integration.domain}.yaml`,
          })}
        </p>
        <dl class="review-list">
          ${lines.map(
            (line) =>
              html`<div class="line">
                <dt>${line.label}</dt>
                <dd>${this._summaryValue(line)}</dd>
              </div>`
          )}
        </dl>
        <pre class="yaml" tabindex="0">
${maskYaml(this._yaml, leaves, this._l("secret_mask"))}</pre>
        ${
          leaves.some((leaf) => leaf.secret)
            ? html`<p class="note">${this._l("review_masked_note")}</p>`
            : nothing
        }
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
    const reload = apply?.mode === "reload";
    return html`
      <section>
        <ha-alert alert-type="success" .title=${this._l("saved_title")}>
          ${this._l("saved_text")}
        </ha-alert>
        ${
          apply
            ? html`<p role="status">
                ${
                  reload
                    ? this._l("done_reload", { name: this.integration.name })
                    : this._l("done_restart", { name: this.integration.name })
                }
              </p>`
            : nothing
        }
        ${
          this._applyError
            ? html`<ha-alert alert-type="error">${this._applyError}</ha-alert>`
            : nothing
        }
        <div class="actions">
          <ha-button appearance="plain" @click=${this._close}>
            ${this._l("later")}
          </ha-button>
          ${
            apply
              ? html`<ha-button
                  @click=${this._applyChange}
                  .disabled=${this._busy}
                >
                  ${reload ? this._l("reload_now") : this._l("restart_now")}
                </ha-button>`
              : nothing
          }
        </div>
      </section>
    `;
  }

  private _renderActions(
    nextDisabled: boolean,
    canSkip = false
  ): TemplateResult {
    return html`<div class="actions">
      <ha-button appearance="plain" @click=${this._back}>
        ${
          this._step === "about" || this.entry
            ? this._l("cancel")
            : this._l("back")
        }
      </ha-button>
      <span class="end">
        ${
          canSkip
            ? html`<ha-button appearance="plain" @click=${this._review}>
                ${this._l("skip_defaults")}
              </ha-button>`
            : nothing
        }
        <ha-button
          @click=${this._next}
          .disabled=${nextDisabled || this._busy || this._noTargetChosen()}
        >
          ${this._l("next")}
        </ha-button>
      </span>
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
      .wizard.wide {
        max-width: 1040px;
      }
      .wizard.wide .body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: var(--ha-space-6);
        align-items: start;
      }
      h2 {
        margin: 0 0 var(--ha-space-3);
        overflow-wrap: anywhere;
      }
      h3 {
        margin: var(--ha-space-4) 0 var(--ha-space-1);
      }
      .rail {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--ha-space-1);
        list-style: none;
        margin: 0 0 var(--ha-space-4);
        padding: 0;
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        width: 100%;
        min-height: 44px;
        padding: var(--ha-space-1) 0;
        font: inherit;
        font-size: var(--ha-font-size-s);
        text-align: start;
        color: var(--secondary-text-color);
        background: none;
        border: 0;
        cursor: pointer;
      }
      .step:disabled {
        cursor: default;
      }
      .step:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
        border-radius: var(--ha-border-radius-sm, 4px);
      }
      .step .bar {
        display: block;
        height: 4px;
        border-radius: 2px;
        background: var(--divider-color);
      }
      .step.done .bar {
        background: var(--primary-color);
      }
      .step.current .bar {
        background: color-mix(in srgb, var(--primary-color) 40%, transparent);
      }
      .step.current,
      .step.done {
        color: var(--primary-text-color);
      }
      .step.current .label {
        font-weight: var(--ha-font-weight-medium);
      }
      .step.error .bar {
        background: var(--error-color);
      }
      .step.error {
        color: var(--error-color);
      }
      .step .label {
        overflow-wrap: anywhere;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .note {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .note.live:empty {
        display: none;
      }
      .actions {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-4);
      }
      .end,
      .inline-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .inline-actions {
        margin-top: var(--ha-space-2);
      }
      ha-button {
        --ha-button-height: 44px;
        min-width: 44px;
      }
      .center {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-6);
      }
      .choice {
        display: block;
        width: 100%;
        min-height: 44px;
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
      pre.yaml:focus-visible {
        outline: 2px solid var(--primary-color);
      }
      ha-alert ul {
        margin: 0;
        padding-inline-start: var(--ha-space-5);
      }
      .summary {
        box-sizing: border-box;
        padding: var(--ha-space-3) var(--ha-space-4);
        background: var(--secondary-background-color);
        border-radius: var(--ha-border-radius-lg);
      }
      aside.summary {
        position: sticky;
        top: var(--ha-space-4);
      }
      aside.summary h3 {
        margin-top: 0;
      }
      details.summary {
        margin-top: var(--ha-space-4);
      }
      summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        min-height: 44px;
        cursor: pointer;
      }
      summary:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      dl {
        margin: 0;
      }
      .line {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: var(--ha-space-2);
        padding: var(--ha-space-1) 0;
        border-bottom: 1px solid var(--divider-color);
      }
      dt {
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
      }
      dd {
        margin: 0;
        font-family: var(--ha-font-family-code, monospace);
        overflow-wrap: anywhere;
      }
      .review-list {
        margin-bottom: var(--ha-space-3);
      }
      .guidance-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        border-bottom: 1px solid var(--divider-color);
        overflow-wrap: anywhere;
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-guided-setup-wizard": HaGuidedSetupWizard;
  }
}
