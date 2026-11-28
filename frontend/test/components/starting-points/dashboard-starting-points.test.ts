import { describe, expect, it } from "vitest";
import { dashboardStarterSections } from "../../../src/components/starting-points/dashboard-starting-points";
import type { HomeAssistant } from "../../../src/types";

const hass = {
  areas: {},
  entities: { "switch.hidden": { hidden: true } },
  states: Object.fromEntries(
    [
      ["switch.hidden", ""],
      ["switch.fan", ""],
      ["light.desk", ""],
      ["sensor.power", "power"],
      ["sensor.energy", "energy"],
      ["sensor.warmth", "temperature"],
    ].map(([id, deviceClass]) => [
      id,
      { entity_id: id, attributes: { device_class: deviceClass } },
    ])
  ),
} as unknown as HomeAssistant;

describe("dashboard starting points", () => {
  it("builds wall controls only for visible switchable devices", async () => {
    expect(await dashboardStarterSections("tablet", hass, "")).toEqual([
      {
        type: "grid",
        cards: [
          { type: "button", entity: "light.desk" },
          { type: "button", entity: "switch.fan" },
        ],
      },
    ]);
  });

  it("uses the device class for energy tiles", async () => {
    expect(await dashboardStarterSections("energy", hass, "")).toEqual([
      {
        type: "grid",
        cards: [
          { type: "tile", entity: "sensor.energy" },
          { type: "tile", entity: "sensor.power" },
        ],
      },
    ]);
  });

  it("creates no sections when empty or a room disappears", async () => {
    expect(await dashboardStarterSections("empty", hass, "")).toEqual([]);
    expect(await dashboardStarterSections("room", hass, "deleted")).toEqual([]);
  });
});
