import { describe, expect, it } from "vitest";
import {
  buildSentenceParts,
  heroText,
  isDescribeError,
} from "../../../../src/panels/config/automation/editor-frame/automation-sentence";
import {
  collectHelperEntityIds,
  conditionForHelper,
} from "../../../../src/panels/config/automation/helpers-panel/helper-references";

describe("collectHelperEntityIds", () => {
  const config = {
    triggers: [{ trigger: "state", entity_id: "input_boolean.guest_mode" }],
    conditions: [
      {
        condition: "template",
        value_template: "{{ states('input_number.brightness') | int > 3 }}",
      },
    ],
    actions: [
      { service: "timer.start", target: { entity_id: ["timer.hall"] } },
      { service: "light.turn_on", entity_id: "light.hall" },
      { event: "my_input_boolean.x" },
    ],
  };

  it("finds helpers in fields, lists and templates, once each", () => {
    expect(collectHelperEntityIds(config)).toEqual([
      "input_boolean.guest_mode",
      "input_number.brightness",
      "timer.start",
      "timer.hall",
    ]);
  });

  it("keeps only known entities, which drops service names", () => {
    const known = new Set(["timer.hall", "input_boolean.guest_mode"]);
    expect(collectHelperEntityIds(config, (id) => known.has(id))).toEqual([
      "input_boolean.guest_mode",
      "timer.hall",
    ]);
  });

  it("ignores names glued to a longer word and non-helper domains", () => {
    expect(collectHelperEntityIds({ a: "my_input_boolean.x light.x" })).toEqual(
      []
    );
  });

  it("copes with empty and cyclic input", () => {
    expect(collectHelperEntityIds(undefined)).toEqual([]);
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(collectHelperEntityIds(loop)).toEqual([]);
  });
});

describe("conditionForHelper", () => {
  it("tests a toggle for on and a number for a value", () => {
    expect(conditionForHelper("input_boolean.x")).toMatchObject({
      condition: "state",
      state: "on",
    });
    expect(conditionForHelper("counter.c")).toMatchObject({
      condition: "numeric_state",
    });
  });
});

describe("sentence builder", () => {
  const describers = {
    trigger: (t: any) => `trigger ${t.id}`,
    condition: (c: any) => {
      if (c.bad) {
        throw new Error("nope");
      }
      return `cond ${c.id}`;
    },
    action: (a: any) => (a.empty ? "  " : `act ${a.id}`),
  };

  it("collects described steps and skips ones that fail or are empty", () => {
    const parts = buildSentenceParts(
      {
        triggers: [{ id: 1 }],
        conditions: [{ id: 2 }, { bad: true }],
        actions: [{ id: 3 }, { empty: true }],
      },
      describers
    );
    expect(parts).toEqual({
      when: ["trigger 1"],
      onlyIf: ["cond 2"],
      then: ["act 3"],
    });
  });

  it("falls back to the alias, never an error text, when nothing is described", () => {
    const parts = buildSentenceParts(
      { alias: "Night", conditions: [{ bad: true }] },
      describers
    );
    expect(heroText(parts, "Night", () => "sentence")).toBe("Night");
    expect(heroText(parts, undefined, () => "sentence")).toBe("");
  });

  it("uses the sentence when something could be described", () => {
    const parts = buildSentenceParts({ triggers: [{ id: 1 }] }, describers);
    // The sentence always starts with a capital letter.
    expect(heroText(parts, "x", () => "sentence")).toBe("Sentence");
  });

  it("recognises a localized describe error by its prefix", () => {
    expect(
      isDescribeError(
        "Error in describing trigger: boom",
        "Error in describing trigger:"
      )
    ).toBe(true);
    expect(isDescribeError("Sun sets", "Error in describing trigger:")).toBe(
      false
    );
    expect(isDescribeError("anything", "")).toBe(false);
  });
});
