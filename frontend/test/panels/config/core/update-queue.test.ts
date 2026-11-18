import { describe, expect, it } from "vitest";
import type { UpdateEntity } from "../../../../src/data/update";
import {
  STEP_SETTLE_MS,
  STEP_START_GRACE_MS,
  STEP_TIMEOUT_MS,
  SYSTEM_STEP_SETTLE_MS,
  createQueue,
  evaluateStep,
  orderUpdateQueue,
  parseStoredQueue,
  queueProgress,
  stepReached,
  supervisorUpdateFirst,
  updateBlockReason,
  updateRole,
} from "../../../../src/panels/config/core/updates/update-queue";

// Protects the order in which "Update everything" installs: the Supervisor
// first and the operating system last, because each of them restarts
// something under the updates that come after it. A wrong order here breaks
// a running instance without any visible error.

const entity = (
  entityId: string,
  overrides: Partial<UpdateEntity["attributes"]> = {},
  state = "on"
): UpdateEntity =>
  ({
    entity_id: entityId,
    state,
    attributes: {
      installed_version: "1",
      latest_version: "2",
      skipped_version: null,
      in_progress: false,
      title: null,
      update_percentage: null,
      ...overrides,
    },
  }) as unknown as UpdateEntity;

const supervisor = (o = {}, s = "on") =>
  entity("update.home_assistant_supervisor_update", o, s);
const core = (o = {}, s = "on") =>
  entity("update.home_assistant_core_update", o, s);
const os = (o = {}, s = "on") =>
  entity("update.home_assistant_operating_system_update", o, s);
const app = (name: string, o = {}, s = "on") =>
  entity(`update.${name}_update`, o, s);

const ids = (list: UpdateEntity[]) => list.map((e) => e.entity_id);

describe("updateRole", () => {
  it("knows the three system updates by entity id", () => {
    expect(updateRole(supervisor())).toBe("supervisor");
    expect(updateRole(core())).toBe("core");
    expect(updateRole(os())).toBe("os");
    expect(updateRole(app("mosquitto"))).toBe("other");
  });

  it("falls back to the fixed title when the entity id was renamed", () => {
    expect(
      updateRole(entity("update.my_core", { title: "Home Assistant Core" }))
    ).toBe("core");
  });
});

// Core is refused by the Supervisor while a newer Supervisor is on offer, so
// the page has to know beforehand and offer the Supervisor first.
describe("supervisorUpdateFirst", () => {
  it("names the Supervisor update that Core has to wait for", () => {
    expect(
      supervisorUpdateFirst(core(), [core(), supervisor()])?.entity_id
    ).toBe("update.home_assistant_supervisor_update");
  });

  it("says nothing when the Supervisor is current, running or skipped", () => {
    expect(supervisorUpdateFirst(core(), [core()])).toBeUndefined();
    expect(
      supervisorUpdateFirst(core(), [
        core(),
        entity("update.home_assistant_supervisor_update", {}, "off"),
      ])
    ).toBeUndefined();
    expect(
      supervisorUpdateFirst(core(), [
        core(),
        entity("update.home_assistant_supervisor_update", {
          in_progress: true,
        }),
      ])
    ).toBeUndefined();
    expect(
      supervisorUpdateFirst(core(), [
        core(),
        entity("update.home_assistant_supervisor_update", {
          skipped_version: "2",
        }),
      ])
    ).toBeUndefined();
  });

  it("applies to Core only", () => {
    expect(supervisorUpdateFirst(app("a"), [app("a"), supervisor()])).toBe(
      undefined
    );
    expect(supervisorUpdateFirst(os(), [os(), supervisor()])).toBeUndefined();
  });

  it("puts the Supervisor before Core in the queue it starts", () => {
    expect(ids(orderUpdateQueue([core(), supervisor()]))).toEqual([
      "update.home_assistant_supervisor_update",
      "update.home_assistant_core_update",
    ]);
  });
});

