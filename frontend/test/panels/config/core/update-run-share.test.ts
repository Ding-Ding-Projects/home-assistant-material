import { describe, expect, it } from "vitest";
import type { UpdateRunRecord } from "../../../../src/data/auto-update";
import type {
  QueueState,
  QueueStep,
} from "../../../../src/panels/config/core/updates/update-queue";
import {
  MAX_SHARED_STEPS,
  runReportFromQueue,
  sharedRunView,
} from "../../../../src/panels/config/core/updates/update-run-share";

// Protects "Updating 2 of 2" in a second browser: the browser that drives the
// run reports where it is, and the other browsers derive their read-only card
// from that report alone, without ever claiming that a step was installed.

const A = "update.app_a";
const B = "update.app_b";

const step = (entityId: string, state: QueueStep["state"]): QueueStep => ({
  entityId,
  targetVersion: "2.0",
  state,
  role: "other",
  seenInProgress: false,
  startedAt: null,
  idleSince: null,
});

const queue = (
  steps: QueueStep[],
  extra: Partial<QueueState> = {}
): QueueState => ({
  version: 1,
  steps,
  stopRequested: false,
  backup: false,
  ...extra,
});

const record = (extra: Partial<UpdateRunRecord> = {}): UpdateRunRecord => ({
  entity_ids: [A, B],
  position: 2,
  total: 2,
  state: "running",
  current: B,
  started: "2026-11-20T10:00:00+00:00",
  updated: "2026-11-20T10:05:00+00:00",
  ...extra,
});

describe("runReportFromQueue", () => {
  it("reports the second of two updates running", () => {
    expect(
      runReportFromQueue(queue([step(A, "done"), step(B, "updating")]))
    ).toEqual({
      entity_ids: [A, B],
      position: 2,
      state: "running",
      current: B,
    });
  });

  it("reports a failed step", () => {
    expect(
      runReportFromQueue(
        queue([step(A, "failed"), step(B, "waiting")], {
          failure: { entityId: A, reason: "failed" },
        })
      )
    ).toMatchObject({ position: 1, state: "failed", current: A });
  });

  it("reports a stopped run as cancelled and a finished one as done", () => {
    expect(
      runReportFromQueue(
        queue([step(A, "done"), step(B, "skipped")], { stopRequested: true })
      )?.state
    ).toBe("cancelled");
    expect(
      runReportFromQueue(queue([step(A, "done"), step(B, "done")]))
    ).toMatchObject({ state: "done", position: 2, current: null });
  });

  // The server loses its record when Core restarts in the middle of a run;
  // the browser's own start time keeps "Started at" from moving to the time
  // of the next report.
  it("reports the queue's own start time", () => {
    const start = Date.UTC(2026, 10, 20, 7, 14);
    expect(
      runReportFromQueue(
        queue([step(A, "done"), step(B, "updating")], { startedAt: start })
      )?.started
    ).toBe("2026-11-20T07:14:00.000Z");
  });

  it("uses the first started step for a queue without its own start", () => {
    const first = Date.UTC(2026, 10, 20, 7, 14);
    const second = Date.UTC(2026, 10, 20, 7, 16);
    expect(
      runReportFromQueue(
        queue([
          { ...step(A, "done"), startedAt: first },
          { ...step(B, "updating"), startedAt: second },
        ])
      )?.started
    ).toBe("2026-11-20T07:14:00.000Z");
  });

  it("reports no start time when nothing says when the run began", () => {
    expect(runReportFromQueue(queue([step(A, "waiting")]))).not.toHaveProperty(
      "started"
    );
  });

  it("shares nothing without a queue or with more steps than allowed", () => {
    expect(runReportFromQueue(undefined)).toBeUndefined();
    const many = Array.from({ length: MAX_SHARED_STEPS + 1 }, (_, index) =>
      step(`update.item_${index}`, "waiting")
    );
    expect(runReportFromQueue(queue(many))).toBeUndefined();
  });
});

