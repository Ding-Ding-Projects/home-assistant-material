import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import {
  applyPreferenceDefaultsForEveryone,
  getSharedDefaults,
  onSharedDefaultsChanged,
  removePreferenceDefaultsForEveryone,
  SHARED_DEFAULT_FIELDS,
  type SharedDefaultField,
  type SharedPreferenceDefaults,
} from "../../../common/preferences/shared-preference-defaults";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/setting-info/ha-setting-info";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

/** The row on the Personal page that explains each shareable setting. */
const FIELD_ROW: Record<SharedDefaultField, string> = {
  languageMode: "language_mode",
  funnyEnglish: "funny_english",
  funnyCantonese: "funny_cantonese",
  dialogEmojis: "dialog_emojis",
  soundEffects: "sound_effects",
  soundVolume: "sound_volume",
  lowStimulation: "low_stimulation",
  oneThingAtATime: "one_thing",
  timeAwareness: "time_awareness",
  momentum: "momentum",
};

const LANGUAGE_MODES = ["english", "cantonese", "bilingual"] as const;

const optionsFor = (
  field: SharedDefaultField
): (string | number | boolean)[] => {
  switch (field) {
    case "languageMode":
      return [...LANGUAGE_MODES];
    case "funnyEnglish":
    case "funnyCantonese":
      return [1, 2, 3, 4, 5];
    case "soundVolume":
      return [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    default:
      return [true, false];
  }
};

/**
 * For administrators: defaults for the personal settings that make sense to
 * share, stored for everyone on this instance. They are only defaults. A
 * choice a person made in their own browser always wins, and each row on the
 * Personal page says when it follows the shared default.
 */
@customElement("ha-personal-shared-defaults")
export class HaPersonalSharedDefaults extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The values being edited, not yet applied. */
  @state() private _draft: SharedPreferenceDefaults = {
    ...getSharedDefaults(),
  };

  @state() private _stored: SharedPreferenceDefaults = getSharedDefaults();

  @state() private _busy = false;

  @state() private _error = "";

  private _lang = new LanguageModeController(this);

  private _unsub?: UnsubscribeFunc;

  public connectedCallback() {
    super.connectedCallback();
    this._stored = getSharedDefaults();
    this._draft = { ...this._stored };
    this._unsub = onSharedDefaultsChanged(() => {
      this._stored = getSharedDefaults();
      this._draft = { ...this._stored };
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.personal.${key}`,
      values
    );
  }

  private _valueText(
    field: SharedDefaultField,
    value: string | number | boolean
  ): string {
    if (field === "languageMode") {
      return this._t(`language_mode.${value}`);
    }
    if (typeof value === "boolean") {
      return this._t(value ? "on" : "off");
    }
    return String(value);
  }

  private _dirty(): boolean {
    return JSON.stringify(this._draft) !== JSON.stringify(this._stored);
  }

  private _changed = (ev: Event) => {
    const select = ev.target as HTMLSelectElement;
    const field = select.dataset.field as SharedDefaultField;
    const next: Record<string, unknown> = { ...this._draft };
    if (select.value === "") {
      delete next[field];
    } else {
      const option = optionsFor(field).find(
        (item) => String(item) === select.value
      );
      if (option !== undefined) {
        next[field] = option;
      }
    }
    this._draft = next as SharedPreferenceDefaults;
  };

  private _apply = async () => {
    this._busy = true;
    this._error = "";
    try {
      await applyPreferenceDefaultsForEveryone(
        this.hass.connection,
        this._draft
      );
      showToast(this, { message: this._t("shared.applied") });
    } catch (err) {
      this._error = this._t("shared.failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this._busy = false;
    }
  };

  private _remove = async () => {
    this._busy = true;
    this._error = "";
    try {
      await removePreferenceDefaultsForEveryone(this.hass.connection);
      showToast(this, { message: this._t("shared.removed") });
    } catch (err) {
      this._error = this._t("shared.failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this._busy = false;
    }
  };

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass?.user?.is_admin) {
      return nothing;
    }
    const hasShared = Object.keys(this._stored).length > 0;
    return html`<ha-card .header=${this._t("shared.title")}>
      <div class="card-content">
        <p class="note">${this._t("shared.note")}</p>
        <ul class="fields">
          ${SHARED_DEFAULT_FIELDS.map((field) => this._renderField(field))}
        </ul>
        ${
          this._error
            ? html`<p class="problem" role="alert">${this._error}</p>`
            : nothing
        }
        <div class="actions">
          <ha-button
            appearance="filled"
            .disabled=${this._busy || !this._dirty()}
            @click=${this._apply}
            >${this._t("shared.apply")}</ha-button
          >
          <ha-button
            appearance="plain"
            variant="danger"
            .disabled=${this._busy || !hasShared}
            @click=${this._remove}
            >${this._t("shared.remove")}</ha-button
          >
        </div>
      </div>
    </ha-card>`;
  }

  private _renderField(field: SharedDefaultField): TemplateResult {
    const row = FIELD_ROW[field];
    const label = this._t(`${row}.label`);
    const current = this._draft[field];
    const id = `shared-${field}`;
    const stored = this._stored[field];
    return html`<li class="field">
      <div class="field-label">
        <label for=${id}>${label}</label>
        <ha-setting-info
          .hass=${this.hass}
          .label=${label}
          .description=${this._t(`${row}.description`)}
          .reach=${this._t(`shared.reach`)}
          .labels=${this._infoLabels()}
        ></ha-setting-info>
      </div>
      <select id=${id} data-field=${field} @change=${this._changed}>
        <option value="" ?selected=${current === undefined}>
          ${this._t("shared.not_set")}
        </option>
        ${optionsFor(field).map(
          (option) =>
            html`<option
              value=${String(option)}
              ?selected=${current === option}
            >
              ${this._valueText(field, option)}
            </option>`
        )}
      </select>
      <span class="state">
        ${
          stored === undefined
            ? this._t("shared.current_none")
            : this._t("shared.current", {
                value: this._valueText(field, stored),
              })
        }
      </span>
    </li>`;
  }

  private _infoLabels() {
    return {
      button: this._t("info.button"),
      close: this._t("info.close"),
      what: this._t("info.what"),
      defaultValue: this._t("info.default"),
      reach: this._t("info.reach"),
      holding: this._t("info.holding"),
      holdingNothing: this._t("info.holding_nothing"),
      openHelp: this._t("info.open_help"),
    };
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .note {
      margin: 0 0 var(--ha-space-3);
      color: var(--secondary-text-color);
      white-space: pre-line;
    }
    .fields {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .field {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-1) var(--ha-space-3);
      padding: var(--ha-space-1) 0;
      border-top: 1px solid var(--divider-color);
    }
    .field-label {
      display: flex;
      align-items: center;
      flex: 1 1 180px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    select {
      min-height: 44px;
      min-width: 0;
      max-width: 100%;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 0 var(--ha-space-2);
    }
    select:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .state {
      flex-basis: 100%;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .problem {
      color: var(--error-color);
      margin: var(--ha-space-2) 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-3);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-personal-shared-defaults": HaPersonalSharedDefaults;
  }
}
