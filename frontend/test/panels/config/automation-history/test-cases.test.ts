import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareToExpected,
  simulateRun,
} from "../../../../src/panels/config/automation-history/simulated-run";
import type { TestCase } from "../../../../src/panels/config/automation-history/test-cases";
import {
  buildTestCase,
  duplicateTestCase,
  loadTestCases,
  parseKeyValueLines,
  renameTestCase,
  saveTestCases,
  TEST_CASE_LIMITS,
  testCaseStorageKey,
  validateTestCase,
} from "../../../../src/panels/config/automation-history/test-cases";

// Test cases are stored in the browser and drive a simulation that must never
// call a service. These protect the limits that keep stored cases small, the
// way a broken or blocked store is survived, and the condition logic that the
// pass or fail comparison rests on.

const makeCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  id: "a",
  name: "Evening",
  trigger: { id: "", description: "", variables: {} },
  states: {},
  expected: "pass",
  ...overrides,
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("validateTestCase", () => {
  const draft = { name: "Night", trigger: { variables: {} }, states: {} };

  it("accepts a plain case", () => {
    expect(validateTestCase(draft).ok).toBe(true);
  });

  it("rejects an empty or too long name", () => {
    expect(validateTestCase({ ...draft, name: "  " }).errors).toContain(
      "name_empty"
    );
    expect(
      validateTestCase({
        ...draft,
        name: "x".repeat(TEST_CASE_LIMITS.maxName + 1),
      }).errors
    ).toContain("name_too_long");
  });

  it("rejects a name another case has, but lets a case keep its own", () => {
    const others = [makeCase({ id: "a", name: "Night" })];
    expect(validateTestCase(draft, others).errors).toContain("name_taken");
    expect(validateTestCase(draft, others, "a").ok).toBe(true);
  });

  it("stops at 20 cases", () => {
    const others = Array.from({ length: 20 }, (_v, i) =>
      makeCase({ id: `c${i}`, name: `Case ${i}` })
    );
    expect(validateTestCase(draft, others).errors).toContain("too_many_cases");
    expect(
      validateTestCase({ ...draft, name: "Case 3" }, others, "c3").ok
    ).toBe(true);
  });

  it("caps states and variables in number and size", () => {
    const states: Record<string, string> = {};
    for (let i = 0; i <= TEST_CASE_LIMITS.maxStates; i++) {
      states[`sensor.s${i}`] = "1";
    }
    expect(validateTestCase({ ...draft, states }).errors).toContain(
      "too_many_states"
    );
    expect(
      validateTestCase({
        ...draft,
        states: { "sensor.a": "x".repeat(TEST_CASE_LIMITS.maxValue + 1) },
      }).errors
    ).toContain("state_too_long");
    expect(
      validateTestCase({ ...draft, states: { "not an entity": "1" } }).errors
    ).toContain("entity_id_invalid");
    expect(
      validateTestCase({
        ...draft,
        trigger: { variables: { "bad name": "1" } },
      }).errors
    ).toContain("variable_name_invalid");
    expect(
      validateTestCase({
        ...draft,
        trigger: {
          variables: { a: "x".repeat(TEST_CASE_LIMITS.maxValue + 1) },
        },
      }).errors
    ).toContain("variable_too_long");
  });
});

describe("list operations", () => {
  it("renames with the same checks as creating", () => {
    const cases = [
      makeCase({ id: "a", name: "A" }),
      makeCase({ id: "b", name: "B" }),
    ];
    expect(renameTestCase(cases, "a", "b").errors).toEqual(["name_taken"]);
    expect(renameTestCase(cases, "a", "C").cases[0].name).toBe("C");
  });

  it("duplicates with a free name and refuses past the cap", () => {
    const cases = [makeCase({ id: "a", name: "A" })];
    const once = duplicateTestCase(cases, "a", "copy", "x");
    expect(once.cases.map((item) => item.name)).toEqual(["A", "A copy"]);
    const twice = duplicateTestCase(once.cases, "a", "copy", "y");
    expect(twice.cases[2].name).toBe("A copy 2");
    const full = Array.from({ length: 20 }, (_v, i) =>
      makeCase({ id: `c${i}`, name: `C${i}` })
    );
    expect(duplicateTestCase(full, "c0", "copy").errors).toEqual([
      "too_many_cases",
    ]);
  });

  it("reads name = value lines", () => {
    expect(parseKeyValueLines("a = 1\n\nbad line\nb=two = 2")).toEqual({
      a: "1",
      b: "two = 2",
    });
  });
});

