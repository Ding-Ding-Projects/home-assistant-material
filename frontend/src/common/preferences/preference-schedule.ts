/**
 * Schedules for personal preferences.
 *
 * A rule says "between these times on these days, this preference has this
 * value". The rules are checked top to bottom and the first one that applies
 * to a preference wins. Evaluating the rules never writes to the stored
 * choice: it gives an overlay that is laid over the stored choices, below
 * School mode, so the stored choice is back as soon as no rule applies.
 *
 * Everything here is pure. Storage and the clock live in
 * `preference-schedule-store.ts`.
 */
import { stripHiddenCharacters } from "../string/hidden-characters";
import type { LanguageMode, PersonalPreferences } from "./personal-preferences";

/** The preferences a rule can change; each has a real consumer today. */
export const SCHEDULABLE_PREFERENCES = [
  "languageMode",
  "lowStimulation",
  "soundEffects",
  "dialogEmojis",
  "oneThingAtATime",
  "focusSpotlight",
  "timeAwareness",
  "momentum",
  "narratorEnabled",
] as const satisfies readonly (keyof PersonalPreferences)[];

export type SchedulablePreference = (typeof SCHEDULABLE_PREFERENCES)[number];

export const SCHEDULE_LANGUAGE_MODES = [
  "english",
  "cantonese",
  "bilingual",
] as const satisfies readonly LanguageMode[];

export type ScheduleValue = boolean | LanguageMode;

export const ENTITY_COMPARISONS = ["is", "is_not", "above", "below"] as const;

export type EntityComparison = (typeof ENTITY_COMPARISONS)[number];

/** A condition on the state of one Home Assistant entity. */
export interface EntityCondition {
  /** The entity, as `domain.object_id`. */
  entityId: string;
  comparison: EntityComparison;
  /** The states to match, for "is" and "is not". */
  states: string[];
  /** The number to compare with, for "above" and "below". */
  threshold?: number;
}

export const MAX_CONDITION_STATES = 10;
export const CONDITION_STATE_MAX = 64;
export const ENTITY_ID_MAX = 255;

/** Looks up the state of an entity; undefined when the entity is not known. */
export type EntityStateLookup = (entityId: string) => string | undefined;

export interface ScheduleRule {
  id: string;
  /** An optional title; the rule reads as a sentence when it is empty. */
  name: string;
  enabled: boolean;
  preference: SchedulablePreference;
  value: ScheduleValue;
  /** Start as "HH:MM", 24 hours. */
  from: string;
  /** End as "HH:MM". An end before the start runs into the next day. */
  to: string;
  /** Days the rule starts on, 0 is Sunday and 6 is Saturday. */
  days: number[];
  /**
   * False when the rule has no time window and depends on the entity only.
   * Missing means true, which is what rules stored before this field read as.
   * `from`, `to` and `days` are still stored then, so the rule stays valid.
   */
  timed?: boolean;
  /** An optional condition; when set it must hold as well as the time window. */
  condition?: EntityCondition;
}

export const MAX_SCHEDULE_RULES = 30;
export const SCHEDULE_NAME_MAX = 40;
const WEEK_MINUTES = 7 * 1440;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isScheduleTime = (value: unknown): value is string =>
  typeof value === "string" && TIME_PATTERN.test(value);

export const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const isSchedulablePreference = (
  value: unknown
): value is SchedulablePreference =>
  (SCHEDULABLE_PREFERENCES as readonly unknown[]).includes(value);

/** True when `value` is a value this preference can take. */
export const isValueFor = (
  preference: SchedulablePreference,
  value: unknown
): value is ScheduleValue =>
  preference === "languageMode"
    ? (SCHEDULE_LANGUAGE_MODES as readonly unknown[]).includes(value)
    : typeof value === "boolean";

const ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export const isEntityId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= ENTITY_ID_MAX &&
  ENTITY_ID_PATTERN.test(value);

export const isEntityComparison = (value: unknown): value is EntityComparison =>
  (ENTITY_COMPARISONS as readonly unknown[]).includes(value);

