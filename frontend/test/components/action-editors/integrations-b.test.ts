import { describe, expect, it } from "vitest";
import { INTEGRATION_EDITORS_B } from "../../../src/components/action-editors/domains/integrations/b";
import type {
  QuickContext,
  QuickControl,
  QuickFieldInfo,
} from "../../../src/components/action-editors/quick-types";

/**
 * Every field each service declares in its services.yaml, written out by
 * hand. The first part of the name is the integration, the rest the service.
 */
const EXPECTED: Record<string, string[]> = {
  "duckdns.set_txt": ["config_entry_id", "txt"],
  "dynalite.request_area_preset": ["host", "area", "channel"],
  "dynalite.request_channel_level": ["host", "area", "channel"],
  "easyenergy.get_gas_prices": [
    "config_entry",
    "incl_vat",
    "price_type",
    "start",
    "end",
  ],
  "easyenergy.get_energy_usage_prices": [
    "config_entry",
    "incl_vat",
    "granularity",
    "price_type",
    "start",
    "end",
  ],
  "easyenergy.get_energy_return_prices": [
    "config_entry",
    "granularity",
    "start",
    "end",
  ],
  "ebusd.write": ["call"],
  "ecobee.create_vacation": [
    "entity_id",
    "vacation_name",
    "cool_temp",
    "heat_temp",
    "start_date",
    "start_time",
    "end_date",
    "end_time",
    "fan_mode",
    "fan_min_on_time",
  ],
  "ecobee.delete_vacation": ["entity_id", "vacation_name"],
  "ecobee.resume_program": ["entity_id", "resume_all"],
  "ecobee.set_fan_min_on_time": ["entity_id", "fan_min_on_time"],
  "ecobee.set_dst_mode": ["dst_enabled"],
  "ecobee.set_mic_mode": ["mic_enabled"],
  "ecobee.set_occupancy_modes": ["auto_away", "follow_me"],
  "ecobee.set_sensors_used_in_climate": ["preset_mode", "device_ids"],
  "ecosmart.get_forecasts": ["device_id"],
  "ecovacs.raw_get_positions": [],
  "elgato.identify": [],
  "elkm1.alarm_bypass": ["code"],
  "elkm1.alarm_clear_bypass": ["code"],
  "elkm1.alarm_arm_home_instant": ["code"],
  "elkm1.alarm_arm_night_instant": ["code"],
  "elkm1.alarm_arm_vacation": ["code"],
  "elkm1.alarm_display_message": ["clear", "beep", "timeout", "line1", "line2"],
  "elkm1.set_time": ["prefix"],
  "elkm1.speak_phrase": ["number", "prefix"],
  "elkm1.speak_word": ["number", "prefix"],
  "elkm1.sensor_counter_refresh": [],
  "elkm1.sensor_counter_set": ["value"],
  "elkm1.sensor_zone_bypass": ["code"],
  "elkm1.sensor_zone_trigger": [],
  "elkm1.switch_output_turn_on_for": ["duration"],
  "energyzero.get_gas_prices": ["config_entry", "incl_vat", "start", "end"],
  "energyzero.get_energy_prices": [
    "config_entry",
    "incl_vat",
    "price_type",
    "interval",
    "start",
    "end",
  ],
  "environment_canada.get_alerts": ["config_entry_id"],
  "environment_canada.get_forecasts": [],
  "environment_canada.get_precipitation_forecast": [
    "config_entry_id",
    "precip_type",
    "past_minutes",
    "future_minutes",
    "hourly_hours",
  ],
  "environment_canada.set_radar_type": ["radar_type"],
  "envisalink.alarm_keypress": ["keypress"],
  "envisalink.invoke_custom_function": ["partition", "pgm"],
  "epson.select_cmode": ["cmode"],
  "eurotronic_cometblue.get_schedule": [],
  "eurotronic_cometblue.set_schedule": [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ],
  "eurotronic_cometblue.set_holiday": ["from", "to", "temperature"],
  "evohome.set_system_mode": ["mode", "period", "duration"],
  "evohome.refresh_system": [],
  "evohome.set_zone_override": ["setpoint", "duration"],
  "evohome.set_dhw_override": ["state", "duration"],
  "ezviz.set_alarm_detection_sensibility": ["level", "type_value"],
  "ezviz.wake_device": [],
  "ffmpeg.restart": ["entity_id"],
  "ffmpeg.start": ["entity_id"],
  "ffmpeg.stop": ["entity_id"],
  "file.read_file": ["file_name", "file_encoding"],
  "filter.reload": [],
  "flo.set_sleep_mode": ["sleep_minutes", "revert_to_mode"],
  "flo.set_away_mode": [],
  "flo.set_home_mode": [],
  "flo.run_health_test": [],
  "flume.list_notifications": ["config_entry"],
  "flux_led.set_custom_effect": ["colors", "speed_pct", "transition"],
  "flux_led.set_zones": ["colors", "speed_pct", "effect"],
  "flux_led.set_music_mode": [
    "sensitivity",
    "brightness",
    "light_screen",
    "effect",
    "foreground_color",
    "background_color",
  ],
  "forecast_solar.get_forecast": ["config_entry", "start", "end", "resolution"],
  "foscam.ptz": ["movement", "travel_time"],
  "foscam.ptz_preset": ["preset_name"],
  "foursquare.checkin": [
    "alt",
    "altAcc",
    "broadcast",
    "eventId",
    "ll",
    "llAcc",
    "mentions",
    "shout",
    "venueId",
  ],
  "fritz.set_guest_wifi_password": ["device_id", "password", "length"],
  "fritz.dial": ["device_id", "number", "max_ring_seconds"],
  "fully_kiosk.load_url": ["device_id", "url"],
  "fully_kiosk.set_config": ["device_id", "key", "value"],
  "fully_kiosk.start_application": ["application", "device_id"],
  "generic.reload": [],
  "generic_thermostat.reload": [],
  "geniushub.set_zone_mode": ["entity_id", "mode"],
  "geniushub.set_zone_override": ["entity_id", "temperature", "duration"],
  "geniushub.set_switch_override": ["duration"],
  "google.add_event": [
    "calendar_id",
    "summary",
    "description",
    "start_date_time",
    "end_date_time",
    "start_date",
    "end_date",
    "in",
  ],
  "google.create_event": [
    "summary",
    "description",
    "start_date_time",
    "end_date_time",
    "start_date",
    "end_date",
    "in",
    "location",
  ],
  "google_air_quality.get_forecast": ["device_id", "hours"],
  "google_assistant.request_sync": ["agent_user_id"],
  "google_assistant.reload": [],
  "google_assistant_sdk.send_text_command": ["command", "media_player"],
  "google_mail.set_vacation": [
    "enabled",
    "title",
    "message",
    "plain_text",
    "restrict_contacts",
    "restrict_domain",
    "start",
    "end",
  ],
  "google_photos.upload": ["config_entry_id", "filename", "album"],
  "google_sheets.append_sheet": [
    "config_entry",
    "worksheet",
    "add_created_column",
    "data",
  ],
  "google_sheets.get_sheet": ["config_entry", "worksheet", "rows"],
  "google_travel_time.get_travel_times": [
    "config_entry_id",
    "origin",
    "destination",
    "mode",
    "units",
    "language",
    "avoid",
    "traffic_model",
    "departure_time",
  ],
  "google_travel_time.get_transit_times": [
    "config_entry_id",
    "origin",
    "destination",
    "units",
    "language",
    "transit_mode",
    "transit_routing_preference",
    "departure_time",
    "arrival_time",
  ],
  "green_planet_energy.get_cheapest_duration": ["duration", "time_range"],
  "green_planet_energy.get_prices": ["config_entry_id", "hours"],
  "growatt_server.update_time_segment": [
    "segment_id",
    "batt_mode",
    "start_time",
    "end_time",
    "enabled",
    "device_id",
  ],
  "growatt_server.read_time_segments": ["device_id"],
  "growatt_server.write_ac_charge_times": [
    "device_id",
    "charge_power",
    "charge_stop_soc",
    "mains_enabled",
    "period_1_start",
    "period_1_end",
    "period_1_enabled",
    "period_2_start",
    "period_2_end",
    "period_2_enabled",
    "period_3_start",
    "period_3_end",
    "period_3_enabled",
  ],
  "growatt_server.write_ac_discharge_times": [
    "device_id",
    "discharge_power",
    "discharge_stop_soc",
    "period_1_start",
    "period_1_end",
    "period_1_enabled",
    "period_2_start",
    "period_2_end",
    "period_2_enabled",
    "period_3_start",
    "period_3_end",
    "period_3_enabled",
  ],
  "growatt_server.read_ac_charge_times": ["device_id"],
  "growatt_server.read_ac_discharge_times": ["device_id"],
  "guardian.pair_sensor": ["device_id", "uid"],
  "guardian.unpair_sensor": ["device_id", "uid"],
  "guardian.upgrade_firmware": ["device_id", "url", "port", "filename"],
  "habitica.cast_skill": ["config_entry", "skill", "task"],
  "habitica.accept_quest": ["config_entry"],
  "habitica.reject_quest": ["config_entry"],
  "habitica.start_quest": ["config_entry"],
  "habitica.cancel_quest": ["config_entry"],
  "habitica.abort_quest": ["config_entry"],
  "habitica.leave_quest": ["config_entry"],
  "habitica.score_habit": ["config_entry", "task", "direction"],
  "habitica.score_reward": ["config_entry", "task"],
  "habitica.transformation": ["config_entry", "item", "target"],
  "habitica.get_tasks": ["config_entry", "filter"],
  "habitica.update_reward": [
    "config_entry",
    "task",
    "rename",
    "notes",
    "cost",
    "tag_options",
    "developer_options",
  ],
  "habitica.create_reward": [
    "config_entry",
    "name",
    "notes",
    "cost",
    "tag",
    "developer_options",
  ],
  "habitica.update_habit": [
    "config_entry",
    "task",
    "rename",
    "notes",
    "up_down",
    "priority",
    "frequency",
    "tag_options",
    "developer_options",
  ],
  "habitica.create_habit": [
    "config_entry",
    "name",
    "notes",
    "up_down",
    "priority",
    "frequency",
    "tag",
    "developer_options",
  ],
  "habitica.update_todo": [
    "config_entry",
    "task",
    "rename",
    "notes",
    "checklist_options",
    "priority",
    "duedate_options",
    "reminder_options",
    "tag_options",
    "developer_options",
  ],
  "habitica.create_todo": [
    "config_entry",
    "name",
    "notes",
    "add_checklist_item",
    "collapse_checklist",
    "priority",
    "date",
    "reminder",
    "tag",
    "developer_options",
  ],
  "habitica.update_daily": [
    "config_entry",
    "task",
    "rename",
    "notes",
    "checklist_options",
    "priority",
    "start_date",
    "frequency",
    "every_x",
    "repeat_weekly_options",
    "repeat_monthly_options",
    "reminder_options",
    "tag_options",
    "developer_options",
  ],
  "habitica.create_daily": [
    "config_entry",
    "name",
    "notes",
    "add_checklist_item",
    "collapse_checklist",
    "priority",
    "start_date",
    "frequency",
    "every_x",
    "repeat_weekly_options",
    "repeat_monthly_options",
    "reminder",
    "tag",
    "developer_options",
  ],
  "harmony.sync": [],
  "harmony.change_channel": ["channel"],
  "hassio.addon_start": ["addon"],
  "hassio.addon_restart": ["addon"],
  "hassio.addon_stdin": ["addon"],
  "hassio.addon_stop": ["addon"],
  "hassio.app_start": ["app"],
  "hassio.app_restart": ["app"],
  "hassio.app_stdin": ["app", "input"],
  "hassio.app_stop": ["app"],
  "hassio.host_reboot": [],
  "hassio.host_shutdown": [],
  "hassio.backup_full": [
    "name",
    "password",
    "compressed",
    "location",
    "homeassistant_exclude_database",
  ],
  "hassio.backup_partial": [
    "homeassistant",
    "homeassistant_exclude_database",
    "apps",
    "addons",
    "folders",
    "name",
    "password",
    "compressed",
    "location",
  ],
  "hassio.restore_full": ["slug", "password"],
  "hassio.restore_partial": [
    "slug",
    "homeassistant",
    "folders",
    "apps",
    "addons",
    "password",
  ],
  "hassio.mount_reload": ["device_id"],
  "hdmi_cec.power_on": [],
  "hdmi_cec.select_device": ["device"],
  "hdmi_cec.send_command": ["att", "cmd", "dst", "raw", "src"],
  "hdmi_cec.standby": [],
  "hdmi_cec.update": [],
  "hdmi_cec.volume": ["down", "mute", "up"],
  "heos.get_queue": [],
  "heos.remove_from_queue": ["queue_ids"],
  "heos.move_queue_item": ["queue_ids", "destination_position"],
  "heos.group_volume_set": ["volume_level"],
  "heos.group_volume_down": [],
  "heos.group_volume_up": [],
  "history_stats.reload": [],
};

