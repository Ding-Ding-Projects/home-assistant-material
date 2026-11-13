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

describe("draftFromSentence, more patterns", () => {
  const entities = [
    { id: "light.hall", name: "Hall light" },
    { id: "light.kitchen", name: "Kitchen" },
    { id: "switch.tj", name: "Tom and Jerry lamp" },
    { id: "sensor.temp", name: "Living room temperature" },
    { id: "switch.fan", name: "Fan" },
  ];
  const draft = (text: string) => draftFromSentence(text, entities);

  it("drafts a numeric threshold, with and without a wait", () => {
    expect(
      draft("When Living room temperature goes above 25, turn on Fan").config
        ?.triggers
    ).toEqual([
      { trigger: "numeric_state", entity_id: "sensor.temp", above: 25 },
    ]);
    expect(
      draft(
        "when sensor.temp drops below 18.5 degrees for 10 minutes then turn off Fan"
      ).config?.triggers
    ).toEqual([
      {
        trigger: "numeric_state",
        entity_id: "sensor.temp",
        below: 18.5,
        for: "00:10:00",
      },
    ]);
    expect(
      draft("When sensor.temp exceeds 30%, toggle Fan").config?.triggers[0]
    ).toEqual({
      trigger: "numeric_state",
      entity_id: "sensor.temp",
      above: 30,
    });
  });

  it("drafts a state trigger that has to hold", () => {
    expect(
      draft("When Fan turns on for 2 hours, turn off Hall light").config
        ?.triggers
    ).toEqual([
      { trigger: "state", entity_id: "switch.fan", to: "on", for: "02:00:00" },
    ]);
  });

  it("drafts sun triggers with offsets", () => {
    const trigger = (text: string) => draft(text).config?.triggers[0];
    expect(trigger("At sunset turn on Hall light")).toEqual({
      trigger: "sun",
      event: "sunset",
    });
    expect(trigger("when the sun rises, turn off Hall light")).toEqual({
      trigger: "sun",
      event: "sunrise",
    });
    expect(trigger("at sunset minus 30 minutes turn on Hall light")).toEqual({
      trigger: "sun",
      event: "sunset",
      offset: "-00:30:00",
    });
    expect(trigger("1 hour after sunrise turn off Fan")).toEqual({
      trigger: "sun",
      event: "sunrise",
      offset: "01:00:00",
    });
    expect(trigger("45 minutes before sunset, turn on Fan")).toEqual({
      trigger: "sun",
      event: "sunset",
      offset: "-00:45:00",
    });
  });

  it("reads a twelve hour time and a daily prefix", () => {
    expect(draft("Every day at 7:30 pm turn on Fan").config?.triggers).toEqual([
      { trigger: "time", at: "19:30:00" },
    ]);
    expect(draft("at 12 am turn on Fan").config?.triggers[0]).toEqual({
      trigger: "time",
      at: "00:00:00",
    });
    expect(draft("at 13 pm turn on Fan").problem).toBe("no_pattern");
    expect(draft("at 5 turn on Fan").problem).toBe("no_pattern");
  });

  it("joins several actions with and, sharing or changing the verb", () => {
    const actions = (text: string) => draft(text).config?.actions;
    expect(actions("at 07:00 turn on Hall light and Kitchen")).toEqual([
      { action: "homeassistant.turn_on", target: { entity_id: "light.hall" } },
      {
        action: "homeassistant.turn_on",
        target: { entity_id: "light.kitchen" },
      },
    ]);
    expect(
      actions("at 07:00 turn on Kitchen and turn off Fan and toggle Hall light")
    ).toEqual([
      {
        action: "homeassistant.turn_on",
        target: { entity_id: "light.kitchen" },
      },
      { action: "homeassistant.turn_off", target: { entity_id: "switch.fan" } },
      { action: "homeassistant.toggle", target: { entity_id: "light.hall" } },
    ]);
  });

  it("keeps an entity name that contains and", () => {
    expect(
      draft("at 07:00 turn on Tom and Jerry lamp and Fan").config?.actions
    ).toEqual([
      { action: "homeassistant.turn_on", target: { entity_id: "switch.tj" } },
      { action: "homeassistant.turn_on", target: { entity_id: "switch.fan" } },
    ]);
  });

  it("names the first entity it cannot find, in the trigger or the actions", () => {
    expect(draft("when Garage turns on, turn on Fan")).toEqual({
      problem: "unknown_entity",
      unknown: "Garage",
    });
    expect(draft("at 07:00 turn on Fan and Garage door")).toEqual({
      problem: "unknown_entity",
      unknown: "Garage door",
    });
  });

  it("does not guess at sentences outside the patterns", () => {
    expect(draft("turn on Fan").problem).toBe("no_pattern");
    expect(draft("when Fan is nice, turn on Hall light").problem).toBe(
      "no_pattern"
    );
    expect(draft("at sunset plus 25 hours turn on Fan").problem).toBe(
      "no_pattern"
    );
  });
});
