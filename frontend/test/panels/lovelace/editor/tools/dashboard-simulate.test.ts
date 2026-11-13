import { describe, expect, it } from "vitest";
import type { HassEntities } from "home-assistant-js-websocket";
import {
  changedAmong,
  simulateStates,
} from "../../../../../src/panels/lovelace/editor/tools/dashboard-simulate";

const entity = (entity_id: string, state: string) => ({
  entity_id,
  state,
  attributes: { friendly_name: entity_id },
  last_changed: "",
  last_updated: "",
  context: { id: "", parent_id: null, user_id: null },
});

const states = (): HassEntities => ({
  "sun.sun": entity("sun.sun", "above_horizon"),
  "person.alex": entity("person.alex", "home"),
  "alarm_control_panel.house": entity("alarm_control_panel.house", "disarmed"),
  "light.a": entity("light.a", "on"),
});

describe("simulateStates", () => {
  it("leaves everything alone for now", () => {
    const real = states();
    const result = simulateStates(real, "now");
    expect(result.changed).toEqual([]);
    expect(result.states["sun.sun"].state).toBe("above_horizon");
  });

  it("applies night, away and alarm to a copy", () => {
    const real = states();
    expect(simulateStates(real, "night").states["sun.sun"].state).toBe(
      "below_horizon"
    );
    expect(simulateStates(real, "away").states["person.alex"].state).toBe(
      "not_home"
    );
    expect(
      simulateStates(real, "alarm").states["alarm_control_panel.house"].state
    ).toBe("triggered");
    // The real states are never modified.
    expect(real["sun.sun"].state).toBe("above_horizon");
    expect(real["person.alex"].state).toBe("home");
  });

  it("applies manual overrides over the preset and skips unknown entities", () => {
    const result = simulateStates(states(), "away", [
      { entityId: "person.alex", state: "home" },
      { entityId: "light.a", state: "off" },
      { entityId: "light.missing", state: "on" },
    ]);
    expect(result.states["person.alex"].state).toBe("home");
    expect(result.states["light.a"].state).toBe("off");
    expect(result.states["light.missing"]).toBeUndefined();
    expect(result.changed).toEqual(["light.a"]);
  });

  it("finds which changed entities a card uses", () => {
    expect(changedAmong(["a", "b"], ["b", "c"])).toEqual(["b"]);
  });
});
