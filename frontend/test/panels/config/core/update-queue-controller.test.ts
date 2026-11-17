import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateEntity } from "../../../../src/data/update";
import type { HomeAssistant } from "../../../../src/types";

import { installUpdatesTracked } from "../../../../src/components/update-progress/update-install-tracker";
import type { QueueState } from "../../../../src/panels/config/core/updates/update-queue";
import { loadStoredQueue } from "../../../../src/panels/config/core/updates/update-queue";
import { UpdateQueueController } from "../../../../src/panels/config/core/updates/update-queue-controller";

vi.mock(
  "../../../../src/components/update-progress/update-install-tracker",
  () => ({ installUpdatesTracked: vi.fn() })
);

// Protects "Update everything" across a Core restart. In a real run the
// install call was rejected with an empty, non-connection error while Core
// restarted, the page reloaded onto the new build, and the card then said the
// update had failed although Core was running the new version.

const CORE = "update.home_assistant_core_update";

const coreEntity = (
  overrides: Partial<UpdateEntity["attributes"]> = {},
  state = "on"
): UpdateEntity =>
  ({
    entity_id: CORE,
    state,
    attributes: {
      installed_version: "481",
      latest_version: "490",
      skipped_version: null,
      in_progress: false,
      title: "Home Assistant Core",
      update_percentage: null,
      ...overrides,
    },
  }) as unknown as UpdateEntity;

const makeHass = (
  entity: UpdateEntity | undefined,
  version = "481",
  connected = true
) =>
  ({
    connected,
    config: { version },
    states: entity ? { [CORE]: entity } : {},
    localize: (key: string) => key,
  }) as unknown as HomeAssistant;

const makeController = (getHass: () => HomeAssistant) => {
  const host = {
    addController: () => undefined,
    requestUpdate: () => undefined,
  } as any;
  return new UpdateQueueController(host, getHass);
};

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const stepOf = (state: "failed" | "waiting"): QueueState["steps"][number] => ({
  entityId: CORE,
  targetVersion: "490",
  state,
  role: "core",
  seenInProgress: state === "failed",
  startedAt: state === "failed" ? 1 : null,
  idleSince: null,
});

const store = (queue: QueueState) =>
  window.sessionStorage.setItem("ha-update-queue", JSON.stringify(queue));

describe("update queue controller", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(installUpdatesTracked).mockReset();
  });

  it("does not fail Core when its install call is cut off by the restart", async () => {
    let hass = makeHass(coreEntity());
    vi.mocked(installUpdatesTracked).mockImplementation(async () => {
      // The restart starts: the call dies with an error that is not a lost
      // connection and has no text.
      hass = makeHass(coreEntity({ in_progress: true }), "481", false);
      throw {};
    });
    const controller = makeController(() => hass);
    controller.start([coreEntity()], false);
    await flush();
    expect(controller.queue?.failure).toBeUndefined();
    expect(controller.queue?.steps[0].state).toBe("updating");
  });

  it("finishes the step when the reloaded page finds Core at the target", () => {
    store({
      version: 1,
      backup: false,
      stopRequested: false,
      failure: { entityId: CORE, reason: "error" },
      steps: [stepOf("failed")],
    });
    const hass = makeHass(coreEntity(), "490");
    const controller = makeController(() => hass);
    controller.hostConnected();
    expect(controller.queue?.failure).toBeUndefined();
    expect(controller.queue?.steps[0].state).toBe("done");
    expect(installUpdatesTracked).not.toHaveBeenCalled();
    controller.hostDisconnected();
  });

  it("heals a refused-call failure once the target is reached", () => {
    store({
      version: 1,
      backup: false,
      stopRequested: false,
      failure: { entityId: CORE, reason: "error" },
      steps: [stepOf("failed")],
    });
    let hass = makeHass(coreEntity(), "481");
    const controller = makeController(() => hass);
    controller.hostConnected();
    expect(controller.queue?.failure?.reason).toBe("error");
    hass = makeHass(coreEntity({ installed_version: "490" }, "off"), "490");
    controller.tick();
    expect(controller.queue?.failure).toBeUndefined();
    expect(controller.queue?.steps[0].state).toBe("done");
    controller.hostDisconnected();
  });

  it("does not issue another install for a restored step already at the target", () => {
    store({
      version: 1,
      backup: false,
      stopRequested: false,
      steps: [stepOf("waiting")],
    });
    const hass = makeHass(coreEntity(), "490");
    const controller = makeController(() => hass);
    controller.hostConnected();
    expect(installUpdatesTracked).not.toHaveBeenCalled();
    expect(loadStoredQueue()).toBeUndefined();
    controller.hostDisconnected();
  });

  it("still fails a genuine refusal with a message that is never empty", async () => {
    const hass = makeHass(coreEntity());
    vi.mocked(installUpdatesTracked).mockRejectedValue({});
    const controller = makeController(() => hass);
    controller.start([coreEntity()], false);
    await flush();
    expect(controller.queue?.failure?.reason).toBe("error");
    expect(controller.failureMessage).toBeTruthy();
  });
});
