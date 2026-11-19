import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  buildAutomationControls,
  buildDeviceControls,
  CONDITION_EDITORS,
  DEVICE_EDITORS,
  resolveAutomationEditor,
  resolveDeviceEditor,
  TRIGGER_EDITORS,
} from "../../../src/components/automation-editors";
import {
  entryKeys,
  hiddenKeys,
} from "../../../src/components/automation-editors/helpers";
import type {
  AutomationEditorContext,
  QuickControl,
} from "../../../src/components/automation-editors/types";

// Written by hand from the integrations' triggers.yaml and conditions.yaml.
const TRIGGERS = [
  "air_quality.gas_detected",
  "air_quality.gas_cleared",
  "air_quality.co_detected",
  "air_quality.co_cleared",
  "air_quality.smoke_detected",
  "air_quality.smoke_cleared",
  "air_quality.co_changed",
  "air_quality.co_crossed_threshold",
  "air_quality.co2_changed",
  "air_quality.co2_crossed_threshold",
  "air_quality.pm1_changed",
  "air_quality.pm1_crossed_threshold",
  "air_quality.pm25_changed",
  "air_quality.pm25_crossed_threshold",
  "air_quality.pm4_changed",
  "air_quality.pm4_crossed_threshold",
  "air_quality.pm10_changed",
  "air_quality.pm10_crossed_threshold",
  "air_quality.ozone_changed",
  "air_quality.ozone_crossed_threshold",
  "air_quality.voc_changed",
  "air_quality.voc_crossed_threshold",
  "air_quality.voc_ratio_changed",
  "air_quality.voc_ratio_crossed_threshold",
  "air_quality.no_changed",
  "air_quality.no_crossed_threshold",
  "air_quality.no2_changed",
  "air_quality.no2_crossed_threshold",
  "air_quality.n2o_changed",
  "air_quality.n2o_crossed_threshold",
  "air_quality.so2_changed",
  "air_quality.so2_crossed_threshold",
  "air_quality.radon_changed",
  "air_quality.radon_crossed_threshold",
  "alarm_control_panel.armed",
  "alarm_control_panel.armed_away",
  "alarm_control_panel.armed_home",
  "alarm_control_panel.armed_night",
  "alarm_control_panel.armed_vacation",
  "alarm_control_panel.disarmed",
  "alarm_control_panel.triggered",
  "assist_satellite.idle",
  "assist_satellite.listening",
  "assist_satellite.processing",
  "assist_satellite.responding",
  "battery.became_low",
  "battery.no_longer_low",
  "battery.started_charging",
  "battery.stopped_charging",
  "battery.level_changed",
  "battery.level_crossed_threshold",
  "button.pressed",
  "calendar.event_started",
  "calendar.event_ended",
  "climate.started_cooling",
  "climate.started_drying",
  "climate.started_heating",
  "climate.turned_off",
  "climate.turned_on",
  "climate.hvac_mode_changed",
  "climate.target_humidity_changed",
  "climate.target_humidity_crossed_threshold",
  "climate.target_temperature_changed",
  "climate.target_temperature_crossed_threshold",
  "counter.incremented",
  "counter.decremented",
  "counter.maximum_reached",
  "counter.minimum_reached",
  "counter.reset",
  "cover.awning_closed",
  "cover.awning_opened",
  "cover.blind_closed",
  "cover.blind_opened",
  "cover.curtain_closed",
  "cover.curtain_opened",
  "cover.shade_closed",
  "cover.shade_opened",
  "cover.shutter_closed",
  "cover.shutter_opened",
  "door.closed",
  "door.opened",
  "doorbell.rang",
  "event.received",
  "fan.turned_on",
  "fan.turned_off",
  "fumis.fuel_became_low",
  "garage_door.closed",
  "garage_door.opened",
  "gate.closed",
  "gate.opened",
  "homeassistant.host_reboot_required",
  "homeassistant.restart_required",
  "homeassistant.updated",
  "humidifier.started_drying",
  "humidifier.started_humidifying",
  "humidifier.turned_on",
  "humidifier.turned_off",
  "humidifier.mode_changed",
  "humidity.changed",
  "humidity.crossed_threshold",
  "illuminance.detected",
  "illuminance.cleared",
  "illuminance.changed",
  "illuminance.crossed_threshold",
  "knx.telegram",
  "lawn_mower.returned_to_dock",
  "lawn_mower.errored",
  "lawn_mower.paused_mowing",
  "lawn_mower.started_mowing",
  "lawn_mower.started_returning",
  "lawn_mower.became_idle",
  "light.turned_on",
  "light.turned_off",
  "light.brightness_changed",
  "light.brightness_crossed_threshold",
  "lock.jammed",
  "lock.locked",
  "lock.opened",
  "lock.unlocked",
  "media_player.muted",
  "media_player.unmuted",
  "media_player.paused_playing",
  "media_player.started_playing",
  "media_player.stopped_playing",
  "media_player.turned_off",
  "media_player.turned_on",
  "media_player.volume_changed",
  "media_player.volume_crossed_threshold",
  "moisture.detected",
  "moisture.cleared",
  "moisture.changed",
  "moisture.crossed_threshold",
  "moon.phase_changed",
  "motion.detected",
  "motion.cleared",
  "mqtt._",
  "occupancy.detected",
  "occupancy.cleared",
  "power.changed",
  "power.crossed_threshold",
  "remote.turned_off",
  "remote.turned_on",
  "scene.activated",
  "schedule.block_ended",
  "schedule.block_started",
  "select.selection_changed",
  "siren.turned_off",
  "siren.turned_on",
  "sun.sunrise",
  "sun.sunset",
  "sun.solar_noon",
  "sun.solar_midnight",
  "sun.dawn",
  "sun.dusk",
  "sun.golden_hour_started",
  "sun.golden_hour_ended",
  "sun.blue_hour_started",
  "sun.blue_hour_ended",
  "sun.midnight_sun_started",
  "sun.midnight_sun_ended",
  "sun.polar_night_started",
  "sun.polar_night_ended",
  "sun.elevation_changed",
  "sun.elevation_crossed_threshold",
  "switch.turned_off",
  "switch.turned_on",
  "temperature.changed",
  "temperature.crossed_threshold",
  "text.changed",
  "timer.cancelled",
  "timer.finished",
  "timer.paused",
  "timer.restarted",
  "timer.started",
  "timer.remaining_time_reached",
  "todo.item_added",
  "todo.item_completed",
  "todo.item_removed",
  "ttc.departure_within",
  "ttc.lift_changed",
  "ttc.new_alert",
  "ttc.route_delayed",
  "ttc.route_resumed",
  "ttc.time_to_leave",
  "update.became_available",
  "vacuum.returned_to_dock",
  "vacuum.errored",
  "vacuum.paused_cleaning",
  "vacuum.started_cleaning",
  "vacuum.started_returning",
  "valve.closed",
  "valve.opened",
  "vibration.detected",
  "vibration.cleared",
  "water_heater.operation_mode_changed",
  "water_heater.turned_off",
  "water_heater.turned_on",
  "water_heater.target_temperature_changed",
  "water_heater.target_temperature_crossed_threshold",
  "webostv.turn_on",
  "window.closed",
  "window.opened",
  "zone.entered",
  "zone.left",
  "zone.occupancy_detected",
  "zone.occupancy_cleared",
  "zwave_js.event",
  "zwave_js.value_updated",
];

