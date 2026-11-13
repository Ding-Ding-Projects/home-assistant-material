import { describe, expect, it } from "vitest";
import {
  conditionCannotBeJudged,
  throttleDelay,
  watchedEntityIds,
} from "../../../../src/panels/config/automation/live-state";

describe("watchedEntityIds", () => {
  it("reads a single id, a list and a target", () => {
    expect(watchedEntityIds({ entity_id: "light.a" })).toEqual(["light.a"]);
    expect(
      watchedEntityIds({ entity_id: ["light.a", "sensor.b", "light.a"] })
    ).toEqual(["light.a", "sensor.b"]);
    expect(watchedEntityIds({ target: { entity_id: "switch.c" } })).toEqual([
      "switch.c",
    ]);
  });

  it("ignores templates and anything that is not an id", () => {
    expect(watchedEntityIds({ entity_id: "{{ x }}" })).toEqual([]);
    expect(watchedEntityIds("light.a")).toEqual([]);
    expect(watchedEntityIds({})).toEqual([]);
  });
});

describe("conditionCannotBeJudged", () => {
  it("is judgeable for a plain state condition", () => {
    expect(
      conditionCannotBeJudged({
        condition: "state",
        entity_id: "light.a",
        state: "on",
      })
    ).toBeUndefined();
  });

  it("cannot judge disabled or trigger-dependent conditions", () => {
    expect(
      conditionCannotBeJudged({ condition: "state", enabled: false })
    ).toBe("disabled");
    expect(conditionCannotBeJudged({ condition: "trigger", id: "x" })).toBe(
      "needs_trigger"
    );
    expect(
      conditionCannotBeJudged({
        condition: "template",
        value_template: "{{ trigger.to_state.state == 'on' }}",
      })
    ).toBe("needs_trigger");
  });
});

describe("throttleDelay", () => {
  it("runs immediately the first time and after the gap", () => {
    expect(throttleDelay(undefined, 1000)).toBe(0);
    expect(throttleDelay(1000, 7000)).toBe(0);
  });

  it("waits for the rest of the gap", () => {
    expect(throttleDelay(1000, 3000)).toBe(3000);
  });
});
