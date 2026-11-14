import type {
  RecorderStorageDay,
  RecorderStorageEntity,
} from "../../../data/recorder";

/**
 * A row count the server reported, or undefined when it is missing or not a
 * usable number, so a page can say it is unknown instead of showing NaN.
 */
export const toCount = (value: unknown): number | undefined => {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0
    ? number
    : undefined;
};

/** True when at least one of the days carries a usable row count. */
export const hasRowCounts = (days: RecorderStorageDay[]): boolean =>
  days.some((day) => toCount(day?.rows) !== undefined);

/** The usable row count of one day, 0 when it is missing. */
const dayRows = (day: RecorderStorageDay): number => toCount(day?.rows) ?? 0;

/** Share of one number in another, 0 to 1, or undefined when it is unknown. */
export const shareOf = (
  part: number | null | undefined,
  whole: number | null | undefined
): number | undefined => {
  if (part == null || !whole || whole <= 0) {
    return undefined;
  }
  return Math.min(1, Math.max(0, part / whole));
};

/** Average rows per day over the given days, without the days before the first row. */
export const averageRowsPerDay = (
  days: RecorderStorageDay[],
  first: number | null
): number => {
  const covered =
    first == null ? days : days.filter((day) => !(day.start + 86400 <= first));
  const counted = covered.filter((day) => toCount(day?.rows) !== undefined);
  if (!counted.length) {
    return 0;
  }
  return counted.reduce((sum, day) => sum + dayRows(day), 0) / counted.length;
};

export interface Interval {
  unit: "seconds" | "minutes" | "hours" | "days";
  value: number;
}

/** How often a value is recorded, from rows per day. Undefined below one a week. */
export const recordingInterval = (rowsPerDay: number): Interval | undefined => {
  if (rowsPerDay <= 0) {
    return undefined;
  }
  const seconds = 86400 / rowsPerDay;
  if (seconds < 60) {
    return { unit: "seconds", value: Math.max(1, Math.round(seconds)) };
  }
  if (seconds < 3600) {
    return { unit: "minutes", value: Math.round(seconds / 60) };
  }
  if (seconds < 86400) {
    return { unit: "hours", value: Math.round(seconds / 3600) };
  }
  if (seconds > 7 * 86400) {
    return undefined;
  }
  return { unit: "days", value: Math.round(seconds / 86400) };
};

/** Keep-for choices: the entity's whole history is always the last one. */
export const KEEP_DAY_CHOICES = [0, 1, 3, 7, 14] as const;

/**
 * Estimated bytes freed by keeping only the last `keepDays` days of one
 * entity's history. The rows of the last days come from the per-day counts;
 * everything older than the counted window is purged. Undefined when the
 * database cannot report a table size, so there is no per-row estimate.
 */
export const estimatedSaving = (
  detail: RecorderStorageEntity,
  keepDays: number
): number | undefined => {
  if (detail.average_row_bytes == null) {
    return undefined;
  }
  const rows = toCount(detail.rows);
  if (rows === undefined) {
    return undefined;
  }
  const kept =
    keepDays <= 0
      ? 0
      : detail.per_day
          .slice(-keepDays)
          .reduce((sum, day) => sum + dayRows(day), 0);
  return Math.max(0, Math.round((rows - kept) * detail.average_row_bytes));
};

/** Rows that stay after keeping only the last `keepDays` days. */
export const rowsKept = (
  detail: RecorderStorageEntity,
  keepDays: number
): number =>
  keepDays <= 0
    ? 0
    : Math.min(
        toCount(detail.rows) ?? 0,
        detail.per_day
          .slice(-keepDays)
          .reduce((sum, day) => sum + dayRows(day), 0)
      );

/** Record-at-most-once-every choices in seconds, 0 meaning every change. */
export const MIN_INTERVAL_CHOICES = [0, 10, 60, 300, 900] as const;

/**
 * Rows a day that a minimum interval removes at most. An entity cannot record
 * more than one row per interval, so the remaining rows are at most
 * 86400 / interval. Changes to a different value are always recorded, so the
 * real saving can be smaller. Zero when the interval is off.
 */
export const intervalRowsSavedPerDay = (
  rowsPerDay: number,
  intervalSeconds: number
): number =>
  intervalSeconds <= 0
    ? 0
    : Math.max(0, Math.round(rowsPerDay - 86400 / intervalSeconds));

/** Estimated bytes a day for a number of rows, undefined without a row size. */
export const bytesForRows = (
  rows: number,
  averageRowBytes: number | null
): number | undefined =>
  averageRowBytes == null ? undefined : Math.round(rows * averageRowBytes);
