import { describe, expect, it } from "vitest";
import type { RecorderStorageEntity } from "../../../../src/data/recorder";
import {
  averageRowsPerDay,
  estimatedSaving,
  recordingInterval,
  rowsKept,
  shareOf,
} from "../../../../src/panels/config/storage/storage-math";

const detail = (
  overrides: Partial<RecorderStorageEntity> = {}
): RecorderStorageEntity => ({
  rows: 100,
  first: 0,
  last: 0,
  per_day: [
    { start: 0, rows: 10 },
    { start: 86400, rows: 20 },
    { start: 172800, rows: 30 },
  ],
  estimated_bytes: 1000,
  average_row_bytes: 10,
  total_rows: 1000,
  table_bytes: 10000,
  recording_excluded: false,
  keep_days: 10,
  ...overrides,
});

describe("shareOf", () => {
  it("is a fraction and never above one", () => {
    expect(shareOf(25, 100)).toBe(0.25);
    expect(shareOf(200, 100)).toBe(1);
  });
  it("is undefined when a figure is unknown", () => {
    expect(shareOf(null, 100)).toBeUndefined();
    expect(shareOf(10, null)).toBeUndefined();
    expect(shareOf(10, 0)).toBeUndefined();
  });
});

describe("averageRowsPerDay", () => {
  it("averages the days", () => {
    expect(averageRowsPerDay(detail().per_day, null)).toBe(20);
  });
  it("skips the days before the first row", () => {
    expect(averageRowsPerDay(detail().per_day, 90000)).toBe(25);
  });
  it("is zero without days", () => {
    expect(averageRowsPerDay([], null)).toBe(0);
  });
});

describe("recordingInterval", () => {
  it("picks a readable unit", () => {
    expect(recordingInterval(86400)).toEqual({ unit: "seconds", value: 1 });
    expect(recordingInterval(1440)).toEqual({ unit: "minutes", value: 1 });
    expect(recordingInterval(24)).toEqual({ unit: "hours", value: 1 });
    expect(recordingInterval(1)).toEqual({ unit: "days", value: 1 });
  });
  it("has nothing to say for no rows or very rare changes", () => {
    expect(recordingInterval(0)).toBeUndefined();
    expect(recordingInterval(0.01)).toBeUndefined();
  });
});

describe("estimatedSaving and rowsKept", () => {
  it("keeps the last days and removes the rest", () => {
    expect(rowsKept(detail(), 2)).toBe(50);
    expect(estimatedSaving(detail(), 2)).toBe(500);
  });
  it("removes everything when nothing is kept", () => {
    expect(rowsKept(detail(), 0)).toBe(0);
    expect(estimatedSaving(detail(), 0)).toBe(1000);
  });
  it("never saves less than nothing", () => {
    expect(estimatedSaving(detail({ rows: 10 }), 3)).toBe(0);
    expect(rowsKept(detail({ rows: 10 }), 3)).toBe(10);
  });
  it("cannot estimate without an average row size", () => {
    expect(
      estimatedSaving(detail({ average_row_bytes: null }), 1)
    ).toBeUndefined();
  });
});
