import type { ScheduleDay } from "../../../../data/schedule";
import { weekdays } from "../../../../data/schedule";
import type { HelperDomain } from "../const";

/**
 * Pure logic behind the helper demos. A demo is a small working model of what
 * a helper does, driven by the values in the create form. It keeps all of its
 * state locally: nothing here calls a service or creates an entity.
 */

/** The shape of demo each helper kind shows. */
export type HelperDemoKind =
  | "switch"
  | "press"
  | "number"
  | "text"
  | "choice"
  | "datetime"
  | "counter"
  | "timer"
  | "week";

/**
 * Every helper kind the create dialog offers has an entry here. The type makes
 * a missing kind a compile error and a test checks it at run time too.
 */
export const HELPER_DEMO_KINDS: Record<HelperDomain, HelperDemoKind> = {
  input_boolean: "switch",
  input_button: "press",
  input_text: "text",
  input_number: "number",
  input_datetime: "datetime",
  input_select: "choice",
  counter: "counter",
  timer: "timer",
  schedule: "week",
};

export const hasHelperDemo = (domain: string): domain is HelperDomain =>
  Object.prototype.hasOwnProperty.call(HELPER_DEMO_KINDS, domain);

/** The form's current values; anything may be missing or still being typed. */
export type DemoConfig = Record<string, unknown> | undefined;

const readNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "string" && value.trim() === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const decimalsOf = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const text = String(value);
  if (text.includes("e-")) {
    return Number(text.split("e-")[1]);
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
};

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** Math.min(decimals, 10);
  return Math.round(value * factor) / factor;
};

/** Keeps a value inside the bounds; a missing bound means no limit. */
export const clamp = (
  value: number,
  min: number | null,
  max: number | null
): number => {
  let result = value;
  if (min !== null && result < min) {
    result = min;
  }
  if (max !== null && result > max) {
    result = max;
  }
  return result;
};

/**
 * Clamps a value and moves it onto the nearest step counted from the minimum,
 * the way a slider with that step would, without float drift (0.1 + 0.2).
 */
export const snapToStep = (
  value: number,
  min: number,
  max: number,
  step: number
): number => {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const high = max < min ? min : max;
  const decimals = Math.max(decimalsOf(safeStep), decimalsOf(min));
  const clamped = clamp(value, min, high);
  let snapped = min + Math.round((clamped - min) / safeStep) * safeStep;
  if (snapped > high) {
    snapped = min + Math.floor((high - min) / safeStep + 1e-9) * safeStep;
  }
  return roundTo(snapped, decimals);
};

// Toggle --------------------------------------------------------------------

/** The word under a switch. */
export const switchState = (on: boolean): "on" | "off" => (on ? "on" : "off");

// Number --------------------------------------------------------------------

export interface NumberDemoConfig {
  min: number;
  max: number;
  step: number;
  mode: "slider" | "box";
  unit: string;
  initial: number;
}

export const numberDemoConfig = (config: DemoConfig): NumberDemoConfig => {
  const min = readNumber(config?.min, 0);
  const stepValue = readNumber(config?.step, 1);
  const step = stepValue > 0 ? stepValue : 1;
  let max = readNumber(config?.max, 100);
  if (max <= min) {
    // A slider needs a range; the form flags the same mistake on its own.
    max = min + step;
  }
  const unit =
    typeof config?.unit_of_measurement === "string"
      ? config.unit_of_measurement
      : "";
  return {
    min,
    max,
    step,
    mode: config?.mode === "box" ? "box" : "slider",
    unit,
    initial: snapToStep(min + (max - min) / 2, min, max, step),
  };
};

// Text ----------------------------------------------------------------------

export interface TextDemoConfig {
  min: number;
  max: number;
  pattern?: string;
  password: boolean;
}

/** The longest pattern the demo will compile, so a typo cannot hang it. */
export const MAX_DEMO_PATTERN_LENGTH = 500;

export const textDemoConfig = (config: DemoConfig): TextDemoConfig => {
  const min = Math.max(0, Math.floor(readNumber(config?.min, 0)));
  const max = Math.max(1, Math.floor(readNumber(config?.max, 100)));
  const pattern =
    typeof config?.pattern === "string" && config.pattern !== ""
      ? config.pattern
      : undefined;
  return {
    min,
    max: Math.max(min, max),
    pattern,
    password: config?.mode === "password",
  };
};

