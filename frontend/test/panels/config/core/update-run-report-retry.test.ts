import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUpdateRun } from "../../../../src/data/auto-update";
import type { UpdateEntity } from "../../../../src/data/update";
import type { QueueState } from "../../../../src/panels/config/core/updates/update-queue";
import {
  MAX_SHARE_RETRIES,
  UpdateQueueController,
} from "../../../../src/panels/config/core/updates/update-queue-controller";
import { SHARE_HEARTBEAT_MS } from "../../../../src/panels/config/core/updates/update-run-share";
import type { HomeAssistant } from "../../../../src/types";

vi.mock(
  "../../../../src/components/update-progress/update-install-tracker",
  () => ({ installUpdatesTracked: vi.fn() })
);

vi.mock("../../../../src/data/auto-update", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  setUpdateRun: vi.fn(),
  clearUpdateRun: vi.fn(),
}));

// Protects what other browsers see of an "Update everything" run.
// - A run that ends with a Core update reports its last state while the new
//   Core is still starting. That Core refuses update entities it has not
//   loaded yet, and the report used to be dropped for good, so the other
//   browsers lost the finished summary. A refused report is sent again.
// - A going run is reported at a steady pace, so other browsers can tell a
//   driven run from one whose browser was closed.

const CORE = "update.home_assistant_core_update";

const coreEntity = (inProgress: boolean): UpdateEntity =>
  ({
    entity_id: CORE,
    state: "on",
    attributes: {
      installed_version: "544",
      latest_version: "545",
      skipped_version: null,
      in_progress: inProgress,
      title: "Home Assistant Core",
      update_percentage: null,
    },
  }) as unknown as UpdateEntity;

const makeHass = (entity: UpdateEntity) =>
  ({
    connected: true,
    config: { version: "544" },
    states: { [CORE]: entity },
    localize: (key: string) => key,
  }) as unknown as HomeAssistant;

const makeController = (hass: HomeAssistant) =>
  new UpdateQueueController(
    {
      addController: () => undefined,
      requestUpdate: () => undefined,
    } as any,
    () => hass
  );

const store = (state: "done" | "updating") => {
  const queue: QueueState = {
    version: 1,
    backup: false,
    stopRequested: false,
    startedAt: Date.now() - 60_000,
    finishedAt: state === "done" ? Date.now() : undefined,
    steps: [
      {
        entityId: CORE,
        targetVersion: "545",
        state,
        role: "core",
        seenInProgress: true,
        startedAt: Date.now() - 60_000,
        idleSince: null,
      },
    ],
  };
  window.sessionStorage.setItem("ha-update-queue", JSON.stringify(queue));
};

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe("reporting the run to other browsers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(setUpdateRun).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a refused final report again", async () => {
    store("done");
    vi.mocked(setUpdateRun)
      .mockRejectedValueOnce(new Error("Not a known update entity"))
      .mockResolvedValue(undefined);
    const controller = makeController(makeHass(coreEntity(false)));
    controller.hostConnected();
    await flush();
    expect(setUpdateRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setUpdateRun).mock.calls[0][1].state).toBe("done");

    controller.tick();
    await flush();
    expect(setUpdateRun).toHaveBeenCalledTimes(2);

    // Accepted: an ended run is not sent again.
    controller.tick();
    await flush();
    expect(setUpdateRun).toHaveBeenCalledTimes(2);
    controller.hostDisconnected();
  });

  it("gives up on a report that keeps being refused", async () => {
    store("done");
    vi.mocked(setUpdateRun).mockRejectedValue(new Error("refused"));
    const controller = makeController(makeHass(coreEntity(false)));
    controller.hostConnected();
    await flush();
    for (let i = 0; i < MAX_SHARE_RETRIES + 5; i++) {
      controller.tick();
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
    expect(setUpdateRun).toHaveBeenCalledTimes(MAX_SHARE_RETRIES + 1);
    controller.hostDisconnected();
  });

  it("reports a going run again after the heartbeat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(10_000_000);
    store("updating");
    vi.mocked(setUpdateRun).mockResolvedValue(undefined);
    const controller = makeController(makeHass(coreEntity(true)));
    controller.hostConnected();
    await flush();
    expect(setUpdateRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setUpdateRun).mock.calls[0][1].state).toBe("running");

    controller.tick();
    await flush();
    expect(setUpdateRun).toHaveBeenCalledTimes(1);

    vi.setSystemTime(10_000_000 + SHARE_HEARTBEAT_MS);
    controller.tick();
    await flush();
    expect(setUpdateRun).toHaveBeenCalledTimes(2);
    // The same report again, not a change of state.
    expect(vi.mocked(setUpdateRun).mock.calls[1][1]).toEqual(
      vi.mocked(setUpdateRun).mock.calls[0][1]
    );
    controller.hostDisconnected();
  });
});
