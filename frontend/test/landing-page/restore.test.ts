import { describe, expect, it } from "vitest";
import {
  computeRestoreSteps,
  formatClock,
  uploadRate,
} from "../../landing-page/src/data/restore";

describe("computeRestoreSteps", () => {
  it("waits for Core: preparing is active with its progress, the rest wait", () => {
    expect(
      computeRestoreSteps({ pending: { state: "queued" }, coreProgress: 62 })
    ).toEqual([
      { id: "prepare", state: "active", progress: 62 },
      { id: "restore", state: "waiting" },
      { id: "start", state: "waiting" },
      { id: "ready", state: "waiting" },
    ]);
  });

  it("has no preparing progress while the install job is not visible", () => {
    const [prepare] = computeRestoreSteps({
      pending: { state: "queued" },
      coreProgress: -1,
    });
    expect(prepare).toEqual({
      id: "prepare",
      state: "active",
      progress: undefined,
    });
  });

  it("shows the restore running with its own progress once it has started", () => {
    expect(
      computeRestoreSteps({
        pending: { state: "running" },
        coreProgress: 100,
        restoreProgress: 45,
      })
    ).toEqual([
      { id: "prepare", state: "done" },
      { id: "restore", state: "active", progress: 45 },
      { id: "start", state: "waiting" },
      { id: "ready", state: "waiting" },
    ]);
  });

  it("marks the restore step failed and leaves the later steps waiting", () => {
    const steps = computeRestoreSteps({
      pending: { state: "failed" },
      coreProgress: -1,
    });
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "failed",
      "waiting",
      "waiting",
    ]);
  });

  it("moves to starting when the restore is done", () => {
    const steps = computeRestoreSteps({
      pending: { state: "done" },
      coreProgress: -1,
    });
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "active",
      "waiting",
    ]);
  });
});

describe("uploadRate", () => {
  it("gives speed and whole seconds left, rounded up", () => {
    expect(uploadRate(38_000_000, 380_000_000, 1000)).toEqual({
      bytesPerSecond: 38_000_000,
      secondsLeft: 9,
    });
  });

  it("does not divide by zero before any time has passed", () => {
    expect(uploadRate(0, 100, 0)).toEqual({
      bytesPerSecond: 0,
      secondsLeft: 0,
    });
  });
});

describe("formatClock", () => {
  it("uses 24 hour time", () => {
    const iso = new Date(2026, 10, 25, 13, 5).toISOString();
    expect(formatClock(iso, "en-US")).toBe("13:05");
  });

  it("gives nothing for a date it cannot read", () => {
    expect(formatClock("not a date", "en")).toBe("");
  });
});