const CONDITIONS = [
  "air_quality.is_gas_detected",
  "air_quality.is_gas_cleared",
  "air_quality.is_co_detected",
  "air_quality.is_co_cleared",
  "air_quality.is_smoke_detected",
  "air_quality.is_smoke_cleared",
  "air_quality.is_co_value",
  "air_quality.is_ozone_value",
  "air_quality.is_voc_value",
  "air_quality.is_voc_ratio_value",
  "air_quality.is_no_value",
  "air_quality.is_no2_value",
  "air_quality.is_so2_value",
  "air_quality.is_radon_value",
  "air_quality.is_co2_value",
  "air_quality.is_pm1_value",
  "air_quality.is_pm25_value",
  "air_quality.is_pm4_value",
  "air_quality.is_pm10_value",
  "air_quality.is_n2o_value",
  "alarm_control_panel.is_armed",
  "alarm_control_panel.is_armed_away",
  "alarm_control_panel.is_armed_home",
  "alarm_control_panel.is_armed_night",
  "alarm_control_panel.is_armed_vacation",
  "alarm_control_panel.is_disarmed",
  "alarm_control_panel.is_triggered",
  "assist_satellite.is_idle",
  "assist_satellite.is_listening",
  "assist_satellite.is_processing",
  "assist_satellite.is_responding",
  "battery.is_low",
  "battery.is_not_low",
  "battery.is_charging",
  "battery.is_not_charging",
  "battery.is_level",
  "calendar.is_event_active",
  "climate.is_off",
  "climate.is_on",
  "climate.is_cooling",
  "climate.is_drying",
  "climate.is_heating",
  "climate.is_hvac_mode",
  "climate.is_target_humidity",
  "climate.is_target_temperature",
  "counter.is_value",
  "cover.awning_is_closed",
  "cover.awning_is_open",
  "cover.blind_is_closed",
  "cover.blind_is_open",
  "cover.curtain_is_closed",
  "cover.curtain_is_open",
  "cover.shade_is_closed",
  "cover.shade_is_open",
  "cover.shutter_is_closed",
  "cover.shutter_is_open",
  "door.is_closed",
  "door.is_open",
  "fan.is_off",
  "fan.is_on",
  "garage_door.is_closed",
  "garage_door.is_open",
  "gate.is_closed",
  "gate.is_open",
  "homeassistant.host_reboot_required",
  "homeassistant.restart_required",
  "humidifier.is_off",
  "humidifier.is_on",
  "humidifier.is_drying",
  "humidifier.is_humidifying",
  "humidifier.is_mode",
  "humidifier.is_target_humidity",
  "humidity.is_value",
  "illuminance.is_detected",
  "illuminance.is_not_detected",
  "illuminance.is_value",
  "lawn_mower.is_docked",
  "lawn_mower.is_encountering_an_error",
  "lawn_mower.is_idle",
  "lawn_mower.is_mowing",
  "lawn_mower.is_paused",
  "lawn_mower.is_returning",
  "light.is_off",
  "light.is_on",
  "light.is_brightness",
  "lock.is_jammed",
  "lock.is_locked",
  "lock.is_open",
  "lock.is_unlocked",
  "media_player.is_muted",
  "media_player.is_off",
  "media_player.is_on",
  "media_player.is_not_playing",
  "media_player.is_paused",
  "media_player.is_playing",
  "media_player.is_unmuted",
  "media_player.is_current_source",
  "media_player.is_volume",
  "moisture.is_detected",
  "moisture.is_not_detected",
  "moisture.is_value",
  "moon.is_phase",
  "moon.is_waxing",
  "moon.is_waning",
  "motion.is_detected",
  "motion.is_not_detected",
  "occupancy.is_detected",
  "occupancy.is_not_detected",
  "power.is_value",
  "remote.is_off",
  "remote.is_on",
  "schedule.is_off",
  "schedule.is_on",
  "select.is_option_selected",
  "siren.is_off",
  "siren.is_on",
  "sun.is_up",
  "sun.is_set",
  "sun.is_ascending",
  "sun.is_descending",
  "sun.is_night",
  "sun.is_golden_hour",
  "sun.is_blue_hour",
  "sun.is_midnight_sun",
  "sun.is_polar_night",
  "sun.elevation",
  "sun.is_morning_twilight",
  "sun.is_evening_twilight",
  "switch.is_off",
  "switch.is_on",
  "temperature.is_value",
  "text.is_equal_to",
  "timer.is_active",
  "timer.is_paused",
  "timer.is_idle",
  "todo.all_completed",
  "todo.incomplete",
  "ttc.route_has_problem",
  "ttc.station_is_step_free",
  "update.is_available",
  "update.is_not_available",
  "vacuum.is_cleaning",
  "vacuum.is_docked",
  "vacuum.is_encountering_an_error",
  "vacuum.is_paused",
  "vacuum.is_returning",
  "valve.is_open",
  "valve.is_closed",
  "vibration.is_detected",
  "vibration.is_not_detected",
  "water_heater.is_off",
  "water_heater.is_on",
  "water_heater.is_operation_mode",
  "water_heater.is_target_temperature",
  "window.is_closed",
  "window.is_open",
  "zone.in_zone",
  "zone.not_in_zone",
  "zone.occupancy_is_detected",
  "zone.occupancy_is_not_detected",
  "zwave_js.node_status",
  "zwave_js.config_parameter",
  "zwave_js.value",
];