// Services the existing editors already own: fan, group and frontend.
const SKIPPED_DOMAINS = ["fan", "group", "frontend"];

const everyField = new Proxy({} as Record<string, QuickFieldInfo>, {
  has: () => true,
});

const context = (
  domain: string,
  service: string,
  data: Record<string, unknown> = {}
): QuickContext => ({
  action: `${domain}.${service}`,
  data,
  fields: everyField,
  domainServices: [],
  entities: [],
});

const controlsFor = (
  name: string,
  data: Record<string, unknown> = {}
): QuickControl[] => {
  const [domain, service] = [name.split(".")[0], name.split(".")[1]];
  return INTEGRATION_EDITORS_B[domain].controls[service](
    context(domain, service, data)
  );
};

const keysOf = (controls: QuickControl[]) =>
  controls.map((control) => control.key).filter((k) => !k.startsWith("$"));

const find = (name: string, field: string, data = {}) =>
  controlsFor(name, data).find((control) => control.key === field);

describe("integration editors duckdns to history_stats", () => {
  it("has an editor for every service in the hand-written list", () => {
    const missing = Object.keys(EXPECTED).filter((name) => {
      const [domain, service] = name.split(".");
      return !(service in (INTEGRATION_EDITORS_B[domain]?.controls ?? {}));
    });
    expect(missing).toEqual([]);
  });

  it("offers no service that the hand-written list does not know", () => {
    const extra = Object.entries(INTEGRATION_EDITORS_B).flatMap(
      ([domain, editor]) =>
        Object.keys(editor.controls)
          .map((service) => `${domain}.${service}`)
          .filter((name) => !(name in EXPECTED))
    );
    expect(extra).toEqual([]);
  });

  it("claims no domain that an existing editor already owns", () => {
    SKIPPED_DOMAINS.forEach((domain) =>
      expect(domain in INTEGRATION_EDITORS_B).toBe(false)
    );
  });

  it("shows every declared field of every service", () => {
    Object.entries(EXPECTED).forEach(([name, fields]) => {
      let shown = keysOf(controlsFor(name));
      if (name.startsWith("google.")) {
        // The all-day switch swaps the date keys for the date-time keys.
        shown = [
          ...new Set([
            ...shown,
            ...keysOf(controlsFor(name, { start_date: "2024-01-01" })),
          ]),
        ];
      }
      expect([...shown].sort(), name).toEqual([...fields].sort());
    });
  });

  it("puts every label under its own integration prefix", () => {
    Object.entries(EXPECTED).forEach(([name]) => {
      const domain = name.split(".")[0];
      controlsFor(name).forEach((control) => {
        if ("labelKey" in control) {
          expect(control.labelKey, `${name} ${control.key}`).toMatch(
            new RegExp(
              `^ui\\.components\\.action-editors\\.fields\\.(${domain}__|note_reload$)`
            )
          );
        }
      });
    });
  });

  it("gives typed fields their own control", () => {
    const kind = (name: string, field: string) => find(name, field)?.kind;
    expect(kind("ecobee.create_vacation", "cool_temp")).toBe("slider");
    expect(kind("ecobee.create_vacation", "start_date")).toBe("date");
    expect(kind("ecobee.create_vacation", "start_time")).toBe("time");
    expect(kind("ecobee.create_vacation", "fan_mode")).toBe("tiles");
    expect(kind("ecobee.create_vacation", "entity_id")).toBe("entities");
    expect(kind("elkm1.alarm_display_message", "timeout")).toBe("duration");
    expect(kind("elkm1.alarm_display_message", "beep")).toBe("switch");
    expect(kind("elkm1.switch_output_turn_on_for", "duration")).toBe(
      "duration"
    );
    expect(kind("evohome.set_zone_override", "duration")).toBe("duration");
    expect(kind("flux_led.set_music_mode", "foreground_color")).toBe("color");
    expect(kind("forecast_solar.get_forecast", "start")).toBe("datetime");
    expect(kind("growatt_server.update_time_segment", "start_time")).toBe(
      "time"
    );
    expect(kind("google_mail.set_vacation", "start")).toBe("date");
    expect(kind("google_mail.set_vacation", "message")).toBe("text");
    expect(kind("fully_kiosk.load_url", "device_id")).toBe("selector");
    expect(kind("heos.group_volume_set", "volume_level")).toBe("slider");
    expect(kind("foscam.ptz", "movement")).toBe("tiles");
    expect(kind("foscam.ptz", "travel_time")).toBe("slider");
    expect(kind("google_assistant_sdk.send_text_command", "media_player")).toBe(
      "entities"
    );
    expect(kind("ffmpeg.start", "entity_id")).toBe("entities");
    expect(kind("harmony.change_channel", "channel")).toBe("stepper");
  });

  it("scales the group volume to a percentage", () => {
    const control = find("heos.group_volume_set", "volume_level");
    expect(control).toMatchObject({ kind: "slider", scale: 100, max: 1 });
  });

  it("keeps secrets in password inputs and shows live character limits", () => {
    expect(find("hassio.backup_full", "password")).toMatchObject({
      kind: "text",
      inputType: "password",
    });
    expect(find("elkm1.alarm_bypass", "code")).toMatchObject({
      inputType: "password",
    });
    expect(find("fritz.set_guest_wifi_password", "password")).toMatchObject({
      inputType: "password",
    });
    expect(find("foursquare.checkin", "shout")).toMatchObject({
      multiline: true,
      showCount: true,
      maxLength: 140,
    });
    expect(find("elkm1.alarm_display_message", "line1")).toMatchObject({
      showCount: true,
      maxLength: 16,
    });
  });

  it("renders nested sections and lists through the selector", () => {
    expect(find("habitica.get_tasks", "filter")).toMatchObject({
      kind: "selector",
      valueType: "object",
    });
    expect(find("hassio.backup_partial", "folders")).toMatchObject({
      kind: "selector",
    });
    expect(find("heos.remove_from_queue", "queue_ids")).toMatchObject({
      kind: "selector",
      selector: { text: { multiple: true, type: "number" } },
    });
    expect(
      find("google_travel_time.get_travel_times", "language")
    ).toMatchObject({ kind: "selector", valueType: "language" });
  });

  it("switches google events between dated and timed", () => {
    const timed = keysOf(controlsFor("google.create_event"));
    expect(timed).toContain("start_date_time");
    expect(timed).not.toContain("start_date");
    const allDay = keysOf(
      controlsFor("google.create_event", { start_date: "2024-05-01" })
    );
    expect(allDay).toContain("start_date");
    expect(allDay).not.toContain("start_date_time");
    expect(
      controlsFor("google.create_event").some((c) => c.key === "$all_day")
    ).toBe(true);
    // A relative `in` hides both date pairs.
    const relative = keysOf(
      controlsFor("google.create_event", { in: { days: 2 } })
    );
    expect(relative).not.toContain("start_date_time");
    expect(relative).not.toContain("start_date");
  });

  it("uses the thermostat's own preset names when it reports them", () => {
    const ctx: QuickContext = {
      ...context("ecobee", "set_sensors_used_in_climate"),
      entities: [
        {
          entity_id: "climate.hall",
          attributes: { preset_modes: ["home", "sleep", "away"] },
        },
      ],
    };
    const preset = INTEGRATION_EDITORS_B.ecobee.controls
      .set_sensors_used_in_climate(ctx)
      .find((control) => control.key === "preset_mode");
    expect(preset?.kind).toBe("tiles");
    expect(
      preset?.kind === "tiles" && preset.options.map((o) => o.value)
    ).toEqual(["home", "sleep", "away"]);
  });

  it("keeps a stored value that a visual control cannot show", () => {
    // A template stays in the generic field, so no slider replaces it.
    expect(
      find("ecobee.create_vacation", "cool_temp", {
        cool_temp: "{{ states('sensor.x') }}",
      })
    ).toBeUndefined();
    // A value outside the option list stays visible as its own tile.
    const tilesControl = find("foscam.ptz", "movement", { movement: "spin" });
    expect(
      tilesControl?.kind === "tiles" && tilesControl.options.map((o) => o.value)
    ).toContain("spin");
  });

  it("warns before the risky services", () => {
    ["host_reboot", "host_shutdown", "restore_full", "restore_partial"].forEach(
      (service) =>
        expect(
          INTEGRATION_EDITORS_B.hassio.cautions?.[service],
          service
        ).toMatch(/hassio__caution_/)
    );
    expect(INTEGRATION_EDITORS_B.guardian.cautions?.upgrade_firmware).toMatch(
      /guardian__caution_/
    );
  });

  it("lists sibling services only for integrations with several", () => {
    expect(INTEGRATION_EDITORS_B.dynalite.siblings).toEqual([
      "request_area_preset",
      "request_channel_level",
    ]);
    expect(INTEGRATION_EDITORS_B.duckdns.siblings).toBeUndefined();
  });
});
