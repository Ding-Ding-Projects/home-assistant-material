import { describe, expect, it } from "vitest";
import type { UpdateRunRecord } from "../../../../src/data/auto-update";
import {
  DRIVER_SILENT_MS,
  driverSeenAt,
  SHARE_HEARTBEAT_MS,
  shareDue,
  sharedRunPhase,
} from "../../../../src/panels/config/core/updates/update-run-share";

// Protects a second browser from a stranded "Update everything" run: when the
// browser that drives the run is closed, the others must say so and offer a
// way out instead of showing "Updating 1 of 4" until the record expires two
// hours later. A run that is still driven must never be called stranded.

const record = (
  state: UpdateRunRecord["state"],
  seenAgo?: number
): UpdateRunRecord => ({
  entity_ids: ["update.app_a", "update.app_b"],
  position: 1,
  total: 2,
  state,
  current: "update.app_a",
  started: "2026-11-21T05:00:00+00:00",
  updated: "2026-11-21T05:00:00+00:00",
  ...(seenAgo === undefined ? {} : { seen_ago: seenAgo }),
});

describe("driver seen at", () => {
  it("measures the last report on this browser's own clock", () => {
    expect(driverSeenAt(record("running", 40), 100_000)).toBe(60_000);
  });

  it("has no time for an older server", () => {
    expect(driverSeenAt(record("running"), 100_000)).toBeUndefined();
    expect(driverSeenAt(null, 100_000)).toBeUndefined();
  });
});

describe("shared run phase", () => {
  const now = 10_000_000;

  it("is running while the driver reported recently", () => {
    expect(
      sharedRunPhase(record("running"), now - DRIVER_SILENT_MS + 1000, now)
    ).toBe("running");
  });

  it("is driver silent once the driver has been quiet long enough", () => {
    expect(sharedRunPhase(record("running"), now - DRIVER_SILENT_MS, now)).toBe(
      "driver_silent"
    );
    expect(
      sharedRunPhase(record("failed"), now - DRIVER_SILENT_MS - 1, now)
    ).toBe("driver_silent");
  });

  it("never calls an ended run stranded", () => {
    for (const state of ["done", "cancelled"] as const) {
      expect(sharedRunPhase(record(state), 0, now)).toBe("finished");
    }
  });

  it("counts a run without a last report time as driven", () => {
    expect(sharedRunPhase(record("running"), undefined, now)).toBe("running");
  });

  it("has nothing to show without a record", () => {
    expect(sharedRunPhase(undefined, 0, now)).toBeUndefined();
  });
});

describe("share due", () => {
  const base = {
    key: "a",
    sentKey: "a",
    state: "running" as const,
    lastSentAt: 1000,
  };

  it("sends a changed report at once", () => {
    expect(shareDue({ ...base, sentKey: "b", now: 1001 })).toBe(true);
  });

  it("sends a refused report again (its key was forgotten)", () => {
    expect(
      shareDue({ ...base, state: "done", sentKey: undefined, now: 1001 })
    ).toBe(true);
  });

  it("reports a going run again after the heartbeat", () => {
    expect(shareDue({ ...base, now: 1000 + SHARE_HEARTBEAT_MS - 1 })).toBe(
      false
    );
    expect(shareDue({ ...base, now: 1000 + SHARE_HEARTBEAT_MS })).toBe(true);
    expect(
      shareDue({ ...base, state: "failed", now: 1000 + SHARE_HEARTBEAT_MS })
    ).toBe(true);
  });

  it("does not repeat an ended run that was accepted", () => {
    expect(
      shareDue({ ...base, state: "done", now: 1000 + SHARE_HEARTBEAT_MS * 10 })
    ).toBe(false);
  });

  it("calls the driver silent well after several missed heartbeats", () => {
    // A background tab reports about once a minute; five minutes leaves room.
    expect(DRIVER_SILENT_MS).toBeGreaterThanOrEqual(SHARE_HEARTBEAT_MS * 6);
  });
});