/** The state as a number, or undefined when it is not plainly numeric. */
export const parseNumericState = (state: string): number | undefined => {
  const trimmed = state.trim();
  if (!NUMBER_PATTERN.test(trimmed)) {
    return undefined;
  }
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
};

const cleanState = (value: unknown): string =>
  typeof value === "string"
    ? Array.from(stripHiddenCharacters(value).replace(/\s+/g, " ").trim())
        .slice(0, CONDITION_STATE_MAX)
        .join("")
    : "";

/** The states of a condition: trimmed, without blanks or repeats, capped. */
export const cleanStates = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map(cleanState).filter((state) => state))].slice(
        0,
        MAX_CONDITION_STATES
      )
    : [];

/** One stored condition, or undefined when it is not valid. */
export const sanitizeCondition = (
  raw: unknown
): EntityCondition | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  if (!isEntityId(source.entityId) || !isEntityComparison(source.comparison)) {
    return undefined;
  }
  if (source.comparison === "above" || source.comparison === "below") {
    if (
      typeof source.threshold !== "number" ||
      !Number.isFinite(source.threshold)
    ) {
      return undefined;
    }
    return {
      entityId: source.entityId,
      comparison: source.comparison,
      states: [],
      threshold: source.threshold,
    };
  }
  const states = cleanStates(source.states);
  if (!states.length) {
    return undefined;
  }
  return { entityId: source.entityId, comparison: source.comparison, states };
};

const cleanDays = (value: unknown): number[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (day): day is number =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6
          )
        ),
      ].sort((a, b) => a - b)
    : [];

/** A title with control and hidden characters removed and spaces collapsed. */
const cleanName = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  const spaced = Array.from(value)
    .map((char) => {
      const code = char.codePointAt(0)!;
      return code < 32 || code === 127 ? " " : char;
    })
    .join("");
  return Array.from(stripHiddenCharacters(spaced).replace(/\s+/g, " ").trim())
    .slice(0, SCHEDULE_NAME_MAX)
    .join("");
};

/** One stored rule, or undefined when it is not valid. */
export const sanitizeRule = (raw: unknown): ScheduleRule | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  if (
    typeof source.id !== "string" ||
    !source.id ||
    source.id.length > 40 ||
    !isSchedulablePreference(source.preference) ||
    !isValueFor(source.preference, source.value) ||
    !isScheduleTime(source.from) ||
    !isScheduleTime(source.to)
  ) {
    return undefined;
  }
  const rule: ScheduleRule = {
    id: source.id,
    name: cleanName(source.name),
    enabled: source.enabled !== false,
    preference: source.preference,
    value: source.value,
    from: source.from,
    to: source.to,
    days: cleanDays(source.days),
  };
  const condition = sanitizeCondition(source.condition);
  if (condition) {
    rule.condition = condition;
  }
  // A rule with no time window needs a valid condition, or it would apply
  // always; one that has neither is dropped.
  if (source.timed === false) {
    if (!condition) {
      return undefined;
    }
    rule.timed = false;
  }
  return rule;
};

/** The valid rules of a stored list, without repeats of an id, capped. */
export const sanitizeSchedules = (raw: unknown): ScheduleRule[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const rules: ScheduleRule[] = [];
  for (const item of raw) {
    const rule = sanitizeRule(item);
    if (rule && !seen.has(rule.id)) {
      seen.add(rule.id);
      rules.push(rule);
    }
    if (rules.length >= MAX_SCHEDULE_RULES) {
      break;
    }
  }
  return rules;
};

export type RuleProblem =
  | "no_days"
  | "no_value"
  | "invalid_time"
  | "no_condition"
  | "invalid_entity"
  | "no_states"
  | "invalid_number";

/** True when the rule has a time window. */
export const isTimed = (rule: Pick<ScheduleRule, "timed">): boolean =>
  rule.timed !== false;

/** What is wrong with a condition as it is being edited, if anything. */
export const conditionProblem = (
  condition: EntityCondition
): RuleProblem | undefined => {
  if (!isEntityId(condition.entityId)) {
    return "invalid_entity";
  }
  if (condition.comparison === "above" || condition.comparison === "below") {
    return typeof condition.threshold === "number" &&
      Number.isFinite(condition.threshold)
      ? undefined
      : "invalid_number";
  }
  return cleanStates(condition.states).length ? undefined : "no_states";
};

