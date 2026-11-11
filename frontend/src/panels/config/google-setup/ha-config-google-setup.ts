import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiCircleOutline,
  mdiContentCopy,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { customElement, property, state } from "lit/decorators";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import { showToast } from "../../../util/toast";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-checkbox";
import type { HaCheckbox } from "../../../components/ha-checkbox";
import "../../../components/ha-file-upload";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-textarea";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import type { ApplicationCredential } from "../../../data/application_credential";
import {
  createApplicationCredential,
  fetchApplicationCredentials,
  fetchApplicationCredentialsConfig,
} from "../../../data/application_credential";
import type { ConfigEntry } from "../../../data/config_entries";
import { getConfigEntries } from "../../../data/config_entries";
import type {
  GoogleApiResult,
  GoogleClientParse,
  GoogleSetupDraft,
  GoogleSetupStatus,
  GoogleSetupStep,
} from "../../../data/google_setup";
import {
  emptyDraft,
  enableGoogleApis,
  fetchGoogleSetupStatus,
  GOOGLE_APIS,
  GOOGLE_CREDENTIALS_URL,
  GOOGLE_SETUP_DRAFT_KEY,
  GOOGLE_SETUP_STEPS,
  googleEnableApiUrl,
  googleRedirectUri,
  parseGoogleClientJson,
  restoreDraft,
  serializeDraft,
} from "../../../data/google_setup";
import { domainToName } from "../../../data/integration";
import { integrationDisplayName } from "./domain-name";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type { NestStepId } from "./nest-guidance";
import {
  NEST_CHECKLIST_KEY,
  NEST_STEPS,
  nestProgress,
  nestRedirectUri,
  restoreNestChecklist,
  serializeNestChecklist,
  validateNestClientText,
  validateNestProjectId,
} from "./nest-guidance";

interface FilePickedEvent extends Event {
  detail: { files: File[] | FileList };
}