// Every device_trigger.py, device_condition.py and device_action.py, by hand.
const DEVICE_AUTOMATIONS = [
  "alarm_control_panel.action",
  "alarm_control_panel.condition",
  "alarm_control_panel.trigger",
  "arcam_fmj.trigger",
  "binary_sensor.condition",
  "binary_sensor.trigger",
  "bthome.trigger",
  "button.action",
  "button.trigger",
  "climate.action",
  "climate.condition",
  "climate.trigger",
  "cover.action",
  "cover.condition",
  "cover.trigger",
  "deconz.trigger",
  "device_tracker.condition",
  "device_tracker.trigger",
  "fan.action",
  "fan.condition",
  "fan.trigger",
  "homekit_controller.trigger",
  "hue.trigger",
  "humidifier.action",
  "humidifier.condition",
  "humidifier.trigger",
  "knx.trigger",
  "kodi.trigger",
  "lcn.trigger",
  "lg_netcast.trigger",
  "light.action",
  "light.condition",
  "light.trigger",
  "lock.action",
  "lock.condition",
  "lock.trigger",
  "lutron_caseta.trigger",
  "media_player.condition",
  "media_player.trigger",
  "mobile_app.action",
  "mqtt.trigger",
  "nest.trigger",
  "netatmo.trigger",
  "number.action",
  "nut.action",
  "philips_js.trigger",
  "remote.action",
  "remote.condition",
  "remote.trigger",
  "rfxtrx.action",
  "rfxtrx.trigger",
  "samsungtv.trigger",
  "select.action",
  "select.condition",
  "select.trigger",
  "sensor.condition",
  "sensor.trigger",
  "shelly.trigger",
  "switch.action",
  "switch.condition",
  "switch.trigger",
  "tasmota.trigger",
  "text.action",
  "update.trigger",
  "vacuum.action",
  "vacuum.condition",
  "vacuum.trigger",
  "water_heater.action",
  "webostv.trigger",
  "wemo.trigger",
  "xiaomi_ble.trigger",
  "yolink.trigger",
  "zha.action",
  "zha.trigger",
  "zwave_js.action",
  "zwave_js.condition",
  "zwave_js.trigger",
];

