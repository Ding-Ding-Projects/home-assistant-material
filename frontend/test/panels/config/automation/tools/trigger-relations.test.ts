import { describe, expect, it } from "vitest";
import {
  analyseRelations,
  conditionTriggerIds,
  stepsReachedBy,
  templateTriggerIds,
  triggersReaching,
} from "../../../../../src/panels/config/automation/tools/trigger-relations";

const config = {
  triggers: [
    { trigger: "state", entity_id: "person.alex", id: "alex" },
    { trigger: "state", entity_id: "person.sam", id: "sam" },
    { trigger: "state", entity_id: "binary_sensor.bell", id: "bell" },
  ],
  actions: [
    {
      choose: [
        {
          conditions: [{ condition: "trigger", id: ["alex", "sam"] }],
          sequence: [{ action: "light.turn_on" }, { action: "lock.unlock" }],
        },
        {
          conditions: [{ condition: "trigger", id: "bell" }],
          sequence: [{ action: "notify.mobile" }],
        },
      ],
      default: [{ action: "script.log" }],
    },
  ],
};

describe("trigger relations", () => {
  it("reads trigger ids from conditions and templates", () => {
    expect([
      ...conditionTriggerIds({ condition: "trigger", id: "a" })!,
    ]).toEqual(["a"]);
    expect([
      ...templateTriggerIds("{{ trigger.id == 'a' or trigger.id == \"b\" }}")!,
    ]).toEqual(["a", "b"]);
    expect([...templateTriggerIds("{{ trigger.id in ['x', 'y'] }}")!]).toEqual([
      "x",
      "y",
    ]);
    expect(templateTriggerIds("{{ is_state('a.b', 'on') }}")).toBeUndefined();
    expect(templateTriggerIds("{{ trigger.id == 'a' and x }}")).toBeUndefined();
    expect(
      conditionTriggerIds({
        condition: "not",
        conditions: [{ condition: "trigger", id: "a" }],
      })
    ).toBeUndefined();
    expect(
      conditionTriggerIds({
        condition: "or",
        conditions: [
          { condition: "trigger", id: "a" },
          { condition: "state", entity_id: "a.b", state: "on" },
        ],
      })
    ).toBeUndefined();
  });

  it("finds which triggers feed which branch", () => {
    const relations = analyseRelations(config);
    const gated = relations.branches.filter((b) => b.ids);
    expect(gated.map((b) => [b.path, b.triggers])).toEqual([
      ["action/0/choose/0", [0, 1]],
      ["action/0/choose/1", [2]],
    ]);
    expect(relations.missingIds).toEqual([]);
  });

  it("finds the steps a trigger can reach", () => {
    const relations = analyseRelations(config);
    const alex = stepsReachedBy(relations, 0).map((s) => s.path);
    expect(alex).toContain("action/0/choose/0/sequence/1");
    expect(alex).not.toContain("action/0/choose/1/sequence/0");
    // The default branch and the choose step itself are open to everyone.
    expect(alex).toContain("action/0/default/0");
    expect(alex).toContain("action/0");
    expect(
      triggersReaching(relations, "action/0/choose/1/sequence/0").map(
        (t) => t.id
      )
    ).toEqual(["bell"]);
  });

  it("limits later siblings after a trigger condition step", () => {
    const relations = analyseRelations({
      triggers: [
        { trigger: "state", id: "a" },
        { trigger: "state", id: "b" },
      ],
      actions: [{ condition: "trigger", id: "a" }, { action: "light.turn_on" }],
    });
    expect(relations.steps.map((s) => s.triggers)).toEqual([[0, 1], [0]]);
    expect(relations.steps[1].gated).toBe(true);
  });

  it("gates the actions behind a top level trigger condition", () => {
    const relations = analyseRelations({
      triggers: [
        { trigger: "state", id: "a" },
        { trigger: "state", id: "b" },
      ],
      conditions: [{ condition: "trigger", id: "b" }],
      actions: [{ action: "light.turn_on" }],
    });
    expect(relations.steps[0].triggers).toEqual([1]);
  });

  it("reports ids that no trigger defines", () => {
    const relations = analyseRelations({
      triggers: [{ trigger: "state", id: "a" }],
      actions: [
        {
          if: [{ condition: "trigger", id: "ghost" }],
          then: [{ action: "light.turn_on" }],
        },
      ],
    });
    expect(relations.missingIds).toEqual(["ghost"]);
    expect(
      relations.steps.find((s) => s.path.endsWith("then/0"))!.triggers
    ).toEqual([]);
  });

  it("reads an empty configuration", () => {
    const relations = analyseRelations({});
    expect(relations.triggers).toEqual([]);
    expect(relations.steps).toEqual([]);
  });
});
