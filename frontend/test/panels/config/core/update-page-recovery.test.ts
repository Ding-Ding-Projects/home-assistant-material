import { describe, expect, it, vi } from "vitest";
import {
  BUILD_RELOAD_KEY,
  DISCONNECT_NOTICE_MS,
  focusIsEditing,
  PROBE_ATTEMPTS,
  PROBE_RETRY_MS,
  UpdatePageRecovery,
} from "../../../../src/panels/config/core/updates/update-page-recovery";
import type {
  BuildProbeResult,
  RecoveryDeps,
} from "../../../../src/panels/config/core/updates/update-page-recovery";
import { autoSystemOsUnmanaged } from "../../../../src/data/auto-update";
import type { AutoSystemInfo } from "../../../../src/data/auto-update";

// The updates page stays open while Home Assistant restarts onto another
// build. It must recover by itself: check the build once after the restart,
// reload once when the build changed, never over something the person is
// doing, never in a loop, and offer a reload when it cannot recover.

const GONE: BuildProbeResult = {
  verdict: "gone",
  url: "http://ha/frontend_latest/app.abc12345.js",
};

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

const setup = (overrides: Partial<RecoveryDeps> = {}) => {
  let now = 1_000_000;
  const deps = {
    probe: vi.fn(async () => GONE),
    busy: vi.fn(() => false),
    reload: vi.fn(() => true),
    changed: vi.fn(),
    storage: memoryStorage(),
    now: () => now,
    ...overrides,
  };
  const recovery = new UpdatePageRecovery(deps);
  return {
    recovery,
    deps,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("updates page recovery after a restart", () => {
  it("does not check the build without a reconnect", async () => {
    const { recovery, deps } = setup();
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.probe).not.toHaveBeenCalled();
  });

  it("waits until Home Assistant runs again, then reloads once", async () => {
    const { recovery, deps } = setup();
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: false });
    await flush();
    expect(deps.probe).not.toHaveBeenCalled();

    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.probe).toHaveBeenCalledTimes(1);
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(deps.storage?.getItem(BUILD_RELOAD_KEY)).toBe(GONE.url);

    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("leaves the page alone when the build is still served", async () => {
    const { recovery, deps } = setup({
      probe: vi.fn(async () => ({ verdict: "present" as const, url: "x" })),
    });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.probe).toHaveBeenCalledTimes(1);
    expect(deps.reload).not.toHaveBeenCalled();
    expect(recovery.noticeDue()).toBe(false);
  });

  it("waits while the person is busy, then reloads", async () => {
    let busy = true;
    const { recovery, deps } = setup({ busy: vi.fn(() => busy) });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.reload).not.toHaveBeenCalled();
    recovery.update({ connected: true, running: true });
    expect(deps.reload).not.toHaveBeenCalled();

    busy = false;
    recovery.update({ connected: true, running: true });
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads twice for the same build: it asks instead", async () => {
    const storage = memoryStorage();
    storage.setItem(BUILD_RELOAD_KEY, GONE.url!);
    const { recovery, deps } = setup({ storage });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.reload).not.toHaveBeenCalled();
    expect(recovery.newerBuild).toBe(true);
    expect(recovery.noticeDue()).toBe(true);
  });

  it("asks instead of reloading without session storage", async () => {
    const { recovery, deps } = setup({ storage: undefined });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.reload).not.toHaveBeenCalled();
    expect(recovery.newerBuild).toBe(true);
  });

  it("asks when the reload was refused", async () => {
    const { recovery } = setup({ reload: vi.fn(() => false) });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    expect(recovery.newerBuild).toBe(true);
  });

  it("asks an unclear answer again after a pause, a limited number of times", async () => {
    const { recovery, deps, advance } = setup({
      probe: vi.fn(async () => ({ verdict: "unknown" as const })),
    });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.probe).toHaveBeenCalledTimes(1);

    // Too early: no new question.
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.probe).toHaveBeenCalledTimes(1);

    for (let i = 1; i < PROBE_ATTEMPTS + 2; i++) {
      advance(PROBE_RETRY_MS);
      recovery.update({ connected: true, running: true });
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
    expect(deps.probe).toHaveBeenCalledTimes(PROBE_ATTEMPTS);
    expect(deps.reload).not.toHaveBeenCalled();
    expect(recovery.noticeDue()).toBe(false);
  });

  it("offers a reload when the connection stays away", () => {
    const { recovery, advance } = setup();
    recovery.update({ connected: false, running: true });
    expect(recovery.noticeDue()).toBe(false);
    advance(DISCONNECT_NOTICE_MS - 1);
    expect(recovery.noticeDue()).toBe(false);
    advance(1);
    expect(recovery.noticeDue()).toBe(true);
    recovery.update({ connected: true, running: false });
    expect(recovery.noticeDue()).toBe(false);
  });

  it("a failing probe counts as an unclear answer", async () => {
    const { recovery, deps } = setup({
      probe: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    recovery.update({ connected: false, running: true });
    recovery.update({ connected: true, running: true });
    await flush();
    expect(deps.reload).not.toHaveBeenCalled();
  });
});

describe("focused element takes input", () => {
  it("knows fields and sliders", () => {
    expect(focusIsEditing(null)).toBe(false);
    expect(focusIsEditing(document.createElement("input"))).toBe(true);
    expect(focusIsEditing(document.createElement("textarea"))).toBe(true);
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    expect(focusIsEditing(slider)).toBe(true);
    expect(focusIsEditing(document.createElement("button"))).toBe(false);
  });
});

describe("operating system automatic update", () => {
  const system = (os?: Partial<AutoSystemInfo["parts"][number]>) =>
    ({
      parts: os
        ? [
            {
              part: "os",
              entity_id: "update.home_assistant_operating_system_update",
              available: true,
              installed_version: "16.0",
              ...os,
            },
          ]
        : [],
    }) as unknown as AutoSystemInfo;

  it("is unmanaged without an operating system update", () => {
    expect(autoSystemOsUnmanaged(system())).toBe(true);
    expect(autoSystemOsUnmanaged(system({ available: false }))).toBe(true);
    expect(autoSystemOsUnmanaged(system({ installed_version: null }))).toBe(
      true
    );
    expect(autoSystemOsUnmanaged(system({}))).toBe(false);
  });
});
