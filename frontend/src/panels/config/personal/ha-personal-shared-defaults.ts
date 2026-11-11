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
import "../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../components/ha-select";
import "../../../components/ha-slider";
import type { HaSlider } from "../../../components/ha-slider";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/setting-info/ha-setting-info";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  FUNNY_LEVEL_MAX,
  FUNNY_LEVEL_MIN,
  VOLUME_MAX,
  VOLUME_MIN,
} from "../../../common/preferences/personal-preferences";
import type { HomeAssistant } from "../../../types";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
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

/** The value of the "not set" choice in a select. */
const UNSET = "__unset";

/** Fields that are a number on a slider; every other field is a select. */
const SLIDERS: Partial<
  Record<SharedDefaultField, { min: number; max: number; step: number }>
> = {
  funnyEnglish: { min: FUNNY_LEVEL_MIN, max: FUNNY_LEVEL_MAX, step: 1 },
  funnyCantonese: { min: FUNNY_LEVEL_MIN, max: FUNNY_LEVEL_MAX, step: 1 },
  soundVolume: { min: VOLUME_MIN, max: VOLUME_MAX, step: 10 },
};

const optionsFor = (field: SharedDefaultField): (string | boolean)[] => {
  switch (field) {
    case "languageMode":
      return [...LANGUAGE_MODES];
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

  /** True when the stored defaults changed elsewhere while edits were open. */
  @state() private _changedElsewhere = false;

  private _lang = new LanguageModeController(this);

  private _unsub?: UnsubscribeFunc;

  public connectedCallback() {
    super.connectedCallback();
    this._stored = getSharedDefaults();
    this._draft = { ...this._stored };
    this._unsub = onSharedDefaultsChanged(() => {
      const wasDirty = this._dirty() && !this._busy;
      this._stored = getSharedDefaults();
      if (wasDirty) {
        // Another administrator, or this one in another tab, changed the
        // defaults: keep the edits in progress and offer to reload instead.
        this._changedElsewhere = true;
      } else {
        this._draft = { ...this._stored };
      }
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

  private _set(field: SharedDefaultField, value: unknown) {
    const next: Record<string, unknown> = { ...this._draft };
    if (value === undefined) {
      delete next[field];
    } else {
      next[field] = value;
    }
    this._draft = next as SharedPreferenceDefaults;
  }

  private _selectChanged = (ev: HaSelectSelectEvent<string>) => {
    ev.stopPropagation();
    const field = (ev.currentTarget as HTMLElement).dataset
      .field as SharedDefaultField;
    const chosen = String(ev.detail.value);
    this._set(
      field,
      chosen === UNSET
        ? undefined
        : optionsFor(field).find((item) => String(item) === chosen)
    );
  };

  private _useDefaultChanged = (ev: Event) => {
    const target = ev.currentTarget as HaSwitch;
    const field = target.dataset.field as SharedDefaultField;
    this._set(
      field,
      target.checked ? DEFAULT_PERSONAL_PREFERENCES[field] : undefined
    );
  };

  private _sliderChanged = (ev: Event) => {
    const target = ev.currentTarget as HaSlider;
    const field = target.dataset.field as SharedDefaultField;
    if (target.value !== undefined && target.value !== null) {
      this._set(field, Number(target.value));
    }
  };

  private _reload = () => {
    this._draft = { ...this._stored };
    this._changedElsewhere = false;
  };

  private _apply = async () => {
    const count = Object.keys(this._draft).length;
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("shared.apply_confirm_title"),
      text: this._t("shared.apply_confirm_text", { count }),
      confirmText: this._t("shared.apply"),
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    this._error = "";
    try {
      await applyPreferenceDefaultsForEveryone(
        this.hass.connection,
        this._draft
      );
      this._changedElsewhere = false;
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
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("shared.remove_confirm_title"),
      text: this._t("shared.remove_confirm_text"),
      confirmText: this._t("shared.remove"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    this._error = "";
    try {
      await removePreferenceDefaultsForEveryone(this.hass.connection);
      this._draft = {};
      this._changedElsewhere = false;
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
          this._changedElsewhere
            ? html`<p class="note" role="status">
                ${this._t("shared.changed_elsewhere")}
                <ha-button
                  appearance="plain"
                  size="small"
                  @click=${this._reload}
                  >${this._t("shared.reload")}</ha-button
                >
              </p>`
            : nothing
        }
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
    const slider = SLIDERS[field];
    return html`<li class="field">
      <div class="field-label">
        <span id=${id}>${label}</span>
        <ha-setting-info
          .hass=${this.hass}
          .label=${label}
          .description=${this._t(`${row}.description`)}
          .reach=${this._t(`shared.reach`)}
          .labels=${this._infoLabels()}
        ></ha-setting-info>
      </div>
      ${
        slider
          ? html`<div class="control">
              <ha-switch
                data-field=${field}
                .checked=${current !== undefined}
                aria-label=${`${label}: ${this._t("shared.use_default")}`}
                @change=${this._useDefaultChanged}
              ></ha-switch>
              <span class="switch-text">${this._t("shared.use_default")}</span>
              <ha-slider
                labeled
                data-field=${field}
                .min=${slider.min}
                .max=${slider.max}
                .step=${slider.step}
                .value=${typeof current === "number" ? current : slider.min}
                .disabled=${current === undefined}
                aria-label=${label}
                @change=${this._sliderChanged}
              ></ha-slider>
              <span class="value"
                >${
                  current === undefined
                    ? this._t("shared.not_set")
                    : String(current)
                }</span
              >
            </div>`
          : html`<ha-select
              class="select"
              data-field=${field}
              aria-label=${label}
              .value=${current === undefined ? UNSET : String(current)}
              .options=${[
                { value: UNSET, label: this._t("shared.not_set") },
                ...optionsFor(field).map((option) => ({
                  value: String(option),
                  label: this._valueText(field, option),
                })),
              ]}
              @selected=${this._selectChanged}
            ></ha-select>`
      }
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
      // The info control fills in the setting name itself.
      button: this._t("info.button", { name: "{name}" }),
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
    .select {
      flex: 1 1 200px;
      min-width: 0;
      max-width: 100%;
    }
    .control {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2) var(--ha-space-3);
      flex: 1 1 260px;
      min-width: 0;
      min-height: 44px;
    }
    .control ha-slider {
      flex: 1 1 160px;
      min-width: 120px;
    }
    .switch-text,
    .value {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .value {
      min-width: 3ch;
      font-variant-numeric: tabular-nums;
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
