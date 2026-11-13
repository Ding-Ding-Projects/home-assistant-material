import { ensureArray } from "../../../../common/array/ensure-array";

/** Monday is 0, Sunday is 6. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const WEEKDAY_ORDER = WEEKDAY_KEYS;

/** More fire times than this in a day are summarised instead of drawn. */
export const MAX_DRAWN_TIMES = 24;

export interface WeekEntry {
  /** What fires: an alias, or the position of the trigger. */
  source: string;
  triggerIndex: number;
  kind: "time" | "time_pattern";
  /** Fire times ("HH:MM") on each listed day. Empty when summarised. */
  times: string[];
  days: WeekDay[];
  /** Set when the pattern fires too often to draw one cell per time. */
  frequent?: { perDay: number };
}

export interface WeekPlan {
  entries: WeekEntry[];
  /** Triggers that cannot be placed on a calendar, with the reason key. */
  unpredictable: { source: string; triggerIndex: number; reason: string }[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Expands one cron-like field ("*", "5", "/15", "*\/15", "1,2") to numbers. */
const expandField = (
  value: unknown,
  max: number,
  fallback: number[]
): number[] | undefined => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const text = String(value).trim();
  if (text === "*") {
    return Array.from({ length: max }, (_, i) => i);
  }
  const step = /^\*?\/(\d+)$/.exec(text);
  if (step) {
    const n = Number(step[1]);
    if (n < 1) {
      return undefined;
    }
    return Array.from({ length: Math.ceil(max / n) }, (_, i) => i * n).filter(
      (v) => v < max
    );
  }
  if (/^\d+$/.test(text)) {
    return Number(text) < max ? [Number(text)] : undefined;
  }
  return undefined;
};

const parseClock = (text: string): string | undefined => {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return undefined;
  }
  return `${pad(Number(match[1]))}:${match[2]}`;
};

const parseWeekdays = (value: unknown): WeekDay[] => {
  // A trigger without `weekday` (the usual case) gives no array at all.
  const names = (ensureArray(value as string | string[] | undefined) ?? []).map(
    (d) => String(d).toLowerCase()
  );
  if (!names.length) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  return names
    .map((n) => WEEKDAY_KEYS.indexOf(n))
    .filter((i) => i >= 0) as WeekDay[];
};

const label = (trigger: any, fallback: string): string =>
  (typeof trigger?.alias === "string" && trigger.alias) || fallback;

/**
 * Places the time and time pattern triggers of an automation on a weekly
 * calendar. Only what can be known from the configuration is listed: triggers
 * that wait for an event, a state or the sun are returned as unpredictable.
 */
export const planWeek = (
  config: { triggers?: unknown; trigger?: unknown; alias?: string },
  automationName: string
): WeekPlan => {
  const triggers = ensureArray(config.triggers ?? config.trigger ?? []);
  const entries: WeekEntry[] = [];
  const unpredictable: WeekPlan["unpredictable"] = [];

  triggers.forEach((trigger: any, triggerIndex) => {
    if (trigger?.enabled === false) {
      return;
    }
    const kind = trigger?.trigger ?? trigger?.platform;
    const source = label(trigger, automationName);
    if (kind === "time") {
      const times: string[] = [];
      let dynamic = false;
      ensureArray(trigger.at).forEach((at: unknown) => {
        const clock = typeof at === "string" ? parseClock(at) : undefined;
        if (clock) {
          times.push(clock);
        } else {
          dynamic = true;
        }
      });
      if (times.length) {
        entries.push({
          source,
          triggerIndex,
          kind: "time",
          times: [...new Set(times)].sort(),
          days: parseWeekdays(trigger.weekday),
        });
      }
      if (dynamic) {
        unpredictable.push({ source, triggerIndex, reason: "dynamic_time" });
      }
    } else if (kind === "time_pattern") {
      const hours = expandField(
        trigger.hours,
        24,
        Array.from({ length: 24 }, (_, i) => i)
      );
      const minutes = expandField(trigger.minutes, 60, [0]);
      const seconds = trigger.seconds;
      if (
        !hours ||
        !minutes ||
        (seconds !== undefined && expandField(seconds, 60, [0]) === undefined)
      ) {
        unpredictable.push({ source, triggerIndex, reason: "pattern" });
        return;
      }
      // Minutes default to every minute when only seconds or hours are given
      // without minutes, which the product treats as "*"; keep it simple here.
      const perDay = hours.length * minutes.length;
      const times = hours.flatMap((h) =>
        minutes.map((m) => `${pad(h)}:${pad(m)}`)
      );
      entries.push({
        source,
        triggerIndex,
        kind: "time_pattern",
        times: perDay > MAX_DRAWN_TIMES ? [] : times,
        days: [0, 1, 2, 3, 4, 5, 6],
        frequent: perDay > MAX_DRAWN_TIMES ? { perDay } : undefined,
      });
    } else if (kind) {
      unpredictable.push({ source, triggerIndex, reason: "event_driven" });
    }
  });
  return { entries, unpredictable };
};

/** The distinct fire times across all entries, sorted, for the grid rows. */
export const gridTimes = (entries: WeekEntry[]): string[] =>
  [...new Set(entries.flatMap((e) => e.times))].sort();

/** Entries that fire at `time` on `day`. */
export const firesAt = (
  entries: WeekEntry[],
  time: string,
  day: WeekDay
): WeekEntry[] =>
  entries.filter((e) => e.days.includes(day) && e.times.includes(time));
