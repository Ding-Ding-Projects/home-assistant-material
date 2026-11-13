import { describe, expect, it } from "vitest";
import {
  buildPathIndex,
  computeCoverage,
  evaluateTestCase,
  exportCases,
  judgeCase,
  parseStoredCases,
  summarizeCoverage,
} from "../../../../../src/panels/config/automation/tools/test-cases";
import type { TestCase } from "../../../../../src/panels/config/automation/tools/test-cases";

const config: any = {
  triggers: [{ trigger: "state", entity_id: "person.alex", to: "home" }],
  conditions: [
    { condition: "state", entity_id: "input_boolean.on", state: "on" },
  ],
  actions: [
    {
      choose: [
        {
          conditions: [
            { condition: "state", entity_id: "zone.home", state: "1" },
          ],
          sequence: [
            { action: "light.turn_on", target: { entity_id: "light.hall" } },
          ],
        },
      ],
      default: [
        { action: "light.turn_off", target: { entity_id: "light.hall" } },
      ],
    },
    { action: "notify.alex" },
  ],
};

const states = (home: string, enabled = "on") =>
  ({
    "input_boolean.on": {
      entity_id: "input_boolean.on",
      state: enabled,
      attributes: {},
    },
    "zone.home": { entity_id: "zone.home", state: home, attributes: {} },
    "light.hall": { entity_id: "light.hall", state: "off", attributes: {} },
  }) as any;

const hassFor = (home: string, enabled = "on") =>
  ({
    states: states(home, enabled),
    callWS: async () => {
      throw new Error("not available");
    },
  }) as any;

const makeCase = (over: Partial<TestCase> = {}): TestCase => ({
  id: "c1",
  name: "case",
  situation: { time: "12:00", overrides: [] },
  expectRun: [],
  expectSkip: [],
  ...over,
});

describe("buildPathIndex", () => {
  it("lists conditions, branches and steps of the flow graph", () => {
    const index = buildPathIndex(config);
    expect(index.topConditions).toBe(1);
    expect(index.items.map((i) => `${i.kind}:${i.path}`)).toEqual([
      "condition_pass:condition/0",
      "condition_fail:condition/0",
      "step:action/0",
      "branch:action/0/choose/0",
      "step:action/0/choose/0/sequence/0",
      "branch:action/0/default",
      "step:action/0/default/0",
      "step:action/1",
    ]);
    expect(index.items.find((i) => i.path === "action/0/default")?.parent).toBe(
      "action/0"
    );
  });
});

describe("judgeCase", () => {
  const paths = new Set(["action/0", "action/1"]);

  it("passes when every expectation is decided and met", () => {
    const result = judgeCase(
      makeCase({ expectRun: ["action/0"], expectSkip: ["action/1"] }),
      paths,
      {
        "action/0": { verdict: "would_run" },
        "action/1": { verdict: "would_skip" },
      }
    );
    expect(result.status).toBe("passed");
  });

  it("fails on a definite mismatch and on a path that no longer exists", () => {
    const wrong = judgeCase(makeCase({ expectRun: ["action/1"] }), paths, {
      "action/1": { verdict: "would_skip" },
    });
    expect(wrong.status).toBe("failed");
    expect(wrong.mismatches).toEqual([
      { path: "action/1", expected: "run", actual: "would_skip" },
    ]);
    const gone = judgeCase(makeCase({ expectRun: ["action/9"] }), paths, {});
    expect(gone.mismatches[0].actual).toBe("missing");
  });

  it("cannot tell when a simulation cannot decide, or nothing is expected", () => {
    const unknown = judgeCase(makeCase({ expectRun: ["action/0"] }), paths, {
      "action/0": { verdict: "cannot_tell" },
    });
    expect(unknown.status).toBe("cannot_tell");
    expect(judgeCase(makeCase(), paths, {}).status).toBe("cannot_tell");
  });
});

