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
