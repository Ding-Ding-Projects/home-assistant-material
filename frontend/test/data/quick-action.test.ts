import { describe, expect, it } from "vitest";
import {
  defaultActionFor,
  delaySeconds,
  duplicateStep,
  firstStepFor,
  isRiskySequence,
  moveStep,
  sequenceToSteps,
  stepsAreComplete,
  stepsToSequence,
  validateSequence,
  waitStep,
} from "../../src/data/quick-action";
import type { QuickStep } from "../../src/data/quick-action";

const services = {
  light: { turn_on: {}, turn_off: {}, toggle: {} },
  lock: { lock: {}, unlock: {}, open: {} },
  cover: { open_cover: {}, close_cover: {}, toggle: {} },
  button: { press: {} },
  sensor: {},
  notify: { send_message: {} },
  homeassistant: { turn_on: {}, turn_off: {} },
};

// Protects the first step a person sees: it should do the opposite of the
// present state, never repeat it.
describe("defaultActionFor", () => {
  it("offers the opposite of the present state", () => {
    expect(defaultActionFor("light.hall", "on", services)).toBe(
      "light.turn_off"
    );
    expect(defaultActionFor("light.hall", "off", services)).toBe(
      "light.turn_on"
    );
    expect(defaultActionFor("lock.front", "locked", services)).toBe(
      "lock.unlock"
    );
    expect(defaultActionFor("cover.garage", "open", services)).toBe(
      "cover.close_cover"
    );
    expect(defaultActionFor("button.bell", "unknown", services)).toBe(
      "button.press"
    );
  });

  it("falls back to toggle, then the first service, then nothing", () => {
    expect(defaultActionFor("light.hall", "unavailable", services)).toBe(
      "light.toggle"
    );
    expect(defaultActionFor("notify.phone", "unknown", services)).toBe(
      "notify.send_message"
    );
    expect(defaultActionFor("sensor.temp", "21", services)).toBeUndefined();
  });
});

// Protects the two-way sync between the guided view and the YAML view, so
// switching tabs never changes what runs.
describe("guided steps and the sequence", () => {
  const steps: QuickStep[] = [
    firstStepFor("light.hall", "off", services),
    waitStep(600),
    {
      kind: "other",
      action: "light.turn_off",
      target: { entity_id: "light.porch" },
      data: {},
    },
  ];

  it("round-trips", () => {
    const sequence = stepsToSequence(steps);
    expect(sequence).toEqual([
      { action: "light.turn_on", target: { entity_id: "light.hall" } },
      { delay: { hours: 0, minutes: 10, seconds: 0 } },
      { action: "light.turn_off", target: { entity_id: "light.porch" } },
    ]);
    expect(sequenceToSteps(sequence, "light.hall")).toEqual(steps);
  });

  it("reads legacy forms", () => {
    expect(
      sequenceToSteps(
        [
          { service: "light.turn_on", data: { entity_id: "light.hall" } },
          { delay: "00:01:30" },
        ],
        "light.hall"
      )
    ).toEqual([
      {
        kind: "action",
        action: "light.turn_on",
        target: { entity_id: "light.hall" },
        data: {},
      },
      waitStep(90),
    ]);
  });

  it("leaves what it cannot show to the YAML view", () => {
    expect(sequenceToSteps([{ condition: "state" }])).toBeUndefined();
    expect(
      sequenceToSteps([{ action: "light.turn_on", continue_on_error: true }])
    ).toBeUndefined();
    expect(sequenceToSteps([{ delay: "{{ 5 }}" }])).toBeUndefined();
    expect(
      sequenceToSteps([
        { action: "light.turn_on", target: { entity_id: "{{ x }}" } },
      ])
    ).toBeUndefined();
  });

  it("needs every step filled in before it runs", () => {
    expect(stepsAreComplete(steps)).toBe(true);
    expect(stepsAreComplete([firstStepFor(undefined, undefined, {})])).toBe(
      false
    );
    expect(stepsAreComplete([])).toBe(false);
  });
});

describe("delaySeconds", () => {
  it("reads every fixed form", () => {
    expect(delaySeconds(5)).toBe(5);
    expect(delaySeconds("01:00")).toBe(60);
    expect(delaySeconds("01:00:05")).toBe(3605);
    expect(delaySeconds({ minutes: 2, seconds: 3 })).toBe(123);
    expect(delaySeconds({ minutes: "{{ x }}" })).toBeUndefined();
    expect(delaySeconds(-1)).toBeUndefined();
  });
});

// Protects the check that runs before anything is sent.
describe("validateSequence", () => {
  it("accepts a list or a single step", () => {
    expect(validateSequence([{ action: "light.turn_on" }], services)).toEqual({
      ok: true,
      sequence: [{ action: "light.turn_on" }],
    });
    expect(validateSequence({ delay: 1 }, services)).toEqual({
      ok: true,
      sequence: [{ delay: 1 }],
    });
  });

  it("names what is wrong", () => {
    expect(validateSequence({}, services)).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(validateSequence("text", services)).toEqual({
      ok: false,
      problem: "not_list",
    });
    expect(validateSequence([{ delay: 1 }, 3], services)).toEqual({
      ok: false,
      problem: "bad_step",
      step: 2,
    });
    expect(validateSequence([{ action: "" }], services)).toEqual({
      ok: false,
      problem: "missing_action",
      step: 1,
    });
    expect(validateSequence([{ action: "light.melt" }], services)).toEqual({
      ok: false,
      problem: "unknown_action",
      step: 1,
    });
  });
});

// Protects the rule that anything able to unlock or open the home asks first,
// including when it is hidden in a nested step or behind an area target.
describe("isRiskySequence", () => {
  const risky = (id: string) => id === "cover.garage";

  it("asks for risky domains and risky entities", () => {
    expect(
      isRiskySequence([{ action: "lock.unlock", target: {} }], risky)
    ).toBe(true);
    expect(
      isRiskySequence(
        [{ action: "cover.open_cover", target: { entity_id: "cover.garage" } }],
        risky
      )
    ).toBe(true);
    expect(
      isRiskySequence(
        [{ action: "homeassistant.turn_on", entity_id: "cover.garage" }],
        risky
      )
    ).toBe(true);
  });

  it("looks inside nested steps and unresolved targets", () => {
    expect(
      isRiskySequence(
        [
          {
            if: [],
            then: [
              {
                action: "light.turn_on",
                target: { entity_id: ["light.a", "cover.garage"] },
              },
            ],
          },
        ],
        risky
      )
    ).toBe(true);
    expect(
      isRiskySequence(
        [{ action: "cover.open_cover", target: { area_id: "garage" } }],
        risky
      )
    ).toBe(true);
  });

  it("lets ordinary steps run straight away", () => {
    expect(
      isRiskySequence(
        [
          { action: "light.turn_on", target: { entity_id: "light.hall" } },
          { delay: 5 },
          { action: "light.turn_on", target: { area_id: "kitchen" } },
        ],
        risky
      )
    ).toBe(false);
  });
});

describe("step list edits", () => {
  it("moves, duplicates and keeps bounds", () => {
    const list: QuickStep[] = [waitStep(1), waitStep(2), waitStep(3)];
    expect(moveStep(list, 0, 1).map((s) => (s as any).seconds)).toEqual([
      2, 1, 3,
    ]);
    expect(moveStep(list, 0, -1)).toBe(list);
    const copy = duplicateStep(list, 1);
    expect(copy).toHaveLength(4);
    expect(copy[2]).toEqual(list[1]);
    expect(copy[2]).not.toBe(list[1]);
  });
});
