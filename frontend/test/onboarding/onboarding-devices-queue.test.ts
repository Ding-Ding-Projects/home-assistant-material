import { afterEach, describe, expect, it, vi } from "vitest";
import { runSetupQueue } from "../../src/onboarding/onboarding-devices-logic";
import type { DeviceStatus } from "../../src/onboarding/onboarding-devices-logic";

describe("runSetupQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a dialog that never reports back unfinished and moves on", async () => {
    vi.useFakeTimers();
    const seen: [string, DeviceStatus][] = [];
    const done = runSetupQueue(
      ["never", "ok"],
      (id) =>
        id === "never"
          ? new Promise<boolean>(() => {
              // never settles
            })
          : Promise.resolve(true),
      (id, status) => seen.push([id, status]),
      () => false,
      1000
    );
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(seen).toEqual([
      ["never", "running"],
      ["never", "unfinished"],
      ["ok", "running"],
      ["ok", "added"],
    ]);
  });

  it("treats a thrown run as unfinished and honours stop", async () => {
    const seen: [string, DeviceStatus][] = [];
    let stop = false;
    await runSetupQueue(
      ["bad", "skipped"],
      () => Promise.reject(new Error("x")),
      (id, status) => {
        seen.push([id, status]);
        if (status === "unfinished") {
          stop = true;
        }
      },
      () => stop
    );
    expect(seen).toEqual([
      ["bad", "running"],
      ["bad", "unfinished"],
    ]);
  });
});
