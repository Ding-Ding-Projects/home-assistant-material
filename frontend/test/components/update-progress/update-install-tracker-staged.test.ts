import type { Connection } from "home-assistant-js-websocket";
import { describe, expect, it, vi } from "vitest";
import type { UpdateTrackerDeps } from "../../../src/components/update-progress/update-install-tracker";
import {
  OS_UPDATE_TITLE,
  deriveUpdateTrayRows,
  updateInstallTracker,
} from "../../../src/components/update-progress/update-install-tracker";
import type { UpdateEntity } from "../../../src/data/update";

// Protects the end of an operating system update. The update entity reports
// the staged version as installed, so only the operating system's own info
// says whether the new version runs: installed and waiting for a restart,
// running after it, or rolled back to the old one.

interface OsInfo {
  version: string | null;
  version_pending: string | null;
}

const entityOf = (
  entityId: string,
  installed: string,
  inProgress = false
): UpdateEntity =>
  ({
    entity_id: entityId,
    state: "on",
    attributes: {
      title: OS_UPDATE_TITLE,
      installed_version: installed,
      latest_version: "2",
      in_progress: inProgress,
      supported_features: 1,
    },
  }) as unknown as UpdateEntity;

const setup = (entityId: string) => {
  const handlers: Record<string, Set<() => void>> = {
    disconnected: new Set(),
    ready: new Set(),
  };
  let pushState: (state: UpdateEntity) => void = () => undefined;
  let current = entityOf(entityId, "1");
  const os: { info: OsInfo } = {
    info: { version: "1", version_pending: null },
  };
  const connection = {
    addEventListener: (name: string, fn: () => void) => handlers[name].add(fn),
    removeEventListener: (name: string, fn: () => void) =>
      handlers[name].delete(fn),
    subscribeEvents: vi.fn(async (callback: (event: unknown) => void) => {
      pushState = (state) => {
        current = state;
        callback({ data: { entity_id: entityId, new_state: state } });
      };
      return () => undefined;
    }),
    sendMessagePromise: vi.fn(async (message: Record<string, string>) => {
      if (message.type === "get_states") {
        return [current];
      }
      if (message.endpoint === "/os/info") {
        return os.info;
      }
      throw new Error("unexpected message");
    }),
  } as unknown as Connection;
  const deps: UpdateTrackerDeps = {
    connection,
    localize: ((key: string) => key) as UpdateTrackerDeps["localize"],
    callService: vi.fn() as unknown as UpdateTrackerDeps["callService"],
    instanceVersion: "x",
    backupAvailable: false,
  };
  const fire = (name: "disconnected" | "ready") =>
    handlers[name].forEach((fn) => fn());
  return { deps, os, fire, push: (state: UpdateEntity) => pushState(state) };
};

/** Installs until the entity reports the staged version, then waits. */
const installUntilStaged = async (entityId: string) => {
  const t = setup(entityId);
  t.os.info = { version: "1", version_pending: "2" };
  const generation = updateInstallTracker.begin(
    t.deps,
    entityOf(entityId, "1"),
    { entity_id: entityId }
  );
  await vi.waitFor(() => expect(t.push).toBeDefined());
  t.push(entityOf(entityId, "1", true));
  updateInstallTracker.finishCall(entityId, undefined, undefined, generation);
  t.push(entityOf(entityId, "2"));
  await vi.waitFor(() =>
    expect(updateInstallTracker.get(entityId)?.stage).toBe("restart_required")
  );
  return t;
};

describe("operating system update that needs a restart", () => {
  it("is not finished while the machine still runs the old version", async () => {
    const entityId = "update.os_staged";
    await installUntilStaged(entityId);
    const run = updateInstallTracker.get(entityId)!;
    expect(run.stage).toBe("restart_required");
    expect(run.finishedAt).toBeUndefined();
    const [row] = deriveUpdateTrayRows([run], Date.now());
    expect(row.state).toBe("attention");
    expect(row.dismissible).toBe(false);
  });

  it("ends as done when the restart brings the new version", async () => {
    const entityId = "update.os_new";
    const t = await installUntilStaged(entityId);
    t.fire("disconnected");
    expect(updateInstallTracker.get(entityId)?.stage).toBe("waiting");
    t.os.info = { version: "2", version_pending: null };
    t.push(entityOf(entityId, "2"));
    t.fire("ready");
    await vi.waitFor(() =>
      expect(updateInstallTracker.get(entityId)?.stage).toBe("done")
    );
  });

  it("says plainly that it rolled back when the old version came back", async () => {
    const entityId = "update.os_old";
    const t = await installUntilStaged(entityId);
    t.fire("disconnected");
    t.os.info = { version: "1", version_pending: null };
    t.push(entityOf(entityId, "1"));
    t.fire("ready");
    await vi.waitFor(() =>
      expect(updateInstallTracker.get(entityId)?.stage).toBe("rolled_back")
    );
    const [row] = deriveUpdateTrayRows(
      [updateInstallTracker.get(entityId)!],
      Date.now()
    );
    expect(row.state).toBe("attention");
    expect(row.dismissible).toBe(true);
  });

  it("stays as restart to finish after Later, and stays when only Home Assistant restarts", async () => {
    const entityId = "update.os_later";
    const t = await installUntilStaged(entityId);
    updateInstallTracker.deferRestart(entityId);
    expect(updateInstallTracker.get(entityId)?.restartDeferred).toBe(true);
    expect(updateInstallTracker.get(entityId)?.stage).toBe("restart_required");

    // The connection drops and returns, but the staged version is still
    // pending: nothing restarted the machine.
    t.fire("disconnected");
    t.fire("ready");
    await vi.waitFor(() =>
      expect(updateInstallTracker.get(entityId)?.stage).toBe("restart_required")
    );
    expect(updateInstallTracker.get(entityId)?.finishedAt).toBeUndefined();
  });
});
