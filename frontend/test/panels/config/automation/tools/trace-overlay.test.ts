import { describe, expect, it } from "vitest";
import {
  buildTraceRows,
  formatDuration,
} from "../../../../../src/panels/config/automation/tools/trace-overlay";

const trace: any = {
  timestamp: {
    start: "2026-01-01T18:42:00.000Z",
    finish: "2026-01-01T18:42:01.300Z",
  },
  config: {
    triggers: [
      { trigger: "state", entity_id: "person.alex", alias: "Alex arrives" },
    ],
    conditions: [],
    actions: [
      {
        choose: [{ conditions: [], sequence: [{ action: "light.turn_on" }] }],
      },
    ],
  },
  trace: {
    "action/0": [
      {
        path: "action/0",
        timestamp: "2026-01-01T18:42:00.012Z",
        result: { choice: 0 },
      },
    ],
    "trigger/0": [
      {
        path: "trigger/0",
        timestamp: "2026-01-01T18:42:00.000Z",
        changed_variables: { trigger: { description: "state of person.alex" } },
      },
    ],
    "action/0/choose/0/sequence/0": [
      {
        path: "action/0/choose/0/sequence/0",
        timestamp: "2026-01-01T18:42:00.390Z",
        result: { params: { entity_id: "light.hall" } },
        error: "boom",
      },
    ],
  },
};

describe("buildTraceRows", () => {
  const rows = buildTraceRows(trace);

  it("orders the steps by time and measures each one up to the next", () => {
    expect(rows.map((r) => r.path)).toEqual([
      "trigger/0",
      "action/0",
      "action/0/choose/0/sequence/0",
    ]);
    expect(rows.map((r) => r.durationMs)).toEqual([12, 378, 910]);
  });

  it("names steps from the configuration the run used", () => {
    expect(rows[0].title).toBe("Alex arrives");
    expect(rows[2].title).toBe("light.turn_on");
    expect(rows[2].kind).toBe("service");
  });

  it("keeps what each step recorded", () => {
    expect(rows[0].facts).toEqual([
      {
        key: "trigger_description",
        values: { description: "state of person.alex" },
      },
    ]);
    expect(rows[1].facts).toEqual([{ key: "choice", values: { choice: "0" } }]);
    expect(rows[2].error).toBe("boom");
  });

  it("formats durations", () => {
    expect(formatDuration(12)).toBe("12 ms");
    expect(formatDuration(1300)).toBe("1.30 s");
  });
});
