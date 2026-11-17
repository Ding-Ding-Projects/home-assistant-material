import { describe, expect, it } from "vitest";
import {
  MAX_FIRINGS,
  periodWindow,
  replayDryRun,
} from "../../../../../src/panels/config/automation/dry-run/dry-run-replay";
import type { Timelines } from "../../../../../src/panels/config/automation/tools/replay";

const H = 3600 * 1000;
const DAY = 24 * H;
const start = new Date(2026, 10, 10, 0, 0, 0).getTime();
const window = { start, end: start + DAY };

const line = (...points: [number, string][]) =>
  points.map(([hours, state]) => ({ t: start + hours * H, state }));

describe("periodWindow", () => {
  const now = start + 10 * DAY;
  it("gives the past day and the past week ending now", () => {
    expect(periodWindow("day", now)).toEqual({
      start: now - DAY,
      end: now,
      clamped: false,
    });
    expect(periodWindow("week", now)?.start).toBe(now - 7 * DAY);
  });
  it("cuts a custom stretch to seven days and never into the future", () => {
    const result = periodWindow("custom", now, {
      start: now - 20 * DAY,
      end: now + 3 * DAY,
    });
    expect(result).toEqual({ start: now - 7 * DAY, end: now, clamped: true });
  });
  it("rejects an empty or reversed stretch", () => {
    expect(
      periodWindow("custom", now, { start: now - DAY, end: now - 2 * DAY })
    ).toBeUndefined();
    expect(periodWindow("custom", now)).toBeUndefined();
  });
});

describe("replayDryRun triggers", () => {
  it("fires a state trigger only after the state held for the wait", () => {
    const timelines: Timelines = {
      "binary_sensor.door": line(
        [0, "off"],
        [2, "on"],
        [2.5, "off"], // only 30 minutes: not enough
        [5, "on"] // stays on until the end of the window
      ),
    };
    const config = {
      triggers: [
        {
          trigger: "state",
          entity_id: "binary_sensor.door",
          to: "on",
          for: "01:00:00",
        },
      ],
      actions: [],
    };
    const result = replayDryRun(config, timelines, window);
    expect(result.firings.map((f) => f.time)).toEqual([start + 6 * H]);
    expect(result.firings[0].because).toEqual({
      entityId: "binary_sensor.door",
      value: "on",
    });
  });

  it("fires a numeric trigger on the crossing and not while it stays above", () => {
    const timelines: Timelines = {
      "sensor.temp": line(
        [0, "18"],
        [3, "22"],
        [4, "25"],
        [6, "19"],
        [8, "23"]
      ),
    };
    const config = {
      triggers: [
        { trigger: "numeric_state", entity_id: "sensor.temp", above: 21 },
      ],
      actions: [],
    };
    const result = replayDryRun(config, timelines, window);
    expect(result.firings.map((f) => f.time)).toEqual([
      start + 3 * H,
      start + 8 * H,
    ]);
  });

  it("fires a time trigger once on each day the stretch covers", () => {
    const config = {
      triggers: [{ trigger: "time", at: "23:30:00" }],
      actions: [],
    };
    const twoDays = { start: start + 12 * H, end: start + 2 * DAY };
    const result = replayDryRun(config, {}, twoDays);
    expect(result.firings.map((f) => f.time)).toEqual([
      start + 23.5 * H,
      start + DAY + 23.5 * H,
    ]);
  });

  it("fires a time pattern trigger on every matching minute", () => {
    const config = {
      triggers: [{ trigger: "time_pattern", hours: "2", minutes: "/30" }],
      actions: [],
    };
    const result = replayDryRun(config, {}, window);
    expect(result.firings.map((f) => f.time)).toEqual([
      start + 2 * H,
      start + 2.5 * H,
    ]);
  });

  it("marks an event trigger as unsupported and lists no firing", () => {
    const config = {
      triggers: [{ trigger: "event", event_type: "x" }],
      actions: [],
    };
    const result = replayDryRun(config, {}, window);
    expect(result.firings).toEqual([]);
    expect(result.triggers[0].status).toBe("unsupported");
  });
});

