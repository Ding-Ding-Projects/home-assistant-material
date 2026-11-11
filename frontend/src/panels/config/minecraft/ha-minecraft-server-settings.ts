import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/input/ha-input";
import type {
  MinecraftServer,
  MinecraftServerDraft,
  MinecraftVersionLists,
} from "../../../data/minecraft_manager";
import {
  isMinecraftFailure,
  MINECRAFT_LIMITS,
  minecraftDraftChanged,
  minecraftFieldErrors,
  minecraftServerToDraft,
  parseMinecraftNumber,
  refreshMinecraftVersions,
  updateMinecraftServer,
  validateMinecraftDraft,
  versionsForFlavour,
} from "../../../data/minecraft_manager";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "./ha-minecraft-version-picker";

/** The editable settings of one server, saved through the update command. */
@customElement("ha-minecraft-server-settings")
class HaMinecraftServerSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public server!: MinecraftServer;

  @property({ attribute: false }) public versions?: MinecraftVersionLists;

  @state() private _draft?: MinecraftServerDraft;

  @state() private _serverErrors: Record<string, string> = {};

  @state() private _saving = false;

  @state() private _versions?: MinecraftVersionLists;

  @state() private _versionsBusy = false;

  @state() private _versionsError?: string;

  @state() private _failure?: string;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.${key}` as any,
      values
    );
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("server")) {
      this._draft = minecraftServerToDraft(this.server);
      this._serverErrors = {};
    }
    if (changed.has("versions") && this.versions && !this._versions) {
      this._versions = this.versions;
    }
  }

  private get _localErrors(): Record<string, string> {
    return this._draft
      ? minecraftFieldErrors(validateMinecraftDraft(this._draft))
      : {};
  }

  /** The text for a field: the server's refusal first, then local checks. */
  private _errorFor(field: string): string | undefined {
    const code = this._serverErrors[field] ?? this._localErrors[field];
    if (!code) {
      return undefined;
    }
    if (code === "container_exists") {
      return this._l("detail.rename_refused");
    }
    const range =
      field === "port"
        ? { min: MINECRAFT_LIMITS.portMin, max: MINECRAFT_LIMITS.portMax }
        : field === "memory_mb"
          ? { min: MINECRAFT_LIMITS.memoryMin, max: MINECRAFT_LIMITS.memoryMax }
          : { min: 1, max: MINECRAFT_LIMITS.nameMax };
    return (
      this._l(`error.${code}`, range) ||
      this._l(`op_error.${code}`) ||
      this._l("op_error.unknown")
    );
  }

  private _fieldInput(ev: Event): void {
    if (!this._draft) {
      return;
    }
    const target = ev.target as HTMLInputElement;
    const value = target.value ?? "";
    const field = target.dataset.field;
    if (field === "name") {
      this._draft = { ...this._draft, name: value };
    } else if (field === "port") {
      this._draft = { ...this._draft, port: parseMinecraftNumber(value) };
    } else if (field === "memory_mb") {
      this._draft = { ...this._draft, memory_mb: parseMinecraftNumber(value) };
    }
    if (field) {
      const { [field]: _removed, ...rest } = this._serverErrors;
      this._serverErrors = rest;
    }
  }

  private _versionChanged(ev: CustomEvent<{ value: string }>): void {
    if (!this._draft) {
      return;
    }
    this._draft = { ...this._draft, version: ev.detail.value };
    const { version: _removed, ...rest } = this._serverErrors;
    this._serverErrors = rest;
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

  private _reset(): void {
    this._draft = minecraftServerToDraft(this.server);
    this._serverErrors = {};
    this._failure = undefined;
  }

  private async _save(): Promise<void> {
    const draft = this._draft;
    if (!draft || Object.keys(this._localErrors).length) {
      return;
    }
    this._saving = true;
    this._failure = undefined;
    try {
      const result = await updateMinecraftServer(
        this.hass,
        this.server.id,
        draft
      );
      if (result.saved) {
        this._serverErrors = {};
        showToast(this, { message: this._l("detail.settings_saved") });
        fireEvent(this, "minecraft-server-changed");
      } else {
        this._serverErrors = minecraftFieldErrors(result.errors);
      }
    } catch {
      this._failure = "unknown";
    } finally {
      this._saving = false;
    }
  }

  protected render(): TemplateResult | typeof nothing {
    const draft = this._draft;
    if (!draft) {
      return nothing;
    }
    const changed = minecraftDraftChanged(this.server, draft);
    const invalid = Object.keys(this._localErrors).length > 0;
    return html`
      <p class="detail">${this._l("detail.settings_intro")}</p>
      <div class="grid">
        ${this._renderInput("name", this._l("field.name"), draft.name)}
        ${this._renderInput(
          "port",
          this._l("field.port"),
          draft.port === undefined ? "" : String(draft.port)
        )}
        ${this._renderInput(
          "memory_mb",
          this._l("field.memory"),
          draft.memory_mb === undefined ? "" : String(draft.memory_mb),
          this._l("hint.memory")
        )}
      </div>
      <ha-minecraft-version-picker
        .hass=${this.hass}
        .value=${draft.version}
        .versions=${versionsForFlavour(this._versions, draft.flavour)}
        .fetchedAt=${this._versions?.fetched_at ?? null}
        .busy=${this._versionsBusy}
        .error=${this._versionsError}
        .hint=${this._l("hint.version")}
        .invalidText=${this._errorFor("version")}
        @value-changed=${this._versionChanged}
        @refresh-versions=${this._refreshVersions}
      ></ha-minecraft-version-picker>
      ${
        this._failure
          ? html`<ha-alert alert-type="error"
              >${this._l(`op_error.${this._failure}`)}</ha-alert
            >`
          : nothing
      }
      <p class="detail">${this._l("detail.settings_note")}</p>
      <div class="row">
        <ha-button
          .disabled=${!changed || this._saving}
          appearance="plain"
          @click=${this._reset}
          >${this._l("detail.settings_discard")}</ha-button
        >
        <ha-button
          .disabled=${!changed || invalid || this._saving}
          @click=${this._save}
          >${this._l(this._saving ? "detail.working" : "detail.settings_save")}</ha-button
        >
      </div>
    `;
  }

  private _renderInput(
    field: string,
    label: string,
    value: string,
    hint?: string
  ): TemplateResult {
    const error = this._errorFor(field);
    return html`<ha-input
      data-field=${field}
      .label=${label}
      .value=${value}
      .invalid=${Boolean(error)}
      .hint=${error ?? hint ?? ""}
      @input=${this._fieldInput}
    ></ha-input>`;
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        min-width: 0;
      }
      p {
        margin: 0;
      }
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
        gap: var(--ha-space-3);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--ha-space-2);
      }
      ha-input {
        width: 100%;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-minecraft-server-settings": HaMinecraftServerSettings;
  }
}