describe("orderUpdateQueue", () => {
  it("runs the Supervisor, then apps, then Core, then the operating system", () => {
    const ordered = orderUpdateQueue([
      os(),
      core(),
      app("zigbee"),
      app("mosquitto"),
      supervisor(),
    ]);
    expect(ids(ordered)).toEqual([
      "update.home_assistant_supervisor_update",
      "update.zigbee_update",
      "update.mosquitto_update",
      "update.home_assistant_core_update",
      "update.home_assistant_operating_system_update",
    ]);
  });

  it("keeps the given order among apps and other updates", () => {
    expect(ids(orderUpdateQueue([app("b"), app("a"), app("c")]))).toEqual([
      "update.b_update",
      "update.a_update",
      "update.c_update",
    ]);
  });

  it("copes with system updates that are missing", () => {
    expect(ids(orderUpdateQueue([core(), app("a")]))).toEqual([
      "update.a_update",
      "update.home_assistant_core_update",
    ]);
    expect(orderUpdateQueue([])).toEqual([]);
  });

  it("leaves out skipped versions and updates with nothing waiting", () => {
    const skipped = app("skipped", {
      latest_version: "3",
      skipped_version: "3",
    });
    const current = app("current", {}, "off");
    expect(ids(orderUpdateQueue([skipped, current, app("a")]))).toEqual([
      "update.a_update",
    ]);
  });

  it("puts updates that are already running first", () => {
    const running = app("running", { in_progress: true });
    const ordered = orderUpdateQueue([
      supervisor(),
      app("a"),
      os({ in_progress: true }),
      running,
    ]);
    expect(ids(ordered)).toEqual([
      "update.running_update",
      "update.home_assistant_operating_system_update",
      "update.home_assistant_supervisor_update",
      "update.a_update",
    ]);
  });
});

describe("evaluateStep", () => {
  const step = {
    targetVersion: "2",
    seenInProgress: true,
    startedAt: 1000,
  };

  it("waits while the connection is down", () => {
    expect(evaluateStep(undefined, step, 2000, false)).toEqual({
      kind: "waiting",
    });
    expect(evaluateStep(core(), step, 2000, false)).toEqual({
      kind: "waiting",
    });
  });

  it("is running while in progress", () => {
    expect(
      evaluateStep(core({ in_progress: true }), step, 2000, true).kind
    ).toBe("running");
  });

  it("is done when the target version is installed or the state is off", () => {
    expect(
      evaluateStep(core({ installed_version: "2" }), step, 2000, true).kind
    ).toBe("done");
    expect(evaluateStep(core({}, "off"), step, 2000, true).kind).toBe("done");
  });

  // Found in a real run: nine seconds into a Core update the entity went
  // back to "available, not running" while the download was still going, and
  // the queue called that a failure. Core then updated correctly.
  it("does not fail the moment a running update reports not running", () => {
    expect(evaluateStep(core(), step, 2000, true)).toEqual({ kind: "waiting" });
    expect(
      evaluateStep(core(), { ...step, idleSince: 2000 }, 11000, true)
    ).toEqual({ kind: "waiting" });
  });

  it("fails once not running has lasted for an ordinary update", () => {
    const other = { ...step, role: "other" as const, idleSince: 2000 };
    expect(evaluateStep(core(), other, 2000 + STEP_SETTLE_MS, true)).toEqual({
      kind: "waiting",
    });
    expect(
      evaluateStep(core(), other, 2000 + STEP_SETTLE_MS + 1, true)
    ).toEqual({ kind: "failed", reason: "failed" });
  });

  it("gives Supervisor, Core and operating system updates longer", () => {
    const system = { ...step, role: "core" as const, idleSince: 2000 };
    expect(
      evaluateStep(core(), system, 2000 + STEP_SETTLE_MS + 1, true)
    ).toEqual({ kind: "waiting" });
    expect(
      evaluateStep(core(), system, 2000 + SYSTEM_STEP_SETTLE_MS + 1, true)
    ).toEqual({ kind: "failed", reason: "failed" });
  });

  it("counts as running while the install call is still open", () => {
    expect(
      evaluateStep(core(), { ...step, idleSince: 2000 }, 9e6, true, true)
    ).toEqual({ kind: "failed", reason: "timeout" });
    expect(
      evaluateStep(
        core(),
        { ...step, role: "core" as const, idleSince: 2000 },
        2000 + SYSTEM_STEP_SETTLE_MS + 5000,
        true,
        true
      )
    ).toEqual({ kind: "running" });
  });

  it("is done when the target version arrives after a quiet spell", () => {
    expect(
      evaluateStep(
        core({ installed_version: "2" }),
        { ...step, role: "core" as const, idleSince: 2000 },
        2000 + SYSTEM_STEP_SETTLE_MS + 5000,
        true
      )
    ).toEqual({ kind: "done" });
  });

  it("gives a started install time to show up before it counts as not started", () => {
    const unseen = { ...step, seenInProgress: false };
    expect(evaluateStep(core(), unseen, 2000, true).kind).toBe("waiting");
    expect(
      evaluateStep(core(), unseen, 1000 + STEP_START_GRACE_MS + 1, true)
    ).toEqual({ kind: "failed", reason: "not_started" });
  });

  it("treats an unavailable entity as a restart in progress, until the time limit", () => {
    expect(evaluateStep(core({}, "unavailable"), step, 2000, true).kind).toBe(
      "waiting"
    );
    expect(
      evaluateStep(
        core({}, "unavailable"),
        step,
        1000 + STEP_TIMEOUT_MS + 1,
        true
      )
    ).toEqual({ kind: "failed", reason: "timeout" });
  });

  it("fails an install that runs longer than thirty minutes", () => {
    expect(
      evaluateStep(
        core({ in_progress: true }),
        step,
        1000 + STEP_TIMEOUT_MS + 1,
        true
      )
    ).toEqual({ kind: "failed", reason: "timeout" });
  });
});

