import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveSubscriptionGate,
  liveSubscriptionWanted,
} from "../../../../src/panels/config/core/updates/update-page-loading";

// Protects the read-only summary of an "Update everything" run in a second
// browser. After a run that restarts Home Assistant, that browser reloads
// onto the new build; the user and the automatic updates part may only be
// known a moment later. The page must still end up subscribed to the run
// record, try again when a subscribe is refused, and subscribe afresh after a
// reconnect, instead of deciding once and giving up.

describe("liveSubscriptionWanted", () => {
  const base = { connected: true, isAdmin: true, componentLoaded: true };

  it("is wanted for a connected administrator with the part loaded", () => {
    expect(liveSubscriptionWanted(base)).toBe(true);
  });

  it("waits while the user is not known yet", () => {
    expect(liveSubscriptionWanted({ ...base, isAdmin: undefined })).toBe(false);
  });

  it("is never wanted for someone who is not an administrator", () => {
    expect(liveSubscriptionWanted({ ...base, isAdmin: false })).toBe(false);
  });

  it("waits while the part is not loaded", () => {
    expect(liveSubscriptionWanted({ ...base, componentLoaded: false })).toBe(
      false
    );
  });

  it("is not wanted while disconnected", () => {
    expect(liveSubscriptionWanted({ ...base, connected: false })).toBe(false);
  });
});

describe("LiveSubscriptionGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes once the user turns out to be an administrator", async () => {
    const subscribe = vi.fn(() => Promise.resolve(() => undefined));
    const gate = new LiveSubscriptionGate(subscribe, () => undefined);
    // The page shows before the user is known.
    gate.sync(
      liveSubscriptionWanted({
        connected: true,
        isAdmin: undefined,
        componentLoaded: true,
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribe).not.toHaveBeenCalled();
    // The user arrives with the next change.
    gate.sync(
      liveSubscriptionWanted({
        connected: true,
        isAdmin: true,
        componentLoaded: true,
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(gate.status).toBe("ready");
    // Later changes do not subscribe a second time.
    gate.sync(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("tries again after a refused subscribe", async () => {
    let calls = 0;
    const subscribe = vi.fn(() => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error("unknown_command"))
        : Promise.resolve(() => undefined);
    });
    const gate = new LiveSubscriptionGate(
      subscribe,
      () => undefined,
      1000,
      [500]
    );
    gate.sync(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.status).toBe("error");
    // A change in the meantime does not start a second attempt.
    gate.sync(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(gate.status).toBe("ready");
  });

  it("closes on a disconnect and subscribes afresh after the reconnect", async () => {
    const unsubs: ReturnType<typeof vi.fn>[] = [];
    const subscribe = vi.fn(() => {
      const unsub = vi.fn();
      unsubs.push(unsub);
      return Promise.resolve(unsub);
    });
    const gate = new LiveSubscriptionGate(subscribe, () => undefined);
    gate.sync(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.status).toBe("ready");
    gate.sync(false);
    expect(unsubs[0]).toHaveBeenCalledTimes(1);
    expect(gate.status).toBe("idle");
    gate.sync(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(gate.status).toBe("ready");
  });

  it("leaves nothing open after a stop", async () => {
    const unsub = vi.fn();
    const gate = new LiveSubscriptionGate(
      () => Promise.resolve(unsub),
      () => undefined
    );
    gate.sync(true);
    await vi.advanceTimersByTimeAsync(0);
    gate.stop();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