const ctx = (
  kind: "trigger" | "condition",
  id: string,
  data: Record<string, unknown> = {},
  extra: Partial<AutomationEditorContext> = {}
): AutomationEditorContext => ({
  kind,
  id,
  data,
  fields: {},
  entities: [],
  ...extra,
});

const controls = (
  kind: "trigger" | "condition",
  id: string,
  data: Record<string, unknown> = {}
): QuickControl[] =>
  resolveAutomationEditor(kind, id)!.controls(ctx(kind, id, data));

const byKey = (list: QuickControl[], key: string) =>
  list.find((c) => c.key === key);

describe("coverage by hand-written lists", () => {
  it("lists the expected number of triggers, conditions and device automations", () => {
    expect(TRIGGERS).toHaveLength(208);
    expect(CONDITIONS).toHaveLength(163);
    expect(DEVICE_AUTOMATIONS).toHaveLength(77);
  });

  it.each(TRIGGERS)("trigger %s has a tailored editor", (id) => {
    const item = TRIGGER_EDITORS[id];
    expect(item, id).toBeDefined();
    expect(item.kind).toBe("trigger");
    expect(item.id).toBe(id);
  });

  it.each(CONDITIONS)("condition %s has a tailored editor", (id) => {
    const item = CONDITION_EDITORS[id];
    expect(item, id).toBeDefined();
    expect(item.kind).toBe("condition");
  });

  it.each(DEVICE_AUTOMATIONS)(
    "device automation %s has a tailored editor",
    (key) => {
      const item = DEVICE_EDITORS[key];
      expect(item, key).toBeDefined();
      expect(`${item.domain}.${item.kind}`).toBe(key);
    }
  );

  it("has no editor that the hand-written lists do not name", () => {
    expect(Object.keys(TRIGGER_EDITORS).sort()).toEqual([...TRIGGERS].sort());
    expect(Object.keys(CONDITION_EDITORS).sort()).toEqual(
      [...CONDITIONS].sort()
    );
    expect(Object.keys(DEVICE_EDITORS).sort()).toEqual(
      [...DEVICE_AUTOMATIONS].sort()
    );
  });
});

