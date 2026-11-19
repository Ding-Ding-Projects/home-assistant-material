import { describe, expect, it } from "vitest";
import {
  keptFor,
  RATE_LIMITED_MESSAGE,
  toOfferEvent,
  waitsForTap,
  type WatchedRow,
} from "../../src/data/camera_watched";
import { isRateLimitMessage } from "../../src/data/camera-live-session";
import {
  clockTime,
  filterWatched,
  lengthText,
} from "../../src/components/ha-camera-watched-rows";

const row = (kind: WatchedRow["kind"], start: number): WatchedRow => ({
  start,
  kind,
  state: "saved",
  origin: "person",
  reason: null,
  name: null,
  duration: 72,
  size: 0,
  points_at: null,
  entry_id: "e",
});

describe("starting live video", () => {
  it("waits for a tap only when the camera's switch is off", () => {
    expect(waitsForTap(true, undefined)).toBe(false);
    expect(waitsForTap(true, { auto_start: true })).toBe(false);
    expect(waitsForTap(true, { auto_start: false })).toBe(true);
    expect(waitsForTap(false, { auto_start: false })).toBe(false);
  });
});

describe("watch events", () => {
  it("passes answers and candidates through in the player's shape", () => {
    expect(toOfferEvent({ type: "answer", answer: "v=0" })).toEqual({
      type: "answer",
      answer: "v=0",
    });
    expect(
      toOfferEvent({ type: "candidate", candidate: { candidate: "c" } })
    ).toEqual({ type: "candidate", candidate: { candidate: "c" } });
    expect(toOfferEvent({ type: "ended" })).toBeUndefined();
  });

  it("turns a refusal into words the player waits on", () => {
    const event = toOfferEvent({
      type: "error",
      code: "rate_limited",
      retry_after: 60,
    });
    expect(event).toEqual({
      type: "error",
      code: "rate_limited",
      message: RATE_LIMITED_MESSAGE,
    });
    expect(isRateLimitMessage(RATE_LIMITED_MESSAGE)).toBe(true);
    expect(
      isRateLimitMessage(
        (toOfferEvent({ type: "error", code: "failed" }) as { message: string })
          .message
      )
    ).toBe(false);
  });
});

describe("kept rows", () => {
  it("shows how long it has been kept", () => {
    expect(keptFor(1000, 1024_000)).toBe("0:24");
    expect(keptFor(0, 3_725_000)).toBe("1:02:05");
  });

  it("filters live views and snapshots, and leaves events to the timeline", () => {
    const rows = [row("live_view", 1), row("snapshot", 2)];
    expect(filterWatched(rows, "all")).toHaveLength(2);
    expect(filterWatched(rows, "snapshot").map((r) => r.kind)).toEqual([
      "snapshot",
    ]);
    expect(filterWatched(rows, "events")).toEqual([]);
    expect(lengthText(72)).toBe("1:12");
    expect(clockTime(0)).toMatch(/^\d\d:\d\d$/);
  });
});