describe("storage", () => {
  it("round trips, per automation", () => {
    const item = buildTestCase(
      { name: "N", trigger: { id: "t" }, states: { "sensor.a": "1" } },
      "id1"
    );
    expect(saveTestCases("auto1", [item])).toBe(true);
    expect(loadTestCases("auto1")).toEqual([item]);
    expect(loadTestCases("auto2")).toEqual([]);
  });

  it("survives a store that refuses to write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveTestCases("auto1", [makeCase()])).toBe(false);
  });

  it("survives a store that refuses to read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadTestCases("auto1")).toEqual([]);
  });

  it("gives an empty list for unreadable or invalid content", () => {
    localStorage.setItem(testCaseStorageKey("auto1"), "{not json");
    expect(loadTestCases("auto1")).toEqual([]);
    localStorage.setItem(testCaseStorageKey("auto1"), '{"a":1}');
    expect(loadTestCases("auto1")).toEqual([]);
  });

  it("leaves out a stored case that breaks the limits", () => {
    localStorage.setItem(
      testCaseStorageKey("auto1"),
      JSON.stringify([
        makeCase({ id: "ok", name: "Fine" }),
        { ...makeCase({ id: "bad" }), name: "" },
        { ...makeCase({ id: "worse", name: "W" }), states: { "no good": "1" } },
      ])
    );
    expect(loadTestCases("auto1").map((item) => item.id)).toEqual(["ok"]);
  });
});

