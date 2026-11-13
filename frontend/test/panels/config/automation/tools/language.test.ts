import { describe, expect, it } from "vitest";
import {
  describeAutomation,
  draftFromSentence,
  toSentence,
} from "../../../../../src/panels/config/automation/tools/language";

// A translator that shows the key and the values, so the tests read the rules
// and not the English wording.
const ctx = {
  t: (key: string, values?: Record<string, string | number>) =>
    `${key.replace("s.", "")}${values ? `(${Object.values(values).join("|")})` : ""}`,
  name: (id: string) => id.split(".")[1],
};

describe("describeAutomation", () => {
  it("reads triggers, conditions and actions in order", () => {
    const lines = describeAutomation(
      {
        triggers: [{ trigger: "state", entity_id: "person.alex", to: "home" }],
        conditions: [{ condition: "sun", after: "sunset" }],
        actions: [
          { action: "light.turn_on", target: { entity_id: "light.hall" } },
        ],
      },
      ctx
    );
    expect(lines.map((l) => l.role)).toEqual(["when", "if", "then"]);
    expect(lines[0].text).toBe("trigger_state_to(alex|home)");
    expect(lines[2].text).toBe("action_turn_on(hall)");
  });

  it("nests choose options and skips disabled steps", () => {
    const lines = describeAutomation(
      {
        triggers: [{ trigger: "time", at: "07:00:00" }],
        actions: [
          {
            choose: [
              {
                conditions: [
                  {
                    condition: "state",
                    entity_id: "person.alex",
                    state: "home",
                  },
                ],
                sequence: [{ delay: "00:00:05" }],
              },
            ],
            default: [
              { action: "notify.alex" },
              { event: "x", enabled: false },
            ],
          },
        ],
      },
      ctx
    );
    expect(lines.map((l) => [l.role, l.depth])).toEqual([
      ["when", 0],
      ["if", 0],
      ["then", 1],
      ["otherwise", 0],
      ["then", 1],
    ]);
  });

  it("joins lines into a sentence", () => {
    const lines = describeAutomation(
      { triggers: [{ trigger: "homeassistant", event: "start" }] },
      ctx
    );
    expect(toSentence(lines, ctx)).toBe(
      "line_when(trigger_homeassistant_start)"
    );
  });
});

describe("draftFromSentence", () => {
  const entities = [
    { id: "light.hall", name: "Hall light" },
    { id: "switch.fan", name: "Fan" },
  ];

  it("drafts a state trigger and a turn off action", () => {
    const draft = draftFromSentence(
      "When Fan turns on, turn off Hall light.",
      entities
    );
    expect(draft.config?.triggers).toEqual([
      { trigger: "state", entity_id: "switch.fan", to: "on" },
    ]);
    expect(draft.config?.actions[0]).toEqual({
      action: "homeassistant.turn_off",
      target: { entity_id: "light.hall" },
    });
  });

  it("drafts a time trigger", () => {
    const draft = draftFromSentence("at 7:30 turn on light.hall", entities);
    expect(draft.config?.triggers).toEqual([
      { trigger: "time", at: "07:30:00" },
    ]);
  });

  it("names the entity it could not find and refuses other sentences", () => {
    expect(draftFromSentence("at 07:30 turn on Garage", entities)).toEqual({
      problem: "unknown_entity",
      unknown: "Garage",
    });
    expect(draftFromSentence("make it cosy", entities).problem).toBe(
      "no_pattern"
    );
    expect(draftFromSentence("at 27:30 turn on Fan", entities).problem).toBe(
      "no_pattern"
    );
  });
});
