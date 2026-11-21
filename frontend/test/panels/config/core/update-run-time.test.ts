import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateEntity } from "../../../../src/data/update";
import type { HomeAssistant } from "../../../../src/types";

import type { QueueState } from "../../../../src/panels/config/core/updates/update-queue";
import {
  CLOCK_SKEW_MS,
  queueRunTime,
  resolveStepEnd,
} from "../../../../src/panels/config/core/updates/update-queue";
import { UpdateQueueController } from "../../../../src/panels/config/core/updates/update-queue-controller";

vi.mock(
  "../../../../src/components/update-progress/update-install-tracker",
  () => ({ installUpdatesTracked: vi.fn() })
);

// Protects the times shown for a finished "Update everything" run. A run with
// a Core update reloads the page when Core comes back; the Core step then had
// no end time and the summary left it out, so a run of about two and a half
// minutes was reported as "took 0:43". A step whose end is not known must
// never be dropped from the total, and the time the person happened to look
// must never stand in for it.

const START = Date.parse("2026-11-21T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("resolveStepEnd", () => {
  it("uses the moment it was seen while the page watched", () => {
    expect(
      resolveStepEnd({ startedAt: START }, undefined, START + 9000, true)
    ).toEqual({ at: START + 9000, approximate: false });
  });

  it("uses the update's own change after the page was away (same tab)", () => {
    const end = resolveStepEnd(
      { startedAt: START },
      { last_changed: iso(START + 6000), last_updated: iso(START + 6000) },
      START + 60_000,
      false,
      START + 60_000
    );
    expect(end).toEqual({ at: START + 6000, approximate: false });
  });

  it("never uses the time of looking when nothing else is known", () => {
    // No connection drop was seen during the step: the return to the page is
    // only the person looking, so the end stays unknown.
    expect(
      resolveStepEnd(
        { startedAt: START },
        { last_changed: iso(START - 5000), last_updated: iso(START - 5000) },
        START + 600_000,
        false,
        START + 600_000
      )
    ).toEqual({ at: null, approximate: false });
  });

  it("uses the connection coming back after a restart, as an estimate", () => {
    const back = START + 150_000;
    expect(
      resolveStepEnd(
        { startedAt: START, connectionLostAt: START + 40_000 },
        undefined,
        back + 2000,
        false,
        back
      )
    ).toEqual({ at: back, approximate: true });
  });

  it("does not take a return long after the drop as the end", () => {
    expect(
      resolveStepEnd(
        { startedAt: START, connectionLostAt: START + 40_000 },
        undefined,
        START + 3 * 60 * 60_000,
        false,
        START + 3 * 60 * 60_000 - 1000
      ).at
    ).toBeNull();
  });

  it("takes a server time a little ahead of this browser as now, approximately", () => {
    const now = START + 120_000;
    expect(
      resolveStepEnd(
        { startedAt: START },
        { last_changed: iso(now + CLOCK_SKEW_MS / 2), last_updated: "" },
        now,
        false
      )
    ).toEqual({ at: now, approximate: true });
  });
});

describe("queueRunTime", () => {
  const step = (
    startedAt: number | null,
    endedAt: number | null | undefined,
    endedApprox = false
  ) => ({
    state: "done" as const,
    startedAt,
    endedAt,
    ...(endedApprox ? { endedApprox } : {}),
  });

  it("is the first start to the last end", () => {
    // The same-tab return case: "Done 0:06", and the run "took 1:06".
    expect(
      queueRunTime([
        step(START, START + 60_000),
        step(START + 60_000, START + 66_000),
      ])
    ).toEqual({ ms: 66_000, approximate: false, atLeast: false });
  });

  it("counts the Core step that ended across the reload", () => {
    expect(
      queueRunTime([
        step(START, START + 30_000),
        step(START + 31_000, START + 37_000),
        step(START + 37_000, START + 43_000),
        step(START + 43_000, START + 154_000, true),
      ])
    ).toEqual({ ms: 154_000, approximate: true, atLeast: false });
  });

  it("says at least, never a shorter number, when an end is unknown", () => {
    expect(
      queueRunTime([step(START, START + 30_000), step(START + 43_000, null)])
    ).toEqual({ ms: 43_000, approximate: false, atLeast: true });
  });

  it("holds the answer back while an end is still being worked out", () => {
    expect(
      queueRunTime([
        step(START, START + 30_000),
        step(START + 43_000, undefined),
      ])
    ).toBeUndefined();
  });

  it("says nothing for a run with no start", () => {
    expect(queueRunTime([step(null, null)])).toBeUndefined();
  });
});