describe("simulateRun", () => {
  const states = (record: Record<string, string>) =>
    makeCase({ states: record });
  const stateCondition = {
    condition: "state",
    entity_id: "light.hall",
    state: "on",
  };
  const numeric = {
    condition: "numeric_state",
    entity_id: "sensor.temp",
    above: 20,
    below: 25,
  };

  it("is always labelled simulated", () => {
    expect(simulateRun({ conditions: [] }, makeCase()).simulated).toBe(true);
  });

  it("evaluates a state condition from the fake states", () => {
    const config = { conditions: [stateCondition] };
    expect(simulateRun(config, states({ "light.hall": "on" })).outcome).toBe(
      "pass"
    );
    expect(simulateRun(config, states({ "light.hall": "off" })).outcome).toBe(
      "fail"
    );
    const missing = simulateRun(config, states({}));
    expect(missing.outcome).toBe("fail");
    expect(missing.trace[0].reason).toBe("no_state");
  });

  it("accepts a list of states and the any match", () => {
    const config = {
      conditions: [
        {
          condition: "state",
          entity_id: ["light.a", "light.b"],
          state: ["on", "heat"],
          match: "any",
        },
      ],
    };
    expect(simulateRun(config, states({ "light.b": "heat" })).outcome).toBe(
      "pass"
    );
    expect(
      simulateRun(
        { conditions: [{ ...config.conditions[0], match: "all" }] },
        states({ "light.b": "heat" })
      ).outcome
    ).toBe("fail");
  });

  it("evaluates numeric_state with strict limits", () => {
    const config = { conditions: [numeric] };
    expect(simulateRun(config, states({ "sensor.temp": "22.5" })).outcome).toBe(
      "pass"
    );
    expect(simulateRun(config, states({ "sensor.temp": "20" })).outcome).toBe(
      "fail"
    );
    expect(simulateRun(config, states({ "sensor.temp": "25" })).outcome).toBe(
      "fail"
    );
    const text = simulateRun(config, states({ "sensor.temp": "warm" }));
    expect(text.outcome).toBe("fail");
    expect(text.trace[0].reason).toBe("not_a_number");
  });

  it("does not guess a limit that names an entity", () => {
    const run = simulateRun(
      {
        conditions: [
          {
            condition: "numeric_state",
            entity_id: "sensor.t",
            above: "sensor.x",
          },
        ],
      },
      states({ "sensor.t": "5" })
    );
    expect(run.outcome).toBe("unknown");
  });

  it("evaluates and, or and not, in every written form", () => {
    const on = states({ "light.hall": "on", "sensor.temp": "30" });
    expect(
      simulateRun(
        {
          conditions: [
            { condition: "and", conditions: [stateCondition, numeric] },
          ],
        },
        on
      ).outcome
    ).toBe("fail");
    expect(
      simulateRun({ conditions: [{ or: [stateCondition, numeric] }] }, on)
        .outcome
    ).toBe("pass");
    expect(
      simulateRun(
        { conditions: [{ condition: "not", conditions: [stateCondition] }] },
        on
      ).outcome
    ).toBe("fail");
    expect(simulateRun({ conditions: [{ not: [numeric] }] }, on).outcome).toBe(
      "pass"
    );
    expect(
      simulateRun(
        { conditions: [{ condition: [stateCondition, numeric] }] },
        on
      ).outcome
    ).toBe("fail");
  });

  it("nests groups and lists them in reading order", () => {
    const run = simulateRun(
      {
        conditions: [
          {
            condition: "or",
            conditions: [
              { condition: "not", conditions: [stateCondition] },
              numeric,
            ],
          },
        ],
      },
      states({ "light.hall": "off" })
    );
    expect(run.outcome).toBe("pass");
    expect(run.trace.map((line) => [line.kind, line.depth])).toEqual([
      ["or", 0],
      ["not", 1],
      ["state", 2],
      ["numeric_state", 1],
    ]);
  });

  it("lets a decided condition win over an undecided one", () => {
    const sun = { condition: "sun", after: "sunset" };
    const on = states({ "light.hall": "on" });
    expect(simulateRun({ conditions: [sun, stateCondition] }, on).outcome).toBe(
      "unknown"
    );
    expect(
      simulateRun(
        { conditions: [sun, { ...stateCondition, state: "off" }] },
        on
      ).outcome
    ).toBe("fail");
    expect(
      simulateRun({ conditions: [{ or: [sun, stateCondition] }] }, on).outcome
    ).toBe("pass");
  });

  it("matches a trigger condition against the fired trigger", () => {
    const config = { conditions: [{ condition: "trigger", id: "motion" }] };
    const fired = makeCase({
      trigger: { id: "motion", description: "", variables: {} },
    });
    expect(simulateRun(config, fired).outcome).toBe("pass");
    expect(simulateRun(config, makeCase()).outcome).toBe("fail");
  });

  it("skips a condition that is turned off", () => {
    expect(
      simulateRun(
        { conditions: [{ ...stateCondition, enabled: false }] },
        states({})
      ).outcome
    ).toBe("pass");
  });

  it("ignores a disabled condition inside or and not, as Home Assistant does", () => {
    const off = states({ "light.hall": "off" });
    const disabled = { ...numeric, enabled: false };
    // or [disabled, state hall = on] with the light off fails, not passes.
    expect(
      simulateRun({ conditions: [{ or: [disabled, stateCondition] }] }, off)
        .outcome
    ).toBe("fail");
    // not [disabled] has nothing left to negate, so it passes.
    expect(
      simulateRun(
        { conditions: [{ condition: "not", conditions: [disabled] }] },
        off
      ).outcome
    ).toBe("pass");
    // and [disabled, state] still depends on the enabled condition alone.
    expect(
      simulateRun({ conditions: [{ and: [disabled, stateCondition] }] }, off)
        .outcome
    ).toBe("fail");
  });

  it("lists actions only when the conditions pass, and calls nothing", () => {
    const config = {
      conditions: [stateCondition],
      actions: [
        { action: "light.turn_off", target: { entity_id: "light.hall" } },
        { alias: "Wait a bit", delay: "00:00:05" },
        { action: "notify.me", enabled: false },
        { choose: [] },
      ],
    };
    const passing = simulateRun(config, states({ "light.hall": "on" }));
    expect(passing.actions).toEqual([
      { kind: "action", label: "light.turn_off" },
      { kind: "delay", label: "Wait a bit" },
      { kind: "choose", label: "" },
    ]);
    expect(
      simulateRun(config, states({ "light.hall": "off" })).actions
    ).toEqual([]);
  });

  it("accepts the older singular keys and no conditions at all", () => {
    expect(
      simulateRun({ condition: stateCondition }, states({ "light.hall": "on" }))
        .outcome
    ).toBe("pass");
    expect(simulateRun({}, makeCase()).outcome).toBe("pass");
  });
});

describe("compareToExpected", () => {
  it("compares the outcome with what was expected", () => {
    expect(compareToExpected({ outcome: "pass" }, "pass")).toBe("match");
    expect(compareToExpected({ outcome: "fail" }, "pass")).toBe("mismatch");
    expect(compareToExpected({ outcome: "fail" }, "fail")).toBe("match");
    expect(compareToExpected({ outcome: "unknown" }, "fail")).toBe("undecided");
  });
});
