import type {
  RecorderStorageDay,
  RecorderStorageEntity,
} from "../../../data/recorder";

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
    first == null ? days : days.filter((day) => day.start + 86400 > first);
  if (!covered.length) {
    return 0;
  }
  return covered.reduce((sum, day) => sum + day.rows, 0) / covered.length;
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
  const kept =
    keepDays <= 0
      ? 0
      : detail.per_day.slice(-keepDays).reduce((sum, day) => sum + day.rows, 0);
  return Math.max(
    0,
    Math.round((detail.rows - kept) * detail.average_row_bytes)
  );
};

/** Rows that stay after keeping only the last `keepDays` days. */
export const rowsKept = (
  detail: RecorderStorageEntity,
  keepDays: number
): number =>
  keepDays <= 0
    ? 0
    : Math.min(
        detail.rows,
        detail.per_day.slice(-keepDays).reduce((sum, day) => sum + day.rows, 0)
      );
