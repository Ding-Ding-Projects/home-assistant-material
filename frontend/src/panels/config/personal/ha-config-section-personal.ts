import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { mdiDotsVertical } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  ACCESSIBILITY_STORAGE_KEY,
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../../../common/accessibility/accessibility-tools";
import { getStorage } from "../../../common/decorators/storage";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import {
  listVoices,
  narrator,
  onVoicesChanged,
  speechAvailable,
} from "../../../common/narration/narrator";
import type { SpeechLanguage } from "../../../common/narration/narration";
import {
  narratorSilence,
  voicesFor,
} from "../../../common/narration/narration";
import type { HASSDomTargetEvent } from "../../../common/dom/fire_event";
import type {
  LanguageMode,
  NarratorSpeakIn,
  PersonalPreferences,
} from "../../../common/preferences/personal-preferences";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  FUNNY_LEVEL_MAX,
  FUNNY_LEVEL_MIN,
  getPersonalPreferences,
  initPersonalPreferences,
  LANGUAGE_MODES,
  NARRATOR_PITCH_MAX,
  NARRATOR_PITCH_MIN,
  NARRATOR_RATE_MAX,
  NARRATOR_RATE_MIN,
  NARRATOR_SPEAK_IN,
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
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-slider";
import "../../../components/ha-switch";
import "../../../components/ha-button-toggle-group";
import type { HaSlider } from "../../../components/ha-slider";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

type GroupId = "language" | "sound" | "attention" | "narrator";

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
  /** The current value as words, for the reset-all listing. */
  valueText: string;
  control: TemplateResult;
  isDefault: boolean;
  reset: () => void;
}

