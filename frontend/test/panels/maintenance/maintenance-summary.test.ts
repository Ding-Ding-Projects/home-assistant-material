import { describe, expect, it } from "vitest";
import {
  sameItems,
  summarizeMaintenance,
} from "../../../src/panels/maintenance/maintenance-summary";
import type { HomeAssistant } from "../../../src/types";

const state = (entityId: string, value: string, deviceClass: string) =>
  [
    entityId,
    {
      entity_id: entityId,
      state: value,
      attributes: { device_class: deviceClass },
    },
  ] as const;

const build = (
  rows: (readonly [string, unknown])[],
  deviceIds: Record<string, string | undefined>
) => {
  const states = Object.fromEntries(rows) as unknown as HomeAssistant["states"];
  const entities = Object.fromEntries(
    Object.entries(deviceIds).map(([id, device_id]) => [id, { device_id }])
  ) as unknown as HomeAssistant["entities"];
  return { states, entities, ids: Object.keys(states) };
};

describe("summarizeMaintenance", () => {
  it("shows a device with two low battery entities once", () => {
    const { states, entities, ids } = build(
      [
        state("sensor.lock_battery", "10", "battery"),
        state("binary_sensor.lock_battery_low", "on", "battery"),
      ],
      {
        "sensor.lock_battery": "lock",
        "binary_sensor.lock_battery_low": "lock",
      }
    );
    const result = summarizeMaintenance(states, entities, ids, ids);
    expect(result.lowDevices).toHaveLength(1);
    expect(result.fineCount).toBe(0);
  });

  it("counts offline devices, not entities, and keeps problem sensors out of the device count", () => {
    const { states, entities, ids } = build(
      [
        state("sensor.a_battery", "unavailable", "battery"),
        state("binary_sensor.a_low", "unavailable", "battery"),
        state("binary_sensor.a_problem", "unavailable", "problem"),
        state("binary_sensor.b_problem", "unavailable", "problem"),
      ],
      {
        "sensor.a_battery": "a",
        "binary_sensor.a_low": "a",
        "binary_sensor.a_problem": "a",
        "binary_sensor.b_problem": "b",
      }
    );
    const result = summarizeMaintenance(states, entities, ids, []);
    expect(result.offlineDevices).toEqual(["sensor.a_battery"]);
    expect(result.offlineSensors).toEqual(["binary_sensor.b_problem"]);
  });

  it("does not count unknown readings as fine", () => {
    const { states, entities, ids } = build(
      [
        state("sensor.x_battery", "unknown", "battery"),
        state("sensor.y_battery", "80", "battery"),
        state("sensor.z_battery", "unknown", "battery"),
        state("binary_sensor.z_low", "off", "battery"),
      ],
      {
        "sensor.x_battery": "x",
        "sensor.y_battery": "y",
        "sensor.z_battery": "z",
        "binary_sensor.z_low": "z",
      }
    );
    const result = summarizeMaintenance(states, entities, ids, []);
    expect(result.unknownCount).toBe(1);
    expect(result.fineCount).toBe(2);
  });

  it("lists one problem row per device and treats entities without a device separately", () => {
    const { states, entities, ids } = build(
      [
        state("binary_sensor.p1", "on", "problem"),
        state("binary_sensor.p2", "on", "problem"),
        state("binary_sensor.p3", "on", "problem"),
        state("binary_sensor.p4", "off", "problem"),
      ],
      {
        "binary_sensor.p1": "d",
        "binary_sensor.p2": "d",
        "binary_sensor.p3": undefined,
        "binary_sensor.p4": undefined,
      }
    );
    const result = summarizeMaintenance(states, entities, ids, []);
    expect(result.problemDevices).toEqual([
      "binary_sensor.p1",
      "binary_sensor.p3",
    ]);
  });
});

describe("sameItems", () => {
  it("compares by identity, element by element", () => {
    const a = {};
    expect(sameItems([a], [a])).toBe(true);
    expect(sameItems([a], [{}])).toBe(false);
    expect(sameItems([a], [a, a])).toBe(false);
  });
});