describe("replayDryRun conditions", () => {
  const timelines: Timelines = {
    "binary_sensor.motion": line([0, "off"], [10, "on"], [12, "off"]),
    "sensor.people": line([0, "0"], [11, "2"]),
  };
  const config = {
    triggers: [
      { trigger: "state", entity_id: "binary_sensor.motion", to: "on" },
      { trigger: "state", entity_id: "binary_sensor.motion", to: "off" },
    ],
    conditions: [
      { condition: "numeric_state", entity_id: "sensor.people", above: 0 },
    ],
    actions: [{ action: "light.turn_on", target: { entity_id: "light.a" } }],
  };

  it("stops a run at the condition and names the value that was seen", () => {
    const result = replayDryRun(config, timelines, window);
    const stopped = result.firings.find((f) => f.time === start + 10 * H)!;
    expect(stopped.outcome).toBe("stopped");
    expect(stopped.stoppedBy).toMatchObject({
      path: "0",
      type: "numeric_state",
      seen: { entityId: "sensor.people", value: "0" },
    });
    const ran = result.firings.find((f) => f.time === start + 12 * H)!;
    expect(ran.outcome).toBe("would_run");
    expect(result.counts).toEqual({ would_run: 1, stopped: 1, cannot_tell: 0 });
  });

  it("names the passing child that stops a not condition", () => {
    const result = replayDryRun(
      {
        ...config,
        conditions: [
          {
            condition: "not",
            conditions: [
              { condition: "state", entity_id: "sensor.people", state: "2" },
            ],
          },
        ],
      },
      timelines,
      window
    );
    const stopped = result.firings.find((f) => f.time === start + 12 * H)!;
    expect(stopped.outcome).toBe("stopped");
    expect(stopped.stoppedBy?.seen?.value).toBe("2");
  });

  it("decides a time condition that wraps midnight", () => {
    const result = replayDryRun(
      {
        triggers: [
          { trigger: "time", at: "01:00:00" },
          { trigger: "time", at: "12:00:00" },
        ],
        conditions: [
          { condition: "time", after: "22:00:00", before: "06:00:00" },
        ],
        actions: [],
      },
      {},
      window
    );
    expect(result.firings.map((f) => f.outcome)).toEqual([
      "would_run",
      "stopped",
    ]);
  });

  it("propagates cannot tell from an unreadable condition", () => {
    const result = replayDryRun(
      {
        ...config,
        conditions: [
          { condition: "template", value_template: "{{ true }}" },
          { condition: "numeric_state", entity_id: "sensor.people", above: 0 },
        ],
      },
      timelines,
      window
    );
    // The first firing fails the numeric condition: a known fail wins.
    expect(result.firings[0].outcome).toBe("stopped");
    // The second passes the numeric one, so only the template stays unknown.
    expect(result.firings[1].outcome).toBe("cannot_tell");
    expect(result.firings[1].unknownAt).toMatchObject({
      type: "template",
      reason: "kind:template",
    });
  });

  it("says cannot tell, not stopped, when the entity has no history", () => {
    const result = replayDryRun(
      {
        triggers: [{ trigger: "time", at: "08:00:00" }],
        conditions: [
          { condition: "state", entity_id: "person.x", state: "home" },
        ],
        actions: [],
      },
      {},
      window
    );
    expect(result.firings[0].outcome).toBe("cannot_tell");
    expect(result.firings[0].unknownAt?.reason).toBe("history:person.x");
  });
});

describe("replayDryRun cap", () => {
  it("lists at most the cap and reports the total found", () => {
    const config = {
      triggers: [{ trigger: "time_pattern", minutes: "/1", seconds: "0" }],
      actions: [],
    };
    const result = replayDryRun(config, {}, window);
    expect(result.firings).toHaveLength(MAX_FIRINGS);
    expect(result.total).toBe(1441);
    expect(result.truncated).toBe(true);
  });
});
