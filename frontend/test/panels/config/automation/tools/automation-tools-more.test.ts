import { describe, expect, it } from "vitest";
import { swapEntity } from "../../../../../src/panels/config/automation/tools/automation-bulk";
import {
  buildBlueprint,
  listSteps,
} from "../../../../../src/panels/config/automation/tools/automation-blueprint-maker";
import { computeHealth } from "../../../../../src/panels/config/automation/tools/automation-health";
import {
  addSnippet,
  insertSnippet,
  removeSnippet,
} from "../../../../../src/panels/config/automation/tools/automation-snippets";
import {
  analyzeVariables,
  templateUsesName,
} from "../../../../../src/panels/config/automation/tools/automation-variables";
import {
  firesAt,
  planWeek,
} from "../../../../../src/panels/config/automation/tools/automation-week";

describe("variables", () => {
  it("ignores names that only appear inside quotes", () => {
    expect(templateUsesName("{{ states('who') }}", "who")).toBe(false);
    expect(templateUsesName("{{ who ~ '!' }}", "who")).toBe(true);
    expect(templateUsesName("{{ trigger.who }}", "who")).toBe(false);
  });

  it("finds where variables are set and read", () => {
    const result = analyzeVariables({
      variables: { who: "Alex" },
      triggers: [{ trigger: "state", entity_id: "person.a" }],
      actions: [
        { variables: { lights_on: "{{ who }}" } },
        { action: "notify.x", data: { message: "{{ lights_on }} {{ who }}" } },
      ],
    });
    const who = result.variables.find((v) => v.name === "who")!;
    expect(who.literal).toBe("Alex");
    expect(who.usedAt).toEqual([
      { section: "action", index: 0 },
      { section: "action", index: 1 },
    ]);
    const lights = result.variables.find((v) => v.name === "lights_on")!;
    expect(lights.setAt).toEqual([{ section: "action", index: 0 }]);
    expect(lights.literal).toBeUndefined();
  });
});

describe("blueprint maker", () => {
  const config = {
    triggers: [{ trigger: "state", entity_id: "person.alex", to: "home" }],
    actions: [
      { action: "light.turn_on", target: { entity_id: "light.hall" } },
      { action: "light.turn_off", target: { entity_id: "light.hall" } },
    ],
  };

  it("turns entities into shared inputs", () => {
    const draft = buildBlueprint(
      config,
      [
        { section: "triggers", index: 0 },
        { section: "actions", index: 0 },
        { section: "actions", index: 1 },
      ],
      { name: "Demo" }
    );
    expect(draft.inputs.map((i) => i.key)).toEqual(["person", "light"]);
    expect(draft.yaml).toContain("entity_id: !input light");
    expect(draft.yaml).toContain("entity_id: !input person");
    expect(draft.yaml).toContain("domain: automation");
    expect(draft.yaml).not.toContain("__BLUEPRINT_INPUT__");
  });

  it("lists every step", () => {
    expect(listSteps(config)).toHaveLength(3);
  });
});

describe("snippets", () => {
  it("adds, inserts and removes", () => {
    const list = addSnippet([], "Night", "conditions", [{ condition: "sun" }]);
    expect(list).toHaveLength(1);
    expect(addSnippet(list, " ", "conditions", [{}])).toBe(list);
    const next = insertSnippet(
      {
        triggers: [],
        conditions: [{ condition: "state" }],
        actions: [],
      } as any,
      list[0]
    );
    expect((next as any).conditions).toHaveLength(2);
    expect(removeSnippet(list, list[0].id)).toEqual([]);
  });
});

describe("health", () => {
  it("scores from real findings", () => {
    const report = computeHealth(
      {
        trigger: [],
        action: [{ action: "light.turn_on", target: { entity_id: "light.x" } }],
      } as any,
      {},
      { status: "invalid", part: "actions", message: "bad" }
    );
    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "invalid",
        "unavailable_entity",
        "deprecated",
        "no_conditions",
      ])
    );
    expect(report.score).toBe(100 - 40 - 10 - 10 - 5);
    expect(
      report.findings.find((f) => f.id === "deprecated")!.fix
    ).toHaveProperty("actions");
  });

  it("is perfect when nothing is wrong", () => {
    const report = computeHealth(
      {
        triggers: [],
        conditions: [{ condition: "sun" }],
        actions: [],
      } as any,
      {},
      { status: "ok", conditions: "pass" }
    );
    expect(report.score).toBe(100);
  });
});

describe("week", () => {
  it("places time and pattern triggers and flags the rest", () => {
    const plan = planWeek(
      {
        triggers: [
          { trigger: "time", at: "07:00:00", weekday: ["mon", "tue"] },
          { trigger: "time_pattern", hours: "/6" },
          { trigger: "time_pattern", minutes: "*" },
          { trigger: "state", entity_id: "light.a" },
          { trigger: "time", at: "input_datetime.wake" },
        ],
      },
      "Demo"
    );
    expect(firesAt(plan.entries, "07:00", 0)).toHaveLength(1);
    expect(firesAt(plan.entries, "07:00", 2)).toHaveLength(0);
    expect(firesAt(plan.entries, "12:00", 3)).toHaveLength(1);
    expect(plan.entries.find((e) => e.frequent)!.frequent!.perDay).toBe(1440);
    expect(plan.unpredictable.map((u) => u.reason)).toEqual([
      "event_driven",
      "dynamic_time",
    ]);
  });
});

describe("swapEntity", () => {
  it("replaces whole values and reports mentions in text", () => {
    const result = swapEntity(
      {
        triggers: [{ trigger: "state", entity_id: ["light.porch"] }],
        actions: [
          {
            action: "x",
            data: { a: "light.porch", b: "{{ states('light.porch') }}" },
          },
        ],
      } as any,
      "light.porch",
      "light.porch_main"
    );
    expect(result.paths).toEqual([
      "triggers[0].entity_id[0]",
      "actions[0].data.a",
    ]);
    expect(result.untouchedMentions).toEqual(["actions[0].data.b"]);
    expect((result.config as any).actions[0].data.b).toContain("light.porch'");
  });
});