export const truncateText = (value: string, max: number): string =>
  Array.from(value).slice(0, max).join("");

export interface TextValidation {
  length: number;
  tooShort: boolean;
  patternMismatch: boolean;
  /** The pattern could not be compiled (for example, half typed). */
  patternInvalid: boolean;
  valid: boolean;
}

/**
 * Checks the text the way the helper would. An empty field is not flagged: a
 * browser's pattern check ignores empty input too, and flagging it would show
 * an error before anyone has typed.
 */
export const validateText = (
  value: string,
  config: Pick<TextDemoConfig, "min" | "pattern">
): TextValidation => {
  const length = Array.from(value).length;
  const tooShort = length > 0 && length < config.min;
  let patternMismatch = false;
  let patternInvalid = false;
  if (config.pattern !== undefined) {
    if (config.pattern.length > MAX_DEMO_PATTERN_LENGTH) {
      patternInvalid = true;
    } else {
      try {
        const regex = new RegExp(`^(?:${config.pattern})$`, "u");
        patternMismatch = length > 0 && !regex.test(value);
      } catch (_err) {
        patternInvalid = true;
      }
    }
  }
  return {
    length,
    tooShort,
    patternMismatch,
    patternInvalid,
    valid: !tooShort && !patternMismatch,
  };
};

// Choice --------------------------------------------------------------------

export const selectDemoOptions = (config: DemoConfig): string[] => {
  const options = config?.options;
  if (!Array.isArray(options)) {
    return [];
  }
  return options.filter(
    (option): option is string => typeof option === "string" && option !== ""
  );
};

/** Moves the selection with the arrow keys, wrapping at both ends. */
export const moveSelection = (
  current: number,
  delta: number,
  count: number
): number => {
  if (count <= 0) {
    return -1;
  }
  const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
  return (((base + delta) % count) + count) % count;
};

// Date and time -------------------------------------------------------------

export interface DateTimeDemoConfig {
  hasDate: boolean;
  hasTime: boolean;
}

export const dateTimeDemoConfig = (config: DemoConfig): DateTimeDemoConfig => {
  const hasDate = config?.has_date === true;
  const hasTime = config?.has_time === true;
  // The form turns on the date when neither is chosen yet.
  return hasDate || hasTime
    ? { hasDate, hasTime }
    : { hasDate: true, hasTime: false };
};

// Counter -------------------------------------------------------------------

export interface CounterDemoConfig {
  min: number | null;
  max: number | null;
  step: number;
  initial: number;
}

export const counterDemoConfig = (config: DemoConfig): CounterDemoConfig => {
  const min = readOptionalNumber(config?.minimum);
  const max = readOptionalNumber(config?.maximum);
  const stepValue = readNumber(config?.step, 1);
  const step = stepValue > 0 ? stepValue : 1;
  const initial = clamp(readNumber(config?.initial, 0), min, max);
  return { min, max, step, initial };
};

/** Adds or subtracts one step, staying inside the bounds. */
export const counterStep = (
  value: number,
  direction: 1 | -1,
  config: Pick<CounterDemoConfig, "min" | "max" | "step">
): number => {
  const decimals = Math.max(decimalsOf(config.step), decimalsOf(value));
  return clamp(
    roundTo(value + direction * config.step, decimals),
    config.min,
    config.max
  );
};

export const counterCanStep = (
  value: number,
  direction: 1 | -1,
  config: Pick<CounterDemoConfig, "min" | "max" | "step">
): boolean => counterStep(value, direction, config) !== value;

// Timer ---------------------------------------------------------------------

/** What the demo counts from when the form has no duration yet. */
export const FALLBACK_TIMER_SECONDS = 10;

const dictSeconds = (dict: Record<string, unknown>): number =>
  readNumber(dict.days, 0) * 86400 +
  readNumber(dict.hours, 0) * 3600 +
  readNumber(dict.minutes, 0) * 60 +
  readNumber(dict.seconds, 0);

/**
 * Reads the form's duration, which can be a number of seconds, an
 * "H:MM:SS" or "MM:SS" string, or an object with hours, minutes and seconds.
 */
export const parseDurationSeconds = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return 0;
    }
    const parts = trimmed.split(":").map(Number);
    if (parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
      return 0;
    }
    return Math.max(
      0,
      parts.reduce((total, part) => total * 60 + part, 0)
    );
  }
  if (value && typeof value === "object") {
    return Math.max(0, dictSeconds(value as Record<string, unknown>));
  }
  return 0;
};

