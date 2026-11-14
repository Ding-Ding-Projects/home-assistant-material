import { describe, expect, it } from "vitest";
import { dryRunAutomation } from "../../../../../src/panels/config/automation/automation-dry-run";
import {
  buildSimulationHass,
  evaluateTime,
  parseClock,
} from "../../../../../src/panels/config/automation/tools/simulate";

const state = (entity_id: string, value: string) => ({
  entity_id,
  state: value,
  attributes: {},
  last_changed: "",
  last_updated: "",
  context: { id: "", parent_id: null, user_id: null },
});

const live = {
  "person.alex": state("person.alex", "home"),
  "zone.home": state("zone.home", "zoning"),
};

describe("evaluateTime", () => {
  const situation = { overrides: [], time: "22:00", weekday: 1 };
  it("handles a window that wraps past midnight", () => {
    expect(
      evaluateTime({ after: "20:00:00", before: "06:00:00" }, situation, {})
    ).toBe(true);
    expect(
      evaluateTime({ after: "23:00:00", before: "06:00:00" }, situation, {})
    ).toBe(false);
  });
  it("checks the weekday and refuses a sun reference", () => {
    expect(evaluateTime({ weekday: ["mon"] }, situation, {})).toBe(true);
    expect(evaluateTime({ weekday: ["tue"] }, situation, {})).toBe(false);
    expect(() => evaluateTime({ after: "sunset" }, situation, {})).toThrow(
      "unsupported:time_reference"
    );
  });
  it("parses clock values", () => {
    expect(parseClock("07:30")).toBe(27000);
    expect(parseClock("25:00")).toBeUndefined();
  });
});

describe("simulation through the dry run", () => {
  it("uses the entered states and never reaches the server", async () => {
    const hass = buildSimulationHass(live as any, {
      overrides: [{ entityId: "person.alex", state: "not_home" }],
      time: "22:00",
    });
    const result = await dryRunAutomation(hass, {
      conditions: [
        { condition: "state", entity_id: "person.alex", state: "home" },
      ],
      actions: [
        { action: "light.turn_on", target: { entity_id: "light.hall" } },
      ],
    });
    expect(result.conditions).toBe("fail");
    expect(result.counts.would_skip).toBe(1);
  });

  it("decides time and zone conditions and reports others as unknown", async () => {
    const hass = buildSimulationHass(live as any, {
      overrides: [],
      time: "22:00",
    });
    const result = await dryRunAutomation(hass, {
      conditions: [
        { condition: "time", after: "20:00:00" },
        { condition: "zone", entity_id: "person.alex", zone: "zone.home" },
      ],
      actions: [{ action: "light.turn_on" }],
    });
    expect(result.conditions).toBe("pass");
    const unknown = await dryRunAutomation(hass, {
      conditions: [{ condition: "template", value_template: "{{ true }}" }],
      actions: [{ action: "light.turn_on" }],
    });
    expect(unknown.conditions).toBe("unknown");
    expect(unknown.steps[0].detail).toBe("unsupported:template");
  });
});

describe("simulated trigger conditions", () => {
  it("uses the supplied trigger ID without executing an action", async () => {
    const hass = buildSimulationHass(live, {
      overrides: [],
      time: "22:00",
      triggerId: "arrived",
    });
    const result = await dryRunAutomation(hass, {
      conditions: [{ condition: "trigger", id: ["arrived", "manual"] }],
      actions: [{ action: "light.turn_on" }],
    });
    expect(result.conditions).toBe("pass");
    expect(result.counts.would_run).toBe(1);
    const other = await dryRunAutomation(hass, {
      conditions: [{ condition: "trigger", id: "left" }],
      actions: [{ action: "light.turn_on" }],
    });
    expect(other.conditions).toBe("fail");
    expect(other.counts.would_skip).toBe(1);
    await expect(hass.callWS({ type: "call_service" })).rejects.toThrow(
      "not available in a simulation"
    );
  });

  it("does not guess which trigger fired when its ID is unset", async () => {
    const hass = buildSimulationHass(live, { overrides: [], time: "22:00" });
    const result = await dryRunAutomation(hass, {
      conditions: [{ condition: "trigger", id: "arrived" }],
      actions: [],
    });
    expect(result.conditions).toBe("unknown");
    expect(result.steps[0].reason).toBe("needs_trigger");
  });

  it("accepts explicit seconds in simulated time", () => {
    expect(
      evaluateTime(
        { after: "22:00:30" },
        {
          overrides: [],
          time: "22:00:45",
        },
        {}
      )
    ).toBe(true);
  });
});