describe("coverage against the integration sources", () => {
  const components = join(
    __dirname,
    "../../../../core/homeassistant/components"
  );
  const available = existsSync(components);

  const readYaml = (file: string, kind: string) => {
    const found: string[] = [];
    readdirSync(components).forEach((domain) => {
      const path = join(components, domain, file);
      if (!existsSync(path)) return;
      const doc = load(readFileSync(path, "utf8")) as Record<string, unknown>;
      Object.keys(doc ?? {})
        .filter((name) => !name.startsWith("."))
        .forEach((name) => found.push(`${domain}.${name}`));
    });
    expect(found.length, kind).toBeGreaterThan(0);
    return found;
  };

  it.skipIf(!available)("every triggers.yaml entry has an editor", () => {
    readYaml("triggers.yaml", "triggers").forEach((id) => {
      expect(TRIGGER_EDITORS[id], id).toBeDefined();
    });
  });

  it.skipIf(!available)("every conditions.yaml entry has an editor", () => {
    readYaml("conditions.yaml", "conditions").forEach((id) => {
      expect(CONDITION_EDITORS[id], id).toBeDefined();
    });
  });

  it.skipIf(!available)("every device automation file has an editor", () => {
    readdirSync(components).forEach((domain) => {
      ["trigger", "condition", "action"].forEach((kind) => {
        if (existsSync(join(components, domain, `device_${kind}.py`))) {
          expect(
            DEVICE_EDITORS[`${domain}.${kind}`],
            `${domain}.${kind}`
          ).toBeDefined();
        }
      });
    });
  });
});

