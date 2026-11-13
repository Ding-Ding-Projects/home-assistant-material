import { describe, expect, it } from "vitest";
import {
  continueOnErrorState,
  countContinueOnErrorActions,
  inheritContinueOnError,
  setContinueOnErrorAll,
} from "../../../../src/panels/config/automation/action/continue-on-error-all";

const nested = () => [
  { action: "light.turn_on" },
  {
    choose: [
      { conditions: [], sequence: [{ delay: "00:00:01" }] },
      { conditions: [], sequence: { action: "a.b" } },
    ],
    default: [{ event: "x" }],
  },
  {
    if: [{ condition: "state", entity_id: "a.b", state: "on" }],
    then: [{ variables: { a: 1 } }],
    else: [{ stop: "done" }],
  },
  { repeat: { count: 2, sequence: [{ action: "c.d" }] } },
  { parallel: [{ action: "e.f" }, { sequence: [{ action: "g.h" }] }] },
  { sequence: [{ wait_template: "{{ true }}" }] },
  { condition: "template", value_template: "{{ true }}" },
  { and: [{ condition: "state", entity_id: "a.b", state: "on" }] },
  "{{ true }}",
];

describe("continue on error for all actions", () => {
  it("inherits the setting for added nested actions and keeps explicit edits", () => {
    const previous = setContinueOnErrorAll(
      [{ sequence: [{ action: "light.turn_on" }] }],
      true
    );
    const next = [
      {
        ...previous[0],
        sequence: [...previous[0].sequence, { action: "light.turn_off" }],
      },
    ];
    expect(continueOnErrorState(inheritContinueOnError(previous, next))).toBe(
      "all"
    );
    const explicitlyOff = [{ ...previous[0], continue_on_error: false }];
    expect(inheritContinueOnError(previous, explicitlyOff)).toBe(explicitlyOff);
  });

  it("reads none, all and mixed", () => {
    expect(continueOnErrorState([])).toBe("none");
    expect(continueOnErrorState([{ action: "a.b" }])).toBe("none");
    expect(
      continueOnErrorState([{ action: "a.b", continue_on_error: true }])
    ).toBe("all");
    expect(
      continueOnErrorState([
        { action: "a.b", continue_on_error: true },
        { action: "c.d" },
      ])
    ).toBe("mixed");
    expect(
      continueOnErrorState([
        { action: "a.b", continue_on_error: false },
        { action: "c.d" },
      ])
    ).toBe("none");
  });

  it("sees nested actions of every kind", () => {
    // Top level all on, one nested one off.
    const on = setContinueOnErrorAll(nested(), true) as any[];
    expect(continueOnErrorState(on)).toBe("all");
    delete on[3].repeat.sequence[0].continue_on_error;
    expect(continueOnErrorState(on)).toBe("mixed");
    const on2 = setContinueOnErrorAll(nested(), true) as any[];
    delete on2[1].choose[1].sequence.continue_on_error;
    expect(continueOnErrorState(on2)).toBe("mixed");
    const on3 = setContinueOnErrorAll(nested(), true) as any[];
    delete on3[4].parallel[1].sequence[0].continue_on_error;
    expect(continueOnErrorState(on3)).toBe("mixed");
    const on4 = setContinueOnErrorAll(nested(), true) as any[];
    delete on4[2].else[0].continue_on_error;
    expect(continueOnErrorState(on4)).toBe("mixed");
    const on5 = setContinueOnErrorAll(nested(), true) as any[];
    delete on5[1].default[0].continue_on_error;
    expect(continueOnErrorState(on5)).toBe("mixed");
  });

  it("counts only actions that can carry the option", () => {
    // light, choose, delay, a.b, event, if, variables, stop, repeat, c.d,
    // parallel, e.f, sequence, g.h, sequence, wait
    expect(countContinueOnErrorActions(nested())).toBe(16);
  });

  it("sets the option everywhere and leaves conditions alone", () => {
    const out = setContinueOnErrorAll(nested(), true) as any[];
    expect(out[0].continue_on_error).toBe(true);
    expect(out[1].continue_on_error).toBe(true);
    expect(out[1].choose[0].sequence[0].continue_on_error).toBe(true);
    expect(out[1].choose[1].sequence.continue_on_error).toBe(true);
    expect(out[1].choose[0].continue_on_error).toBeUndefined();
    expect(out[1].default[0].continue_on_error).toBe(true);
    expect(out[2].then[0].continue_on_error).toBe(true);
    expect(out[2].else[0].continue_on_error).toBe(true);
    expect(out[2].if[0].continue_on_error).toBeUndefined();
    expect(out[3].continue_on_error).toBe(true);
    expect(out[3].repeat.sequence[0].continue_on_error).toBe(true);
    expect(out[4].parallel[0].continue_on_error).toBe(true);
    expect(out[4].parallel[1].continue_on_error).toBe(true);
    expect(out[4].parallel[1].sequence[0].continue_on_error).toBe(true);
    expect(out[5].sequence[0].continue_on_error).toBe(true);
    expect(out[6]).toEqual(nested()[6]);
    expect(out[7]).toEqual(nested()[7]);
    expect(out[8]).toBe("{{ true }}");
  });

  it("removes the key instead of writing false", () => {
    const on = setContinueOnErrorAll(nested(), true);
    const off = setContinueOnErrorAll(on, false);
    expect(off).toEqual(nested());
    expect(JSON.stringify(off)).not.toContain("continue_on_error");
    expect(
      setContinueOnErrorAll(
        [{ action: "a.b", continue_on_error: false }],
        false
      )
    ).toEqual([{ action: "a.b" }]);
  });

  it("does not change its input", () => {
    const input = nested();
    const snapshot = structuredClone(input);
    setContinueOnErrorAll(input, true);
    expect(input).toEqual(snapshot);
    const on = setContinueOnErrorAll(input, true);
    const onSnapshot = structuredClone(on);
    setContinueOnErrorAll(on, false);
    expect(on).toEqual(onSnapshot);
  });

  it("keeps the order of keys and untouched references", () => {
    const first = { action: "a.b", data: { x: 1 }, alias: "A" };
    const out = setContinueOnErrorAll([first], true) as any[];
    expect(Object.keys(out[0])).toEqual([
      "action",
      "data",
      "alias",
      "continue_on_error",
    ]);
    expect(out[0].data).toBe(first.data);
    const already = [{ action: "a.b", continue_on_error: true }];
    expect(setContinueOnErrorAll(already, true)).toBe(already);
  });

  it("handles a single action that is not in a list", () => {
    const out = setContinueOnErrorAll({ action: "a.b" }, true);
    expect(out).toEqual({ action: "a.b", continue_on_error: true });
    expect(continueOnErrorState(out)).toBe("all");
  });
});