export interface TimerDemoConfig {
  seconds: number;
  /** True when the form has no duration yet and the fallback is used. */
  usedFallback: boolean;
}

export const timerDemoConfig = (config: DemoConfig): TimerDemoConfig => {
  const seconds = parseDurationSeconds(config?.duration);
  return seconds > 0
    ? { seconds, usedFallback: false }
    : { seconds: FALLBACK_TIMER_SECONDS, usedFallback: true };
};

export type TimerDemoStatus = "idle" | "active" | "paused" | "finished";

export interface TimerDemoState {
  status: TimerDemoStatus;
  /** The time left when not running. */
  remainingMs: number;
  /** When a running timer reaches zero, as a millisecond timestamp. */
  endsAt: number | null;
}

export const timerIdle = (durationMs: number): TimerDemoState => ({
  status: "idle",
  remainingMs: durationMs,
  endsAt: null,
});

export const timerRemainingMs = (state: TimerDemoState, now: number): number =>
  state.status === "active" && state.endsAt !== null
    ? Math.max(0, state.endsAt - now)
    : state.remainingMs;

export const timerStart = (
  state: TimerDemoState,
  durationMs: number,
  now: number
): TimerDemoState => {
  if (state.status === "active") {
    return state;
  }
  const remaining =
    state.status === "paused" ? state.remainingMs : Math.max(0, durationMs);
  return { status: "active", remainingMs: remaining, endsAt: now + remaining };
};

export const timerPause = (
  state: TimerDemoState,
  now: number
): TimerDemoState =>
  state.status === "active"
    ? {
        status: "paused",
        remainingMs: timerRemainingMs(state, now),
        endsAt: null,
      }
    : state;

export const timerCancel = (durationMs: number): TimerDemoState =>
  timerIdle(durationMs);

/** Moves a running timer to finished once its time is up. */
export const timerTick = (
  state: TimerDemoState,
  now: number
): TimerDemoState =>
  state.status === "active" && timerRemainingMs(state, now) <= 0
    ? { status: "finished", remainingMs: 0, endsAt: null }
    : state;

/** "mm:ss", or "h:mm:ss" from one hour up; a part of a second counts up. */
export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${two(minutes)}:${two(seconds)}`;
};

// Schedule ------------------------------------------------------------------

export const SECONDS_PER_DAY = 86400;

/** "07:30", "07:30:15" or "24:00:00" as seconds into the day, or null. */
export const parseClockSeconds = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const seconds =
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
  return seconds <= SECONDS_PER_DAY ? seconds : null;
};

export interface DemoBlock {
  from: number;
  to: number;
}

/** The valid blocks of one weekday, in time order. */
export const scheduleDayBlocks = (
  config: DemoConfig,
  day: (typeof weekdays)[number]
): DemoBlock[] => {
  const blocks = config?.[day];
  if (!Array.isArray(blocks)) {
    return [];
  }
  const result: DemoBlock[] = [];
  for (const block of blocks as Partial<ScheduleDay>[]) {
    const from = parseClockSeconds(block?.from);
    const to = parseClockSeconds(block?.to);
    if (from !== null && to !== null && to > from) {
      result.push({ from, to });
    }
  }
  return result.sort((a, b) => a.from - b.from);
};

export interface ScheduleNow {
  on: boolean;
  /** When the state next changes today, in seconds into the day, if it does. */
  changesAt: number | null;
}

/** Whether the schedule is on at a moment, judged by the local weekday. */
export const scheduleNow = (config: DemoConfig, date: Date): ScheduleNow => {
  const blocks = scheduleDayBlocks(config, weekdays[date.getDay()]);
  const now =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  for (const block of blocks) {
    if (now >= block.from && now < block.to) {
      return { on: true, changesAt: block.to };
    }
  }
  const next = blocks.find((block) => block.from > now);
  return { on: false, changesAt: next ? next.from : null };
};

export const scheduleHasBlocks = (config: DemoConfig): boolean =>
  weekdays.some((day) => scheduleDayBlocks(config, day).length > 0);

/** "07:30" for a number of seconds into the day, in 24-hour form. */
export const formatClockSeconds = (seconds: number): string => {
  const capped = Math.min(Math.max(0, seconds), SECONDS_PER_DAY);
  const hours = Math.floor(capped / 3600);
  const minutes = Math.floor((capped % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