const CORE = "update.home_assistant_core_update";

const coreEntity = (lastChanged: number): UpdateEntity =>
  ({
    entity_id: CORE,
    state: "off",
    last_changed: iso(lastChanged),
    last_updated: iso(lastChanged),
    attributes: {
      installed_version: "490",
      latest_version: "490",
      skipped_version: null,
      in_progress: false,
      title: "Home Assistant Core",
      update_percentage: null,
    },
  }) as unknown as UpdateEntity;

const makeHass = (
  states: Record<string, UpdateEntity>,
  version: string,
  connected = true
) =>
  ({
    connected,
    config: { version },
    states,
    localize: (key: string) => key,
  }) as unknown as HomeAssistant;

const makeController = (getHass: () => HomeAssistant) =>
  new UpdateQueueController(
    {
      addController: () => undefined,
      requestUpdate: () => undefined,
    } as any,
    getHass
  );

describe("a Core step that ends across the reload", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(START + 160_000);
    // The page was loaded a moment ago, as after the reload Core brings.
    Object.defineProperty(window.performance, "timeOrigin", {
      value: Date.now() - 1000,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const storeRun = () => {
    const queue: QueueState = {
      version: 1,
      backup: false,
      stopRequested: false,
      startedAt: START,
      steps: [
        {
          entityId: CORE,
          targetVersion: "490",
          fromVersion: "481",
          state: "updating",
          role: "core",
          seenInProgress: true,
          startedAt: START + 43_000,
          idleSince: null,
          connectionLostAt: START + 60_000,
        },
      ],
    };
    window.sessionStorage.setItem("ha-update-queue", JSON.stringify(queue));
  };

  it("waits for the update entity and uses its own change", () => {
    storeRun();
    // Core answers with its new version before its update entity is loaded.
    let hass = makeHass({}, "490");
    const controller = makeController(() => hass);
    controller.hostConnected();
    expect(controller.queue?.steps[0].state).toBe("done");
    expect(controller.queue?.steps[0].endedAt).toBeUndefined();
    hass = makeHass({ [CORE]: coreEntity(START + 150_000) }, "490");
    vi.advanceTimersByTime(5000);
    controller.tick();
    expect(controller.queue?.steps[0].endedAt).toBe(START + 150_000);
    expect(controller.queue?.steps[0].endedApprox).toBeUndefined();
    controller.hostDisconnected();
  });

  it("falls back to the connection coming back, marked as an estimate", () => {
    storeRun();
    const hass = makeHass({}, "490");
    const controller = makeController(() => hass);
    controller.hostConnected();
    const backAt = Date.now();
    vi.advanceTimersByTime(61_000);
    controller.tick();
    const step = controller.queue!.steps[0];
    expect(step.endedAt).toBe(backAt);
    expect(step.endedApprox).toBe(true);
    expect(queueRunTime(controller.queue!.steps)?.approximate).toBe(true);
    controller.hostDisconnected();
  });

  it("records the connection drop while the page watches the step", () => {
    window.sessionStorage.clear();
    const queue: QueueState = {
      version: 1,
      backup: false,
      stopRequested: false,
      steps: [
        {
          entityId: CORE,
          targetVersion: "490",
          state: "updating",
          role: "core",
          seenInProgress: true,
          startedAt: Date.now() - 10_000,
          idleSince: null,
        },
      ],
    };
    window.sessionStorage.setItem("ha-update-queue", JSON.stringify(queue));
    let hass = makeHass({}, "481", true);
    const controller = makeController(() => hass);
    controller.hostConnected();
    hass = makeHass({}, "481", false);
    controller.tick();
    expect(typeof controller.queue?.steps[0].connectionLostAt).toBe("number");
    controller.hostDisconnected();
  });
});
