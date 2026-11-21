import { describe, expect, it } from "vitest";
import { stepEndedAt } from "../../../../src/panels/config/core/updates/update-queue";

// Protects the time shown beside a finished step of "Update everything". When
// the step finished while the tab was on another page, the time it was seen
// on return counted the minutes away ("Done 1:00" for a few seconds of work).

const START = Date.parse("2026-11-21T10:00:00Z");
const NOW = START + 60_000;

const at = (seconds: number) => new Date(START + seconds * 1000).toISOString();

describe("stepEndedAt", () => {
  it("uses the moment it was seen while the page watched", () => {
    expect(stepEndedAt({ startedAt: START }, undefined, NOW, true)).toBe(NOW);
  });

  it("uses the update's own change after the page was away", () => {
    expect(
      stepEndedAt(
        { startedAt: START },
        { last_changed: at(6), last_updated: at(40) },
        NOW,
        false
      )
    ).toBe(START + 6000);
  });

  it("falls back to the last update when the state did not change in the step", () => {
    expect(
      stepEndedAt(
        { startedAt: START },
        { last_changed: at(-300), last_updated: at(8) },
        NOW,
        false
      )
    ).toBe(START + 8000);
  });

  it("leaves the end unknown when nothing fits", () => {
    expect(
      stepEndedAt(
        { startedAt: START },
        { last_changed: at(-300), last_updated: at(-200) },
        NOW,
        false
      )
    ).toBeNull();
    expect(stepEndedAt({ startedAt: START }, undefined, NOW, false)).toBeNull();
    expect(stepEndedAt({ startedAt: null }, undefined, NOW, false)).toBeNull();
  });
});