/** What is wrong with a rule as it is being edited, if anything. */
export const ruleProblem = (
  rule: Pick<ScheduleRule, "preference" | "value" | "from" | "to" | "days"> &
    Partial<Pick<ScheduleRule, "timed" | "condition">>
): RuleProblem | undefined => {
  if (!isValueFor(rule.preference, rule.value)) {
    return "no_value";
  }
  if (rule.condition) {
    const problem = conditionProblem(rule.condition);
    if (problem) {
      return problem;
    }
  }
  if (!isTimed(rule)) {
    return rule.condition ? undefined : "no_condition";
  }
  if (!isScheduleTime(rule.from) || !isScheduleTime(rule.to)) {
    return "invalid_time";
  }
  if (!rule.days.length) {
    return "no_days";
  }
  return undefined;
};

/** True when the rule runs for the whole of each chosen day. */
export const isAllDay = (rule: Pick<ScheduleRule, "from" | "to">): boolean =>
  rule.from === rule.to;

export interface ZoneParts {
  /** 0 is Sunday. */
  day: number;
  /** Minutes since midnight on the wall clock. */
  minute: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat | null>();

const formatterFor = (zone: string): Intl.DateTimeFormat | null => {
  let formatter = formatters.get(zone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    } catch (_err) {
      formatter = null;
    }
    formatters.set(zone, formatter);
  }
  return formatter;
};

/** True when the browser knows this time zone name. */
export const isKnownZone = (zone: string): boolean =>
  !!zone && formatterFor(zone) !== null;

/**
 * The weekday and wall clock time in a time zone. A zone the browser does not
 * know reads as the browser's own zone. Using the wall clock means a day with
 * a daylight saving change simply skips or repeats the hour on the clock.
 */
export const zoneParts = (date: Date, zone: string): ZoneParts => {
  const formatter = formatterFor(zone);
  if (!formatter) {
    return {
      day: date.getDay(),
      minute: date.getHours() * 60 + date.getMinutes(),
    };
  }
  let weekday = "Sun";
  let hour = 0;
  let minute = 0;
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "weekday") {
      weekday = part.value;
    } else if (part.type === "hour") {
      hour = Number(part.value) % 24;
    } else if (part.type === "minute") {
      minute = Number(part.value);
    }
  }
  return { day: WEEKDAYS[weekday] ?? 0, minute: hour * 60 + minute };
};

export type ConditionStatus = "met" | "not_met" | "unavailable";

/** The states that say an entity cannot be read right now. */
const UNREADABLE_STATES = new Set(["unavailable", "unknown"]);

/**
 * Whether a condition holds. An entity that is missing, unavailable or
 * unknown is "unavailable" and never holds, whatever the comparison. A number
 * comparison against a state that is not a number does not hold either.
 */
export const conditionStatus = (
  condition: EntityCondition,
  lookup?: EntityStateLookup
): ConditionStatus => {
  const state = lookup?.(condition.entityId);
  if (
    typeof state !== "string" ||
    UNREADABLE_STATES.has(state.trim().toLowerCase())
  ) {
    return "unavailable";
  }
  if (condition.comparison === "above" || condition.comparison === "below") {
    const number = parseNumericState(state);
    if (number === undefined || typeof condition.threshold !== "number") {
      return "not_met";
    }
    return (
      condition.comparison === "above"
        ? number > condition.threshold
        : number < condition.threshold
    )
      ? "met"
      : "not_met";
  }
  const wanted = condition.states.map((item) => item.trim().toLowerCase());
  const listed = wanted.includes(state.trim().toLowerCase());
  return (condition.comparison === "is" ? listed : !listed) ? "met" : "not_met";
};

/** The entities the rules depend on, once each and in order. Enabled rules only. */
export const watchedEntityIds = (rules: readonly ScheduleRule[]): string[] => [
  ...new Set(
    rules
      .filter((rule) => rule.enabled && rule.condition)
      .map((rule) => rule.condition!.entityId)
  ),
];