const GROUPS: GroupId[] = ["language", "sound", "attention", "narrator"];

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

  @state() private _open = new Set<string>();

  @state() private _prefs: PersonalPreferences = getPersonalPreferences();

  @state() private _reduceMotion = getAccessibilitySettings().reduceMotion;

  @state() private _voices: SpeechSynthesisVoice[] = [];

  private _lang = new LanguageModeController(this);

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
      onVoicesChanged(() => {
        this._voices = listVoices();
      }),
    ];
    this._voices = listVoices();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs = [];
  }

  /** Short text: both languages share a line, joined by a dot. */
  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.personal.${key}`,
      values
    );
  }

  /** Longer text: both languages, one under the other. */
  private _tl(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.personal.${key}`,
      values,
      "\n"
    );
  }

  private _onOff(value: boolean): string {
    return this._t(value ? "on" : "off");
  }

  private _renderQuietHours(p: PersonalPreferences): TemplateResult {
    const label = this._t("quiet_hours.label");
    const dayName = (day: number) =>
      new Date(2024, 0, 7 + day).toLocaleDateString(
        this.hass.locale?.language,
        { weekday: "short" }
      );
    return html`<ha-switch
        .checked=${p.quietHours}
        aria-label=${label}
        @change=${this._quietSwitch}
      ></ha-switch>
      ${
        p.quietHours
          ? html`<div class="quiet">
              <label
                >${this._t("quiet_hours.from")}
                <input
                  type="time"
                  .value=${p.quietFrom}
                  data-key="quietFrom"
                  @change=${this._quietTime}
                />
              </label>
              <label
                >${this._t("quiet_hours.to")}
                <input
                  type="time"
                  .value=${p.quietTo}
                  data-key="quietTo"
                  @change=${this._quietTime}
                />
              </label>
              <div
                class="days"
                role="group"
                aria-label=${this._t("quiet_hours.days")}
              >
                ${[1, 2, 3, 4, 5, 6, 0].map(
                  (day) =>
                    html`<button
                      type="button"
                      class=${classMap({
                        day: true,
                        selected: p.quietDays.includes(day),
                      })}
                      aria-pressed=${p.quietDays.includes(day) ? "true" : "false"}
                      data-day=${day}
                      @click=${this._toggleQuietDay}
                    >
                      ${dayName(day)}
                    </button>`
                )}
              </div>
            </div>`
          : nothing
      }`;
  }

  private _quietSwitch = (ev: HASSDomTargetEvent<HaSwitch>) => {
    this._change({ quietHours: ev.target.checked });
  };

  private _quietTime = (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    if (input.value) {
      this._change({ [input.dataset.key as string]: input.value });
    }
  };

  private _toggleQuietDay = (ev: Event) => {
    const day = Number((ev.currentTarget as HTMLElement).dataset.day);
    const days = this._prefs.quietDays;
    this._change({
      quietDays: days.includes(day)
        ? days.filter((item) => item !== day)
        : [...days, day],
    });
  };

  private _rows(): Row[] {
    const p = this._prefs;
    const d = DEFAULT_PERSONAL_PREFERENCES;
    const modeButtons = LANGUAGE_MODES.map((mode) => ({
      value: mode,
      label: this._t(`language_mode.${mode}`),
    }));
    const silence = silenceReason(p);
    const narrationSilence = narratorSilence(p);
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
        description: this._tl("language_mode.description"),
        defaultText: this._t("language_mode.default"),
        reach: this._tl("language_mode.reach"),
        active: true,
        valueText: this._t(`language_mode.${p.languageMode}`),
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
        description: this._tl("funny_english.description"),
        defaultText: this._t("funny_english.default"),
        reach: this._tl("funny_english.reach"),
        active: false,
        valueText: String(p.funnyEnglish),
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
        description: this._tl("funny_cantonese.description"),
        defaultText: this._t("funny_cantonese.default"),
        reach: this._tl("funny_cantonese.reach"),
        active: false,
        valueText: String(p.funnyCantonese),
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
        description: this._tl("sound_effects.description"),
        defaultText: this._t("sound_effects.default"),
        reach: this._tl("sound_effects.reach"),
        active: true,
        valueText: this._onOff(p.soundEffects),
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
        id: "quiet_hours",
        group: "sound",
        label: this._t("quiet_hours.label"),
        description: this._tl("quiet_hours.description"),
        defaultText: this._t("quiet_hours.default"),
        reach: this._tl("quiet_hours.reach"),
        active: true,
        valueText: p.quietHours
          ? this._t("quiet_hours.value", {
              from: p.quietFrom,
              to: p.quietTo,
            })
          : this._onOff(false),
        isDefault:
          p.quietHours === d.quietHours &&
          p.quietFrom === d.quietFrom &&
          p.quietTo === d.quietTo &&
          p.quietDays.join() === d.quietDays.join(),
        reset: () =>
          this._change({
            quietHours: d.quietHours,
            quietFrom: d.quietFrom,
            quietTo: d.quietTo,
            quietDays: d.quietDays,
          }),
        control: this._renderQuietHours(p),
      },
      {
        id: "sound_volume",
        group: "sound",
        label: this._t("sound_volume.label"),
        description: this._tl("sound_volume.description"),
        defaultText: this._t("sound_volume.default"),
        reach: this._tl("sound_volume.reach"),
        active: true,
        valueText: String(p.soundVolume),
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
        description: this._tl("reduce_motion.description"),
        defaultText: this._t("reduce_motion.default"),
        reach: this._tl("reduce_motion.reach"),
        active: true,
        valueText: this._onOff(this._reduceMotion),
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
        description: this._tl("low_stimulation.description"),
        defaultText: this._t("low_stimulation.default"),
        reach: this._tl("low_stimulation.reach"),
        active: true,
        valueText: this._onOff(p.lowStimulation),
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
        description: this._tl("focus_spotlight.description"),
        defaultText: this._t("focus_spotlight.default"),
        reach: this._tl("focus_spotlight.reach"),
        active: true,
        valueText: this._onOff(p.focusSpotlight),
        isDefault: p.focusSpotlight === d.focusSpotlight,
        reset: () => this._change({ focusSpotlight: d.focusSpotlight }),
        control: toggle(
          p.focusSpotlight,
          this._t("focus_spotlight.label"),
          (ev) => this._change({ focusSpotlight: ev.target.checked })
        ),
      },
      {
        id: "time_awareness",
        group: "attention",
        label: this._t("time_awareness.label"),
        description: this._tl("time_awareness.description"),
        defaultText: this._t("time_awareness.default"),
        reach: this._tl("time_awareness.reach"),
        active: true,
        valueText: this._onOff(p.timeAwareness),
        isDefault: p.timeAwareness === d.timeAwareness,
        reset: () => this._change({ timeAwareness: d.timeAwareness }),
        control: toggle(
          p.timeAwareness,
          this._t("time_awareness.label"),
          (ev) => this._change({ timeAwareness: ev.target.checked })
        ),
      },
      {
        id: "momentum",
        group: "attention",
        label: this._t("momentum.label"),
        description: this._tl("momentum.description"),
        defaultText: this._t("momentum.default"),
        reach: this._tl("momentum.reach"),
        active: true,
        valueText: this._onOff(p.momentum),
        isDefault: p.momentum === d.momentum,
        reset: () => this._change({ momentum: d.momentum }),
        control: toggle(p.momentum, this._t("momentum.label"), (ev) =>
          this._change({ momentum: ev.target.checked })
        ),
      },
      {
        id: "narrator_enabled",
        group: "narrator",
        label: this._t("narrator_enabled.label"),
        description: this._tl("narrator_enabled.description"),
        defaultText: this._t("narrator_enabled.default"),
        reach: this._tl("narrator_enabled.reach"),
        active: speechAvailable(),
        valueText: this._onOff(p.narratorEnabled),
        isDefault: p.narratorEnabled === d.narratorEnabled,
        reset: () => this._change({ narratorEnabled: d.narratorEnabled }),
        control: html`${toggle(
          p.narratorEnabled,
          this._t("narrator_enabled.label"),
          (ev) => this._change({ narratorEnabled: ev.target.checked })
        )}
        ${
          speechAvailable()
            ? nothing
            : html`<span class="silent" role="status"
                >${this._t("narrator_enabled.unavailable")}</span
              >`
        }
        ${
          narrationSilence
            ? html`<span class="silent" role="status"
                >${this._t(`narrator_enabled.silent.${narrationSilence}`)}</span
              >`
            : nothing
        }`,
      },
      {
        id: "narrator_speak_in",
        group: "narrator",
        label: this._t("narrator_speak_in.label"),
        description: this._tl("narrator_speak_in.description"),
        defaultText: this._t("narrator_speak_in.default"),
        reach: this._tl("narrator_speak_in.reach"),
        active: true,
        valueText: this._t(`narrator_speak_in.${p.narratorSpeakIn}`),
        isDefault: p.narratorSpeakIn === d.narratorSpeakIn,
        reset: () => this._change({ narratorSpeakIn: d.narratorSpeakIn }),
        control: html`<ha-button-toggle-group
          .buttons=${NARRATOR_SPEAK_IN.map((value) => ({
            value,
            label: this._t(`narrator_speak_in.${value}`),
          }))}
          .active=${p.narratorSpeakIn}
          @value-changed=${this._speakInChanged}
        ></ha-button-toggle-group>`,
      },
      {
        id: "narrator_voice_english",
        group: "narrator",
        label: this._t("narrator_voice_english.label"),
        description: this._tl("narrator_voice_english.description"),
        defaultText: this._t("narrator_voice_english.default"),
        reach: this._tl("narrator_voice_english.reach"),
        active: true,
        valueText: p.narratorVoiceEnglish || this._t("voice_auto"),
        isDefault: p.narratorVoiceEnglish === d.narratorVoiceEnglish,
        reset: () =>
          this._change({ narratorVoiceEnglish: d.narratorVoiceEnglish }),
        control: this._renderVoicePicker("en", p.narratorVoiceEnglish),
      },
      {
        id: "narrator_voice_cantonese",
        group: "narrator",
        label: this._t("narrator_voice_cantonese.label"),
        description: this._tl("narrator_voice_cantonese.description"),
        defaultText: this._t("narrator_voice_cantonese.default"),
        reach: this._tl("narrator_voice_cantonese.reach"),
        active: true,
        valueText: p.narratorVoiceCantonese || this._t("voice_auto"),
        isDefault: p.narratorVoiceCantonese === d.narratorVoiceCantonese,
        reset: () =>
          this._change({ narratorVoiceCantonese: d.narratorVoiceCantonese }),
        control: this._renderVoicePicker("yue", p.narratorVoiceCantonese),
      },
      {
        id: "narrator_rate",
        group: "narrator",
        label: this._t("narrator_rate.label"),
        description: this._tl("narrator_rate.description"),
        defaultText: this._t("narrator_rate.default"),
        reach: this._tl("narrator_rate.reach"),
        active: true,
        valueText: `${p.narratorRate}x`,
        isDefault: p.narratorRate === d.narratorRate,
        reset: () => this._change({ narratorRate: d.narratorRate }),
        control: html`<ha-slider
            labeled
            .min=${NARRATOR_RATE_MIN}
            .max=${NARRATOR_RATE_MAX}
            .step=${0.1}
            .value=${p.narratorRate}
            aria-label=${this._t("narrator_rate.label")}
            @change=${this._rateChanged}
          ></ha-slider
          ><span class="value">${p.narratorRate}x</span>`,
      },
      {
        id: "narrator_pitch",
        group: "narrator",
        label: this._t("narrator_pitch.label"),
        description: this._tl("narrator_pitch.description"),
        defaultText: this._t("narrator_pitch.default"),
        reach: this._tl("narrator_pitch.reach"),
        active: true,
        valueText: String(p.narratorPitch),
        isDefault: p.narratorPitch === d.narratorPitch,
        reset: () => this._change({ narratorPitch: d.narratorPitch }),
        control: html`<ha-slider
            labeled
            .min=${NARRATOR_PITCH_MIN}
            .max=${NARRATOR_PITCH_MAX}
            .step=${0.1}
            .value=${p.narratorPitch}
            aria-label=${this._t("narrator_pitch.label")}
            @change=${this._pitchChanged}
          ></ha-slider
          ><span class="value">${p.narratorPitch}</span>`,
      },
      {
        id: "narrator_sample",
        group: "narrator",
        label: this._t("narrator_sample.label"),
        description: this._tl("narrator_sample.description"),
        defaultText: this._t("narrator_sample.default"),
        reach: this._tl("narrator_sample.reach"),
        active: speechAvailable(),
        valueText: this._t("narrator_sample.label"),
        isDefault: true,
        reset: () => undefined,
        control: html`<ha-button
          appearance="plain"
          size="small"
          .disabled=${!speechAvailable()}
          @click=${this._hearSample}
          >${this._t("narrator_sample.label")}</ha-button
        >`,
      },
    ];
  }

  protected render(): TemplateResult {
    const matches = searchMatcher(this._filter);
    const rows = this._rows().filter((row) =>
      matches(row.label, row.description, row.reach, row.defaultText)
    );
    const searching = this._filter.trim() !== "";
    const searchLabel = this._t("search");
    const groups = GROUPS.filter((group) =>
      rows.some((row) => row.group === group)
    );
    return html`
      <hass-subpage
        back-path="/config"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this._t("caption")}
      >
        <ha-dropdown slot="toolbar-icon" @wa-select=${this._handleMenu}>
          <ha-icon-button
            slot="trigger"
            .label=${this._t("more")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>
          <ha-dropdown-item value="reset_all"
            >${this._t("reset_all")}</ha-dropdown-item
          >
        </ha-dropdown>
        <div class=${classMap({ content: true, narrow: this.narrow })}>
          <p class="intro">${this._tl("intro")}</p>
          <ha-input-search
            class="search"
            appearance="outlined"
            .placeholder=${searchLabel}
            .accessibleLabel=${searchLabel}
            .value=${this._filter}
            @input=${this._filterChanged}
          ></ha-input-search>
          ${
            searching
              ? html`<p class="count" role="status">
                  ${this._t("search_count", { count: rows.length })}
                </p>`
              : nothing
          }
          <div class="layout">
            <div class="pin">
              ${
                groups.length
                  ? html`<nav
                      class="groups"
                      aria-label=${this._t("groups_label")}
                    >
                      ${groups.map(
                        (group) =>
                          html`<button
                            type="button"
                            class="group-link"
                            data-group=${group}
                            @click=${this._scrollToGroup}
                          >
                            ${this._t(
                              `group.${group}.${this.narrow ? "chip" : "title"}`
                            )}
                          </button>`
                      )}
                    </nav>`
                  : nothing
              }
              ${this._renderPreview()}
            </div>
            <div class="groups-list">
              ${
                rows.length
                  ? GROUPS.map((group) =>
                      this._renderGroup(group, rows, searching)
                    )
                  : html`<p class="empty" role="status">
                      ${this._t("search_empty", { query: this._filter.trim() })}
                    </p>`
              }
            </div>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderGroup(
    group: GroupId,
    rows: Row[],
    searching: boolean
  ): TemplateResult | symbol {
    const inGroup = rows.filter((row) => row.group === group);
    if (!inGroup.length) {
      return nothing;
    }
    return html`
      <ha-card
        id=${`group-${group}`}
        .header=${this._t(`group.${group}.title`)}
      >
        <div class="card-content">
          <p class="group-note">${this._tl(`group.${group}.note`)}</p>
          ${inGroup.map((row) => this._renderRow(row, searching))}
        </div>
      </ha-card>
    `;
  }

  private _renderRow(row: Row, searching: boolean): TemplateResult {
    const open = this._open.has(row.id);
    return html`
      <div class="row" id=${row.id}>
        <div class="row-main">
          <button
            type="button"
            class="row-label"
            aria-expanded=${open ? "true" : "false"}
            aria-controls=${`${row.id}-details`}
            aria-label=${this._t("row_details", { name: row.label })}
            data-row=${row.id}
            @click=${this._toggleRow}
          >
            ${row.label}
          </button>
          <div class="row-control">${row.control}</div>
        </div>
        <span class="row-description">
          ${row.description}
          ${
            searching
              ? html` <span class="group-tag"
                  >${this._t(`group.${row.group}.title`)}</span
                >`
              : nothing
          }
        </span>
        ${
          open
            ? html`<div class="row-details" id=${`${row.id}-details`}>
                <span class=${classMap({ reach: true, inactive: !row.active })}
                  >${row.reach}</span
                >
                <span class="row-default"
                  >${this._t("default_prefix")} ${row.defaultText}</span
                >
                <ha-button
                  class="row-reset"
                  appearance="plain"
                  size="small"
                  .disabled=${row.isDefault}
                  aria-label=${`${this._t("reset")}: ${row.label}`}
                  @click=${row.reset}
                  >${this._t("reset")}</ha-button
                >
              </div>`
            : nothing
        }
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
      <ha-card class="preview-card" .header=${this._t("preview.title")}>
        <div class="card-content">
          <span class="preview-only">${this._t("preview_only")}</span>
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

  private _renderVoicePicker(language: SpeechLanguage, chosen: string) {
    const voices = voicesFor(this._voices, language);
    const label = this._t(
      language === "yue"
        ? "narrator_voice_cantonese.label"
        : "narrator_voice_english.label"
    );
    if (!voices.length) {
      return html`<span class="silent" role="status"
        >${this._t(this._voices.length ? "voice_none" : "voice_loading")}</span
      >`;
    }
    const picked = voices.find((voice) => voice.voiceURI === chosen);
    const using = picked ?? voices[0];
    return html`<select
        class="voice"
        aria-label=${label}
        data-language=${language}
        @change=${this._voiceChanged}
      >
        <option value="" ?selected=${!picked}>${this._t("voice_auto")}</option>
        ${voices.map(
          (voice) =>
            html`<option value=${voice.voiceURI} ?selected=${voice === picked}>
              ${voice.name} (${voice.lang})
            </option>`
        )}
      </select>
      <span class="silent"
        >${this._t("voice_using", { name: `${using.name} (${using.lang})` })}</span
      >`;
  }

  private _voiceChanged = (ev: Event) => {
    const select = ev.target as HTMLSelectElement;
    this._change(
      select.dataset.language === "yue"
        ? { narratorVoiceCantonese: select.value }
        : { narratorVoiceEnglish: select.value }
    );
  };

  private _speakInChanged = (ev: CustomEvent<{ value: string }>) => {
    this._change({ narratorSpeakIn: ev.detail.value as NarratorSpeakIn });
  };

  private _rateChanged = (ev: Event) => {
    this._change({
      narratorRate:
        (ev.target as HaSlider).value ??
        DEFAULT_PERSONAL_PREFERENCES.narratorRate,
    });
  };

  private _pitchChanged = (ev: Event) => {
    this._change({
      narratorPitch:
        (ev.target as HaSlider).value ??
        DEFAULT_PERSONAL_PREFERENCES.narratorPitch,
    });
  };

  private _hearSample = () => {
    narrator.sample(this._tl("narrator_sample.text"));
  };

  private _toggleRow = (ev: Event) => {
    const id = (ev.currentTarget as HTMLElement).dataset.row as string;
    const open = new Set(this._open);
    if (!open.delete(id)) {
      open.add(id);
    }
    this._open = open;
  };

  private _scrollToGroup = (ev: Event) => {
    const group = (ev.currentTarget as HTMLElement).dataset.group;
    this.shadowRoot
      ?.getElementById(`group-${group}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  private _handleMenu = (ev: CustomEvent<{ item: { value: string } }>) => {
    if (ev.detail.item.value === "reset_all") {
      this._confirmResetAll();
    }
  };

  private async _confirmResetAll() {
    const changing = this._rows().filter((row) => !row.isDefault);
    if (!changing.length) {
      await showAlertDialog(this, {
        title: this._t("reset_all_title"),
        text: this._t("reset_all_none"),
      });
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("reset_all_title"),
      text: html`<p>${this._t("reset_all_text")}</p>
        <ul>
          ${changing.map(
            (row) =>
              html`<li>
                ${this._t("reset_all_line", {
                  name: row.label,
                  current: row.valueText,
                  default: row.defaultText.replace(/\.$/, ""),
                })}
              </li>`
          )}
        </ul>`,
      confirmText: this._t("reset_all"),
      destructive: true,
    });
    if (confirmed) {
      this._resetAll();
    }
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
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      box-sizing: border-box;
    }
    .intro,
    .group-note,
    .empty,
    .count {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .layout {
      display: grid;
      grid-template-columns: 200px minmax(0, 1fr) 320px;
      grid-template-areas: "nav list side";
      gap: var(--ha-space-4);
      align-items: start;
    }
    .pin {
      display: contents;
    }
    .groups {
      grid-area: nav;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      position: sticky;
      top: var(--ha-space-4);
    }
    .groups-list {
      grid-area: list;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      min-width: 0;
    }
    .preview-card {
      grid-area: side;
      position: sticky;
      top: var(--ha-space-4);
    }
    .group-link {
      border: 0;
      background: none;
      font: inherit;
      color: var(--primary-text-color);
      text-align: start;
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border-radius: 24px;
      cursor: pointer;
    }
    .group-link:hover {
      background: var(--secondary-background-color);
    }
    .group-link:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    .narrow .layout {
      display: flex;
      flex-direction: column;
    }
    .narrow .pin {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      position: sticky;
      top: 0;
      z-index: 1;
      padding: var(--ha-space-2) 0;
      background: var(--primary-background-color);
    }
    .narrow .groups {
      position: static;
      flex-direction: row;
      overflow-x: auto;
      gap: var(--ha-space-2);
    }
    .narrow .group-link {
      flex: none;
      min-height: 36px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      white-space: nowrap;
    }
    .narrow .preview-card {
      position: static;
    }
    .row {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3) 0;
      border-top: 1px solid var(--divider-color);
    }
    .row-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2) var(--ha-space-4);
    }
    .row-label {
      border: 0;
      background: none;
      font: inherit;
      padding: 0;
      min-height: 44px;
      text-align: start;
      cursor: pointer;
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
      flex: 1 1 140px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .row-label:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    .row-description,
    .row-default,
    .reach {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .row-details {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-1);
    }
    .reach.inactive {
      color: var(--warning-color);
    }
    .group-tag {
      display: inline-block;
      padding: 0 var(--ha-space-2);
      border-radius: 12px;
      background: var(--secondary-background-color);
      font-size: var(--ha-font-size-xs, 12px);
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
    .quiet {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2) var(--ha-space-4);
      flex-basis: 100%;
    }
    .quiet label {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .quiet input {
      min-height: 44px;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 0 var(--ha-space-2);
    }
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .day {
      min-width: 44px;
      min-height: 44px;
      font: inherit;
      color: var(--primary-text-color);
      background: none;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      cursor: pointer;
    }
    .day.selected {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color);
    }
    .day:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .voice {
      min-height: 44px;
      max-width: 100%;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 0 var(--ha-space-2);
    }
    .value {
      min-width: 3ch;
    }
    .intro,
    .group-note,
    .row-description,
    .row-default,
    .reach {
      white-space: pre-line;
    }
    .silent {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .preview-only {
      display: inline-block;
      margin-bottom: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      border-radius: 12px;
      background: var(--warning-color);
      color: var(--text-primary-color, #fff);
      font-size: var(--ha-font-size-xs, 12px);
      font-weight: var(--ha-font-weight-medium);
    }
    .preview p {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
      overflow-wrap: anywhere;
    }
    @media (max-width: 900px) {
      .content:not(.narrow) .layout {
        grid-template-columns: minmax(0, 1fr) 280px;
        grid-template-areas: "list side";
      }
      .content:not(.narrow) .groups {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-personal": HaConfigSectionPersonal;
  }
}
