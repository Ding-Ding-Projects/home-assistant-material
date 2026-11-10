import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  ACCESSIBILITY_STORAGE_KEY,
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../../../common/accessibility/accessibility-tools";
import { getStorage } from "../../../common/decorators/storage";
import type { HASSDomTargetEvent } from "../../../common/dom/fire_event";
import type {
  LanguageMode,
  PersonalPreferences,
} from "../../../common/preferences/personal-preferences";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  FUNNY_LEVEL_MAX,
  FUNNY_LEVEL_MIN,
  getPersonalPreferences,
  initPersonalPreferences,
  LANGUAGE_MODES,
  resetPersonalPreferences,
  subscribePersonalPreferences,
  updatePersonalPreferences,
  VOLUME_MAX,
  VOLUME_MIN,
} from "../../../common/preferences/personal-preferences";
import { searchMatcher } from "../../../common/regex/filter";
import {
  playActionCue,
  silenceReason,
} from "../../../common/sound/action-sound";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-slider";
import "../../../components/ha-switch";
import "../../../components/ha-button-toggle-group";
import type { HaSlider } from "../../../components/ha-slider";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

type GroupId = "language" | "sound" | "attention";

interface Row {
  id: string;
  group: GroupId;
  label: string;
  description: string;
  defaultText: string;
  /** Says what the setting reaches today; never claims more. */
  reach: string;
  /** True when something in the app reads the setting now. */
  active: boolean;
  control: TemplateResult;
  isDefault: boolean;
  reset: () => void;
}

const GROUPS: GroupId[] = ["language", "sound", "attention"];

/**
 * Personal settings: the choices that belong to one person in this browser,
 * grouped by what they are for. Each control says what it does and what its
 * default is, has its own reset, and is saved at once.
 */