describe("isolated simulation states", () => {
  it("keeps default live fallback but can exclude all unprovided states", async () => {
    const situation = { overrides: [], time: "22:00" };
    const fallback = buildSimulationHass(live, situation);
    expect(fallback.states["person.alex"].state).toBe("home");
    const isolated = buildSimulationHass(live, {
      ...situation,
      useLiveStates: false,
    });
    expect(isolated.states).toEqual({});
    const result = await dryRunAutomation(isolated, {
      conditions: [
        { condition: "state", entity_id: "person.alex", state: "home" },
      ],
      actions: [{ action: "light.turn_on" }],
    });
    expect(result.conditions).toBe("unknown");
    expect(result.steps[0].reason).toBe("entity_not_found");
  });

  it("uses only explicit overrides without inheriting live attributes", async () => {
    const isolated = buildSimulationHass(
      {
        ...live,
        "person.alex": { ...live["person.alex"], attributes: { latitude: 43 } },
      },
      {
        overrides: [{ entityId: "person.alex", state: "not_home" }],
        time: "22:00",
        useLiveStates: false,
      }
    );
    expect(isolated.states["person.alex"].attributes).toEqual({});
    expect(live["person.alex"].state).toBe("home");
    const result = await dryRunAutomation(isolated, {
      conditions: [
        { condition: "state", entity_id: "person.alex", state: "not_home" },
      ],
      actions: [],
    });
    expect(result.conditions).toBe("pass");
  });
});

describe("incomplete isolated state conditions", () => {
  const isolated = () =>
    buildSimulationHass(live, {
      overrides: [{ entityId: "person.alex", state: "home" }],
      time: "22:00",
      useLiveStates: false,
    });
  it("reports missing attributes as unknown rather than comparing undefined", async () => {
    const result = await dryRunAutomation(isolated(), {
      conditions: [
        {
          condition: "state",
          entity_id: "person.alex",
          attribute: "latitude",
          state: "undefined",
        },
      ],
      actions: [],
    });
    expect(result.conditions).toBe("unknown");
    expect(result.steps[0].reason).toBe("attribute_not_found");
  });
  it("reports missing helper state references as unknown", async () => {
    const hass = isolated();
    hass.states["person.alex"].state = "input_select.location";
    const result = await dryRunAutomation(hass, {
      conditions: [
        {
          condition: "state",
          entity_id: "person.alex",
          state: "input_select.location",
        },
      ],
      actions: [],
    });
    expect(result.conditions).toBe("unknown");
    expect(result.steps[0].detail).toBe("input_select.location");
  });
  it("preserves dotted literal states that are not helper references", async () => {
    const hass = isolated();
    hass.states["person.alex"].state = "some.location";
    const result = await dryRunAutomation(hass, {
      conditions: [
        {
          condition: "state",
          entity_id: "person.alex",
          state: "some.location",
        },
      ],
      actions: [],
    });
    expect(result.conditions).toBe("pass");
  });
});

describe("ordered simulated expected states", () => {
  const hass = () =>
    buildSimulationHass(live, {
      overrides: [{ entityId: "person.alex", state: "home" }],
      time: "22:00",
      useLiveStates: false,
    });
  it("keeps a match before a missing helper reference", async () => {
    const result = await dryRunAutomation(hass(), {
      conditions: [
        {
          condition: "state",
          entity_id: "person.alex",
          state: ["home", "input_select.missing"],
        },
      ],
      actions: [],
    });
    expect(result.conditions).toBe("pass");
  });
  it("cannot decide when a missing helper precedes the matching value", async () => {
    const result = await dryRunAutomation(hass(), {
      conditions: [
        {
          condition: "state",
          entity_id: "person.alex",
          state: ["input_select.missing", "home"],
        },
      ],
      actions: [],
    });
    expect(result.conditions).toBe("unknown");
    expect(result.steps[0].detail).toBe("input_select.missing");
  });
});
