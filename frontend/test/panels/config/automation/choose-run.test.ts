import { describe, expect, it, vi } from "vitest";
import {
  areTestResultsCurrent,
  getChooseOutcome,
  getConditionsKey,
  getTestableConditions,
  getUnreachableOptions,
  runActions,
} from "../../../../src/panels/config/automation/option/choose-run";

const pass = { status: "pass" } as const;
const fail = { status: "fail" } as const;
const broken = { status: "error", message: "x" } as const;

describe("getChooseOutcome", () => {
  it("picks the first option that passes, not a later one", () => {
    expect(getChooseOutcome([fail, pass, pass], true)).toEqual({
      kind: "option",
      index: 1,
    });
  });

  it("falls back to the default actions when nothing passes", () => {
    expect(getChooseOutcome([fail, fail], true)).toEqual({ kind: "default" });
  });

  it("runs nothing when nothing passes and there is no default", () => {
    expect(getChooseOutcome([fail], false)).toEqual({ kind: "none" });
    expect(getChooseOutcome([], false)).toEqual({ kind: "none" });
  });

  it("is unknown once an option before the first pass cannot be tested", () => {
    expect(getChooseOutcome([fail, broken, pass], true)).toEqual({
      kind: "unknown",
      index: 1,
    });
  });

  it("ignores an untestable option after the winner", () => {
    expect(getChooseOutcome([pass, broken], false)).toEqual({
      kind: "option",
      index: 0,
    });
  });
});

describe("getTestableConditions", () => {
  it("a disabled condition is left out and templates are kept", () => {
    expect(
      getTestableConditions({
        conditions: [
          { condition: "sun", enabled: false },
          { condition: "time", enabled: true },
          "{{ true }}",
        ] as any,
        sequence: [],
      })
    ).toEqual([{ condition: "time" }, "{{ true }}"]);
  });

  it("leaves out disabled conditions nested in and, or and not", () => {
    expect(
      getTestableConditions({
        conditions: [
          {
            condition: "or",
            conditions: [
              { condition: "sun", enabled: false },
              {
                condition: "not",
                conditions: [
                  { condition: "time", enabled: false },
                  { condition: "zone", entity_id: "a", zone: "b" },
                ],
              },
            ],
          },
        ] as any,
        sequence: [],
      })
    ).toEqual([
      {
        condition: "or",
        conditions: [
          {
            condition: "not",
            conditions: [{ condition: "zone", entity_id: "a", zone: "b" }],
          },
        ],
      },
    ]);
  });

  it("is empty when every condition is disabled", () => {
    expect(
      getTestableConditions({
        conditions: [{ condition: "sun", enabled: false }] as any,
        sequence: [],
      })
    ).toEqual([]);
  });

  it("treats a missing conditions list as empty", () => {
    expect(getTestableConditions({ sequence: [] } as any)).toEqual([]);
  });
});

const opt = (conditions: any[], sequence: any[] = []) =>
  ({ conditions, sequence }) as any;

describe("areTestResultsCurrent", () => {
  const options = [
    opt([{ condition: "sun" }]),
    opt([{ condition: "state", entity_id: "light.a", state: "on" }]),
  ];
  const keys = options.map(getConditionsKey);

  it("is current for unchanged conditions", () => {
    expect(areTestResultsCurrent(keys, options)).toBe(true);
  });

  it("ignores edits to the actions, which do not change a test", () => {
    const edited = [{ ...options[0], sequence: [{ delay: 1 }] }, options[1]];
    expect(areTestResultsCurrent(keys, edited)).toBe(true);
  });

  it("goes stale when a condition is edited", () => {
    const edited = [
      options[0],
      opt([{ condition: "state", entity_id: "light.a", state: "off" }]),
    ];
    expect(areTestResultsCurrent(keys, edited)).toBe(false);
  });

  it("goes stale when options are added, removed or reordered", () => {
    expect(areTestResultsCurrent(keys, [options[0]])).toBe(false);
    expect(areTestResultsCurrent(keys, [...options].reverse())).toBe(false);
  });

  it("goes stale when a condition is disabled, as that changes the test", () => {
    const toggled = [opt([{ condition: "sun", enabled: false }]), options[1]];
    expect(areTestResultsCurrent(keys, toggled)).toBe(false);
  });
});

describe("getUnreachableOptions", () => {
  it("flags every option after one without conditions", () => {
    const result = getUnreachableOptions([
      opt([{ condition: "sun" }]),
      opt([]),
      opt([{ condition: "time" }]),
      opt([]),
    ]);
    expect([...result.entries()]).toEqual([
      [2, { kind: "after_unconditional", by: 1 }],
      [3, { kind: "after_unconditional", by: 1 }],
    ]);
  });

  it("treats a list of only disabled conditions as always passing", () => {
    const result = getUnreachableOptions([
      opt([{ condition: "sun", enabled: false }]),
      opt([{ condition: "time" }]),
    ]);
    expect(result.get(1)).toEqual({ kind: "after_unconditional", by: 0 });
  });

  it("flags an option with the same conditions as an earlier one", () => {
    const result = getUnreachableOptions([
      opt([{ condition: "sun" }]),
      opt([{ condition: "time" }]),
      opt([{ condition: "sun" }], [{ delay: 1 }]),
    ]);
    expect([...result.entries()]).toEqual([
      [2, { kind: "same_conditions", by: 0 }],
    ]);
  });

  it("flags nothing when options differ", () => {
    expect(
      getUnreachableOptions([
        opt([{ condition: "sun" }]),
        opt([{ condition: "time" }]),
      ]).size
    ).toBe(0);
  });

  it("never flags the first option", () => {
    expect(getUnreachableOptions([opt([])]).size).toBe(0);
    expect(getUnreachableOptions([]).size).toBe(0);
  });

  it("accepts a single template string as conditions", () => {
    const result = getUnreachableOptions([
      { conditions: "{{ true }}", sequence: [] } as any,
      { conditions: "{{ true }}", sequence: [] } as any,
    ]);
    expect(result.get(1)).toEqual({ kind: "same_conditions", by: 0 });
  });
});

describe("runActions", () => {
  const actions = [{ delay: 1 }] as any;

  it("validates before executing and executes only after validation", async () => {
    const order: string[] = [];
    const hass = {
      callWS: vi.fn(async (msg: { type: string }) => {
        order.push(msg.type);
        return msg.type === "validate_config"
          ? { actions: { valid: true } }
          : { context: {}, response: null };
      }),
    } as any;
    expect(await runActions(hass, actions)).toEqual({ status: "success" });
    expect(order).toEqual(["validate_config", "execute_script"]);
  });

  it("never executes an invalid action list", async () => {
    const hass = {
      callWS: vi.fn(async () => ({
        actions: { valid: false, error: "nope" },
      })),
    } as any;
    expect(await runActions(hass, actions)).toEqual({
      status: "invalid",
      message: "nope",
    });
    expect(hass.callWS).toHaveBeenCalledTimes(1);
  });

  it("reports a failing validation call without executing", async () => {
    const hass = {
      callWS: vi.fn(async () => {
        throw new Error("offline");
      }),
    } as any;
    expect(await runActions(hass, actions)).toEqual({
      status: "error",
      message: "offline",
    });
    expect(hass.callWS).toHaveBeenCalledTimes(1);
  });
});
