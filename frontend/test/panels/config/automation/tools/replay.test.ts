import { describe, expect, it } from "vitest";
import {
  durationSeconds,
  entitiesToFetch,
  referencedEntities,
  replayDay,
  replayTriggers,
  stateAt,
  timelinesFrom,
} from "../../../../../src/panels/config/automation/tools/replay";
import type { Timelines } from "../../../../../src/panels/config/automation/tools/replay";

const H = 3600 * 1000;
const start = new Date(2026, 10, 10, 0, 0, 0).getTime();
const window = { start, end: start + 24 * H };

const line = (...points: [number, string][]) =>
  points.map(([hours, state]) => ({ t: start + hours * H, state }));

describe("timelinesFrom", () => {
  it("reads the seconds of the history stream and sorts by time", () => {
    const result = timelinesFrom({
      "light.a": [
        { s: "on", lu: 200 },
        { s: "off", lu: 100 },
      ],
    });
    expect(result["light.a"]).toEqual([
      { t: 100000, state: "off" },
      { t: 200000, state: "on" },
    ]);
  });
});

describe("stateAt", () => {
  const t: Timelines = { "light.a": line([0, "off"], [5, "on"]) };
  it("returns the last state at or before a moment", () => {
    expect(stateAt(t, "light.a", start + 4 * H)).toBe("off");
    expect(stateAt(t, "light.a", start + 5 * H)).toBe("on");
    expect(stateAt(t, "light.a", start - H)).toBeUndefined();
    expect(stateAt(t, "light.b", start)).toBeUndefined();
  });
});

describe("durationSeconds", () => {
  it("reads numbers, clocks and dictionaries", () => {
    expect(durationSeconds(30)).toBe(30);
    expect(durationSeconds("00:10:00")).toBe(600);
    expect(durationSeconds({ minutes: 2, seconds: 5 })).toBe(125);
    expect(durationSeconds("{{ x }}")).toBeUndefined();
  });
});

describe("referencedEntities", () => {
  it("finds entity ids anywhere in the configuration", () => {
    expect(
      referencedEntities({
        triggers: [{ trigger: "state", entity_id: ["a.b", "c.d"] }],
        actions: [
          { action: "x.y", target: { entity_id: "e.f" } },
          { choose: [{ conditions: [{ entity_id: "g.h" }], sequence: [] }] },
        ],
      })
    ).toEqual(["a.b", "c.d", "e.f", "g.h"]);
  });
});

