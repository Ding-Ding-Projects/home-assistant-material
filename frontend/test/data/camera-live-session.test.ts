import { describe, expect, it, vi } from "vitest";
import {
  CameraLiveRegistry,
  computeLiveView,
  formatCountdown,
  isRateLimitMessage,
  mayStartLive,
  rateLimitWaitSeconds,
  type LiveListener,
} from "../../src/data/camera-live-session";

const NEST_TEXT =
  "Failed to start the WebRTC stream: Nest API error: Too Many Requests response from API (429): RESOURCE_EXHAUSTED (429): Rate limited for the ExecuteDeviceCommand API for the user.";

const listener = (): LiveListener => ({
  onStream: vi.fn(),
  onPromote: vi.fn(),
  onError: vi.fn(),
  onLimit: vi.fn(),
});

describe("isRateLimitMessage", () => {
  it.each([
    [NEST_TEXT, true],
    ["HTTP 429", true],
    ["RESOURCE_EXHAUSTED", true],
    ["rate limited", true],
    ["Rate-limit reached", true],
    ["quota exceeded", true],
    ["The camera is offline", false],
    ["WebRTC is not supported in this browser.", false],
    ["", false],
    [undefined, false],
  ])("%s", (text, expected) => {
    expect(isRateLimitMessage(text)).toBe(expected);
  });
});

describe("waits", () => {
  it("each wait is longer than the last, up to a cap", () => {
    expect([1, 2, 3, 4, 9].map(rateLimitWaitSeconds)).toEqual([
      60, 120, 300, 300, 300,
    ]);
  });

  it("formats a countdown as minutes and seconds", () => {
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(125.2)).toBe("2:06");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("computeLiveView", () => {
  const base = { playing: false, limitedSeconds: 0, waitingForTap: false };

  it("playing video wins over everything", () => {
    expect(
      computeLiveView({
        ...base,
        playing: true,
        error: "x",
        limitedSeconds: 30,
      })
    ).toBe("live");
  });

  it("a wait after a refusal is shown as limited", () => {
    expect(computeLiveView({ ...base, limitedSeconds: 42 })).toBe("limited");
  });

  it("a refusal text is limited even before a wait is recorded", () => {
    expect(computeLiveView({ ...base, error: NEST_TEXT })).toBe("limited");
  });

  it("another error is an error", () => {
    expect(computeLiveView({ ...base, error: "Could not connect" })).toBe(
      "error"
    );
  });

  it("an unavailable camera is offline, otherwise starting", () => {
    expect(computeLiveView({ ...base, entityState: "unavailable" })).toBe(
      "offline"
    );
    expect(computeLiveView({ ...base, entityState: "idle" })).toBe("starting");
  });

  it("a provider-only camera waits for a tap", () => {
    expect(computeLiveView({ ...base, waitingForTap: true })).toBe(
      "placeholder"
    );
  });
});

describe("mayStartLive", () => {
  it("needs the camera on screen, no wait and no pending tap", () => {
    const ok = { visible: true, limitedSeconds: 0, waitingForTap: false };
    expect(mayStartLive(ok)).toBe(true);
    expect(mayStartLive({ ...ok, visible: false })).toBe(false);
    expect(mayStartLive({ ...ok, limitedSeconds: 5 })).toBe(false);
    expect(mayStartLive({ ...ok, waitingForTap: true })).toBe(false);
  });
});

describe("CameraLiveRegistry", () => {
  it("shares one session: the first holds it, others show its stream", () => {
    const registry = new CameraLiveRegistry();
    const a = listener();
    const b = listener();
    expect(registry.join("camera.door", "a", a)).toBe("owner");
    const stream = {} as MediaStream;
    registry.publish("camera.door", "a", stream);
    expect(registry.join("camera.door", "b", b)).toBe("viewer");
    expect(b.onStream).toHaveBeenCalledWith(stream);
    expect(registry.viewerCount("camera.door")).toBe(2);
  });

  it("a viewer cannot publish", () => {
    const registry = new CameraLiveRegistry();
    const a = listener();
    const b = listener();
    registry.join("camera.door", "a", a);
    registry.join("camera.door", "b", b);
    registry.publish("camera.door", "b", {} as MediaStream);
    expect(a.onStream).not.toHaveBeenCalled();
  });

  it("when the holder leaves, exactly one viewer takes over", () => {
    const registry = new CameraLiveRegistry();
    const a = listener();
    const b = listener();
    const c = listener();
    registry.join("camera.door", "a", a);
    registry.join("camera.door", "b", b);
    registry.join("camera.door", "c", c);
    registry.leave("camera.door", "a");
    expect(b.onPromote).toHaveBeenCalledTimes(1);
    expect(c.onPromote).not.toHaveBeenCalled();
    expect(registry.role("camera.door", "b")).toBe("owner");
    expect(registry.role("camera.door", "c")).toBe("viewer");
  });

  it("a failure of the holder reaches the viewers without a new start", () => {
    const registry = new CameraLiveRegistry();
    const a = listener();
    const b = listener();
    registry.join("camera.door", "a", a);
    registry.join("camera.door", "b", b);
    registry.fail("camera.door", "a", NEST_TEXT);
    expect(b.onError).toHaveBeenCalledWith(NEST_TEXT);
    expect(b.onPromote).not.toHaveBeenCalled();
  });

  it("forgets a camera when the last viewer leaves", () => {
    const registry = new CameraLiveRegistry();
    registry.join("camera.door", "a", listener());
    registry.leave("camera.door", "a");
    expect(registry.viewerCount("camera.door")).toBe(0);
  });

  it("remembers growing waits per camera and clears them on success", () => {
    const registry = new CameraLiveRegistry();
    const a = listener();
    registry.join("camera.door", "a", a);
    const t0 = 1_000_000;
    expect(registry.recordRateLimit("camera.door", t0)).toBe(60);
    expect(registry.limitedSeconds("camera.door", t0 + 18_000)).toBe(42);
    expect(registry.limitedSeconds("camera.door", t0 + 61_000)).toBe(0);
    expect(registry.recordRateLimit("camera.door", t0 + 61_000)).toBe(120);
    expect(registry.recordRateLimit("camera.door", t0 + 200_000)).toBe(300);
    expect(registry.recordRateLimit("camera.door", t0 + 600_000)).toBe(300);
    expect(registry.limitedSeconds("camera.other", t0)).toBe(0);
    expect(a.onLimit).toHaveBeenCalled();
    registry.recordSuccess("camera.door");
    expect(registry.refusals("camera.door")).toBe(0);
    expect(registry.recordRateLimit("camera.door", t0)).toBe(60);
  });

  it("Try now ends the wait but the next refusal waits longer", () => {
    const registry = new CameraLiveRegistry();
    const t0 = 5_000;
    registry.recordRateLimit("camera.door", t0);
    registry.skipWait("camera.door");
    expect(registry.limitedSeconds("camera.door", t0 + 1000)).toBe(0);
    expect(registry.recordRateLimit("camera.door", t0 + 2000)).toBe(120);
  });

  it("keeps the waits for the browser session and ignores broken storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
    const first = new CameraLiveRegistry(storage);
    first.recordRateLimit("camera.door", Date.now());
    const second = new CameraLiveRegistry(storage);
    expect(second.refusals("camera.door")).toBe(1);

    data.set("camera-live-limits", "{not json");
    expect(new CameraLiveRegistry(storage).refusals("camera.door")).toBe(0);
  });
});