/**
 * True when a rule applies at this weekday and minute. A day in `days` is the
 * day the period starts on, so 22:00 to 07:00 on Friday runs into Saturday.
 * When the start and the end are the same, the rule covers the whole day.
 */
export const ruleApplies = (
  rule: ScheduleRule,
  parts: ZoneParts,
  lookup?: EntityStateLookup
): boolean => {
  if (!rule.enabled) {
    return false;
  }
  if (rule.condition && conditionStatus(rule.condition, lookup) !== "met") {
    return false;
  }
  if (!isTimed(rule)) {
    return true;
  }
  const from = minutesOf(rule.from);
  const to = minutesOf(rule.to);
  const yesterday = (parts.day + 6) % 7;
  if (from === to) {
    return rule.days.includes(parts.day);
  }
  if (from < to) {
    return (
      rule.days.includes(parts.day) && parts.minute >= from && parts.minute < to
    );
  }
  return (
    (rule.days.includes(parts.day) && parts.minute >= from) ||
    (rule.days.includes(yesterday) && parts.minute < to)
  );
};

export interface ScheduleEvaluation {
  /** The values rules give right now, only for fields School mode leaves free. */
  overlay: Partial<Record<SchedulablePreference, ScheduleValue>>;
  /** The rule that decides each preference right now. */
  deciding: Partial<
    Record<SchedulablePreference, { ruleId: string; value: ScheduleValue }>
  >;
  /** Rules that apply now but lose to an earlier rule that gives another value. */
  overridden: Record<string, string>;
  /** Rules that apply now but cannot show, because School mode holds the field. */
  heldBySchool: Record<
    string,
    { preference: SchedulablePreference; value: ScheduleValue }
  >;
}

/**
 * What the rules give at one moment. `held` names the preference fields that
 * School mode holds: they are never part of the overlay.
 */
export const evaluateSchedules = (
  rules: readonly ScheduleRule[],
  now: Date,
  zone: string,
  held: ReadonlySet<string> = new Set(),
  lookup?: EntityStateLookup
): ScheduleEvaluation => {
  const parts = zoneParts(now, zone);
  const result: ScheduleEvaluation = {
    overlay: {},
    deciding: {},
    // No prototype, so a stored id such as "__proto__" is just a key.
    overridden: Object.create(null),
    heldBySchool: Object.create(null),
  };
  for (const rule of rules) {
    if (!ruleApplies(rule, parts, lookup)) {
      continue;
    }
    if (held.has(rule.preference)) {
      result.heldBySchool[rule.id] = {
        preference: rule.preference,
        value: rule.value,
      };
      continue;
    }
    const winner = result.deciding[rule.preference];
    if (!winner) {
      result.deciding[rule.preference] = {
        ruleId: rule.id,
        value: rule.value,
      };
      result.overlay[rule.preference] = rule.value;
    } else if (winner.value !== rule.value) {
      result.overridden[rule.id] = winner.ruleId;
    }
  }
  return result;
};

/** A stable text for an overlay, to tell whether it changed. */
export const overlaySignature = (
  overlay: ScheduleEvaluation["overlay"]
): string =>
  SCHEDULABLE_PREFERENCES.filter((key) => key in overlay)
    .map((key) => `${key}=${String(overlay[key])}`)
    .join(";");

/** The preferences with the overlay laid over them. */
export const applyOverlay = <T extends PersonalPreferences>(
  preferences: T,
  overlay: ScheduleEvaluation["overlay"]
): T => {
  const keys = Object.keys(overlay) as SchedulablePreference[];
  return keys.length ? ({ ...preferences, ...overlay } as T) : preferences;
};

/** The stretches of the week a rule covers, in minutes from Sunday 00:00. */
const weeklyIntervals = (rule: ScheduleRule): [number, number][] => {
  if (!isTimed(rule)) {
    return [[0, WEEK_MINUTES]];
  }
  const from = minutesOf(rule.from);
  const to = minutesOf(rule.to);
  const length = from === to ? 1440 : to > from ? to - from : 1440 - from + to;
  const out: [number, number][] = [];
  for (const day of rule.days) {
    const start = day * 1440 + (from === to ? 0 : from);
    const end = start + length;
    if (end <= WEEK_MINUTES) {
      out.push([start, end]);
    } else {
      out.push([start, WEEK_MINUTES], [0, end - WEEK_MINUTES]);
    }
  }
  return out;
};

