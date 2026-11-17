import { describe, expect, it } from "vitest";
import type {
  HealthInput,
  HealthStateObject,
} from "../../../../src/panels/config/device-health/device-health";
import {
  classifyDevices,
  countHealth,
  estimateDaysLeft,
  filterDevices,
  toggleFilter,
} from "../../../../src/panels/config/device-health/device-health";

// Protects the device health page: a device is only called low, silent, weak
// or healthy from evidence it really gives, the worst come first, and the
// numeral tiles filter the same list they count.

const NOW = Date.parse("2026-11-17T20:00:00Z");
const HOUR = 60 * 60 * 1000;
const iso = (ago: number) => new Date(NOW - ago).toISOString();

const state = (
  value: string,
  attributes: Record<string, unknown> = {},
  ago = 0
): HealthStateObject => ({
  state: value,
  last_updated: iso(ago),
  last_changed: iso(ago),
  attributes,
});

const build = (
  devices: string[],
  entities: Record<string, [string, string?]>,
  states: Record<string, HealthStateObject>
): HealthInput => ({
  devices: Object.fromEntries(
    devices.map((id) => [
      id,
      { id, name: `Device ${id}`, area_id: id === "a" ? "hall" : null },
    ])
  ),
  entities: Object.fromEntries(
    Object.entries(entities).map(([entityId, [deviceId, category]]) => [
      entityId,
      { entity_id: entityId, device_id: deviceId, entity_category: category },
    ])
  ),
  states,
  areas: { hall: { name: "Hallway" } },
  now: NOW,
});

const find = (items: ReturnType<typeof classifyDevices>, id: string) =>
  items.find((item) => item.deviceId === id)!;

describe("classifyDevices", () => {
  it("flags a low battery sensor at 20 percent and under", () => {
    const items = classifyDevices(
      build(
        ["a", "b"],
        {
          "sensor.a_battery": ["a"],
          "sensor.b_battery": ["b"],
        },
        {
          "sensor.a_battery": state("20", { device_class: "battery" }),
          "sensor.b_battery": state("21", { device_class: "battery" }),
        }
      )
    );
    expect(find(items, "a").lowBattery).toBe(true);
    expect(find(items, "a").area).toBe("Hallway");
    expect(find(items, "b").lowBattery).toBe(false);
    expect(find(items, "b").healthy).toBe(true);
  });

  it("flags a battery low binary sensor that is on", () => {
    const items = classifyDevices(
      build(
        ["a"],
        { "binary_sensor.a_low": ["a"] },
        { "binary_sensor.a_low": state("on", { device_class: "battery" }) }
      )
    );
    expect(find(items, "a").lowBattery).toBe(true);
    expect(find(items, "a").batteryFlagOnly).toBe(true);
  });

  it("calls a device silent when every main entity is unavailable", () => {
    const items = classifyDevices(
      build(
        ["a"],
        { "light.a": ["a"], "sensor.a_rssi": ["a", "diagnostic"] },
        {
          "light.a": state("unavailable", {}, 3 * HOUR),
          "sensor.a_rssi": state("-50", {
            device_class: "signal_strength",
            unit_of_measurement: "dBm",
          }),
        }
      )
    );
    expect(find(items, "a").silent).toBe(true);
    expect(find(items, "a").silentSince).toBe(NOW - 3 * HOUR);
    expect(find(items, "a").healthy).toBe(false);
  });

  it("calls a device silent when its measuring sensors are a day stale", () => {
    const items = classifyDevices(
      build(
        ["a", "b"],
        { "sensor.a_temp": ["a"], "sensor.b_temp": ["b"] },
        {
          "sensor.a_temp": state(
            "20",
            { state_class: "measurement" },
            25 * HOUR
          ),
          "sensor.b_temp": state(
            "20",
            { state_class: "measurement" },
            23 * HOUR
          ),
        }
      )
    );
    expect(find(items, "a").silent).toBe(true);
    expect(find(items, "b").silent).toBe(false);
  });

  it("does not call a quiet binary sensor silent", () => {
    const items = classifyDevices(
      build(
        ["a"],
        { "binary_sensor.a_door": ["a"] },
        { "binary_sensor.a_door": state("off", {}, 90 * HOUR) }
      )
    );
    expect(find(items, "a").silent).toBe(false);
    expect(find(items, "a").healthy).toBe(true);
  });

  it("applies a threshold per signal unit", () => {
    const items = classifyDevices(
      build(
        ["a", "b", "c", "d"],
        {
          "sensor.a_rssi": ["a"],
          "sensor.b_rssi": ["b"],
          "sensor.c_linkquality": ["c"],
          "sensor.d_signal": ["d"],
        },
        {
          "sensor.a_rssi": state("-81", {
            device_class: "signal_strength",
            unit_of_measurement: "dBm",
          }),
          "sensor.b_rssi": state("-70", {
            device_class: "signal_strength",
            unit_of_measurement: "dBm",
          }),
          "sensor.c_linkquality": state("40", { unit_of_measurement: "lqi" }),
          "sensor.d_signal": state("60", {
            device_class: "signal_strength",
            unit_of_measurement: "%",
          }),
        }
      )
    );
    expect(find(items, "a").weakSignal).toBe(true);
    expect(find(items, "b").weakSignal).toBe(false);
    expect(find(items, "c").weakSignal).toBe(true);
    expect(find(items, "d").weakSignal).toBe(false);
  });

  it("never guesses: a device without any entity does not report health", () => {
    const items = classifyDevices(build(["a"], {}, {}));
    expect(find(items, "a").noHealth).toBe(true);
    expect(find(items, "a").healthy).toBe(false);
  });

  it("leaves out disabled devices", () => {
    const input = build(["a"], {}, {});
    input.devices.a.disabled_by = "user";
    expect(classifyDevices(input)).toHaveLength(0);
  });

  it("orders the worst first: silent, battery by level, signal, healthy", () => {
    const items = classifyDevices(
      build(
        ["ok", "bat5", "bat15", "quiet", "weak", "none"],
        {
          "light.ok": ["ok"],
          "sensor.bat5": ["bat5"],
          "sensor.bat15": ["bat15"],
          "light.quiet": ["quiet"],
          "sensor.weak": ["weak"],
        },
        {
          "light.ok": state("on"),
          "sensor.bat5": state("5", { device_class: "battery" }),
          "sensor.bat15": state("15", { device_class: "battery" }),
          "light.quiet": state("unavailable"),
          "sensor.weak": state("-90", {
            device_class: "signal_strength",
            unit_of_measurement: "dBm",
          }),
        }
      )
    );
    expect(items.map((item) => item.deviceId)).toEqual([
      "quiet",
      "bat5",
      "bat15",
      "weak",
      "ok",
      "none",
    ]);
  });
});

