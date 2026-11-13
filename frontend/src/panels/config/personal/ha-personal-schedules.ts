import {
  mdiArrowDown,
  mdiArrowUp,
  mdiClockOutline,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { repeat } from "lit/directives/repeat";
import type { TimeZone } from "../../../data/translation";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { HASSDomTargetEvent } from "../../../common/dom/fire_event";
import type { PersonalPreferences } from "../../../common/preferences/personal-preferences";
import { schoolHeldFields } from "../../../common/preferences/personal-preferences";
import {
  conditionStatus,
  ENTITY_COMPARISONS,
  evaluateSchedules,
  findConflicts,
  isAllDay,
  isTimed,
  isValueFor,
  parseNumericState,
  MAX_SCHEDULE_RULES,
  newRuleId,
  nextChange,
  ruleProblem,
  SCHEDULABLE_PREFERENCES,
  SCHEDULE_LANGUAGE_MODES,
  SCHEDULE_NAME_MAX,
  cleanStates,
  watchedEntityIds,
  zoneParts,
  type EntityComparison,
  type EntityCondition,
  type NextChange,
  type ScheduleEvaluation,
  type ScheduleRule,
  type ScheduleValue,
  type SchedulablePreference,
} from "../../../common/preferences/preference-schedule";
import {
  getSchedules,
  getScheduleTimeZone,
  saveSchedules,
  setScheduleEntityStates,
  setScheduleZoneSetting,
  isScheduleZoneFallback,
  subscribeScheduleClock,
} from "../../../common/preferences/preference-schedule-store";
import "../../../components/entity/ha-entity-picker";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-select";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import "../../../components/ha-time-input";
import "../../../components/input/ha-input";
import "../../../components/setting-info/ha-setting-info";
import type { HaSelectSelectEvent } from "../../../components/ha-select";
import type { HaSwitch } from "../../../components/ha-switch";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

/** The row on the Personal page that explains each schedulable preference. */
const PREFERENCE_ROW: Record<SchedulablePreference, string> = {
  languageMode: "language_mode",
  lowStimulation: "low_stimulation",
  soundEffects: "sound_effects",
  dialogEmojis: "dialog_emojis",
  oneThingAtATime: "one_thing",
  focusSpotlight: "focus_spotlight",
  timeAwareness: "time_awareness",
  momentum: "momentum",
  narratorEnabled: "narrator_enabled",
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Draft {
  rule: ScheduleRule;
  isNew: boolean;
}

interface Summary {
  evaluation: ScheduleEvaluation;
  next: Partial<Record<SchedulablePreference, NextChange>>;
}

/**
 * Schedules on the Personal settings page: a list of rules that let a
 * personal preference follow the clock in this browser, and an editor for one
 * rule. A rule never writes the stored choice; it is laid over it, below
 * School mode, and says what is in effect now and why.
 */
@customElement("ha-personal-schedules")
export class HaPersonalSchedules extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  /** The stored choices, before schedules and School mode. */
  @property({ attribute: false }) public prefs!: PersonalPreferences;

  @state() private _rules: ScheduleRule[] = getSchedules();

  @state() private _draft?: Draft;

  /** The minute the summary was computed for, so a new minute recomputes it. */
  @state() private _minute = Math.floor(Date.now() / 60000);

  @state() private _summary?: Summary;

  @state() private _announce = "";

  /** The states of the entities that rules name, to recompute when one changes. */
  @state() private _entitySignature = "";

  /** What was typed in the states and the number fields of the editor. */
  @state() private _statesText = "";

  @state() private _thresholdText = "";

  @query(".editor h3") private _editorTitle?: HTMLElement;

  @query(".new-rule") private _newRuleButton?: HTMLElement;

  @queryAll("ha-icon-button") private _iconButtons!: NodeListOf<HTMLElement>;

  /** What gets the focus back once the editor closes: a rule id, or "new". */
  private _focusAfterEditor?: string;

  /** The move button to refocus after a rule moved, by rule id and direction. */
  private _focusAfterMove?: { id: string; by: -1 | 1 };

  private _lastScheduleJson = "";

  private _lang = new LanguageModeController(this);

  private _unsub?: UnsubscribeFunc;

  public connectedCallback() {
    super.connectedCallback();
    this._rules = getSchedules();
    this._lastScheduleJson = JSON.stringify(this._rules);
    this._unsub = subscribeScheduleClock(() => {
      // A new array each tick would recompute the summary for nothing.
      const next = getSchedules();
      const json = JSON.stringify(next);
      if (json !== this._lastScheduleJson) {
        this._lastScheduleJson = json;
        this._rules = next;
      }
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== this._minute) {
        this._minute = minute;
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

  private _tl(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.personal.${key}`,
      values,
      "\n"
    );
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("hass") && this.hass?.locale) {
      // Rules are read in the zone the profile reads times in. The marker is
      // resolved when the rules are evaluated; the app sets it too, so it stays
      // right while this page is closed.
      setScheduleZoneSetting(
        this.hass.locale.time_zone as TimeZone,
        this.hass.config.time_zone
      );
    }
    if (changed.has("hass") && this.hass?.states) {
      setScheduleEntityStates(this.hass.states);
    }
    if (changed.has("hass") || changed.has("_rules") || changed.has("_draft")) {
      const signature = this._entitiesSignature();
      if (signature !== this._entitySignature) {
        this._entitySignature = signature;
      }
    }
    if (
      changed.has("prefs") ||
      changed.has("_rules") ||
      changed.has("_minute") ||
      changed.has("_entitySignature")
    ) {
      this._summary = this._computeSummary();
    }
  }

  protected updated(changed: PropertyValues) {
    if (changed.has("_draft") && this._draft && !changed.get("_draft")) {
      this._editorTitle?.focus({ preventScroll: false });
    }
    if (changed.has("_draft") && !this._draft && this._focusAfterEditor) {
      const id = this._focusAfterEditor;
      this._focusAfterEditor = undefined;
      const edit = this._ruleButton(id, "edit");
      (id === "new" ? this._newRuleButton : edit)?.focus();
    }
    if (this._focusAfterMove) {
      const { id, by } = this._focusAfterMove;
      this._focusAfterMove = undefined;
      const wanted = this._ruleButton(id, by === -1 ? "up" : "down");
      const other = this._ruleButton(id, by === -1 ? "down" : "up");
      // At the first or last place the button that moved it is now disabled.
      (wanted && !(wanted as HTMLElement & { disabled?: boolean }).disabled
        ? wanted
        : other
      )?.focus();
    }
  }

  private _ruleButton(id: string, action: string): HTMLElement | undefined {
    return Array.from(this._iconButtons).find(
      (button) => button.dataset.id === id && button.dataset.action === action
    );
  }

  private _lookup = (entityId: string): string | undefined =>
    this.hass?.states?.[entityId]?.state;

  /** The states of the entities the rules and the open draft name. */
  private _entitiesSignature(): string {
    const ids = new Set(watchedEntityIds(this._rules));
    const draftEntity = this._draft?.rule.condition?.entityId;
    if (draftEntity) {
      ids.add(draftEntity);
    }
    return [...ids]
      .map((id) => `${id}=${this._lookup(id) ?? "\u0000"}`)
      .join("\u0001");
  }

  private _entityName(entityId: string): string {
    const stateObj = this.hass?.states?.[entityId];
    return (stateObj && computeStateName(stateObj)) || entityId;
  }

  private _held(): ReadonlySet<string> {
    return schoolHeldFields(this.prefs);
  }

  private _computeSummary(): Summary {
    const now = new Date(Math.max(Date.now(), this._minute * 60000));
    const zone = getScheduleTimeZone();
    const held = this._held();
    const next: Summary["next"] = {};
    for (const preference of SCHEDULABLE_PREFERENCES) {
      if (this._rules.some((rule) => rule.preference === preference)) {
        const change = nextChange(
          this._rules,
          now,
          zone,
          preference,
          held,
          8 * 1440,
          this._lookup
        );
        if (change) {
          next[preference] = change;
        }
      }
    }
    return {
      evaluation: evaluateSchedules(this._rules, now, zone, held, this._lookup),
      next,
    };
  }

  // Wording helpers ---------------------------------------------------------

  private _prefName(preference: SchedulablePreference): string {
    return this._t(`${PREFERENCE_ROW[preference]}.label`);
  }

  private _valueName(
    preference: SchedulablePreference,
    value: ScheduleValue
  ): string {
    if (preference === "languageMode") {
      return this._t(`language_mode.${value}`);
    }
    return this._t(value ? "on" : "off");
  }

  private _dayName(day: number): string {
    const locale =
      this._lang.mode === "cantonese" ? "zh-HK" : this.hass.locale?.language;
    return new Date(2024, 0, 7 + day).toLocaleDateString(locale, {
      weekday: "short",
    });
  }

  private _daysText(days: number[]): string {
    const key = [...days].sort((a, b) => a - b).join();
    if (key === "0,1,2,3,4,5,6") {
      return this._t("schedules.days_every");
    }
    if (key === "1,2,3,4,5") {
      return this._t("schedules.days_weekdays");
    }
    if (key === "0,6") {
      return this._t("schedules.days_weekends");
    }
    return DAY_ORDER.filter((day) => days.includes(day))
      .map((day) => this._dayName(day))
      .join(", ");
  }

  private _rangeText(rule: Pick<ScheduleRule, "from" | "to">): string {
    return isAllDay(rule)
      ? this._t("schedules.all_day")
      : this._t("schedules.range", { from: rule.from, to: rule.to });
  }

  private _conditionText(condition: EntityCondition): string {
    const entity = this._entityName(condition.entityId);
    if (condition.comparison === "above" || condition.comparison === "below") {
      return this._t(`schedules.condition_${condition.comparison}`, {
        entity,
        value: String(condition.threshold ?? ""),
      });
    }
    return this._t(`schedules.condition_${condition.comparison}`, {
      entity,
      value: condition.states.join(this._t("schedules.states_or")),
    });
  }

  private _sentence(rule: ScheduleRule): string {
    const base = isTimed(rule)
      ? this._t("schedules.sentence", {
          preference: this._prefName(rule.preference),
          value: this._valueName(rule.preference, rule.value),
          days: this._daysText(rule.days),
          range: this._rangeText(rule),
        })
      : this._t("schedules.sentence_always", {
          preference: this._prefName(rule.preference),
          value: this._valueName(rule.preference, rule.value),
        });
    return rule.condition
      ? this._t("schedules.sentence_condition", {
          sentence: base,
          condition: this._conditionText(rule.condition),
        })
      : base;
  }

  private _title(rule: ScheduleRule): string {
    return rule.name || this._sentence(rule);
  }

  private _whenText(at: Date): string {
    const zone = getScheduleTimeZone();
    const there = zoneParts(at, zone);
    const today = zoneParts(new Date(), zone).day;
    const hours = String(Math.floor(there.minute / 60)).padStart(2, "0");
    const minutes = String(there.minute % 60).padStart(2, "0");
    const time = `${hours}:${minutes}`;
    return there.day === today ? time : `${this._dayName(there.day)} ${time}`;
  }

  private _ruleById(id: string): ScheduleRule | undefined {
    return this._rules.find((rule) => rule.id === id);
  }

  // Rules -------------------------------------------------------------------

  private _save(rules: ScheduleRule[]): boolean {
    const saved = saveSchedules(rules);
    this._rules = rules;
    if (!saved) {
      showToast(this, {
        message: this.hass.localize("ui.dialogs.quick-bar.setting_not_saved"),
      });
    }
    return saved;
  }

  private _indexOf(ev: Event): number {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    return this._rules.findIndex((rule) => rule.id === id);
  }

  private _toggleRule = (ev: HASSDomTargetEvent<HaSwitch>) => {
    const index = this._indexOf(ev);
    if (index < 0) {
      return;
    }
    const rules = [...this._rules];
    rules[index] = { ...rules[index], enabled: ev.target.checked };
    this._save(rules);
  };

  private _move(ev: Event, by: -1 | 1) {
    const index = this._indexOf(ev);
    const target = index + by;
    if (index < 0 || target < 0 || target >= this._rules.length) {
      return;
    }
    const rules = [...this._rules];
    [rules[index], rules[target]] = [rules[target], rules[index]];
    this._save(rules);
    this._focusAfterMove = { id: rules[target].id, by };
    this._announce = this._t("schedules.moved", {
      name: this._title(rules[target]),
      position: target + 1,
      total: rules.length,
    });
  }

  private _moveUp = (ev: Event) => this._move(ev, -1);

  private _moveDown = (ev: Event) => this._move(ev, 1);

  private _newRule = () => {
    this._statesText = "";
    this._thresholdText = "";
    this._focusAfterEditor = "new";
    this._draft = {
      isNew: true,
      rule: {
        id: newRuleId(this._rules),
        name: "",
        enabled: true,
        preference: "lowStimulation",
        value: true,
        from: "22:00",
        to: "07:00",
        days: [0, 1, 2, 3, 4, 5, 6],
      },
    };
  };

  private _editRule = (ev: Event) => {
    const rule = this._rules[this._indexOf(ev)];
    if (rule) {
      this._statesText = rule.condition?.states.join(", ") ?? "";
      this._thresholdText =
        rule.condition?.threshold === undefined
          ? ""
          : String(rule.condition.threshold);
      this._focusAfterEditor = rule.id;
      this._draft = {
        isNew: false,
        rule: {
          ...rule,
          days: [...rule.days],
          condition: rule.condition && {
            ...rule.condition,
            states: [...rule.condition.states],
          },
        },
      };
    }
  };

  // Editor ------------------------------------------------------------------

  private _patch(change: Partial<ScheduleRule>) {
    if (this._draft) {
      this._draft = {
        ...this._draft,
        rule: { ...this._draft.rule, ...change },
      };
    }
  }

  private _draftPreference = (ev: HaSelectSelectEvent) => {
    const preference = ev.detail.value as SchedulablePreference;
    const current = this._draft?.rule;
    if (!current || !SCHEDULABLE_PREFERENCES.includes(preference)) {
      return;
    }
    this._patch({
      preference,
      value: isValueFor(preference, current.value)
        ? current.value
        : preference === "languageMode"
          ? "cantonese"
          : true,
    });
  };

  private _draftValue = (ev: Event) => {
    const raw = (ev.currentTarget as HTMLElement).dataset.value;
    const preference = this._draft?.rule.preference;
    if (!preference) {
      return;
    }
    const value = preference === "languageMode" ? raw : raw === "true";
    if (isValueFor(preference, value)) {
      this._patch({ value });
    }
  };

  private _draftTime = (ev: CustomEvent<{ value?: string }>) => {
    const key = (ev.currentTarget as HTMLElement).dataset.key as "from" | "to";
    const value = ev.detail.value?.slice(0, 5);
    if (value) {
      this._patch({ [key]: value });
    }
  };

  private _draftTimed = (ev: Event) => {
    const timed = (ev.target as HaSwitch).checked;
    const rule = this._draft?.rule;
    if (!rule) {
      return;
    }
    // A rule needs a time window or a condition, so turning off one of them
    // while the other is off turns the other on.
    this._patch({
      timed: timed ? undefined : false,
      condition:
        !timed && !rule.condition ? this._emptyCondition() : rule.condition,
    });
  };

  private _emptyCondition(): EntityCondition {
    this._statesText = "";
    this._thresholdText = "";
    return { entityId: "", comparison: "is", states: [] };
  }

  private _draftConditionToggle = (ev: Event) => {
    const on = (ev.target as HaSwitch).checked;
    const rule = this._draft?.rule;
    if (!rule) {
      return;
    }
    if (on) {
      this._patch({ condition: this._emptyCondition() });
    } else {
      this._patch({ condition: undefined, timed: undefined });
    }
  };

  private _patchCondition(change: Partial<EntityCondition>) {
    const condition = this._draft?.rule.condition;
    if (condition) {
      this._patch({ condition: { ...condition, ...change } });
    }
  }

  private _draftEntity = (ev: CustomEvent<{ value?: string }>) => {
    ev.stopPropagation();
    this._patchCondition({ entityId: ev.detail.value ?? "" });
  };

  private _draftComparison = (ev: HaSelectSelectEvent) => {
    const comparison = ev.detail.value as EntityComparison;
    const condition = this._draft?.rule.condition;
    if (!condition || !ENTITY_COMPARISONS.includes(comparison)) {
      return;
    }
    const numeric = comparison === "above" || comparison === "below";
    this._patchCondition({
      comparison,
      states: numeric ? [] : cleanStates(this._statesText.split(",")),
      threshold: numeric ? this._thresholdValue() : undefined,
    });
  };

  private _thresholdValue(): number | undefined {
    const text = this._thresholdText.trim();
    if (!text) {
      return undefined;
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : undefined;
  }

  private _draftStates = (ev: Event) => {
    this._statesText = (ev.target as HTMLInputElement).value ?? "";
    this._patchCondition({ states: cleanStates(this._statesText.split(",")) });
  };

  private _draftThreshold = (ev: Event) => {
    this._thresholdText = (ev.target as HTMLInputElement).value ?? "";
    this._patchCondition({ threshold: this._thresholdValue() });
  };

  private _useCurrentState = () => {
    const condition = this._draft?.rule.condition;
    const currentState = condition
      ? this._lookup(condition.entityId)
      : undefined;
    if (!condition || currentState === undefined) {
      return;
    }
    if (condition.comparison === "above" || condition.comparison === "below") {
      const number = parseNumericState(currentState);
      if (number !== undefined) {
        this._thresholdText = String(number);
        this._patchCondition({ threshold: number });
      }
      return;
    }
    const states = cleanStates([...condition.states, currentState]);
    this._statesText = states.join(", ");
    this._patchCondition({ states });
  };

  private _draftName = (ev: Event) => {
    this._patch({ name: (ev.target as HTMLInputElement).value ?? "" });
  };

  private _draftDay = (ev: Event) => {
    const day = Number((ev.currentTarget as HTMLElement).dataset.day);
    const days = this._draft?.rule.days ?? [];
    this._patch({
      days: (days.includes(day)
        ? days.filter((item) => item !== day)
        : [...days, day]
      ).sort((a, b) => a - b),
    });
  };

  private _noSubmit = (ev: Event) => {
    ev.preventDefault();
  };

  private _cancel = () => {
    this._draft = undefined;
  };

  private _draftRules(): ScheduleRule[] {
    const draft = this._draft;
    if (!draft) {
      return this._rules;
    }
    const index = this._rules.findIndex((rule) => rule.id === draft.rule.id);
    if (index < 0) {
      return [...this._rules, draft.rule];
    }
    const rules = [...this._rules];
    rules[index] = draft.rule;
    return rules;
  }

  private _saveDraft = () => {
    const draft = this._draft;
    if (!draft || ruleProblem(draft.rule)) {
      return;
    }
    if (draft.isNew && this._rules.length >= MAX_SCHEDULE_RULES) {
      return;
    }
    const rules = this._draftRules();
    if (draft.isNew) {
      this._focusAfterEditor = "new";
    }
    this._draft = undefined;
    if (this._save(rules)) {
      showToast(this, { message: this._t("schedules.saved") });
    }
  };

  private _deleteDraft = async () => {
    const draft = this._draft;
    if (!draft || draft.isNew) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("schedules.delete_title"),
      text: this._t("schedules.delete_text", {
        name: this._title(draft.rule),
        preference: this._prefName(draft.rule.preference),
      }),
      confirmText: this._t("schedules.delete"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    // The rule is gone, so the focus goes to the New rule button.
    this._focusAfterEditor = "new";
    this._draft = undefined;
    if (this._save(this._rules.filter((rule) => rule.id !== draft.rule.id))) {
      showToast(this, { message: this._t("schedules.deleted") });
    }
  };

  // Rendering ---------------------------------------------------------------

  protected render(): TemplateResult {
    const zone = getScheduleTimeZone();
    const zoneFallback = isScheduleZoneFallback();
    const atLimit = this._rules.length >= MAX_SCHEDULE_RULES;
    return html`
      <ha-card .header=${this._t("schedules.title")}>
        <div class="card-content">
          <p class="note">${this._tl("schedules.note")}</p>
          <p class="note">${this._t("schedules.zone_note", { zone })}</p>
          ${
            zoneFallback
              ? html`<p class="note warn" role="status">
                  ${this._t("schedules.zone_fallback")}
                </p>`
              : nothing
          }
          <div class="toolbar">
            <ha-button
              appearance="filled"
              class="new-rule"
              .disabled=${atLimit || !!this._draft}
              @click=${this._newRule}
            >
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${this._t("schedules.new_rule")}
            </ha-button>
            ${
              atLimit
                ? html`<span class="note"
                    >${this._t("schedules.limit", {
                      count: MAX_SCHEDULE_RULES,
                    })}</span
                  >`
                : nothing
            }
          </div>
          <div class=${classMap({ body: true, narrow: this.narrow })}>
            <div class="list-side">
              ${this._renderList()}${this._renderNow()}
            </div>
            ${this._draft ? this._renderEditor(this._draft) : nothing}
          </div>
          <p class="sr-only" role="status" aria-live="polite">
            ${this._announce}
          </p>
        </div>
      </ha-card>
    `;
  }

  private _renderList(): TemplateResult {
    if (!this._rules.length) {
      return html`<p class="note empty">${this._t("schedules.empty")}</p>`;
    }
    const evaluation = this._summary?.evaluation;
    return html`<ol class="rules" aria-label=${this._t("schedules.list_label")}>
      ${repeat(
        this._rules,
        (rule) => rule.id,
        (rule, index) => {
          const title = this._title(rule);
          const status = this._status(rule, evaluation);
          return html`<li
            class=${classMap({
              rule: true,
              off: !rule.enabled,
              editing: this._draft?.rule.id === rule.id,
            })}
          >
            <div class="rule-main">
              <span class="rule-title">${title}</span>
              ${
                rule.name
                  ? html`<span class="rule-sentence"
                      >${this._sentence(rule)}</span
                    >`
                  : nothing
              }
              <span class=${classMap({ chip: true, [status.tone]: true })}
                >${status.text}</span
              >
            </div>
            <div class="rule-actions">
              <ha-switch
                data-id=${rule.id}
                .checked=${rule.enabled}
                aria-label=${this._t("schedules.enable_rule", { name: title })}
                @change=${this._toggleRule}
              ></ha-switch>
              <ha-icon-button
                data-id=${rule.id}
                data-action="edit"
                .path=${mdiPencil}
                .label=${this._t("schedules.edit_label", { name: title })}
                @click=${this._editRule}
              ></ha-icon-button>
              <ha-icon-button
                data-id=${rule.id}
                data-action="up"
                .path=${mdiArrowUp}
                .disabled=${index === 0}
                .label=${this._t("schedules.move_up_label", { name: title })}
                @click=${this._moveUp}
              ></ha-icon-button>
              <ha-icon-button
                data-id=${rule.id}
                data-action="down"
                .path=${mdiArrowDown}
                .disabled=${index === this._rules.length - 1}
                .label=${this._t("schedules.move_down_label", { name: title })}
                @click=${this._moveDown}
              ></ha-icon-button>
            </div>
          </li>`;
        }
      )}
    </ol>`;
  }

  private _status(
    rule: ScheduleRule,
    evaluation?: ScheduleEvaluation
  ): { text: string; tone: string } {
    if (!rule.enabled) {
      return { text: this._t("schedules.status.off"), tone: "muted" };
    }
    if (evaluation?.heldBySchool[rule.id]) {
      return {
        text: this._t("schedules.status.school", {
          name: this.prefs.schoolName,
        }),
        tone: "warn",
      };
    }
    if (evaluation?.deciding[rule.preference]?.ruleId === rule.id) {
      return { text: this._t("schedules.status.active"), tone: "active" };
    }
    if (evaluation?.overridden[rule.id]) {
      return { text: this._t("schedules.status.overridden"), tone: "warn" };
    }
    if (rule.condition) {
      const entity = this._entityName(rule.condition.entityId);
      const status = conditionStatus(rule.condition, this._lookup);
      if (status === "unavailable") {
        return {
          text: this._t("schedules.status.entity_unavailable", { entity }),
          tone: "warn",
        };
      }
      if (status === "not_met") {
        return {
          text: this._t("schedules.status.entity_waiting", { entity }),
          tone: "muted",
        };
      }
    }
    return { text: this._t("schedules.status.waiting"), tone: "muted" };
  }

  /** For each preference that has a rule: what is in effect and why. */
  private _renderNow(): TemplateResult | typeof nothing {
    const summary = this._summary;
    const preferences = SCHEDULABLE_PREFERENCES.filter((preference) =>
      this._rules.some((rule) => rule.preference === preference && rule.enabled)
    );
    if (!summary || !preferences.length) {
      return nothing;
    }
    return html`<div class="now" role="region" aria-labelledby="schedules-now">
      <h3 id="schedules-now">
        <ha-svg-icon .path=${mdiClockOutline}></ha-svg-icon>
        ${this._t("schedules.now_title")}
      </h3>
      <ul>
        ${preferences.map((preference) =>
          this._renderNowLine(preference, summary)
        )}
      </ul>
    </div>`;
  }

  private _renderNowLine(
    preference: SchedulablePreference,
    summary: Summary
  ): TemplateResult {
    const name = this._prefName(preference);
    const { evaluation } = summary;
    const deciding = evaluation.deciding[preference];
    const next = summary.next[preference];
    let line: string;
    if (this._held().has(preference)) {
      line = this._t("schedules.now_held", {
        preference: name,
        name: this.prefs.schoolName,
      });
    } else if (deciding) {
      line = this._t("schedules.now_rule", {
        preference: name,
        value: this._valueName(preference, deciding.value),
        rule: this._title(this._ruleById(deciding.ruleId) ?? this._rules[0]),
      });
    } else {
      line = this._t("schedules.now_choice", {
        preference: name,
        value: this._valueName(
          preference,
          this.prefs[preference] as ScheduleValue
        ),
      });
    }
    return html`<li>
      ${line}
      ${
        next
          ? html`<span class="next"
              >${
                next.value === undefined
                  ? this._t("schedules.next_back", {
                      when: this._whenText(next.at),
                    })
                  : this._t("schedules.next_value", {
                      when: this._whenText(next.at),
                      value: this._valueName(preference, next.value),
                    })
              }</span
            >`
          : nothing
      }
    </li>`;
  }

  private _renderEditor(draft: Draft): TemplateResult {
    const { rule } = draft;
    const problem = ruleProblem(rule);
    const rules = this._draftRules();
    const conflicts = findConflicts(rules);
    const losesTo = (conflicts[rule.id] ?? [])
      .map((id) => this._ruleById(id))
      .filter((other): other is ScheduleRule => !!other);
    const winsOver = rules
      .filter((other) => conflicts[other.id]?.includes(rule.id))
      .filter((other) => other.id !== rule.id);
    const row = PREFERENCE_ROW[rule.preference];
    const values: ScheduleValue[] =
      rule.preference === "languageMode"
        ? [...SCHEDULE_LANGUAGE_MODES]
        : [true, false];
    const heldByPage = this._held().has(rule.preference);
    const timed = isTimed(rule);
    return html`<form
      class="editor"
      aria-labelledby="schedule-editor-title"
      @submit=${this._noSubmit}
    >
      <h3 id="schedule-editor-title" tabindex="-1">
        ${this._t(draft.isNew ? "schedules.editor_new" : "schedules.editor_edit")}
      </h3>

      <ha-input
        .label=${this._t("schedules.field_name")}
        maxlength=${SCHEDULE_NAME_MAX}
        .value=${rule.name}
        @input=${this._draftName}
      ></ha-input>

      <div class="field">
        <span class="label"
          ><span id="schedule-change-label"
            >${this._t("schedules.field_change")}</span
          >
          <ha-setting-info
            .hass=${this.hass}
            .label=${this._prefName(rule.preference)}
            .description=${this._tl(`${row}.description`)}
            .defaultText=${this._t(`${row}.default`)}
            .reach=${this._tl(`${row}.reach`)}
            .holding=${
              heldByPage
                ? this._t("school_mode.held", { name: this.prefs.schoolName })
                : ""
            }
            .labels=${this._infoLabels()}
          ></ha-setting-info
        ></span>
        <ha-select
          .label=${this._t("schedules.field_change")}
          .value=${rule.preference}
          .options=${SCHEDULABLE_PREFERENCES.map((preference) => ({
            value: preference,
            label: this._prefName(preference),
          }))}
          @selected=${this._draftPreference}
        ></ha-select>
      </div>

      <div class="field" role="group" aria-labelledby="schedule-to-label">
        <span class="label" id="schedule-to-label"
          >${this._t("schedules.field_to")}</span
        >
        <div class="segments">
          ${values.map(
            (value) =>
              html`<button
                type="button"
                class=${classMap({
                  segment: true,
                  selected: rule.value === value,
                })}
                aria-pressed=${rule.value === value ? "true" : "false"}
                data-value=${String(value)}
                @click=${this._draftValue}
              >
                ${this._valueName(rule.preference, value)}
              </button>`
          )}
        </div>
      </div>

      <label class="switch-row">
        <ha-switch
          .checked=${timed}
          aria-label=${this._t("schedules.field_timed")}
          @change=${this._draftTimed}
        ></ha-switch>
        <span>${this._t("schedules.field_timed")}</span>
      </label>
      ${
        timed
          ? html`<div class="times">
                <ha-time-input
                  .locale=${this.hass.locale}
                  .label=${this._t("schedules.field_from")}
                  .value=${`${rule.from}:00`}
                  data-key="from"
                  @value-changed=${this._draftTime}
                ></ha-time-input>
                <ha-time-input
                  .locale=${this.hass.locale}
                  .label=${this._t("schedules.field_until")}
                  .value=${`${rule.to}:00`}
                  data-key="to"
                  @value-changed=${this._draftTime}
                ></ha-time-input>
              </div>
              <p class="note">${this._t("schedules.time_hint")}</p>
              <div
                class="field"
                role="group"
                aria-labelledby="schedule-days-label"
              >
                <span class="label" id="schedule-days-label"
                  >${this._t("schedules.field_days")}</span
                >
                <div class="days">
                  ${DAY_ORDER.map(
                    (day) =>
                      html`<button
                        type="button"
                        class=${classMap({
                          day: true,
                          selected: rule.days.includes(day),
                        })}
                        aria-pressed=${
                          rule.days.includes(day) ? "true" : "false"
                        }
                        data-day=${day}
                        @click=${this._draftDay}
                      >
                        ${this._dayName(day)}
                      </button>`
                  )}
                </div>
              </div>`
          : nothing
      }

      <label class="switch-row">
        <ha-switch
          .checked=${!!rule.condition}
          aria-label=${this._t("schedules.field_entity")}
          @change=${this._draftConditionToggle}
        ></ha-switch>
        <span>${this._t("schedules.field_entity")}</span>
      </label>
      ${rule.condition ? this._renderCondition(rule.condition) : nothing}

      <p class="preview" role="status">
        ${problem ? nothing : this._sentence(rule)}
      </p>
      ${
        problem
          ? html`<p class="problem" role="alert">
              ${this._t(`schedules.problem.${problem}`)}
            </p>`
          : nothing
      }
      ${
        heldByPage
          ? html`<p class="note">${this._t("schedules.school_note")}</p>`
          : nothing
      }
      ${
        losesTo.length
          ? html`<p class="note warn">
              ${this._t("schedules.conflict_loses", {
                rules: losesTo.map((other) => this._title(other)).join(", "),
              })}
            </p>`
          : nothing
      }
      ${
        winsOver.length
          ? html`<p class="note">
              ${this._t("schedules.conflict_wins", {
                rules: winsOver.map((other) => this._title(other)).join(", "),
              })}
            </p>`
          : nothing
      }

      <div class="editor-actions">
        ${
          draft.isNew
            ? nothing
            : html`<ha-button
                appearance="plain"
                variant="danger"
                @click=${this._deleteDraft}
                >${this._t("schedules.delete")}</ha-button
              >`
        }
        <span class="spacer"></span>
        <ha-button appearance="plain" @click=${this._cancel}
          >${this._t("schedules.cancel")}</ha-button
        >
        <ha-button
          appearance="filled"
          .disabled=${!!problem}
          @click=${this._saveDraft}
          >${this._t("schedules.save")}</ha-button
        >
      </div>
    </form>`;
  }

  private _renderCondition(condition: EntityCondition): TemplateResult {
    const numeric =
      condition.comparison === "above" || condition.comparison === "below";
    const stateObj = condition.entityId
      ? this.hass.states[condition.entityId]
      : undefined;
    const status = condition.entityId
      ? conditionStatus(condition, this._lookup)
      : undefined;
    const current = stateObj
      ? this.hass.formatEntityState(stateObj)
      : undefined;
    return html`<div class="condition">
      <ha-entity-picker
        .hass=${this.hass}
        .label=${this._t("schedules.field_entity_pick")}
        .value=${condition.entityId}
        @value-changed=${this._draftEntity}
      ></ha-entity-picker>
      <ha-select
        .label=${this._t("schedules.field_comparison")}
        .value=${condition.comparison}
        .options=${ENTITY_COMPARISONS.map((comparison) => ({
          value: comparison,
          label: this._t(`schedules.comparison.${comparison}`),
        }))}
        @selected=${this._draftComparison}
      ></ha-select>
      ${
        numeric
          ? html`<ha-input
              type="number"
              step="any"
              .label=${this._t("schedules.field_number")}
              .value=${this._thresholdText}
              @input=${this._draftThreshold}
            ></ha-input>`
          : html`<ha-input
              .label=${this._t("schedules.field_states")}
              .hint=${this._t("schedules.states_hint")}
              maxlength="700"
              .value=${this._statesText}
              @input=${this._draftStates}
            ></ha-input>`
      }
      ${
        stateObj
          ? html`<div class="current">
              <span class="note"
                >${this._t("schedules.entity_current", {
                  state: current ?? stateObj.state,
                })}</span
              >
              <ha-button appearance="plain" @click=${this._useCurrentState}
                >${this._t(
                  numeric
                    ? "schedules.use_current_number"
                    : "schedules.use_current_state"
                )}</ha-button
              >
            </div>`
          : nothing
      }
      ${
        status
          ? html`<p
              class=${classMap({ note: true, warn: status === "unavailable" })}
              role="status"
            >
              ${this._t(`schedules.holds.${status}`)}
            </p>`
          : nothing
      }
    </div>`;
  }

  /** The info panel's own words, in the language mode of this page. */
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

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .note,
    .empty {
      margin: 0 0 var(--ha-space-2);
      color: var(--secondary-text-color);
      white-space: pre-line;
    }
    .note.warn {
      color: var(--warning-color);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2) var(--ha-space-4);
      margin-bottom: var(--ha-space-3);
    }
    .body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--ha-space-4);
      align-items: start;
    }
    .body.narrow {
      grid-template-columns: minmax(0, 1fr);
    }
    @media (max-width: 720px) {
      .body {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .rules {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .rule {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: 16px;
      background: var(--secondary-background-color);
    }
    /* A timeline: a rail runs down the list and each rule hangs a dot on it. */
    .rules {
      position: relative;
      padding-inline-start: var(--ha-space-6, 24px);
    }
    .rules::before {
      content: "";
      position: absolute;
      inset-block: var(--ha-space-4);
      inset-inline-start: 6px;
      width: 2px;
      border-radius: 1px;
      background: var(--ha-color-outline, var(--divider-color));
    }
    .rule {
      position: relative;
    }
    .rule::before {
      content: "";
      position: absolute;
      inset-inline-start: calc(-1 * var(--ha-space-6, 24px) + 1px);
      inset-block-start: 50%;
      width: 12px;
      height: 12px;
      margin-top: -6px;
      border-radius: 50%;
      background: var(--primary-color);
    }
    .rule.off::before {
      background: var(--ha-color-outline, var(--divider-color));
    }
    .rule.editing {
      outline: 2px solid var(--primary-color);
    }
    .rule.off .rule-title,
    .rule.off .rule-sentence {
      color: var(--secondary-text-color);
    }
    .rule-main {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-1);
      flex: 1 1 180px;
      min-width: 0;
    }
    .rule-title {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .rule-sentence {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .rule-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .chip {
      display: inline-block;
      padding: 0 var(--ha-space-2);
      border-radius: 12px;
      font-size: var(--ha-font-size-xs, 12px);
      background: var(--divider-color);
      color: var(--primary-text-color);
    }
    .chip.active {
      background: var(--primary-color);
      color: var(--text-primary-color);
    }
    .chip.warn {
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      box-shadow: inset 0 0 0 2px var(--warning-color);
    }
    .now {
      margin-top: var(--ha-space-4);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: 16px;
      background: var(--secondary-background-color);
    }
    .now h3 {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .now ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .next {
      display: block;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: 20px;
      background: var(--secondary-background-color);
      min-width: 0;
    }
    .editor h3 {
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .editor h3:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
    }
    .label {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    ha-input,
    ha-select,
    ha-time-input,
    ha-entity-picker {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    .switch-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 44px;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .condition {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .current {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .current .note {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .segment:focus-visible,
    .day:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .times {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-3);
    }
    .times ha-time-input {
      flex: 1 1 140px;
    }
    .segments,
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .segment,
    .day {
      min-width: 44px;
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      font: inherit;
      color: var(--primary-text-color);
      background: none;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .segment.selected,
    .day.selected {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color);
    }
    .preview {
      margin: 0;
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .problem {
      margin: 0;
      color: var(--error-color);
    }
    .editor-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .spacer {
      flex: 1 1 0;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-personal-schedules": HaPersonalSchedules;
  }
}