/** True when two rules apply at the same time on some day of the week. */
export const rulesOverlap = (a: ScheduleRule, b: ScheduleRule): boolean => {
  const second = weeklyIntervals(b);
  return weeklyIntervals(a).some(([s1, e1]) =>
    second.some(([s2, e2]) => s1 < e2 && s2 < e1)
  );
};

/**
 * For each enabled rule, the earlier enabled rules that change the same
 * preference to a different value at an overlapping time. Those earlier rules
 * win, so the rule's own value does not show during the overlap.
 */
export const findConflicts = (
  rules: readonly ScheduleRule[]
): Record<string, string[]> => {
  const conflicts: Record<string, string[]> = Object.create(null);
  rules.forEach((rule, index) => {
    if (!rule.enabled) {
      return;
    }
    const winners = rules
      .slice(0, index)
      .filter(
        (earlier) =>
          earlier.enabled &&
          earlier.preference === rule.preference &&
          earlier.value !== rule.value &&
          rulesOverlap(earlier, rule)
      )
      .map((earlier) => earlier.id);
    if (winners.length) {
      conflicts[rule.id] = winners;
    }
  });
  return conflicts;
};

export interface NextChange {
  at: Date;
  /** The value the preference has from then on, or undefined for the stored choice. */
  value: ScheduleValue | undefined;
}

/**
 * The next time the rules give this preference a different value, looking
 * ahead up to `horizonMinutes`. Candidates come from the edges of the rules
 * (their start and end on each coming day), then the exact minute is found
 * around each one, so a rule that only runs on one weekday is found from any
 * other day without scanning every minute. Undefined when nothing changes.
 */
export const nextChange = (
  rules: readonly ScheduleRule[],
  now: Date,
  zone: string,
  preference: SchedulablePreference,
  held: ReadonlySet<string> = new Set(),
  horizonMinutes = 8 * 1440,
  lookup?: EntityStateLookup
): NextChange | undefined => {
  if (held.has(preference)) {
    return undefined;
  }
  const relevant = rules.filter((rule) => rule.preference === preference);
  if (!relevant.length) {
    return undefined;
  }
  const valueAt = (date: Date): ScheduleValue | undefined =>
    evaluateSchedules(relevant, date, zone, held, lookup).overlay[preference];
  const startMs = Math.floor(now.getTime() / 60000) * 60000;
  const endMs = startMs + horizonMinutes * 60000;
  const current = valueAt(new Date(startMs));
  const today = zoneParts(new Date(startMs), zone).minute;
  const edges = new Set<number>([0]);
  relevant.filter(isTimed).forEach((rule) => {
    edges.add(minutesOf(rule.from));
    edges.add(minutesOf(rule.to));
  });
  const candidates = new Set<number>();
  for (let day = 0; day <= Math.ceil(horizonMinutes / 1440) + 1; day++) {
    edges.forEach((edge) => {
      candidates.add(startMs + (day * 1440 + edge - today) * 60000);
    });
  }
  const ordered = [...candidates]
    .filter((ms) => ms > startMs - 120 * 60000 && ms <= endMs + 120 * 60000)
    .sort((a, b) => a - b);
  for (const candidate of ordered) {
    // An hour of clock change can move a real edge; look around the estimate.
    for (let step = -120; step <= 120; step++) {
      const ms = candidate + step * 60000;
      if (ms <= startMs || ms > endMs) {
        continue;
      }
      if (valueAt(new Date(ms)) !== current) {
        return { at: new Date(ms), value: valueAt(new Date(ms)) };
      }
    }
  }
  return undefined;
};

/** A new id that no rule in the list uses. */
export const newRuleId = (rules: readonly ScheduleRule[]): string => {
  const used = new Set(rules.map((rule) => rule.id));
  const make = () => `rule-${Math.random().toString(36).slice(2, 10)}`;
  let id = make();
  while (used.has(id)) {
    id = make();
  }
  return id;
};