@customElement("ha-config-google-setup")
class HaConfigGoogleSetup extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _draft: GoogleSetupDraft = emptyDraft();

  @state() private _restored = false;

  @state() private _status?: GoogleSetupStatus;

  @state() private _error?: string;

  @state() private _credentialDomains: string[] = [];

  @state() private _credentials: ApplicationCredential[] = [];

  @state() private _entries: ConfigEntry[] = [];

  /** Held in memory only, and cleared as soon as the call has been made. */
  @state() private _keyText?: string;

  @state() private _keyProject?: string;

  @state() private _keyError?: string;

  @state() private _selectedApis = new Set<string>(
    GOOGLE_APIS.map((api) => api.id)
  );

  @state() private _enabling = false;

  @state() private _enableError?: string;

  @state() private _apiResults: Record<string, GoogleApiResult> = {};

  /** Held in memory only, and cleared once the credentials are stored. */
  @state() private _client?: GoogleClientParse;

  @state() private _storing = false;

  @state() private _storeResults: Record<string, string> = {};

  @state() private _nestTicked = new Set<NestStepId>();

  /** Pasted Nest client file; held in memory only and never stored. */
  @state() private _nestClientText = "";

  /** Bumped on every pick so a slow earlier file read cannot overwrite a later one. */
  private _keyGeneration = 0;

  private _clientGeneration = 0;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._keyGeneration++;
    this._clientGeneration++;
    this._keyText = undefined;
    this._keyProject = undefined;
    this._client = undefined;
    this._nestClientText = "";
  }

  protected firstUpdated(): void {
    try {
      const raw = localStorage.getItem(GOOGLE_SETUP_DRAFT_KEY);
      this._draft = restoreDraft(raw);
      this._restored = raw !== null;
    } catch (_err) {
      this._draft = emptyDraft();
    }
    try {
      this._nestTicked = restoreNestChecklist(
        localStorage.getItem(NEST_CHECKLIST_KEY)
      );
    } catch (_err) {
      this._nestTicked = new Set();
    }
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      const [status, config] = await Promise.all([
        fetchGoogleSetupStatus(this.hass),
        fetchApplicationCredentialsConfig(this.hass),
      ]);
      this._status = status;
      this._credentialDomains = config.domains;
      this._error = undefined;
      // The names of the integrations are loaded on request. Until they are
      // here the names are the tidied domains.
      this.hass
        .loadBackendTranslation("title", this._domains)
        .catch(() => undefined);
    } catch (err: any) {
      this._error = err?.message ?? String(err);
      return;
    }
    await this._loadStored();
  }

  private async _loadStored(): Promise<void> {
    try {
      const [credentials, entries] = await Promise.all([
        fetchApplicationCredentials(this.hass),
        getConfigEntries(this.hass),
      ]);
      this._credentials = credentials;
      this._entries = entries;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.google_setup.${key}` as any,
      values
    );
  }

  private _setDraft(changes: Partial<GoogleSetupDraft>): void {
    if (changes.step && changes.step !== "helper") {
      this._keyGeneration++;
      this._keyText = undefined;
      this._keyProject = undefined;
    }
    this._draft = { ...this._draft, ...changes };
    try {
      localStorage.setItem(GOOGLE_SETUP_DRAFT_KEY, serializeDraft(this._draft));
    } catch (_err) {
      // Saving is a convenience; the wizard works without it.
    }
  }

  private _startOver(): void {
    try {
      localStorage.removeItem(GOOGLE_SETUP_DRAFT_KEY);
    } catch (_err) {
      // Nothing to remove.
    }
    this._draft = emptyDraft();
    this._restored = false;
    this._keyGeneration++;
    this._clientGeneration++;
    this._client = undefined;
    this._keyText = undefined;
    this._keyProject = undefined;
    this._apiResults = {};
    this._storeResults = {};
  }

  private _goTo(ev: Event): void {
    this._setDraft({
      step: (ev.currentTarget as HTMLElement).dataset.step as GoogleSetupStep,
    });
  }

  private _next(): void {
    const index = GOOGLE_SETUP_STEPS.indexOf(this._draft.step);
    this._setDraft({ step: GOOGLE_SETUP_STEPS[index + 1] });
  }

  private _back(): void {
    const index = GOOGLE_SETUP_STEPS.indexOf(this._draft.step);
    this._setDraft({ step: GOOGLE_SETUP_STEPS[index - 1] });
  }

  private _skipHelper(): void {
    this._keyText = undefined;
    this._keyProject = undefined;
    this._setDraft({ helperSkipped: true, step: "client" });
  }

  private get _redirectUri(): string {
    return googleRedirectUri(this._status?.my_link ?? false, location.origin);
  }

  private get _domains(): string[] {
    return (this._status?.domains ?? []).filter((domain) =>
      this._credentialDomains.includes(domain)
    );
  }

  /** The name of an integration, never the raw domain. */
  private _domainName(domain: string): string {
    return integrationDisplayName(
      domainToName(this.hass.localize, domain),
      domain
    );
  }

  private _hasCredential(domain: string): boolean {
    return this._credentials.some((item) => item.domain === domain);
  }

  private _isConnected(domain: string): boolean {
    return this._entries.some(
      (entry) => entry.domain === domain && entry.disabled_by === null
    );
  }

  private _enabledCount(): number {
    return Object.values(this._apiResults).filter(
      (result) => result.state === "enabled"
    ).length;
  }

  private async _keyPicked(ev: FilePickedEvent): Promise<void> {
    const file = Array.from(ev.detail.files)[0];
    const generation = ++this._keyGeneration;
    this._keyText = undefined;
    this._keyProject = undefined;
    this._keyError = undefined;
    if (!file) {
      return;
    }
    if (file.size > 20000) {
      this._keyError = this._l("key_error_too_large");
      return;
    }
    const text = await file.text();
    if (generation !== this._keyGeneration) {
      return;
    }
    try {
      const data = JSON.parse(text);
      if (
        data?.type !== "service_account" ||
        typeof data.project_id !== "string" ||
        typeof data.client_email !== "string" ||
        typeof data.private_key !== "string"
      ) {
        this._keyError = this._l("key_error_not_a_key");
        return;
      }
      this._keyProject = data.project_id;
    } catch (_err) {
      this._keyError = this._l("key_error_invalid_json");
      return;
    }
    this._keyText = text;
  }

  private _toggleApi(ev: Event): void {
    const input = ev.target as HaCheckbox;
    const next = new Set(this._selectedApis);
    if (input.checked) {
      next.add(input.dataset.api!);
    } else {
      next.delete(input.dataset.api!);
    }
    this._selectedApis = next;
  }

  private async _enableApis(): Promise<void> {
    const key = this._keyText;
    if (!key || this._selectedApis.size === 0) {
      return;
    }
    this._enabling = true;
    this._enableError = undefined;
    try {
      const result = await enableGoogleApis(this.hass, key, [
        ...this._selectedApis,
      ]);
      this._apiResults = Object.fromEntries(
        result.apis.map((item) => [item.id, item])
      );
    } catch (err: any) {
      this._enableError = err?.message ?? String(err);
    } finally {
      if (this._keyText === key) {
        this._keyText = undefined;
        this._keyProject = undefined;
      }
      this._enabling = false;
    }
  }

  private async _clientPicked(ev: FilePickedEvent): Promise<void> {
    const file = Array.from(ev.detail.files)[0];
    const generation = ++this._clientGeneration;
    this._client = undefined;
    this._storeResults = {};
    if (!file) {
      return;
    }
    if (file.size > 20000) {
      this._client = { ok: false, error: "too_large" };
      return;
    }
    const text = await file.text();
    if (generation !== this._clientGeneration) {
      return;
    }
    const parsed = parseGoogleClientJson(text);
    this._client = parsed;
    if (parsed.ok) {
      this._setDraft({ clientId: parsed.clientId });
    }
  }

  private async _storeCredentials(): Promise<void> {
    const client = this._client;
    if (!client?.ok) {
      return;
    }
    this._storing = true;
    const results: Record<string, string> = {};
    await Promise.all(
      this._domains.map(async (domain) => {
        results[domain] = "";
        if (
          this._credentials.some(
            (item) =>
              item.domain === domain && item.client_id === client.clientId
          )
        ) {
          results[domain] = this._l("credential_kept");
          return;
        }
        try {
          await createApplicationCredential(
            this.hass,
            domain,
            client.clientId,
            client.clientSecret,
            this._l("credential_name")
          );
        } catch (err: any) {
          results[domain] = err?.message ?? String(err);
        }
      })
    );
    this._storeResults = results;
    if (Object.values(results).every((message) => message === "")) {
      this._client = undefined;
    }
    this._storing = false;
    await this._loadStored();
  }

  private _nestProjectChanged(ev: Event): void {
    this._setDraft({ nestProjectId: (ev.target as HaInput).value ?? "" });
  }

  // An address to copy. It is shown in full, wrapping where it must, because a
  // single-line field cuts a long address with no sign that more follows.
  private _renderAddress(label: string, value: string): TemplateResult {
    return html`<div class="address" role="group" aria-label=${label}>
      <code class="address-text">${value}</code>
      <ha-button
        appearance="plain"
        size="s"
        .address=${value}
        @click=${this._copyAddress}
      >
        <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
        ${this._l("copy")}
      </ha-button>
    </div>`;
  }

  private async _copyAddress(ev: Event): Promise<void> {
    const { address } = ev.currentTarget as HTMLElement & { address: string };
    await copyToClipboard(address, this);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private _copyNestProject(): void {
    if (this._draft.nestProjectId) {
      copyToClipboard(this._draft.nestProjectId, this);
    }
  }

  private _toggleNestStep(ev: Event): void {
    const input = ev.target as HaCheckbox;
    const next = new Set(this._nestTicked);
    if (input.checked) {
      next.add(input.dataset.step as NestStepId);
    } else {
      next.delete(input.dataset.step as NestStepId);
    }
    this._nestTicked = next;
    try {
      localStorage.setItem(NEST_CHECKLIST_KEY, serializeNestChecklist(next));
    } catch (_err) {
      // Saving is a convenience; the checklist works without it.
    }
  }

  private _nestClientChanged(ev: Event): void {
    this._nestClientText = (ev.target as HTMLTextAreaElement).value ?? "";
  }

  private _renderNestGuidance(): TemplateResult {
    const progress = nestProgress(this._nestTicked);
    const redirect = nestRedirectUri(
      location.origin,
      this._status?.my_link ?? false
    );
    const projectState = validateNestProjectId(this._draft.nestProjectId);
    const clientText = this._nestClientText.trim();
    const client = clientText
      ? clientText.length > 20000
        ? ({ ok: false, error: "too_large" } as GoogleClientParse)
        : validateNestClientText(clientText)
      : undefined;
    return html`<div class="nest-guide">
      <p class="note" role="status">
        ${this._l("nest_progress", {
          count: progress.done,
          total: progress.total,
        })}
      </p>
      <p class="note">${this._l("nest_privacy")}</p>
      <ol class="guide">
        ${NEST_STEPS.map(
          (step) =>
            html`<li>
              <ha-checkbox
                class="check"
                data-step=${step.id}
                .checked=${this._nestTicked.has(step.id)}
                @change=${this._toggleNestStep}
                >${this._l(`nest_step_${step.id}`)}</ha-checkbox
              >
              <p class="note">${this._l(`nest_step_${step.id}_text`)}</p>
              ${
                step.address
                  ? this._renderAddress(this._l("nest_address"), step.address)
                  : nothing
              }
              ${
                step.id === "project_id"
                  ? html`<ha-input
                        .label=${this._l("nest_project")}
                        .value=${this._draft.nestProjectId}
                        .invalid=${projectState === "invalid"}
                        .validationMessage=${this._l("nest_project_invalid")}
                        .hint=${
                          projectState === "valid"
                            ? this._l("nest_project_valid")
                            : this._l("nest_project_hint")
                        }
                        @input=${this._nestProjectChanged}
                      ></ha-input>
                      <ha-button
                        appearance="plain"
                        @click=${this._copyNestProject}
                        >${this._l("copy")}</ha-button
                      >`
                  : nothing
              }
              ${
                step.id === "redirect"
                  ? this._renderAddress(this._l("redirect_label"), redirect)
                  : nothing
              }
              ${
                step.id === "oauth_client"
                  ? html`<ha-textarea
                        .label=${this._l("nest_client_paste")}
                        .value=${this._nestClientText}
                        rows="4"
                        @input=${this._nestClientChanged}
                      ></ha-textarea>
                      ${
                        client && !client.ok
                          ? html`<ha-alert alert-type="error"
                              >${this._clientErrorText(client)}</ha-alert
                            >`
                          : nothing
                      }
                      ${
                        client?.ok
                          ? html`<p role="status">
                              ${this._l("nest_client_ok", {
                                id: client.clientId,
                              })}
                            </p>`
                          : nothing
                      }`
                  : nothing
              }
            </li>`
        )}
      </ol>
    </div>`;
  }

  private _addIntegration(ev: Event): void {
    const domain = (ev.currentTarget as HTMLElement).dataset.domain!;
    showConfigFlowDialog(this, {
      startFlowHandler: domain,
      dialogClosedCallback: () => this._loadStored(),
    });
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/integrations"
        .header=${this._l("title")}
      >
        ${
          this._error
            ? html`<div class="content">
                <ha-alert alert-type="error">${this._error}</ha-alert>
              </div>`
            : !this._status
              ? html`<div class="center">
                  <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
                </div>`
              : this._renderWizard()
        }
      </hass-subpage>
    `;
  }

  private _renderWizard(): TemplateResult {
    return html`
      <div class=${classMap({ content: true, narrow: this.narrow })}>
        <p class="intro">${this._l("intro")}</p>
        ${
          this._restored
            ? html`<ha-alert alert-type="info">
                ${this._l("restored")}
                <ha-button
                  slot="action"
                  appearance="plain"
                  @click=${this._startOver}
                  >${this._l("start_over")}</ha-button
                >
              </ha-alert>`
            : nothing
        }
        <div class="layout">
          ${this._renderRail()}
          <div class="main">${this._renderStep()}${this._renderNav()}</div>
          ${this._renderSummary()}
        </div>
      </div>
    `;
  }

  private _stepDone(step: GoogleSetupStep): boolean {
    switch (step) {
      case "helper":
        return this._draft.helperSkipped || this._enabledCount() > 0;
      case "client":
        return Boolean(this._draft.clientId);
      case "credentials":
        return this._domains.some((domain) => this._hasCredential(domain));
      default:
        return this._domains.some((domain) => this._isConnected(domain));
    }
  }

  private _renderRail(): TemplateResult {
    return html`<ol class="rail" aria-label=${this._l("steps")}>
      ${GOOGLE_SETUP_STEPS.map((step, index) => {
        const current = step === this._draft.step;
        return html`<li>
          <button
            type="button"
            class=${classMap({ stepbtn: true, current })}
            data-step=${step}
            aria-current=${current ? "step" : "false"}
            @click=${this._goTo}
          >
            <ha-svg-icon
              .path=${this._stepDone(step) ? mdiCheckCircle : mdiCircleOutline}
            ></ha-svg-icon>
            <span>${index + 1}. ${this._l(`step_${step}`)}</span>
            ${
              this._stepDone(step)
                ? html`<span class="sr-only">${this._l("done")}</span>`
                : nothing
            }
          </button>
        </li>`;
      })}
    </ol>`;
  }

  private _renderNav(): TemplateResult {
    const index = GOOGLE_SETUP_STEPS.indexOf(this._draft.step);
    return html`<div class="nav">
      ${
        index > 0
          ? html`<ha-button appearance="plain" @click=${this._back}
              >${this._l("back")}</ha-button
            >`
          : nothing
      }
      ${
        index < GOOGLE_SETUP_STEPS.length - 1
          ? html`<ha-button @click=${this._next}>${this._l("next")}</ha-button>`
          : nothing
      }
    </div>`;
  }

  private _renderSummary(): TemplateResult {
    const domains = this._domains;
    return html`<ha-card class="summary" .header=${this._l("summary")}>
      <dl class="card-content">
        <dt>${this._l("step_helper")}</dt>
        <dd>
          ${
            this._enabledCount()
              ? this._l("summary_apis", {
                  count: this._enabledCount(),
                  total: GOOGLE_APIS.length,
                })
              : this._draft.helperSkipped
                ? this._l("summary_skipped")
                : this._l("summary_none")
          }
        </dd>
        <dt>${this._l("step_client")}</dt>
        <dd>
          ${
            this._draft.clientId
              ? html`${this._draft.clientId}<br />${this._l("secret_set")}`
              : this._l("summary_none")
          }
        </dd>
        <dt>${this._l("step_credentials")}</dt>
        <dd>
          ${this._l("summary_credentials", {
            count: domains.filter((domain) => this._hasCredential(domain))
              .length,
            total: domains.length,
          })}
        </dd>
        <dt>${this._l("step_integrations")}</dt>
        <dd>
          ${this._l("summary_connected", {
            count: domains.filter((domain) => this._isConnected(domain)).length,
            total: domains.length,
          })}
        </dd>
      </dl>
      <div class="card-actions">
        <ha-button appearance="plain" @click=${this._startOver}
          >${this._l("start_over")}</ha-button
        >
      </div>
    </ha-card>`;
  }

  private _renderStep(): TemplateResult {
    switch (this._draft.step) {
      case "helper":
        return this._renderHelper();
      case "client":
        return this._renderClient();
      case "credentials":
        return this._renderCredentials();
      default:
        return this._renderIntegrations();
    }
  }

  private _renderHelper(): TemplateResult {
    return html`<section>
      <h2>${this._l("helper_title")}</h2>
      <p class="note">${this._l("helper_text")}</p>
      <ha-file-upload
        accept=".json,application/json"
        .label=${this._l("key_drop")}
        .supports=${this._l("key_supports")}
        @file-picked=${this._keyPicked}
      ></ha-file-upload>
      ${
        this._keyError
          ? html`<ha-alert alert-type="error">${this._keyError}</ha-alert>`
          : nothing
      }
      ${
        this._keyProject
          ? html`<p role="status">
              ${this._l("key_loaded", { project: this._keyProject })}
            </p>`
          : nothing
      }
      <fieldset class="apis">
        <legend>${this._l("choose_apis")}</legend>
        ${GOOGLE_APIS.map((api) => {
          const result = this._apiResults[api.id];
          return html`<div class="api">
            <ha-checkbox
              class="check"
              data-api=${api.id}
              .checked=${this._selectedApis.has(api.id)}
              @change=${this._toggleApi}
              >${this._l(`api_${api.id}`)}</ha-checkbox
            >
            ${
              result
                ? html`<span
                    class=${classMap({
                      result: true,
                      bad: result.state === "error",
                    })}
                    role="status"
                  >
                    <ha-svg-icon
                      .path=${
                        result.state === "enabled"
                          ? mdiCheckCircle
                          : mdiAlertCircle
                      }
                    ></ha-svg-icon>
                    ${
                      result.state === "enabled"
                        ? this._l("api_enabled")
                        : this._l("api_failed", { reason: result.reason ?? "" })
                    }
                  </span>`
                : nothing
            }
            <a
              class="link"
              href=${googleEnableApiUrl(api.service)}
              target="_blank"
              rel="noopener noreferrer"
              >${this._l("open_console")}
              <span class="sr-only">${this._l(`api_${api.id}`)}</span></a
            >
          </div>`;
        })}
      </fieldset>
      ${
        this._enableError
          ? html`<ha-alert alert-type="error">${this._enableError}</ha-alert>`
          : nothing
      }
      <div class="actions">
        <ha-button
          @click=${this._enableApis}
          .disabled=${
            !this._keyText || this._selectedApis.size === 0 || this._enabling
          }
          >${this._enabling ? this._l("enabling") : this._l("enable_apis")}</ha-button
        >
        <ha-button appearance="plain" @click=${this._skipHelper}
          >${this._l("skip_helper")}</ha-button
        >
      </div>
      <p class="note">${this._l("key_privacy")}</p>
    </section>`;
  }

  private _renderClient(): TemplateResult {
    return html`<section>
      <h2>${this._l("client_title")}</h2>
      <p class="note">${this._l("client_text")}</p>
      <ol class="guide">
        <li>
          <a
            class="link"
            href=${GOOGLE_CREDENTIALS_URL}
            target="_blank"
            rel="noopener noreferrer"
            >${this._l("open_credentials")}</a
          >
        </li>
        <li>${this._l("guide_create")}</li>
        <li>${this._l("guide_type")}</li>
        <li>${this._l("guide_redirect")}</li>
        <li>${this._l("guide_download")}</li>
      </ol>
      ${this._renderAddress(this._l("redirect_label"), this._redirectUri)}
      <p class="note">
        ${this._status?.my_link ? this._l("redirect_my") : this._l("redirect_local")}
      </p>
    </section>`;
  }

  private _clientErrorText(client: GoogleClientParse): string {
    return client.ok ? "" : this._l(`client_error_${client.error}`);
  }

  private _renderCredentials(): TemplateResult {
    const client = this._client;
    return html`<section>
      <h2>${this._l("credentials_title")}</h2>
      <p class="note">${this._l("credentials_text")}</p>
      <ha-file-upload
        accept=".json,application/json"
        .label=${this._l("client_drop")}
        .supports=${this._l("client_supports")}
        @file-picked=${this._clientPicked}
      ></ha-file-upload>
      ${
        client && !client.ok
          ? html`<ha-alert alert-type="error"
              >${this._clientErrorText(client)}</ha-alert
            >`
          : nothing
      }
      ${
        client?.ok
          ? html`<dl class="facts" role="status">
                <dt>${this._l("client_id")}</dt>
                <dd>${client.clientId}</dd>
                <dt>${this._l("client_secret")}</dt>
                <dd>${this._l("secret_set")}</dd>
              </dl>
              ${
                client.kind === "installed"
                  ? html`<ha-alert alert-type="warning"
                      >${this._l("client_installed")}</ha-alert
                    >`
                  : nothing
              }`
          : nothing
      }
      <div class="actions">
        <ha-button
          @click=${this._storeCredentials}
          .disabled=${!client?.ok || this._storing || this._domains.length === 0}
          >${this._storing ? this._l("storing") : this._l("store")}</ha-button
        >
      </div>
      <ul class="rows">
        ${this._domains.map((domain) => {
          const message = this._storeResults[domain];
          return html`<li class="row">
            <span class="name">${this._domainName(domain)}</span>
            <span class="detail" role="status">
              ${
                message ||
                (this._hasCredential(domain)
                  ? this._l("credential_stored")
                  : this._l("credential_missing"))
              }
            </span>
          </li>`;
        })}
      </ul>
    </section>`;
  }

  private _renderIntegrations(): TemplateResult {
    return html`<section>
      <h2>${this._l("integrations_title")}</h2>
      <p class="note">${this._l("integrations_text")}</p>
      <ul class="rows">
        ${this._domains.map((domain) => {
          const stored = this._hasCredential(domain);
          const connected = this._isConnected(domain);
          const name = this._domainName(domain);
          return html`<li class="row">
            <span class="text">
              <span class="name">${name}</span>
              <span class="detail">
                ${
                  stored
                    ? this._l("credential_stored")
                    : this._l("credential_missing")
                }
                · ${connected ? this._l("connected") : this._l("not_connected")}
              </span>
            </span>
            <ha-button
              appearance=${connected ? "plain" : "filled"}
              data-domain=${domain}
              .disabled=${!stored}
              @click=${this._addIntegration}
              >${this._l("add")} <span class="sr-only">${name}</span></ha-button
            >
          </li>`;
        })}
      </ul>
      ${
        this._domains.includes("nest")
          ? html`<div class="nest">
              <h3>${this._l("nest_title")}</h3>
              <p class="note">${this._l("nest_text")}</p>
              ${this._renderNestGuidance()}
            </div>`
          : nothing
      }
    </section>`;
  }

  static styles = [
    haStyle,
    css`
      .content {
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4);
        box-sizing: border-box;
      }
      .center {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8);
      }
      .intro,
      .note,
      .detail {
        color: var(--secondary-text-color);
      }
      .layout {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr) 280px;
        gap: var(--ha-space-4);
        align-items: start;
        margin-top: var(--ha-space-4);
      }
      .narrow .layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .rail {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .narrow .rail {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1);
      }
      .stepbtn {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        width: 100%;
        min-height: 44px;
        box-sizing: border-box;
        padding: 0 var(--ha-space-3);
        border: 0;
        border-radius: var(--ha-border-radius-md, 8px);
        background: none;
        color: var(--primary-text-color);
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .stepbtn:hover {
        background: var(--secondary-background-color);
      }
      .stepbtn.current {
        background: var(--secondary-background-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .stepbtn:focus-visible,
      .link:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .main {
        min-width: 0;
      }
      h2 {
        margin-top: 0;
      }
      .nav,
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin: var(--ha-space-4) 0;
      }
      .apis {
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-md, 8px);
        margin: var(--ha-space-4) 0;
        padding: var(--ha-space-2) var(--ha-space-3);
      }
      .api {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
      }
      .check {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        flex: 1;
        min-width: 160px;
        min-height: 44px;
        --ha-checkbox-min-touch-size: 44px;
      }
      .check::part(base) {
        flex: 1;
        min-height: 44px;
        cursor: pointer;
      }
      .link {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: var(--primary-color);
      }
      .result {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1);
        color: var(--success-color);
        overflow-wrap: anywhere;
      }
      .result.bad {
        color: var(--error-color);
      }
      .guide li {
        margin-bottom: var(--ha-space-2);
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .address {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-2);
      }
      .address-text {
        flex: 1 1 220px;
        min-width: 0;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-md);
        background: var(--secondary-background-color);
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
        user-select: all;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
        padding: var(--ha-space-2) 0;
        border-bottom: 1px solid var(--divider-color);
      }
      .text {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .name,
      dd,
      .detail {
        overflow-wrap: anywhere;
      }
      .row .name {
        flex: 1;
      }
      .facts,
      .summary dl {
        margin: 0;
      }
      dt {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      dd {
        margin: 0 0 var(--ha-space-2);
      }
      .nest-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .nest-row ha-input {
        flex: 1;
        min-width: 200px;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-google-setup": HaConfigGoogleSetup;
  }
}
