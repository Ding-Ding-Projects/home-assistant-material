import { describe, expect, it } from "vitest";
import type {
  AutoSystemInfo,
  AutoSystemPart,
} from "../../../../src/data/auto-update";
import {
  autoSystemFailures,
  autoSystemLastResult,
  autoSystemPending,
  autoSystemSupervisorSelfUpdate,
  autoWaitDaysLeft,
  autoWindowMinutes,
  autoWindowSummary,
} from "../../../../src/data/auto-update";

const NOW = new Date("2026-11-17T12:00:00Z");

const part = (overrides: Partial<AutoSystemPart>): AutoSystemPart => ({
  part: "core",
  entity_id: "update.home_assistant_core_update",
  enabled: true,
  available: true,
  installed_version: "1.0",
  latest_version: "2.0",
  update_available: true,
  skipped: false,
  eligible_at: null,
  failed: null,
  last_result: null,
  ...overrides,
});

const system = (
  parts: AutoSystemPart[],
  next: Partial<AutoSystemInfo["next_window"]> = {},
  window = { start: "03:00", end: "05:00" }
): AutoSystemInfo => ({
  enabled: { supervisor: false, core: true, os: false },
  window,
  wait_days: 1,
  next_window: {
    start: "2026-11-18T03:00:00+00:00",
    end: "2026-11-18T05:00:00+00:00",
    open: false,
    day_offset: 1,
    ...next,
  },
  parts,
});

describe("autoWindowMinutes", () => {
  it.each([
    ["03:00", "05:00", 120],
    ["23:00", "01:00", 120],
    ["03:00", "03:10", 10],
    ["22:00", "06:00", 480],
  ])("%s to %s lasts %i minutes", (start, end, minutes) => {
    expect(autoWindowMinutes(start, end)).toBe(minutes);
  });
});

describe("autoWindowSummary", () => {
  it("says open while the window is open", () => {
    expect(autoWindowSummary(system([], { open: true })).kind).toBe("open");
  });

  it("calls an early morning window tomorrow morning tonight", () => {
    expect(autoWindowSummary(system([])).kind).toBe("tonight");
  });

  it("calls a daytime window of tomorrow tomorrow", () => {
    expect(
      autoWindowSummary(system([], {}, { start: "14:00", end: "16:00" })).kind
    ).toBe("tomorrow");
  });

  it("says today for a window later today and later for further away", () => {
    expect(autoWindowSummary(system([], { day_offset: 0 })).kind).toBe("today");
    expect(autoWindowSummary(system([], { day_offset: 3 })).kind).toBe("later");
  });
});

describe("autoWaitDaysLeft", () => {
  it.each([
    [null, 0],
    ["2026-11-17T11:00:00Z", 0],
    ["2026-11-17T12:00:01Z", 1],
    ["2026-11-18T12:00:00Z", 1],
    ["2026-11-18T12:00:01Z", 2],
    ["not a time", 0],
  ])("%s leaves %i days", (eligible, days) => {
    expect(autoWaitDaysLeft(eligible, NOW)).toBe(days);
  });
});

describe("autoSystemPending", () => {
  it("lists only what is switched on, available, not skipped and not failed", () => {
    const pending = autoSystemPending(
      system([
        part({ part: "supervisor", eligible_at: "2026-11-18T12:00:00Z" }),
        part({ part: "core", enabled: false }),
        part({ part: "os", update_available: false }),
        part({ part: "core", skipped: true }),
        part({
          part: "core",
          failed: { version: "2.0", error: "x", time: null },
        }),
      ]),
      NOW
    );
    expect(pending).toEqual([
      { part: "supervisor", version: "2.0", daysLeft: 1 },
    ]);
  });
});

describe("autoSystemLastResult and autoSystemFailures", () => {
  it("picks the newest result and hides skipped failures", () => {
    const old = {
      time: "2026-11-16T03:00:00Z",
      version: "1",
      ok: true,
      error: null,
    };
    const fresh = {
      time: "2026-11-17T03:00:00Z",
      version: "2",
      ok: false,
      error: "disk full",
    };
    const info = system([
      part({ part: "supervisor", last_result: old }),
      part({
        part: "core",
        last_result: fresh,
        failed: { version: "2", error: "disk full", time: fresh.time },
      }),
      part({
        part: "os",
        skipped: true,
        failed: { version: "3", error: "x", time: null },
      }),
    ]);
    expect(autoSystemLastResult(info)).toEqual({
      part: "core",
      result: fresh,
    });
    expect(autoSystemFailures(info).map((item) => item.part)).toEqual(["core"]);
  });
});

describe("autoSystemSupervisorSelfUpdate", () => {
  it("warns only when the Supervisor reports updating itself", () => {
    expect(
      autoSystemSupervisorSelfUpdate(
        system([part({ part: "supervisor", self_update: true })])
      )
    ).toBe(true);
    expect(
      autoSystemSupervisorSelfUpdate(
        system([part({ part: "supervisor", self_update: false })])
      )
    ).toBe(false);
    // An older server does not say; that is no reason to warn
    expect(
      autoSystemSupervisorSelfUpdate(system([part({ part: "supervisor" })]))
    ).toBe(false);
    expect(
      autoSystemSupervisorSelfUpdate(
        system([part({ part: "core", self_update: true })])
      )
    ).toBe(false);
  });
});