describe("sharedRunView", () => {
  it("shows the second of two updates as current, the first as finished", () => {
    const view = sharedRunView(record());
    expect(view).toMatchObject({
      position: 2,
      total: 2,
      finished: 1,
      percent: 50,
      current: B,
    });
    expect(view?.steps).toEqual([
      { entityId: A, state: "finished" },
      { entityId: B, state: "current" },
    ]);
  });

  it("marks the failed step and keeps the rest waiting", () => {
    const view = sharedRunView(
      record({ position: 1, state: "failed", current: A })
    );
    expect(view?.steps.map((item) => item.state)).toEqual([
      "failed",
      "waiting",
    ]);
    expect(view?.finished).toBe(0);
  });

  it("claims no step result for a stopped run", () => {
    const view = sharedRunView(record({ state: "cancelled", current: null }));
    expect(view?.steps.every((item) => item.state === "unknown")).toBe(true);
    expect(view?.percent).toBe(100);
  });

  it("keeps a position outside the run inside it", () => {
    expect(sharedRunView(record({ position: 9 }))?.position).toBe(2);
    expect(sharedRunView(record({ position: 0 }))?.position).toBe(1);
  });

  it("ignores a current update that is not part of the run", () => {
    expect(sharedRunView(record({ current: "update.other" }))?.current).toBe(B);
  });

  it("shows nothing without a record", () => {
    expect(sharedRunView(null)).toBeUndefined();
    expect(sharedRunView(record({ entity_ids: [] }))).toBeUndefined();
  });
});

// Protects the view of a run whose browser stopped responding: five minutes
// after an install had finished it still said "Was installing" and "0 of 2
// finished" while the row below said the update was done. The record is now
// corrected with what this browser sees of each update entity.
describe("sharedRunView with the update entities", () => {
  const entity = (state: string, inProgress = false) => ({
    state,
    attributes: { in_progress: inProgress },
  });
  const stranded = record({ position: 1, current: A });

  it("shows a step whose update finished as finished, and counts it", () => {
    const view = sharedRunView(
      stranded,
      { [A]: entity("off"), [B]: entity("on") },
      true
    );
    expect(view?.steps.map((item) => item.state)).toEqual([
      "finished",
      "waiting",
    ]);
    expect(view?.finished).toBe(1);
    expect(view?.percent).toBe(50);
    expect(view?.current).toBeNull();
  });

  it("keeps a step that is really installing as installing", () => {
    const view = sharedRunView(
      stranded,
      { [A]: entity("on", true), [B]: entity("on") },
      true
    );
    expect(view?.steps[0].state).toBe("current");
    expect(view?.current).toBe(A);
    expect(view?.finished).toBe(0);
  });

  it("does not call a step installing when its browser is silent and nothing runs", () => {
    const view = sharedRunView(
      stranded,
      { [A]: entity("on"), [B]: entity("on") },
      true
    );
    expect(view?.steps.map((item) => item.state)).toEqual([
      "waiting",
      "waiting",
    ]);
    expect(view?.current).toBeNull();
  });

  it("keeps the step a driven run is starting as current", () => {
    const view = sharedRunView(
      stranded,
      { [A]: entity("on"), [B]: entity("on") },
      false
    );
    expect(view?.steps[0].state).toBe("current");
    expect(view?.current).toBe(A);
  });

  it("gives the record alone when no entities are given", () => {
    expect(sharedRunView(stranded)).toEqual(sharedRunView(stranded, undefined));
    expect(sharedRunView(stranded)?.steps[0].state).toBe("current");
  });
});

// A browser that watches a run saw "Updates finished" for a few seconds while
// the Core row still said "Updating": the record had ended before this
// browser's own view of Core caught up. The summary follows the rows.
describe("sharedRunView while a row still installs", () => {
  it("does not call a run finished while a row shows an update installing", () => {
    const view = sharedRunView(
      record({ state: "done", position: 2, current: null }),
      {
        [A]: { state: "off", attributes: {} },
        [B]: { state: "on", attributes: { in_progress: true } },
      }
    );
    expect(view?.state).toBe("running");
    expect(view?.position).toBe(2);
    expect(view?.finished).toBe(1);
    expect(view?.current).toBe(B);
  });

  it("shows the run finished once no row installs", () => {
    const view = sharedRunView(
      record({ state: "done", position: 2, current: null }),
      {
        [A]: { state: "off", attributes: {} },
        [B]: { state: "off", attributes: {} },
      }
    );
    expect(view?.state).toBe("done");
    expect(view?.finished).toBe(2);
  });
});