describe("controls of sample triggers and conditions", () => {
  it("draws a numeric trigger with behavior, a threshold and a hold time", () => {
    const list = controls("trigger", "light.brightness_crossed_threshold");
    expect(list.map((c) => c.key)).toEqual(["behavior", "threshold", "for"]);
    const behavior = byKey(list, "behavior") as Extract<
      QuickControl,
      { kind: "selector" }
    >;
    expect(behavior.selector).toEqual({
      automation_behavior: { mode: "trigger" },
    });
    const threshold = byKey(list, "threshold") as Extract<
      QuickControl,
      { kind: "selector" }
    >;
    const config = (threshold.selector as any).numeric_threshold;
    expect(config.mode).toBe("crossed");
    expect(config.number).toMatchObject({ min: 0, max: 100, mode: "slider" });
    expect(config.entity.map((e: any) => e.domain)).toEqual([
      "input_number",
      "number",
      "sensor",
    ]);
    expect(byKey(list, "for")).toMatchObject({
      kind: "duration",
      format: "hms",
    });
  });

  it("uses condition behavior for conditions", () => {
    const behavior = byKey(
      controls("condition", "light.is_on"),
      "behavior"
    ) as any;
    expect(behavior.selector.automation_behavior.mode).toBe("condition");
  });

  it("gives sun events a twilight type and a signed offset", () => {
    const list = controls("trigger", "sun.dawn");
    expect(list.map((c) => c.key)).toEqual(["type", "offset"]);
    const type = byKey(list, "type") as Extract<
      QuickControl,
      { kind: "tiles" }
    >;
    expect(type.options.map((o) => o.value)).toEqual([
      "civil",
      "nautical",
      "astronomical",
    ]);
    const offset = byKey(list, "offset") as any;
    expect(offset.selector.duration).toEqual({
      enable_day: true,
      mode: "offset",
    });
  });

  it("shows the nine moon phases as tiles", () => {
    const phase = byKey(
      controls("trigger", "moon.phase_changed"),
      "phase"
    ) as any;
    expect(phase.kind).toBe("tiles");
    expect(phase.options).toHaveLength(9);
    const condition = byKey(
      controls("condition", "moon.is_phase"),
      "phase"
    ) as any;
    expect(condition.options).toHaveLength(8);
  });

  it("offers every HVAC mode as a ticked list", () => {
    const mode = byKey(
      controls("trigger", "climate.hvac_mode_changed"),
      "hvac_mode"
    ) as any;
    expect(mode.selector.select.multiple).toBe(true);
    expect(mode.selector.select.options.map((o: any) => o.value)).toEqual([
      "off",
      "heat",
      "cool",
      "heat_cool",
      "auto",
      "dry",
      "fan_only",
    ]);
  });

  it("draws zones with the entity control", () => {
    expect(byKey(controls("trigger", "zone.entered"), "zone")).toMatchObject({
      kind: "entities",
      domain: "zone",
      multiple: false,
    });
    expect(byKey(controls("condition", "zone.in_zone"), "zone")).toMatchObject({
      kind: "entities",
      domain: "zone",
    });
  });

  it("draws the knx telegram filter with switches and a group address list", () => {
    const list = controls("trigger", "knx.telegram");
    expect(list.filter((c) => c.kind === "switch").map((c) => c.key)).toEqual([
      "group_value_write",
      "group_value_response",
      "group_value_read",
      "incoming",
      "outgoing",
    ]);
    expect((byKey(list, "destination") as any).selector.text.multiple).toBe(
      true
    );
  });

  it("draws the timer remaining time as a duration", () => {
    expect(
      byKey(controls("trigger", "timer.remaining_time_reached"), "remaining")
    ).toMatchObject({ kind: "selector", selector: { duration: {} } });
  });

  it("draws Z-Wave command classes as a searchable list and endpoints as numbers", () => {
    const list = controls("trigger", "zwave_js.value_updated");
    expect(byKey(list, "command_class")).toMatchObject({
      kind: "selector",
      valueType: "list",
    });
    expect(byKey(list, "endpoint")).toMatchObject({ kind: "stepper", min: 0 });
    expect(byKey(list, "device_id")).toMatchObject({
      kind: "selector",
      valueType: "list",
    });
    expect(
      byKey(controls("condition", "zwave_js.node_status"), "status")
    ).toMatchObject({ kind: "tiles" });
  });

  it("keeps entry keys in required-first order with the hold time last", () => {
    const keys = entryKeys(TRIGGER_EDITORS["zwave_js.event"]);
    expect(keys[0]).toBe("event_source");
    expect(keys.indexOf("event")).toBeLessThan(keys.indexOf("event_data"));
  });
});

describe("stored values", () => {
  it("shows a stored value and keeps one the list does not know", () => {
    const type = byKey(
      controls("trigger", "sun.dawn", { type: "polar" }),
      "type"
    ) as any;
    expect(type.value).toBe("polar");
    expect(type.options.map((o: any) => o.value)).toContain("polar");
  });

  it("leaves a templated value to the text editor", () => {
    const list = controls("trigger", "light.brightness_crossed_threshold", {
      threshold: "{{ states('input_number.x') }}",
      for: "{{ 5 }}",
    });
    expect(byKey(list, "threshold")).toBeUndefined();
    expect(byKey(list, "for")).toBeUndefined();
  });

  it("keeps the stored shape of the hold time", () => {
    expect(
      byKey(controls("trigger", "light.turned_on", { for: 30 }), "for")
    ).toMatchObject({ kind: "duration", format: "seconds" });
    const object = byKey(
      controls("trigger", "light.turned_on", { for: { seconds: 5 } }),
      "for"
    ) as any;
    expect(object).toMatchObject({ kind: "selector", valueType: "duration" });
  });

  it("only offers fields the description declares", () => {
    const item = resolveAutomationEditor("trigger", "light.turned_on")!;
    const list = item.controls(
      ctx("trigger", "light.turned_on", {}, { fields: { for: {} } })
    );
    expect(list.map((c) => c.key)).toEqual(["for"]);
  });
});