describe("replayTriggers", () => {
  it("fires a state trigger on each matching change", () => {
    const timelines: Timelines = {
      "person.alex": line([0, "away"], [8, "home"], [12, "away"], [18, "home"]),
    };
    const [trigger] = replayTriggers(
      {
        triggers: [{ trigger: "state", entity_id: "person.alex", to: "home" }],
      },
      timelines,
      window
    );
    expect(trigger.status).toBe("replayed");
    expect(trigger.firings).toEqual([start + 8 * H, start + 18 * H]);
  });

  it("ignores attribute-only records and honours from", () => {
    const timelines: Timelines = {
      "light.a": line([0, "off"], [1, "off"], [2, "on"], [3, "off"]),
    };
    const [trigger] = replayTriggers(
      { triggers: [{ trigger: "state", entity_id: "light.a", from: "on" }] },
      timelines,
      window
    );
    expect(trigger.firings).toEqual([start + 3 * H]);
  });

  it("waits for a state to hold for a time and drops it when it changes sooner", () => {
    const timelines: Timelines = {
      "light.a": line([0, "off"], [1, "on"], [1.25, "off"], [4, "on"]),
    };
    const [trigger] = replayTriggers(
      {
        triggers: [
          { trigger: "state", entity_id: "light.a", to: "on", for: "00:30:00" },
        ],
      },
      timelines,
      window
    );
    expect(trigger.firings).toEqual([start + 4.5 * H]);
  });

  it("cannot replay attribute, template and unrecorded triggers", () => {
    const timelines: Timelines = { "light.a": line([0, "on"]) };
    const triggers = replayTriggers(
      {
        triggers: [
          { trigger: "state", entity_id: "light.a", attribute: "brightness" },
          { trigger: "state", entity_id: "light.b" },
          { trigger: "template", value_template: "{{ true }}" },
        ],
      },
      timelines,
      window
    );
    expect(triggers.map((t) => t.status)).toEqual([
      "unsupported",
      "unsupported",
      "unsupported",
    ]);
    expect(triggers[1].reason).toBe("history:light.b");
    expect(triggers[2].reason).toBe("kind:template");
  });

  it("fires a numeric trigger when the value crosses into range", () => {
    const timelines: Timelines = {
      "sensor.t": line(
        [0, "18"],
        [3, "21"],
        [4, "unavailable"],
        [6, "22"],
        [7, "19"],
        [9, "25"]
      ),
    };
    const [trigger] = replayTriggers(
      {
        triggers: [
          { trigger: "numeric_state", entity_id: "sensor.t", above: 20 },
        ],
      },
      timelines,
      window
    );
    expect(trigger.firings).toEqual([
      start + 3 * H,
      start + 6 * H,
      start + 9 * H,
    ]);
  });

  it("fires a time trigger each day it falls in the window and filters weekdays", () => {
    const [daily] = replayTriggers(
      { triggers: [{ trigger: "time", at: ["07:30:00", "23:00"] }] },
      {},
      window
    );
    expect(daily.firings).toEqual([start + 7.5 * H, start + 23 * H]);
    const [weekday] = replayTriggers(
      { triggers: [{ trigger: "time", at: "07:30:00", weekday: ["mon"] }] },
      {},
      window
    );
    // 10 November 2026 is a Tuesday.
    expect(weekday.firings).toEqual([]);
    const [entity] = replayTriggers(
      { triggers: [{ trigger: "time", at: "input_datetime.wake" }] },
      {},
      window
    );
    expect(entity.status).toBe("unsupported");
  });

  it("takes sun events from the sun entity history with an offset", () => {
    const timelines: Timelines = {
      "sun.sun": line(
        [0, "below_horizon"],
        [7, "above_horizon"],
        [17, "below_horizon"]
      ),
    };
    const [set, rise] = replayTriggers(
      {
        triggers: [
          { trigger: "sun", event: "sunset", offset: "-00:30:00" },
          { trigger: "sun", event: "sunrise" },
        ],
      },
      timelines,
      window
    );
    expect(set.firings).toEqual([start + 16.5 * H]);
    expect(rise.firings).toEqual([start + 7 * H]);
  });

  it("skips a switched off trigger and keeps the others' paths", () => {
    const triggers = replayTriggers(
      {
        triggers: [
          { trigger: "time", at: "01:00", enabled: false },
          { trigger: "time", at: "02:00" },
        ],
      },
      {},
      window
    );
    expect(triggers[0].status).toBe("disabled");
    expect(triggers[1].path).toBe("trigger/1");
  });
});

describe("entitiesToFetch", () => {
  it("adds the sun entity for a sun trigger", () => {
    expect(
      entitiesToFetch({ triggers: [{ trigger: "sun", event: "sunset" }] })
    ).toEqual(["sun.sun"]);
  });
});

describe("replayDay", () => {
  const config: any = {
    triggers: [{ trigger: "state", entity_id: "person.alex", to: "home" }],
    conditions: [
      { condition: "state", entity_id: "input_boolean.guest", state: "off" },
    ],
    actions: [
      {
        if: [{ condition: "state", entity_id: "light.hall", state: "off" }],
        then: [
          { action: "light.turn_on", target: { entity_id: "light.hall" } },
        ],
      },
    ],
  };
  const live = (states: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(states).map(([id, state]) => [
        id,
        { entity_id: id, state, attributes: {} },
      ])
    ) as any;
  const hass = {
    states: live({
      "person.alex": "home",
      "input_boolean.guest": "off",
      "light.hall": "on",
    }),
    callWS: async () => {
      throw new Error("not available");
    },
  } as any;

  it("evaluates each firing against the states of that moment", async () => {
    const timelines: Timelines = {
      "person.alex": line([0, "away"], [8, "home"], [18, "away"], [20, "home"]),
      "input_boolean.guest": line([0, "off"], [19, "on"]),
      "light.hall": line([0, "off"]),
    };
    const result = await replayDay(hass, config, timelines, window);
    expect(result.firings.map((f) => [f.time, f.outcome])).toEqual([
      [start + 8 * H, "would_run"],
      [start + 20 * H, "conditions_fail"],
    ]);
    expect(result.firings[0].branches).toEqual(["action/0/then"]);
    expect(result.usedLive).toEqual([]);
  });

  it("names entities without history that were read live", async () => {
    const result = await replayDay(
      hass,
      config,
      { "person.alex": line([0, "away"], [8, "home"]) },
      window
    );
    expect(result.usedLive).toEqual(["input_boolean.guest", "light.hall"]);
  });
});
