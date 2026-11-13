import type {
  ArithmeticOp,
  CompareOp,
  ElapsedStyle,
  NameWhat,
  PieceKind,
} from "./types";

export interface DateTimePreset {
  /** Used to look up the translated label. */
  id: string;
  format: string;
}

/** Date and time patterns offered by the builder. Time is 24-hour first. */
export const DATETIME_PRESETS: readonly DateTimePreset[] = [
  { id: "time", format: "%H:%M" },
  { id: "time_seconds", format: "%H:%M:%S" },
  { id: "time_12h", format: "%I:%M %p" },
  { id: "date_iso", format: "%Y-%m-%d" },
  { id: "date_day_first", format: "%d/%m/%Y" },
  { id: "date_month_first", format: "%m/%d/%Y" },
  { id: "date_long", format: "%d %B %Y" },
  { id: "date_short", format: "%B %d" },
  { id: "weekday", format: "%A" },
  { id: "weekday_short", format: "%a" },
  { id: "month", format: "%B" },
  { id: "year", format: "%Y" },
  { id: "datetime", format: "%Y-%m-%d %H:%M" },
  { id: "weekday_time", format: "%A %H:%M" },
];

export const CUSTOM_DATETIME = "custom";

export const presetIdForFormat = (format: string): string =>
  DATETIME_PRESETS.find((preset) => preset.format === format)?.id ??
  CUSTOM_DATETIME;

export const PIECE_KINDS: readonly PieceKind[] = [
  "text",
  "state",
  "attribute",
  "name",
  "datetime",
  "elapsed",
  "number",
  "condition",
  "count",
  "raw",
];

export const NAME_CHOICES: readonly NameWhat[] = ["name", "area", "floor"];

export const ELAPSED_STYLES: readonly ElapsedStyle[] = [
  "words",
  "seconds",
  "minutes",
  "hours",
  "days",
];

export const ARITHMETIC_OPS: readonly ArithmeticOp[] = [
  "none",
  "add",
  "subtract",
  "multiply",
  "divide",
];

export const COMPARE_OPS: readonly CompareOp[] = [
  "is",
  "is_not",
  "above",
  "below",
  "between",
  "contains",
];

/** Seconds per unit for the numeric elapsed styles. */
export const ELAPSED_DIVISOR: Record<Exclude<ElapsedStyle, "words">, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};