describe("builder output", () => {
  it("collapses the hold time and hides behavior for a single target", () => {
    const set = buildAutomationControls(
      ctx("trigger", "light.turned_on", {}, { targetEntityCount: 1 })
    )!;
    expect(set.main.map((c) => c.key)).toEqual([]);
    expect(set.advanced.map((c) => c.key)).toEqual(["for"]);
    const several = buildAutomationControls(
      ctx("trigger", "light.turned_on", {}, { targetEntityCount: 3 })
    )!;
    expect(several.main.map((c) => c.key)).toEqual(["behavior"]);
    expect(
      hiddenKeys(ctx("trigger", "x", {}, { targetEntityCount: 0 }))
    ).toEqual(["behavior"]);
    expect(hiddenKeys(ctx("trigger", "x"))).toEqual([]);
  });

  it("returns nothing for ids no integration defines", () => {
    expect(
      resolveAutomationEditor("trigger", "example.nothing")
    ).toBeUndefined();
    expect(resolveAutomationEditor("condition", undefined)).toBeUndefined();
    expect(
      buildAutomationControls(ctx("trigger", "example.nothing"))
    ).toBeUndefined();
    expect(resolveDeviceEditor("trigger", "example")).toBeUndefined();
  });

  it("carries the target filter of each integration", () => {
    expect(
      TRIGGER_EDITORS["cover.awning_opened"]?.target ??
        CONDITION_EDITORS["cover.awning_is_open"].target
    ).toBeTruthy();
    expect(
      (CONDITION_EDITORS["cover.awning_is_open"].target as any).entity[0]
    ).toMatchObject({ domain: "cover", device_class: "awning" });
    expect(TRIGGER_EDITORS["homeassistant.updated"].target).toBeNull();
  });
});

describe("device automations", () => {
  const device = (
    kind: "trigger" | "condition" | "action",
    domain: string,
    type: string | undefined,
    data: Record<string, unknown> = {},
    attributes: Record<string, unknown> = {}
  ) =>
    buildDeviceControls({
      kind,
      domain,
      type,
      data,
      entities: [{ entity_id: `${domain}.x`, attributes }],
    })!;

  it("lists the climate trigger types and gives each type its own fields", () => {
    expect(DEVICE_EDITORS["climate.trigger"].types).toEqual([
      "current_temperature_changed",
      "current_humidity_changed",
      "hvac_mode_changed",
    ]);
    expect(
      device("trigger", "climate", "hvac_mode_changed").map((c) => c.key)
    ).toEqual(["to", "for"]);
    const humidity = device("trigger", "climate", "current_humidity_changed");
    expect(humidity.map((c) => c.key)).toEqual(["above", "below", "for"]);
    expect(humidity[0]).toMatchObject({ kind: "slider", min: 0, max: 100 });
    expect(
      device("trigger", "climate", "current_temperature_changed")[0]
    ).toMatchObject({ kind: "stepper" });
  });

  it("uses a position slider for cover actions and tiles for preset modes", () => {
    expect(device("action", "cover", "set_position")[0]).toMatchObject({
      kind: "slider",
      key: "position",
    });
    expect(device("action", "cover", "open")).toEqual([]);
    const preset = device(
      "condition",
      "climate",
      "is_preset_mode",
      {},
      { preset_modes: ["eco", "boost"] }
    )[0] as any;
    expect(preset.kind).toBe("tiles");
    expect(preset.options.map((o: any) => o.value)).toEqual(["eco", "boost"]);
    expect(device("condition", "climate", "is_preset_mode")[0]).toMatchObject({
      kind: "text",
    });
  });

  it("masks the alarm code and tells type lists from per-device lists", () => {
    expect(
      device("action", "alarm_control_panel", "arm_away")[0]
    ).toMatchObject({ kind: "text", inputType: "password" });
    expect(DEVICE_EDITORS["alarm_control_panel.trigger"].typeSource).toBe(
      "static"
    );
    expect(DEVICE_EDITORS["hue.trigger"]).toMatchObject({
      typeSource: "device",
      subtype: true,
    });
    expect(DEVICE_EDITORS["sensor.trigger"].entityDomain).toBe("sensor");
  });

  it("shows a sensor limit with the sensor's own unit", () => {
    const [above] = device(
      "trigger",
      "sensor",
      "temperature",
      {},
      { unit_of_measurement: "°C" }
    );
    expect(above).toMatchObject({ kind: "stepper", key: "above", unit: "°C" });
  });
});
