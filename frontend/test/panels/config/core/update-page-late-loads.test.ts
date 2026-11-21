import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_TIMEOUT_MS,
  missingNoticeDue,
  RetryingSubscription,
} from "../../../../src/panels/config/core/updates/update-page-loading";
import { versionArrival } from "../../../../src/panels/config/core/updates/update-progress-model";

// After a run that updates the Supervisor and Home Assistant Core, the page
// reloads while both restart. The backup state is then subscribed to late,
// may never answer, or may fail; the page must keep trying without leaving a
// subscription open, and say so when something is still missing.

const never = <T>(): Promise<T> =>
  new Promise<T>((_resolve) => {
    void _resolve;
  });

describe("RetryingSubscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes, and closes the subscription when stopped", async () => {
    const unsub = vi.fn();
    const sub = new RetryingSubscription(
      () => Promise.resolve(unsub),
      () => undefined
    );
    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sub.status).toBe("ready");
    sub.stop();
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(sub.status).toBe("idle");
  });

  it("tries again after a call that never answers", async () => {
    const unsub = vi.fn();
    let calls = 0;
    const sub = new RetryingSubscription(
      () => {
        calls++;
        return calls === 1 ? never() : Promise.resolve(unsub);
      },
      () => undefined,
      CALL_TIMEOUT_MS,
      [1000]
    );
    sub.start();
    await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_MS);
    expect(sub.status).toBe("error");
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(sub.status).toBe("ready");
  });

  it("closes a subscription that answers after its time limit", async () => {
    const late = vi.fn();
    let answer: (unsub: () => void) => void = () => undefined;
    const sub = new RetryingSubscription(
      () =>
        new Promise<() => void>((resolve) => {
          answer = resolve;
        }),
      () => undefined,
      1000,
      [60_000]
    );
    sub.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sub.status).toBe("error");
    answer(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late).toHaveBeenCalledTimes(1);
    sub.stop();
  });

  it("does not subscribe twice when started again", async () => {
    let calls = 0;
    const sub = new RetryingSubscription(
      () => {
        calls++;
        return Promise.resolve(() => undefined);
      },
      () => undefined
    );
    sub.start();
    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    sub.start();
    expect(calls).toBe(1);
    sub.stop();
  });

  it("tries again at once when the connection comes back", async () => {
    let calls = 0;
    const sub = new RetryingSubscription(
      () => {
        calls++;
        return calls === 1
          ? Promise.reject(new Error("restarting"))
          : Promise.resolve(() => undefined);
      },
      () => undefined,
      CALL_TIMEOUT_MS,
      [60_000]
    );
    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sub.status).toBe("error");
    sub.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    expect(sub.status).toBe("ready");
    sub.stop();
  });
});

describe("missing information notice", () => {
  it("shows only after the wait and while something is missing", () => {
    expect(missingNoticeDue(false, [true])).toBe(false);
    expect(missingNoticeDue(true, [false, false])).toBe(false);
    expect(missingNoticeDue(true, [false, true])).toBe(true);
  });
});

describe("versionArrival", () => {
  const record = { fromVersion: "2026.11.2.543", toVersion: "2026.11.2.544" };

  it("ends at the version the update installed to", () => {
    expect(
      versionArrival(record, {
        state: "off",
        installedVersion: "2026.11.2.544",
      })
    ).toEqual({ arrived: true, version: "2026.11.2.544" });
  });

  it("ends a going back at the older version it installed", () => {
    expect(
      versionArrival(record, { state: "on", installedVersion: "2026.11.2.540" })
    ).toEqual({ arrived: true, version: "2026.11.2.540" });
  });

  it("keeps waiting while nothing changed", () => {
    expect(
      versionArrival(record, { state: "on", installedVersion: "2026.11.2.543" })
    ).toEqual({ arrived: false });
  });

  it("keeps waiting through a restart", () => {
    expect(
      versionArrival(record, {
        state: "unavailable",
        installedVersion: "2026.11.2.540",
      })
    ).toEqual({ arrived: false });
  });
});