@customElement("ha-config-section-personal")
export class HaConfigSectionPersonal extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _filter = "";

  @state() private _prefs: PersonalPreferences = getPersonalPreferences();

  @state() private _reduceMotion = getAccessibilitySettings().reduceMotion;

  private _unsubs: UnsubscribeFunc[] = [];

  public connectedCallback() {
    super.connectedCallback();
    initPersonalPreferences();
    this._prefs = getPersonalPreferences();
    this._reduceMotion = getAccessibilitySettings().reduceMotion;
    this._unsubs = [
      subscribePersonalPreferences((prefs) => {
        this._prefs = prefs;
      }),
      subscribeAccessibilitySettings((settings) => {
        this._reduceMotion = settings.reduceMotion;
      }),
    ];
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs = [];
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.personal.${key}` as any,
      values as any
    );
  }

  private _rows(): Row[] {
    const p = this._prefs;
    const d = DEFAULT_PERSONAL_PREFERENCES;
    const modeButtons = LANGUAGE_MODES.map((mode) => ({
      value: mode,
      label: this._t(`language_mode.${mode}`),
    }));
    const silence = silenceReason(p);
    const slider = (
      value: number,
      min: number,
      max: number,
      label: string,
      onChange: (ev: Event) => void,
      disabled = false
    ) =>
      html`<ha-slider
        labeled
        .min=${min}
        .max=${max}
        .step=${1}
        .value=${value}
        .disabled=${disabled}
        aria-label=${label}
        @change=${onChange}
      ></ha-slider>`;
    const toggle = (
      checked: boolean,
      label: string,
      onChange: (ev: HASSDomTargetEvent<HaSwitch>) => void
    ) =>
      html`<ha-switch
        .checked=${checked}
        aria-label=${label}
        @change=${onChange}
      ></ha-switch>`;

    return [
      {
        id: "language_mode",
        group: "language",
        label: this._t("language_mode.label"),
        description: this._t("language_mode.description"),
        defaultText: this._t("language_mode.default"),
        reach: this._t("language_mode.reach"),
        active: true,
        isDefault: p.languageMode === d.languageMode,
        reset: () => this._change({ languageMode: d.languageMode }, "reset"),
        control: html`<ha-button-toggle-group
          .buttons=${modeButtons}
          .active=${p.languageMode}
          @value-changed=${this._languageModeChanged}
        ></ha-button-toggle-group>`,
      },
      {
        id: "funny_english",
        group: "language",
        label: this._t("funny_english.label"),
        description: this._t("funny_english.description"),
        defaultText: this._t("funny_english.default"),
        reach: this._t("funny_english.reach"),
        active: true,
        isDefault: p.funnyEnglish === d.funnyEnglish,
        reset: () => this._change({ funnyEnglish: d.funnyEnglish }, "reset"),
        control: slider(
          p.funnyEnglish,
          FUNNY_LEVEL_MIN,
          FUNNY_LEVEL_MAX,
          this._t("funny_english.label"),
          (ev) =>
            this._change({ funnyEnglish: (ev.target as HaSlider).value ?? 5 })
        ),
      },
      {
        id: "funny_cantonese",
        group: "language",
        label: this._t("funny_cantonese.label"),
        description: this._t("funny_cantonese.description"),
        defaultText: this._t("funny_cantonese.default"),
        reach: this._t("funny_cantonese.reach"),
        active: true,
        isDefault: p.funnyCantonese === d.funnyCantonese,
        reset: () =>
          this._change({ funnyCantonese: d.funnyCantonese }, "reset"),
        control: slider(
          p.funnyCantonese,
          FUNNY_LEVEL_MIN,
          FUNNY_LEVEL_MAX,
          this._t("funny_cantonese.label"),
          (ev) =>
            this._change({
              funnyCantonese: (ev.target as HaSlider).value ?? 5,
            })
        ),
      },
      {
        id: "sound_effects",
        group: "sound",
        label: this._t("sound_effects.label"),
        description: this._t("sound_effects.description"),
        defaultText: this._t("sound_effects.default"),
        reach: this._t("sound_effects.reach"),
        active: true,
        isDefault: p.soundEffects === d.soundEffects,
        reset: () => this._change({ soundEffects: d.soundEffects }, "reset"),
        control: html`${toggle(
            p.soundEffects,
            this._t("sound_effects.label"),
            (ev) =>
              this._change(
                { soundEffects: ev.target.checked },
                ev.target.checked ? "toggle-on" : undefined
              )
          )}
          <ha-button appearance="plain" size="small" @click=${this._playSample}
            >${this._t("sound_effects.try")}</ha-button
          >
          ${
            silence
              ? html`<span class="silent" role="status"
                  >${this._t(`sound_effects.silent.${silence}`)}</span
                >`
              : nothing
          }`,
      },
      {
        id: "sound_volume",
        group: "sound",
        label: this._t("sound_volume.label"),
        description: this._t("sound_volume.description"),
        defaultText: this._t("sound_volume.default"),
        reach: this._t("sound_volume.reach"),
        active: true,
        isDefault: p.soundVolume === d.soundVolume,
        reset: () => this._change({ soundVolume: d.soundVolume }, "reset"),
        control: slider(
          p.soundVolume,
          VOLUME_MIN,
          VOLUME_MAX,
          this._t("sound_volume.label"),
          (ev) =>
            this._change(
              { soundVolume: (ev.target as HaSlider).value ?? d.soundVolume },
              "sample"
            ),
          !p.soundEffects
        ),
      },
      {
        id: "reduce_motion",
        group: "attention",
        label: this._t("reduce_motion.label"),
        description: this._t("reduce_motion.description"),
        defaultText: this._t("reduce_motion.default"),
        reach: this._t("reduce_motion.reach"),
        active: true,
        isDefault: !this._reduceMotion,
        reset: () => this._setReduceMotion(false),
        control: toggle(
          this._reduceMotion,
          this._t("reduce_motion.label"),
          (ev) => this._setReduceMotion(ev.target.checked)
        ),
      },
      {
        id: "low_stimulation",
        group: "attention",
        label: this._t("low_stimulation.label"),
        description: this._t("low_stimulation.description"),
        defaultText: this._t("low_stimulation.default"),
        reach: this._t("low_stimulation.reach"),
        active: true,
        isDefault: p.lowStimulation === d.lowStimulation,
        reset: () => this._change({ lowStimulation: d.lowStimulation }),
        control: toggle(
          p.lowStimulation,
          this._t("low_stimulation.label"),
          (ev) => this._change({ lowStimulation: ev.target.checked })
        ),
      },
      {
        id: "focus_spotlight",
        group: "attention",
        label: this._t("focus_spotlight.label"),
        description: this._t("focus_spotlight.description"),
        defaultText: this._t("focus_spotlight.default"),
        reach: this._t("focus_spotlight.reach"),
        active: true,
        isDefault: p.focusSpotlight === d.focusSpotlight,
        reset: () => this._change({ focusSpotlight: d.focusSpotlight }),
        control: toggle(
          p.focusSpotlight,
          this._t("focus_spotlight.label"),
          (ev) => this._change({ focusSpotlight: ev.target.checked })
        ),
      },
    ];
  }

  protected render(): TemplateResult {
    const matches = searchMatcher(this._filter);
    const rows = this._rows().filter((row) =>
      matches(row.label, row.description, row.reach, row.defaultText)
    );
    const searchLabel = this._t("search");
    return html`
      <hass-subpage
        back-path="/config"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this._t("caption")}
      >
        <div class="content">
          <p class="intro">${this._t("intro")}</p>
          <ha-input-search
            class="search"
            appearance="outlined"
            .placeholder=${searchLabel}
            .accessibleLabel=${searchLabel}
            .value=${this._filter}
            @input=${this._filterChanged}
          ></ha-input-search>
          ${
            rows.length
              ? GROUPS.map((group) => this._renderGroup(group, rows))
              : html`<p class="empty" role="status">
                  ${this._t("search_empty")}
                </p>`
          }
          ${this._renderPreview()}
          <div class="reset-all">
            <ha-button
              appearance="plain"
              variant="danger"
              @click=${this._resetAll}
              >${this._t("reset_all")}</ha-button
            >
            <span class="hint">${this._t("reset_all_note")}</span>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderGroup(group: GroupId, rows: Row[]): TemplateResult | symbol {
    const inGroup = rows.filter((row) => row.group === group);
    if (!inGroup.length) {
      return nothing;
    }
    return html`
      <ha-card .header=${this._t(`group.${group}.title`)}>
        <div class="card-content">
          <p class="group-note">${this._t(`group.${group}.note`)}</p>
          ${inGroup.map((row) => this._renderRow(row))}
        </div>
      </ha-card>
    `;
  }

  private _renderRow(row: Row): TemplateResult {
    return html`
      <div class="row" id=${row.id}>
        <div class="row-text">
          <span class="row-label">${row.label}</span>
          <span class="row-description">${row.description}</span>
          <span class="row-default"
            >${this._t("default_prefix")} ${row.defaultText}</span
          >
          <span class=${classMap({ reach: true, inactive: !row.active })}
            >${row.reach}</span
          >
        </div>
        <div class="row-control">${row.control}</div>
        <ha-button
          class="row-reset"
          appearance="plain"
          size="small"
          .disabled=${row.isDefault}
          aria-label=${`${this._t("reset")}: ${row.label}`}
          @click=${row.reset}
          >${this._t("reset")}</ha-button
        >
      </div>
    `;
  }

  private _renderPreview(): TemplateResult {
    const p = this._prefs;
    const show = (language: "en" | "yue", level: number) =>
      this._t(`preview.${language}.level_${level}`);
    const lines =
      p.languageMode === "english"
        ? [show("en", p.funnyEnglish)]
        : p.languageMode === "cantonese"
          ? [show("yue", p.funnyCantonese)]
          : [show("en", p.funnyEnglish), show("yue", p.funnyCantonese)];
    return html`
      <ha-card .header=${this._t("preview.title")}>
        <div class="card-content">
          <p class="group-note">${this._t("preview.note")}</p>
          <div class="preview" role="status" aria-live="polite">
            ${lines.map(
              (line, index) =>
                html`<p
                  lang=${
                    p.languageMode === "cantonese" ||
                    (p.languageMode === "bilingual" && index === 1)
                      ? "yue-Hant-HK"
                      : "en"
                  }
                >
                  ${line}
                </p>`
            )}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _change(
    change: Partial<PersonalPreferences>,
    cue?: "toggle-on" | "reset" | "sample"
  ) {
    this._prefs = updatePersonalPreferences(change);
    if (cue) {
      playActionCue(cue);
    }
  }

  private _languageModeChanged = (ev: CustomEvent<{ value: string }>) => {
    this._change({ languageMode: ev.detail.value as LanguageMode });
  };

  private _playSample = () => {
    playActionCue("sample");
  };

  /** Reduce motion belongs to the accessibility tools; this writes the same choice. */
  private _setReduceMotion(value: boolean) {
    const storage = getStorage();
    storage.setValue(ACCESSIBILITY_STORAGE_KEY, {
      ...getAccessibilitySettings(),
      reduceMotion: value,
    });
    this._reduceMotion = value;
  }

  private _resetAll = () => {
    this._prefs = resetPersonalPreferences();
    this._setReduceMotion(false);
    playActionCue("reset");
  };

  static styles: CSSResultGroup = css`
    .content {
      padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-8);
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      box-sizing: border-box;
    }
    .intro,
    .group-note,
    .empty {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--ha-space-2) var(--ha-space-4);
      padding: var(--ha-space-3) 0;
      border-top: 1px solid var(--divider-color);
      align-items: center;
    }
    .row-text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
      grid-column: 1 / -1;
    }
    .row-label {
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    .row-description,
    .row-default,
    .reach {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .reach.inactive {
      color: var(--warning-color);
    }
    .row-control {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      min-width: 0;
    }
    .row-control ha-slider {
      min-width: 160px;
      flex: 1 1 160px;
    }
    .row-reset {
      justify-self: end;
    }
    .silent {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .preview p {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
      overflow-wrap: anywhere;
    }
    .reset-all {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-personal": HaConfigSectionPersonal;
  }
}