describe("evaluateTestCase", () => {
  const index = buildPathIndex(config);

  it("matches dry run steps to paths and passes a met expectation", async () => {
    const result = await evaluateTestCase(
      hassFor("1"),
      config,
      index,
      makeCase({
        expectRun: ["action/0/choose/0", "action/0/choose/0/sequence/0"],
        expectSkip: ["action/0/default", "action/0/default/0"],
      })
    );
    expect(result.mismatches).toEqual([]);
    expect(result.status).toBe("passed");
    expect(result.outcomes["action/1"].verdict).toBe("would_run");
  });

  it("takes the default when the option fails", async () => {
    const result = await evaluateTestCase(
      hassFor("0"),
      config,
      index,
      makeCase({
        expectRun: ["action/0/default"],
        expectSkip: ["action/0/choose/0"],
      })
    );
    expect(result.status).toBe("passed");
  });

  it("marks the top level condition by its path, passing or failing", async () => {
    const off = await evaluateTestCase(
      hassFor("1", "off"),
      config,
      index,
      makeCase({ expectSkip: ["condition/0", "action/1"] })
    );
    expect(off.status).toBe("passed");
    expect(off.outcomes["condition/0"]).toEqual({
      verdict: "would_skip",
      reason: "conditions_fail",
    });
  });

  it("applies the situation's state overrides", async () => {
    const result = await evaluateTestCase(
      hassFor("0"),
      config,
      index,
      makeCase({
        situation: {
          time: "12:00",
          overrides: [{ entityId: "zone.home", state: "1" }],
        },
        expectRun: ["action/0/choose/0"],
      })
    );
    expect(result.status).toBe("passed");
  });
});

describe("computeCoverage", () => {
  const index = buildPathIndex(config);

  it("covers what a passing case reaches and leaves the rest untested", async () => {
    const pass = await evaluateTestCase(
      hassFor("1"),
      config,
      index,
      makeCase({ expectRun: ["action/0/choose/0"] })
    );
    const rows = computeCoverage(index.items, [pass]);
    const state = (kind: string, path: string) =>
      rows.find((r) => r.kind === kind && r.path === path)?.state;
    expect(state("condition_pass", "condition/0")).toBe("covered");
    expect(state("condition_fail", "condition/0")).toBe("untested");
    expect(state("branch", "action/0/choose/0")).toBe("covered");
    expect(state("branch", "action/0/default")).toBe("untested");
    const summary = summarizeCoverage(rows);
    expect(summary.branches).toBe(4);
    expect(summary.branchesCovered).toBe(2);
    expect(summary.steps).toBe(4);
  });

  it("never counts a failing case as coverage", async () => {
    const fail = await evaluateTestCase(
      hassFor("1"),
      config,
      index,
      makeCase({ expectRun: ["action/0/default"] })
    );
    expect(fail.status).toBe("failed");
    const rows = computeCoverage(index.items, [fail]);
    expect(rows.every((r) => r.state !== "covered")).toBe(true);
  });

  it("reports cannot tell when only an undecidable case reaches a step", () => {
    const rows = computeCoverage(
      [{ path: "action/0", kind: "step" }],
      [
        {
          status: "cannot_tell",
          mismatches: [],
          outcomes: { "action/0": { verdict: "cannot_tell" } },
        },
      ]
    );
    expect(rows[0].state).toBe("cannot_tell");
  });
});

describe("stored cases", () => {
  it("round trips and drops entries that do not fit", () => {
    const good = makeCase({
      situation: {
        time: "20:00",
        weekday: 3,
        overrides: [{ entityId: "a.b", state: "on" }],
      },
      expectRun: ["action/0"],
    });
    const parsed = parseStoredCases([
      good,
      { id: 1 },
      "x",
      { ...good, id: "c2", situation: { time: 5 } },
    ]);
    expect(parsed).toEqual([good]);
    expect(parseStoredCases(undefined)).toEqual([]);
    expect(JSON.parse(exportCases("Arrive", [good]))).toEqual({
      version: 1,
      automation: "Arrive",
      cases: [good],
    });
  });
});

describe("simulated trigger persistence", () => {
  it("preserves trigger IDs in imported test situations and ignores invalid values", () => {
    const saved = {
      id: "arrival",
      name: "Arrival branch",
      situation: { time: "18:00", overrides: [], triggerId: "arrived" },
      expectRun: [],
      expectSkip: [],
    };
    expect(parseStoredCases([saved])[0].situation.triggerId).toBe("arrived");
    expect(
      parseStoredCases([
        { ...saved, situation: { ...saved.situation, triggerId: 3 } },
      ])[0].situation.triggerId
    ).toBeUndefined();
  });
});

describe("isolated situation persistence", () => {
  it("retains explicit isolation and preserves defaults for older cases", () => {
    const saved = {
      id: "isolated",
      name: "Only supplied states",
      situation: { time: "18:00", overrides: [], useLiveStates: false },
      expectRun: [],
      expectSkip: [],
    };
    expect(parseStoredCases([saved])[0].situation.useLiveStates).toBe(false);
    const older = { ...saved, situation: { time: "18:00", overrides: [] } };
    expect(
      parseStoredCases([older])[0].situation.useLiveStates
    ).toBeUndefined();
  });
});
