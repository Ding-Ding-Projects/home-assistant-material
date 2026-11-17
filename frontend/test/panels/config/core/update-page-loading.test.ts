import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_WAIT_MS,
  CallTimeoutError,
  pageShowsSpinner,
  RetryingLoad,
  withTimeout,
} from "../../../../src/panels/config/core/updates/update-page-loading";
import {
  FINISHED_KEEP_MS,
  loadStoredQueue,
  parseStoredQueue,
  storeQueue,
} from "../../../../src/panels/config/core/updates/update-queue";
import type { QueueState } from "../../../../src/panels/config/core/updates/update-queue";

// The updates page after a reload onto a new build: the Supervisor may still
// be starting, so a call may never answer, reject, or the connection may drop
// and return. The page must show itself regardless.

// A call that never answers.
const never = <T>(): Promise<T> =>
  new Promise<T>((_resolve) => {
    void _resolve;
  });

describe("page spinner", () => {
  it("shows only while the backup state is unknown and the wait is not over", () => {
    expect(pageShowsSpinner(undefined, true, false)).toBe(true);
    expect(pageShowsSpinner(undefined, true, true)).toBe(false);
    expect(pageShowsSpinner("idle", true, false)).toBe(false);
    expect(pageShowsSpinner(undefined, false, false)).toBe(false);
    expect(BACKUP_WAIT_MS).toBeLessThanOrEqual(3000);
  });
});

describe("loading with a time limit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rejects a call that never answers", async () => {
    const result = withTimeout(never<never>(), 1000);
    const caught = result.catch((err) => err);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await caught).toBeInstanceOf(CallTimeoutError);
  });

  it("ends in an error state for a call that never answers, then retries", async () => {
    let calls = 0;
    const changed = vi.fn();
    const load = new RetryingLoad(
      () => {
        calls++;
        return calls === 1 ? never<string>() : Promise.resolve("info");
      },
      changed,
      1000,
      [500]
    );
    load.start();
    expect(load.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1001);
    expect(load.status).toBe("error");
    await vi.advanceTimersByTimeAsync(501);
    expect(load.status).toBe("ready");
    expect(load.value).toBe("info");
    load.stop();
  });

  it("keeps retrying a call that rejects, with growing pauses", async () => {
    let calls = 0;
    const load = new RetryingLoad(
      () => {
        calls++;
        return Promise.reject(new Error("starting"));
      },
      () => undefined,
      1000,
      [100, 200]
    );
    load.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(load.status).toBe("error");
    await vi.advanceTimersByTimeAsync(101);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(201);
    expect(calls).toBe(3);
    load.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(3);
  });

  it("tries again at once when the connection returns", async () => {
    let up = false;
    let calls = 0;
    const load = new RetryingLoad(
      () => {
        calls++;
        return up ? Promise.resolve(1) : Promise.reject(new Error("down"));
      },
      () => undefined,
      1000,
      [60000]
    );
    load.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(load.status).toBe("error");
    up = true;
    load.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(load.status).toBe("ready");
    expect(calls).toBe(2);
    load.retryNow();
    expect(calls).toBe(2);
    load.stop();
  });
});

describe("a finished queue after a reload", () => {
  const finished = (): QueueState => ({
    version: 1,
    backup: false,
    stopRequested: false,
    steps: [
      {
        entityId: "update.home_assistant_core_update",
        targetVersion: "2026.11.1.503",
        state: "done",
        role: "core",
        seenInProgress: true,
        startedAt: 1,
        idleSince: null,
      },
    ],
  });

  beforeEach(() => window.sessionStorage.clear());

  it("is kept, so the page can say the updates finished", () => {
    storeQueue(finished());
    const stored = loadStoredQueue();
    expect(stored?.steps[0].state).toBe("done");
    expect(stored?.finishedAt).toBeTypeOf("number");
  });

  it("is forgotten when the person closes it", () => {
    storeQueue(finished());
    storeQueue(undefined);
    expect(loadStoredQueue()).toBeUndefined();
  });

  it("is dropped after an hour", () => {
    storeQueue(finished());
    const raw = JSON.parse(window.sessionStorage.getItem("ha-update-queue")!);
    raw.finishedAt = Date.now() - FINISHED_KEEP_MS - 1000;
    expect(parseStoredQueue(JSON.stringify(raw))).toBeUndefined();
  });

  it("is not kept when nothing was installed", () => {
    const queue = finished();
    queue.steps[0].state = "skipped";
    storeQueue(queue);
    expect(loadStoredQueue()).toBeUndefined();
  });
});
