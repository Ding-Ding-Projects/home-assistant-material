import { describe, expect, it } from "vitest";
import {
  chipCounts,
  matchesChip,
  minutesLeft,
  sendReadiness,
  shortAddress,
} from "../../../../src/panels/config/problem-log/problem-log-send-logic";

// These protect the two places where the page decides on its own: the chip
// counts, and whether the send button is disabled with the next allowed time.
// If they drift from the backend's rule, the page invites a send that will be
// refused, or hides one that is allowed.

const counts = (notSent: number) => ({
  all: 3,
  sent: 3 - notSent,
  not_sent: notSent,
  held: 0,
});

describe("chip counts", () => {
  it("counts each state and treats unknown problems as not sent", () => {
    const files = ["a.md", "b.md", "c.md", "d.md"];
    const statuses = {
      "a.md": "sent",
      "b.md": "held",
      "c.md": "not_sent",
    } as const;
    expect(chipCounts(files, statuses)).toEqual({
      all: 4,
      not_sent: 2,
      held: 1,
    });
    expect(matchesChip("d.md", statuses, "not_sent")).toBe(true);
    expect(matchesChip("b.md", statuses, "not_sent")).toBe(false);
    expect(matchesChip("b.md", statuses, "held")).toBe(true);
    expect(matchesChip("a.md", statuses, "all")).toBe(true);
  });
});

describe("send readiness", () => {
  const now = new Date("2026-11-18T19:00:00Z");

  it("is off until turned on", () => {
    expect(
      sendReadiness(
        { enabled: false, next_allowed: null, counts: counts(2) },
        now
      )
    ).toEqual({ kind: "off" });
  });

  it("has nothing to do when every problem was sent", () => {
    expect(
      sendReadiness(
        { enabled: true, next_allowed: null, counts: counts(0) },
        now
      ).kind
    ).toBe("nothing_new");
  });

  it("waits for the next allowed time within the hour", () => {
    const result = sendReadiness(
      {
        enabled: true,
        next_allowed: "2026-11-18T19:41:00Z",
        counts: counts(3),
      },
      now
    );
    expect(result).toEqual({
      kind: "wait",
      count: 3,
      at: new Date("2026-11-18T19:41:00Z"),
    });
  });

  it("is ready once the hour has passed", () => {
    expect(
      sendReadiness(
        {
          enabled: true,
          next_allowed: "2026-11-18T18:59:59Z",
          counts: counts(1),
        },
        now
      )
    ).toEqual({ kind: "ready", count: 1 });
  });
});

describe("sign-in code", () => {
  it("rounds the minutes left up and never goes below zero", () => {
    const now = new Date("2026-11-18T19:00:00Z");
    expect(minutesLeft("2026-11-18T19:13:01Z", now)).toBe(14);
    expect(minutesLeft("2026-11-18T18:00:00Z", now)).toBe(0);
    expect(minutesLeft(null, now)).toBe(0);
  });

  it("shortens the device page address", () => {
    expect(shortAddress("https://github.com/login/device")).toBe(
      "github.com/login/device"
    );
  });
});