describe("updateBlockReason", () => {
  it("allows a press when nothing is running", () => {
    expect(
      updateBlockReason(core(), [core(), app("a")], false)
    ).toBeUndefined();
  });

  it("blocks every other update while one is running", () => {
    const running = app("a", { in_progress: true });
    expect(updateBlockReason(app("b"), [running, app("b")], false)).toEqual({
      kind: "update_running",
      entityId: "update.a_update",
    });
  });

  it("does not block the running update itself", () => {
    const running = app("a", { in_progress: true });
    expect(updateBlockReason(running, [running], false)).toBeUndefined();
  });

  it("holds Core and the operating system while the Supervisor runs", () => {
    const list = [supervisor({ in_progress: true }), core(), os()];
    expect(updateBlockReason(core(), list, false)?.entityId).toBe(
      "update.home_assistant_supervisor_update"
    );
    expect(updateBlockReason(os(), list, false)?.entityId).toBe(
      "update.home_assistant_supervisor_update"
    );
  });

  it("holds the operating system while Core runs", () => {
    const list = [core({ in_progress: true }), os()];
    expect(updateBlockReason(os(), list, false)?.entityId).toBe(
      "update.home_assistant_core_update"
    );
  });

  it("holds single updates between steps of a running queue", () => {
    expect(updateBlockReason(app("a"), [app("a")], true)).toEqual({
      kind: "queue_running",
    });
  });
});

describe("queue state", () => {
  it("is built in order with the target versions", () => {
    const queue = createQueue([os(), core(), supervisor()], true);
    expect(queue.steps.map((s) => s.role)).toEqual([
      "supervisor",
      "core",
      "os",
    ]);
    expect(queue.steps.every((s) => s.targetVersion === "2")).toBe(true);
    expect(queue.backup).toBe(true);
  });

  it("reports progress over the steps", () => {
    const queue = createQueue([supervisor(), app("a"), core()], false);
    queue.steps[0].state = "done";
    queue.steps[1].state = "updating";
    expect(queueProgress(queue)).toMatchObject({
      total: 3,
      finished: 1,
      position: 2,
      percent: 33,
    });
  });

  it("drops stored data that is not a queue", () => {
    expect(parseStoredQueue(null)).toBeUndefined();
    expect(parseStoredQueue("not json")).toBeUndefined();
    expect(parseStoredQueue('{"version":2,"steps":[]}')).toBeUndefined();
    expect(
      parseStoredQueue(
        JSON.stringify({
          version: 1,
          steps: [{ entityId: "light.kitchen", state: "waiting" }],
        })
      )
    ).toBeUndefined();
  });

  it("keeps the version a step started from, and accepts a queue stored without it", () => {
    const queue = createQueue([supervisor(), core()], false);
    expect(queue.steps[0].fromVersion).toBe(
      supervisor().attributes.installed_version
    );
    const restored = parseStoredQueue(JSON.stringify(queue));
    expect(restored?.steps[0].fromVersion).toBe(queue.steps[0].fromVersion);
    // A queue stored by an older build has no from-version.
    const old = JSON.parse(JSON.stringify(queue));
    old.steps.forEach(
      (step: Record<string, unknown>) => delete step.fromVersion
    );
    expect(parseStoredQueue(JSON.stringify(old))?.steps[0].fromVersion).toBe(
      undefined
    );
  });

  it("restores what it stored", () => {
    const queue = createQueue([supervisor(), core()], false);
    queue.steps[0].state = "updating";
    queue.steps[0].seenInProgress = true;
    expect(parseStoredQueue(JSON.stringify(queue))).toEqual({
      ...queue,
      failure: undefined,
    });
  });
});

describe("stepReached", () => {
  it("is true at the target version or when nothing is offered", () => {
    expect(
      stepReached(core({ installed_version: "2" }), { targetVersion: "2" })
    ).toBe(true);
    expect(stepReached(core({}, "off"), { targetVersion: "2" })).toBe(true);
  });

  it("is false while still offered, while running, or when gone", () => {
    expect(stepReached(core(), { targetVersion: "2" })).toBe(false);
    expect(
      stepReached(core({ installed_version: "2", in_progress: true }), {
        targetVersion: "2",
      })
    ).toBe(false);
    expect(stepReached(undefined, { targetVersion: "2" })).toBe(false);
  });
});