describe("tiles", () => {
  const items = classifyDevices(
    build(
      ["a", "b", "c"],
      {
        "sensor.a_battery": ["a"],
        "light.b": ["b"],
        "light.c": ["c"],
      },
      {
        "sensor.a_battery": state("10", { device_class: "battery" }),
        "light.b": state("unavailable"),
        "light.c": state("on"),
      }
    )
  );

  it("counts each group", () => {
    expect(countHealth(items)).toMatchObject({
      low_battery: 1,
      silent: 1,
      weak_signal: 0,
      healthy: 1,
      attention: 2,
    });
  });

  it("filters the list and clears when the same tile is pressed again", () => {
    const pressed = toggleFilter(undefined, "silent");
    expect(pressed).toBe("silent");
    expect(filterDevices(items, pressed).map((item) => item.deviceId)).toEqual([
      "b",
    ]);
    expect(toggleFilter(pressed, "silent")).toBeUndefined();
    expect(filterDevices(items, undefined)).toHaveLength(3);
    expect(filterDevices(items, "healthy").map((i) => i.deviceId)).toEqual([
      "c",
    ]);
  });
});

describe("estimateDaysLeft", () => {
  const day = 24 * HOUR;
  it("estimates from a steady fall", () => {
    const points = [0, 1, 2, 3, 4].map((n) => ({
      start: n * day,
      mean: 30 - n * 2,
    }));
    // Falls 2 percent a day, now at 22: eleven days.
    expect(estimateDaysLeft(points, 22)).toBe(11);
  });

  it("gives no estimate for a flat, rising or short record", () => {
    const flat = [0, 1, 2, 3].map((n) => ({ start: n * day, mean: 15 }));
    const rising = [0, 1, 2, 3].map((n) => ({ start: n * day, mean: 5 + n }));
    expect(estimateDaysLeft(flat, 15)).toBeUndefined();
    expect(estimateDaysLeft(rising, 8)).toBeUndefined();
    expect(
      estimateDaysLeft(
        [
          { start: 0, mean: 20 },
          { start: day, mean: 18 },
        ],
        18
      )
    ).toBeUndefined();
  });
});
