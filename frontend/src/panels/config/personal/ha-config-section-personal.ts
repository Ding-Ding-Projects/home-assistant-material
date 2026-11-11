import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { mdiCheckCircle, mdiDotsVertical } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  ACCESSIBILITY_STORAGE_KEY,
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../../../common/accessibility/accessibility-tools";
import { getStorage } from "../../../common/decorators/storage";
import { renderBilingual } from "../../../common/language-mode/bilingual-text";
import {
  fillPlaceholders,
  joinForMode,
  sameIgnoringPunctuation,
  stripFullStops,
  textParts,
  yueString,
} from "../../../common/language-mode/language-mode";
import {
  checkAll,
  createLockRecord,
  PIN_PATTERN,
} from "../../../common/locks/lock-credentials";
import {
  readLocks,
  withLock,
  withLockRecord,
  withUpdatedRecord,
  writeLocks,
} from "../../../common/locks/element-locks";
import {
  playfulParts,
  playfulText,
} from "../../../common/playful/playful-text";
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
  effectivePreferences,
  FUNNY_LEVEL_MAX,
  FUNNY_LEVEL_MIN,
  getPreferenceDefaults,
  followDefaultPreferences,
  getChosenPreferenceKeys,
  getPersonalPreferences,
  getStoredPreferences,
  initPersonalPreferences,
  LANGUAGE_MODES,
  NARRATOR_PITCH_MAX,
  NARRATOR_PITCH_MIN,
  NARRATOR_RATE_MAX,
  NARRATOR_RATE_MIN,
  NARRATOR_SPEAK_IN,
  PERSONAL_PREFERENCES_NOT_SAVED_EVENT,
  resetPersonalPreferences,
  SCHOOL_NAME_MAX,
  SCHOOL_RULES,
  schoolHeldFields,
  subscribePersonalPreferences,
  updatePersonalPreferences,
  VOLUME_MAX,
  VOLUME_MIN,
} from "../../../common/preferences/personal-preferences";
import {
  currentScheduleEvaluation,
  scheduleZoneNow,
} from "../../../common/preferences/preference-schedule-store";
import type { ScheduleEvaluation } from "../../../common/preferences/preference-schedule";
import {
  getSharedDefaults,
  subscribeSharedPreferenceDefaults,
  type SharedDefaultField,
} from "../../../common/preferences/shared-preference-defaults";
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
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import "../../../components/ha-button-toggle-group";
import type { HaSlider } from "../../../components/ha-slider";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input-search";
import "../../../components/setting-info/ha-setting-info";
import "./ha-personal-schedules";
import "./ha-personal-shared-defaults";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import {
  showAlertDialog,
  showConfirmationDialog,
  showPromptDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

type GroupId = "language" | "modes" | "sound" | "attention" | "narrator";

/** The key School mode keeps its PIN under, in the shared lock store. */
const SCHOOL_LOCK_KEY = "school-mode";

interface Row {
  id: string;
  group: GroupId;
  /** True while School mode holds this setting fixed. */
  held?: boolean;
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

/** The preference each row changes, for the rows that a schedule or the instance can reach. */
const ROW_FIELD: Record<
  string,
  SharedDefaultField | "narratorEnabled" | "focusSpotlight"
> = {
  language_mode: "languageMode",
  funny_english: "funnyEnglish",
  funny_cantonese: "funnyCantonese",
  dialog_emojis: "dialogEmojis",
  one_thing: "oneThingAtATime",
  sound_effects: "soundEffects",
  sound_volume: "soundVolume",
  low_stimulation: "lowStimulation",
  time_awareness: "timeAwareness",
  momentum: "momentum",
  focus_spotlight: "focusSpotlight",
  narrator_enabled: "narratorEnabled",
};

const GROUPS: GroupId[] = [
  "language",
  "modes",
  "sound",
  "attention",
  "narrator",
];

/** After this long without a voice list, say that there is none. */
const VOICE_WAIT_MS = 3000;

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

  /** The choices as stored, before School mode is laid over them. */
  @state() private _prefs: PersonalPreferences = getStoredPreferences();

  /** Long texts whose second language is shown on a narrow screen. */
  @state() private _shownYue = new Set<string>();

  @state() private _reduceMotion = getAccessibilitySettings().reduceMotion;

  @state() private _voices: SpeechSynthesisVoice[] = [];

  /** True once waiting for the voice list has gone on long enough. */
  @state() private _voicesWaited = false;

  /** True when the last "hear a sample" could not speak. */
  @state() private _sampleFailed = false;

  private _voiceTimer?: number;

  private _lang = new LanguageModeController(this);

  private _unsubs: UnsubscribeFunc[] = [];

  private _unsubShared?: Promise<UnsubscribeFunc>;

  /** What the schedules give right now, set before each render. */
  private _scheduleNow?: ScheduleEvaluation;

  public connectedCallback() {
    super.connectedCallback();
    initPersonalPreferences();
    if (this.hasUpdated) {
      this._subscribeShared();
    }
    this._prefs = getStoredPreferences();
    this._reduceMotion = getAccessibilitySettings().reduceMotion;
    this._unsubs = [
      subscribePersonalPreferences(() => {
        this._prefs = getStoredPreferences();
      }),
      subscribeAccessibilitySettings((settings) => {
        this._reduceMotion = settings.reduceMotion;
      }),
      onVoicesChanged(() => {
        this._voices = listVoices();
      }),
    ];
    this._voices = listVoices();
    this._voicesWaited = false;
    window.clearTimeout(this._voiceTimer);
    this._voiceTimer = window.setTimeout(() => {
      this._voicesWaited = true;
    }, VOICE_WAIT_MS);
    window.addEventListener("hashchange", this._hashChanged);
    window.addEventListener(
      PERSONAL_PREFERENCES_NOT_SAVED_EVENT,
      this._preferencesNotSaved
    );
  }

  // Tells the person when the browser could not keep a choice.
  private _preferencesNotSaved = () => {
    showToast(this, {
      message: this.hass.localize("ui.dialogs.quick-bar.setting_not_saved"),
    });
  };

  protected firstUpdated() {
    this._subscribeShared();
    this._goToHashRow();
  }

  /** Reads the defaults the instance supplies while this page is open. */
  private _subscribeShared() {
    if (this._unsubShared || !this.hass?.connection) {
      return;
    }
    this._unsubShared = subscribeSharedPreferenceDefaults(
      this.hass.connection
    ).catch(() => () => undefined);
  }

  private _hashChanged = () => {
    this._goToHashRow();
  };

  /**
   * Opens the row named in the address hash (the search of everything links
   * to `#<row id>`), scrolls it into view and moves focus to its label.
   */
  private async _goToHashRow() {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!id) {
      return;
    }
    if (!this._rows().some((row) => row.id === id)) {
      return;
    }
    // A filter that hides the row would hide the target too.
    this._filter = "";
    this._open = new Set([...this._open, id]);
    await this.updateComplete;
    const row = this.shadowRoot?.getElementById(id);
    if (!row) {
      return;
    }
    row.scrollIntoView({ behavior: this._scrollBehavior(), block: "center" });
    (row.querySelector(".row-label") as HTMLElement | null)?.focus({
      preventScroll: true,
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._hashChanged);
    window.removeEventListener(
      PERSONAL_PREFERENCES_NOT_SAVED_EVENT,
      this._preferencesNotSaved
    );
    window.clearTimeout(this._voiceTimer);
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs = [];
    this._unsubShared?.then((unsub) => unsub());
    this._unsubShared = undefined;
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

  /** Longer text as two language spans, one under the other. */
  private _bl(key: string): TemplateResult {
    const parts = textParts(
      this.hass.localize,
      `ui.panel.config.personal.${key}`
    );
    // On a narrow screen, a long text in both languages shows the second
    // language only after a tap, so the page does not turn into a wall.
    if (
      this.narrow &&
      this._lang.mode === "bilingual" &&
      parts.cantonese !== undefined &&
      parts.english.length > 60 &&
      !sameIgnoringPunctuation(parts.cantonese, parts.english)
    ) {
      const shown = this._shownYue.has(key);
      return html`${renderBilingual(parts, shown ? "bilingual" : "english", "\n")}
        <button
          type="button"
          class="yue-toggle"
          aria-expanded=${shown ? "true" : "false"}
          data-key=${key}
          @click=${this._toggleYue}
        >
          ${this.hass.localize(
            `ui.panel.config.personal.${shown ? "hide_cantonese" : "show_cantonese"}`
          )}
        </button>`;
    }
    return renderBilingual(parts, this._lang.mode, "\n");
  }

  private _toggleYue = (ev: Event) => {
    const key = (ev.currentTarget as HTMLElement).dataset.key as string;
    const next = new Set(this._shownYue);
    if (!next.delete(key)) {
      next.add(key);
    }
    this._shownYue = next;
  };

  /** The playfulness levels in use now, School mode included. */
  private _levels() {
    const eff = effectivePreferences(this._prefs);
    return { english: eff.funnyEnglish, cantonese: eff.funnyCantonese };
  }

  /** An optional message at the chosen levels, in the chosen language mode. */
  private _play(key: string, values?: Record<string, string | number>) {
    return playfulText(
      this.hass.localize,
      key,
      this._lang.mode,
      this._levels(),
      values,
      "\n"
    );
  }

  /** A text with the full stops removed from each language part. */
  private _tNoStops(key: string): string {
    const parts = textParts(
      this.hass.localize,
      `ui.panel.config.personal.${key}`
    );
    return joinForMode(
      {
        english: stripFullStops(parts.english),
        cantonese:
          parts.cantonese === undefined
            ? undefined
            : stripFullStops(parts.cantonese),
      },
      this._lang.mode
    );
  }

  /** The name of a stored voice, not its address. */
  private _voiceLabel(uri: string): string {
    if (!uri) {
      return this._t("voice_auto");
    }
    return (
      this._voices.find((voice) => voice.voiceURI === uri)?.name ??
      this._t("voice_auto")
    );
  }

  private _onOff(value: boolean): string {
    return this._t(value ? "on" : "off");
  }

  private _renderQuietHours(p: PersonalPreferences): TemplateResult {
    const label = this._t("quiet_hours.label");
    const dayLocale =
      this._lang.mode === "cantonese" ? "zh-HK" : this.hass.locale?.language;
    const dayName = (day: number) =>
      new Date(2024, 0, 7 + day).toLocaleDateString(dayLocale, {
        weekday: "short",
      });
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
    const d = getPreferenceDefaults();
    const held = schoolHeldFields(p);
    const chosen = new Set<string>(getChosenPreferenceKeys());
    const follows = (...keys: (keyof PersonalPreferences)[]) =>
      keys.every((key) => !chosen.has(key));
    const schoolName = p.schoolName;
    // The hints read what applies now, with School mode and schedules laid
    // over the choices, not the stored choice behind them.
    const effective = getPersonalPreferences();
    const silence = silenceReason(effective, scheduleZoneNow());
    const narrationSilence = narratorSilence(effective);
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
      onChange: (ev: HASSDomTargetEvent<HaSwitch>) => void,
      disabled = false
    ) =>
      html`<ha-switch
        .checked=${checked}
        .disabled=${disabled}
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
        isDefault: follows("languageMode"),
        held: held.has("languageMode"),
        reset: () => this._follow(["languageMode"], "reset"),
        control: this._renderModeCards(p, held.has("languageMode")),
      },
      {
        id: "funny_english",
        group: "language",
        label: this._t("funny_english.label"),
        description: this._tl("funny_english.description"),
        defaultText: this._t("funny_english.default"),
        reach: this._tl("funny_english.reach"),
        active: true,
        valueText: String(p.funnyEnglish),
        isDefault: follows("funnyEnglish"),
        held: held.has("funnyEnglish"),
        reset: () => this._follow(["funnyEnglish"], "reset"),
        control: html`${slider(
            p.funnyEnglish,
            FUNNY_LEVEL_MIN,
            FUNNY_LEVEL_MAX,
            this._t("funny_english.label"),
            (ev) =>
              this._change({
                funnyEnglish: (ev.target as HaSlider).value ?? 5,
              }),
            held.has("funnyEnglish")
          )}<span class="value">${p.funnyEnglish}</span>`,
      },
      {
        id: "funny_cantonese",
        group: "language",
        label: this._t("funny_cantonese.label"),
        description: this._tl("funny_cantonese.description"),
        defaultText: this._t("funny_cantonese.default"),
        reach: this._tl("funny_cantonese.reach"),
        active: true,
        valueText: String(p.funnyCantonese),
        isDefault: follows("funnyCantonese"),
        held: held.has("funnyCantonese"),
        reset: () => this._follow(["funnyCantonese"], "reset"),
        control: html`${slider(
            p.funnyCantonese,
            FUNNY_LEVEL_MIN,
            FUNNY_LEVEL_MAX,
            this._t("funny_cantonese.label"),
            (ev) =>
              this._change({
                funnyCantonese: (ev.target as HaSlider).value ?? 5,
              }),
            held.has("funnyCantonese")
          )}<span class="value">${p.funnyCantonese}</span>`,
      },
      {
        id: "dialog_emojis",
        group: "language",
        label: this._t("dialog_emojis.label"),
        description: this._tl("dialog_emojis.description"),
        defaultText: this._t("dialog_emojis.default"),
        reach: this._tl("dialog_emojis.reach"),
        active: true,
        valueText: this._onOff(p.dialogEmojis),
        isDefault: follows("dialogEmojis"),
        held: held.has("dialogEmojis"),
        reset: () => this._follow(["dialogEmojis"]),
        control: toggle(
          p.dialogEmojis,
          this._t("dialog_emojis.label"),
          (ev) => this._change({ dialogEmojis: ev.target.checked }),
          held.has("dialogEmojis")
        ),
      },
      {
        id: "one_thing",
        group: "modes",
        label: this._t("one_thing.label"),
        description: this._tl("one_thing.description"),
        defaultText: this._t("one_thing.default"),
        reach: this._tl("one_thing.reach"),
        active: true,
        valueText: this._onOff(p.oneThingAtATime),
        isDefault: follows("oneThingAtATime"),
        held: held.has("oneThingAtATime"),
        reset: () => this._follow(["oneThingAtATime"]),
        control: toggle(
          p.oneThingAtATime,
          this._t("one_thing.label"),
          (ev) => this._change({ oneThingAtATime: ev.target.checked }),
          held.has("oneThingAtATime")
        ),
      },
      {
        id: "school_mode",
        group: "modes",
        label: this._t("school_mode.label"),
        description: this._tl("school_mode.description"),
        defaultText: this._t("school_mode.default"),
        reach: this._tl("school_mode.reach"),
        active: true,
        valueText: this._onOff(p.schoolMode),
        // While the mode is on it can only be changed with the PIN.
        isDefault: p.schoolMode || follows("schoolName", "schoolRules"),
        reset: () => this._follow(["schoolName", "schoolRules"]),
        control: this._renderSchool(p, schoolName),
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
        isDefault: follows("soundEffects"),
        held: held.has("soundEffects"),
        reset: () => this._follow(["soundEffects"], "reset"),
        control: html`${toggle(
            p.soundEffects,
            this._t("sound_effects.label"),
            (ev) =>
              this._change(
                { soundEffects: ev.target.checked },
                ev.target.checked ? "toggle-on" : undefined
              ),
            held.has("soundEffects")
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
        isDefault: follows("quietHours", "quietFrom", "quietTo", "quietDays"),
        reset: () =>
          this._follow(["quietHours", "quietFrom", "quietTo", "quietDays"]),
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
        isDefault: follows("soundVolume"),
        reset: () => this._follow(["soundVolume"], "reset"),
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
        isDefault: follows("lowStimulation"),
        held: held.has("lowStimulation"),
        reset: () => this._follow(["lowStimulation"]),
        control: toggle(
          p.lowStimulation,
          this._t("low_stimulation.label"),
          (ev) => this._change({ lowStimulation: ev.target.checked }),
          held.has("lowStimulation")
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
        isDefault: follows("focusSpotlight"),
        reset: () => this._follow(["focusSpotlight"]),
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
        isDefault: follows("timeAwareness"),
        reset: () => this._follow(["timeAwareness"]),
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
        isDefault: follows("momentum"),
        reset: () => this._follow(["momentum"]),
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
        isDefault: follows("narratorEnabled"),
        reset: () => this._follow(["narratorEnabled"]),
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
        isDefault: follows("narratorSpeakIn"),
        reset: () => this._follow(["narratorSpeakIn"]),
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
        valueText: this._voiceLabel(p.narratorVoiceEnglish),
        isDefault: follows("narratorVoiceEnglish"),
        reset: () => this._follow(["narratorVoiceEnglish"]),
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
        valueText: this._voiceLabel(p.narratorVoiceCantonese),
        isDefault: follows("narratorVoiceCantonese"),
        reset: () => this._follow(["narratorVoiceCantonese"]),
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
        isDefault: follows("narratorRate"),
        reset: () => this._follow(["narratorRate"]),
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
        isDefault: follows("narratorPitch"),
        reset: () => this._follow(["narratorPitch"]),
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
          >
          ${
            this._sampleFailed
              ? html`<span class="silent" role="status"
                  >${this._t("narrator_sample.failed")}</span
                >`
              : nothing
          }`,
      },
    ];
  }

  protected willUpdate() {
    this._scheduleNow = currentScheduleEvaluation(
      schoolHeldFields(this._prefs)
    );
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
    const showSchedules = matches(
      this._t("schedules.title"),
      this._t("schedules.note")
    );
    const showShared =
      !!this.hass.user?.is_admin &&
      matches(this._t("shared.title"), this._t("shared.note"));
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
          <p class="intro">${this._bl("intro")}</p>
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
                groups.length || showSchedules || showShared
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
                      ${
                        showSchedules
                          ? html`<button
                              type="button"
                              class="group-link"
                              data-group="schedules"
                              @click=${this._scrollToGroup}
                            >
                              ${this._t("schedules.title")}
                            </button>`
                          : nothing
                      }
                      ${
                        showShared
                          ? html`<button
                              type="button"
                              class="group-link"
                              data-group="shared"
                              @click=${this._scrollToGroup}
                            >
                              ${this._t("shared.title")}
                            </button>`
                          : nothing
                      }
                    </nav>`
                  : nothing
              }
              ${this._renderPreview()}
            </div>
            <div class="groups-list">
              ${
                rows.length || showSchedules || showShared
                  ? html`${GROUPS.map((group) =>
                      this._renderGroup(group, rows, searching)
                    )}
                    ${
                      showSchedules
                        ? html`<div id="group-schedules">
                            <ha-personal-schedules
                              .hass=${this.hass}
                              .narrow=${this.narrow}
                              .prefs=${this._prefs}
                            ></ha-personal-schedules>
                          </div>`
                        : nothing
                    }
                    ${
                      showShared
                        ? html`<div id="group-shared">
                            <ha-personal-shared-defaults
                              .hass=${this.hass}
                            ></ha-personal-shared-defaults>
                          </div>`
                        : nothing
                    }`
                  : html`<p class="empty" role="status">
                      ${this._play(
                        "ui.personal_prefs.playful.personal_search_empty",
                        {
                          query: this._filter.trim(),
                        }
                      )}
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
          <p class="group-note">${this._bl(`group.${group}.note`)}</p>
          ${
            group === "language"
              ? html`<p class="group-note">${this._bl("playfulness_note")}</p>`
              : nothing
          }
          ${inGroup.map((row) => this._renderRow(row, searching))}
          ${
            group === "modes"
              ? html`<div class="info" role="note">
                  <p>${this._bl("no_praise")}</p>
                  <p>${this._bl("honest_note")}</p>
                </div>`
              : nothing
          }
        </div>
      </ha-card>
    `;
  }

  /** A value of a setting as words. */
  private _fieldValueText(field: string, value: unknown): string {
    if (field === "languageMode") {
      return this._t(`language_mode.${value}`);
    }
    return typeof value === "boolean" ? this._onOff(value) : String(value);
  }

  /** The default the instance supplies for this row, if it gives one. */
  private _sharedDefault(
    row: Row
  ): { field: string; value: unknown } | undefined {
    const field = ROW_FIELD[row.id];
    const shared = getSharedDefaults() as Record<string, unknown>;
    return field && shared[field] !== undefined
      ? { field, value: shared[field] }
      : undefined;
  }

  /** True while a setting has no choice of its own and follows the shared default. */
  private _followsShared(row: Row): boolean {
    const shared = this._sharedDefault(row);
    return (
      !!shared &&
      JSON.stringify(this._prefs[shared.field as keyof PersonalPreferences]) ===
        JSON.stringify(shared.value)
    );
  }

  /** What a schedule sets for this row right now, if one does. */
  private _scheduledValue(row: Row): unknown {
    const field = ROW_FIELD[row.id];
    return field
      ? (this._scheduleNow?.overlay as Record<string, unknown> | undefined)?.[
          field
        ]
      : undefined;
  }

  /** The default as words: the shared default where there is one. */
  private _defaultTextOf(row: Row): string {
    const shared = this._sharedDefault(row);
    return shared
      ? this._t("shared_default", {
          value: this._fieldValueText(shared.field, shared.value),
        })
      : row.defaultText;
  }

  /** What holds the value right now, for the information panel. */
  private _holdingText(row: Row): string {
    const lines: string[] = [];
    if (row.held) {
      lines.push(this._t("school_mode.held", { name: this._prefs.schoolName }));
    }
    const scheduled = this._scheduledValue(row);
    if (scheduled !== undefined) {
      lines.push(
        this._t("schedules.holding_scheduled", {
          value: this._fieldValueText(ROW_FIELD[row.id], scheduled),
        })
      );
    }
    if (this._followsShared(row)) {
      lines.push(this._t("shared_using"));
    }
    return lines.join("\n");
  }

  /** Says where Reset goes back to: the shared default where there is one. */
  private _resetText(row: Row): string {
    return this._t(this._sharedDefault(row) ? "reset_shared" : "reset");
  }

  private _infoLabels() {
    return {
      // The info button fills in {name} itself, so the placeholder is passed through unchanged.
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

  private _renderRow(row: Row, searching: boolean): TemplateResult {
    const open = this._open.has(row.id);
    const scheduled = this._scheduledValue(row);
    const field = ROW_FIELD[row.id];
    return html`
      <div class="row" id=${row.id}>
        <div class="row-main">
          <div class="row-title">
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
            <ha-setting-info
              .hass=${this.hass}
              .label=${row.label}
              .description=${this._tl(`${row.id}.description`)}
              .defaultText=${this._defaultTextOf(row)}
              .reach=${this._tl(`${row.id}.reach`)}
              .holding=${this._holdingText(row)}
              .labels=${this._infoLabels()}
            ></ha-setting-info>
          </div>
          <div class="row-control">${row.control}</div>
        </div>
        <span class="row-description">
          ${this._bl(`${row.id}.description`)}
          ${
            searching
              ? html` <span class="group-tag"
                  >${this._t(`group.${row.group}.title`)}</span
                >`
              : nothing
          }
        </span>
        ${
          row.held
            ? html`<span class="silent" role="status"
                >${this._t("school_mode.held", {
                  name: this._prefs.schoolName,
                })}</span
              >`
            : nothing
        }
        ${
          scheduled !== undefined
            ? html`<span class="silent" role="status"
                >${this._t("schedules.row_scheduled", {
                  value: this._fieldValueText(field, scheduled),
                  own: this._fieldValueText(
                    field,
                    this._prefs[field as keyof PersonalPreferences]
                  ),
                })}</span
              >`
            : nothing
        }
        ${
          this._followsShared(row)
            ? html`<span class="silent" role="status"
                >${this._t("shared_using")}</span
              >`
            : nothing
        }
        ${
          open
            ? html`<div class="row-details" id=${`${row.id}-details`}>
                <span class=${classMap({ reach: true, inactive: !row.active })}
                  >${this._bl(`${row.id}.reach`)}</span
                >
                <span class="row-default"
                  >${this._t("default_prefix")}
                  ${this._defaultTextOf(row)}</span
                >
                <ha-button
                  class="row-reset"
                  appearance="plain"
                  size="small"
                  .disabled=${row.isDefault}
                  aria-label=${`${this._resetText(row)}: ${row.label}`}
                  @click=${row.reset}
                  >${this._resetText(row)}</ha-button
                >
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _renderPreview(): TemplateResult {
    const eff = effectivePreferences(this._prefs);
    const mode = this._lang.mode;
    const loc = this.hass.localize;
    const base = "ui.panel.config.personal.preview.dialog";
    const statusKey = "ui.panel.config.personal.preview.status";
    const modeName = textParts(
      loc,
      `ui.panel.config.personal.language_mode.${mode}`
    );
    const levels = { english: eff.funnyEnglish, cantonese: eff.funnyCantonese };
    const statusValues = {
      english: levels.english,
      cantonese: levels.cantonese,
    };
    const statusYue = yueString(statusKey);
    const status = {
      english: loc(statusKey, { ...statusValues, mode: modeName.english }),
      cantonese:
        statusYue === undefined
          ? undefined
          : fillPlaceholders(statusYue, {
              ...statusValues,
              mode: modeName.cantonese ?? modeName.english,
            }),
    };
    const bodyParts = playfulParts(
      loc,
      "ui.personal_prefs.playful.restart_demo.body",
      levels
    );
    return html`
      <ha-card class="preview-card" .header=${this._t("preview.title")}>
        <div class="card-content">
          <span class="preview-only">${this._t("preview_only")}</span>
          <p class="group-note preview-status" role="status">
            ${renderBilingual(status, mode, " · ")}
          </p>
          <div class="sample-dialog">
            ${
              eff.dialogEmojis
                ? html`<span class="sample-emoji" aria-hidden="true">😴</span>`
                : nothing
            }
            <p class="sample-title">
              ${renderBilingual(textParts(loc, `${base}.title`), mode, "\n")}
            </p>
            <p class="sample-body">${renderBilingual(bodyParts, mode, "\n")}</p>
            <div class="sample-actions" aria-hidden="true">
              <span class="sample-button text"
                >${this._t("preview.dialog.not_now")}</span
              >
              <span class="sample-button filled"
                >${this._t("preview.dialog.restart")}</span
              >
            </div>
          </div>
          <p class="group-note">${this._bl("preview.dialog.caption")}</p>
          <p class="group-note">${this._t("preview.note")}</p>
        </div>
      </ha-card>
    `;
  }

  /** Language mode as three cards, each with a short line under its name. */
  private _renderModeCards(
    p: PersonalPreferences,
    held: boolean
  ): TemplateResult {
    const loc = this.hass.localize;
    const title = (mode: LanguageMode) =>
      loc(
        mode === "cantonese"
          ? "ui.panel.config.personal.language_mode.cantonese_native"
          : mode === "english"
            ? "ui.panel.config.personal.language_mode.english"
            : "ui.panel.config.personal.language_mode.bilingual"
      );
    return html`<div
      class="mode-cards"
      role="group"
      aria-label=${this._t("language_mode.label")}
    >
      ${LANGUAGE_MODES.map((mode) => {
        const selected = p.languageMode === mode;
        return html`<button
          type="button"
          class=${classMap({ "mode-card": true, selected })}
          aria-pressed=${selected ? "true" : "false"}
          ?disabled=${held}
          data-mode=${mode}
          @click=${this._modeCardClicked}
        >
          <span
            class="mode-card-title"
            lang=${mode === "cantonese" ? "yue-Hant-HK" : "en"}
            >${title(mode)}</span
          >
          <span class="mode-card-sub"
            >${this._t(`language_mode.sub.${mode}`)}</span
          >
          ${
            selected
              ? html`<ha-svg-icon
                  class="mode-card-check"
                  .path=${mdiCheckCircle}
                ></ha-svg-icon>`
              : nothing
          }
        </button>`;
      })}
    </div>`;
  }

  private _modeCardClicked = (ev: Event) => {
    const mode = (ev.currentTarget as HTMLElement).dataset.mode as LanguageMode;
    if (mode !== this._prefs.languageMode) {
      this._change({ languageMode: mode });
    }
  };

  /** The School mode switch, its name and the rules it applies. */
  private _renderSchool(p: PersonalPreferences, name: string): TemplateResult {
    return html`<ha-switch
        .checked=${p.schoolMode}
        aria-label=${this._t("school_mode.label")}
        @change=${this._schoolSwitch}
      ></ha-switch>
      <span class="silent" role="status"
        >${this._t(p.schoolMode ? "school_mode.status_on" : "school_mode.status_off")}</span
      >
      <div class="school">
        <label class="school-name"
          >${this._t("school_mode.name_label")}
          <input
            type="text"
            maxlength=${SCHOOL_NAME_MAX}
            .value=${name}
            ?disabled=${p.schoolMode}
            @change=${this._schoolName}
          />
        </label>
        <fieldset class="school-rules" ?disabled=${p.schoolMode}>
          <legend>${this._t("school_mode.rules_title")}</legend>
          ${SCHOOL_RULES.map(
            (rule) =>
              html`<label class="rule"
                ><input
                  type="checkbox"
                  .checked=${p.schoolRules.includes(rule)}
                  data-rule=${rule}
                  @change=${this._schoolRule}
                />
                ${this._t(`school_mode.rules.${rule}`)}</label
              >`
          )}
        </fieldset>
        ${
          p.schoolMode
            ? html`<span class="silent"
                >${this._t("school_mode.locked_note")}</span
              >`
            : nothing
        }
      </div>`;
  }

  private _schoolName = (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    this._change({ schoolName: input.value });
    // Show what was kept when the typed name was empty.
    input.value = this._prefs.schoolName;
  };

  private _schoolRule = (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const rule = input.dataset.rule as (typeof SCHOOL_RULES)[number];
    const rules = this._prefs.schoolRules;
    this._change({
      schoolRules: input.checked
        ? [...rules, rule]
        : rules.filter((item) => item !== rule),
    });
  };

  private _schoolSwitch = async (ev: HASSDomTargetEvent<HaSwitch>) => {
    const toggle = ev.target;
    if (toggle.checked) {
      await this._schoolTurnOn();
    } else {
      await this._schoolTurnOff();
    }
    // A cancelled or refused change puts the switch back to what is stored.
    toggle.checked = this._prefs.schoolMode;
  };

  private async _schoolTurnOn() {
    const name = this._prefs.schoolName;
    const pin = await showPromptDialog(this, {
      title: this._t("school_mode.pin_set_title", { name }),
      text: this._t("school_mode.pin_set_text"),
      inputLabel: this._t("school_mode.pin_label"),
      inputType: "password",
      confirmText: this._t("on"),
      emoji: "🎒",
    });
    if (pin === null) {
      return;
    }
    if (!PIN_PATTERN.test(pin)) {
      await showAlertDialog(this, {
        title: this._t("school_mode.label"),
        text: this._t("school_mode.pin_invalid", { name }),
      });
      return;
    }
    try {
      const record = await createLockRecord(
        {
          key: SCHOOL_LOCK_KEY,
          label: name,
          policy: "pin",
          duration: { kind: "session" },
          pin,
          onStart: false,
        },
        Date.now()
      );
      writeLocks(withLockRecord(readLocks(), record));
      if (!readLocks().records?.[SCHOOL_LOCK_KEY]) {
        throw new Error("not kept");
      }
    } catch (_err) {
      await showAlertDialog(this, {
        title: this._t("school_mode.label"),
        text: this._t("school_mode.pin_not_saved", { name }),
      });
      return;
    }
    this._change({ schoolMode: true });
    showToast(this, { message: this._t("school_mode.on_done", { name }) });
  }

  private async _schoolTurnOff() {
    const name = this._prefs.schoolName;
    if (readLocks().records?.[SCHOOL_LOCK_KEY]) {
      const pin = await showPromptDialog(this, {
        title: this._t("school_mode.pin_off_title", { name }),
        text: this._t("school_mode.pin_off_text"),
        inputLabel: this._t("school_mode.pin_label"),
        inputType: "password",
        confirmText: this._t("off"),
        emoji: "🎒",
      });
      if (pin === null) {
        return;
      }
      // The store is read again after the prompt, so attempt counts and waits
      // recorded meanwhile (for example in another tab) are the ones checked.
      const record = readLocks().records?.[SCHOOL_LOCK_KEY];
      if (record) {
        const result = await checkAll(record, { pin }, Date.now());
        // A wrong try is counted on the freshest store, so the next ones wait.
        writeLocks(withUpdatedRecord(readLocks(), result.record));
        if (result.outcome === "wait") {
          await showAlertDialog(this, {
            title: this._t("school_mode.label"),
            text: this._t("school_mode.pin_wait", {
              seconds: Math.ceil(result.waitMs / 1000),
            }),
          });
          return;
        }
        if (result.outcome === "wrong") {
          await showAlertDialog(this, {
            title: this._t("school_mode.label"),
            text: this._t("school_mode.pin_wrong", { name }),
          });
          return;
        }
      }
    }
    writeLocks(withLock(readLocks(), SCHOOL_LOCK_KEY, false));
    this._change({ schoolMode: false });
    showToast(this, { message: this._t("school_mode.off_done", { name }) });
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
        >${this._t(
          this._voices.length || this._voicesWaited
            ? "voice_none"
            : "voice_loading"
        )}</span
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
    // Both language parts go in; the narrator keeps the ones that match the
    // "speak in" choice, so English display with Cantonese speech still works.
    const parts = textParts(
      this.hass.localize,
      "ui.panel.config.personal.narrator_sample.text"
    );
    const text = [parts.english, parts.cantonese].filter(Boolean).join("\n");
    this._sampleFailed = !narrator.sample(text);
  };

  private _toggleRow = (ev: Event) => {
    const id = (ev.currentTarget as HTMLElement).dataset.row as string;
    const open = new Set(this._open);
    if (!open.delete(id)) {
      // One thing at a time: opening a row closes the others.
      if (effectivePreferences(this._prefs).oneThingAtATime) {
        open.clear();
      }
      open.add(id);
    }
    this._open = open;
  };

  private _scrollToGroup = (ev: Event) => {
    const group = (ev.currentTarget as HTMLElement).dataset.group;
    this.shadowRoot
      ?.getElementById(`group-${group}`)
      ?.scrollIntoView({ behavior: this._scrollBehavior(), block: "start" });
  };

  /** Smooth scrolling, unless the person or the device asks for less motion. */
  private _scrollBehavior(): ScrollBehavior {
    return this._reduceMotion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }

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
        text: this._play("ui.personal_prefs.playful.personal_reset_none"),
        emoji: "👍",
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
                  default: this._sharedDefault(row)
                    ? this._defaultTextOf(row)
                    : this._tNoStops(`${row.id}.default`),
                })}
              </li>`
          )}
        </ul>`,
      confirmText: this._t("reset_all"),
      destructive: true,
      emoji: "🔄",
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

  // Going back to following the default is the only way a choice is dropped.
  private _follow(keys: (keyof PersonalPreferences)[], cue?: "reset") {
    this._prefs = followDefaultPreferences(keys);
    if (cue) {
      playActionCue(cue);
    }
  }

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
    const school = this._prefs;
    this._prefs = resetPersonalPreferences();
    if (school.schoolMode) {
      // School mode is turned off only with its PIN, never by a reset.
      this._prefs = updatePersonalPreferences({
        schoolMode: true,
        schoolName: school.schoolName,
        schoolRules: school.schoolRules,
      });
    }
    this._setReduceMotion(false);
    playActionCue("reset");
    showToast(this, {
      message: this._play("ui.personal_prefs.playful.personal_reset_done"),
    });
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
      /* The columns below answer to the width of the page itself, which is
         narrower than the window while the sidebar is docked. */
      container: personal-page / inline-size;
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
      /* On a short window the lower part stays reachable by scrolling. */
      max-height: calc(100dvh - 2 * var(--ha-space-4));
      overflow-y: auto;
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
      max-height: calc(100dvh - 2 * var(--ha-space-4));
      overflow-y: auto;
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
    /* On a narrow screen only the group chips stay pinned. The preview scrolls
       away with the page: pinned, it covered most of a phone screen and hid
       the settings under it. */
    .narrow .groups {
      position: sticky;
      top: 0;
      z-index: 1;
      max-height: none;
      padding: var(--ha-space-2) 0;
      background: var(--primary-background-color);
      flex-direction: row;
      overflow-x: auto;
      gap: var(--ha-space-2);
    }
    .narrow .group-link {
      flex: none;
      min-height: 44px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      white-space: nowrap;
    }
    .narrow .preview-card {
      position: static;
      max-height: none;
      overflow: visible;
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
    .row-title {
      display: flex;
      align-items: center;
      flex: 1 1 140px;
      min-width: 0;
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
    .mode-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
      gap: var(--ha-space-2);
      flex-basis: 100%;
      min-width: 0;
    }
    .narrow .mode-cards {
      grid-template-columns: minmax(0, 1fr);
    }
    .mode-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-1);
      min-height: 72px;
      padding: var(--ha-space-3) var(--ha-space-4);
      padding-inline-end: var(--ha-space-10, 40px);
      font: inherit;
      text-align: start;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 2px solid transparent;
      border-radius: 16px;
      cursor: pointer;
      min-width: 0;
      overflow-wrap: break-word;
      word-break: normal;
    }
    .mode-card.selected {
      background: var(--primary-color);
      color: var(--text-primary-color);
    }
    .mode-card:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .mode-card:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .mode-card-title {
      font-size: var(--ha-font-size-xl);
    }
    .mode-card-sub {
      font-size: var(--ha-font-size-s);
    }
    .mode-card-check {
      position: absolute;
      inset-inline-end: var(--ha-space-3);
      inset-block-start: var(--ha-space-3);
    }
    .level {
      min-width: 2ch;
    }
    .school {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      flex-basis: 100%;
    }
    .school-name {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .school-name input {
      min-height: 44px;
      min-width: 0;
      flex: 1 1 160px;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 0 var(--ha-space-2);
    }
    .school-rules {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .school-rules legend {
      padding: 0;
      font-weight: var(--ha-font-weight-medium);
    }
    .rule {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
    }
    .rule input {
      width: 24px;
      height: 24px;
      flex: none;
    }
    .info {
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: 16px;
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      white-space: pre-line;
    }
    .info p {
      margin: 0;
    }
    .info p + p {
      margin-top: var(--ha-space-2);
    }
    .yue-toggle {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 var(--ha-space-2);
      font: inherit;
      color: var(--primary-color);
      background: none;
      border: 0;
      cursor: pointer;
    }
    .yue-toggle:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    .sample-dialog {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-5, 20px);
      border-radius: 28px;
      background: var(--card-background-color);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      min-width: 0;
    }
    .sample-emoji {
      font-size: 32px;
      line-height: 1;
    }
    .sample-dialog p {
      margin: 0;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    .sample-title {
      font-size: var(--ha-font-size-xl);
    }
    .sample-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--ha-space-2);
    }
    .sample-button {
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: 20px;
      font-weight: var(--ha-font-weight-medium);
    }
    .sample-button.text {
      color: var(--primary-color);
    }
    .sample-button.filled {
      background: var(--primary-color);
      color: var(--text-primary-color);
    }
    .preview-status {
      font-size: var(--ha-font-size-s);
    }
    /* Three columns need about 960 px of page; below that the group list goes
       and the preview stays beside the settings, and below 720 px the preview
       sits under them. */
    @container personal-page (max-width: 960px) {
      .content:not(.narrow) .layout {
        grid-template-columns: minmax(0, 1fr) 280px;
        grid-template-areas: "list side";
      }
      .content:not(.narrow) .groups {
        display: none;
      }
    }
    @container personal-page (max-width: 720px) {
      .content:not(.narrow) .layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          "list"
          "side";
      }
      .content:not(.narrow) .preview-card {
        position: static;
        max-height: none;
        overflow: visible;
      }
    }
    /* A group that is scrolled to stops under the pinned chip bar, not behind
       it: the bar is 44 px of chips with 8 px above and below. */
    .narrow .groups-list > ha-card {
      scroll-margin-top: calc(60px + var(--ha-space-2));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-personal": HaConfigSectionPersonal;
  }
}
