import { describe, expect, it } from "vitest";
import { INTEGRATION_EDITORS_E } from "../../../src/components/action-editors/domains/integrations/e";
import type {
  QuickContext,
  QuickControl,
  QuickEntity,
} from "../../../src/components/action-editors/quick-types";

const SERVICES: Record<string, string[]> = {
  prosegur: ["request_image"],
  prowl: ["send_message"],
  ps4: ["send_command"],
  pushover: ["cancel"],
  python_script: ["reload"],
  qbittorrent: ["get_torrents", "get_all_torrents"],
  qvr_pro: ["start_record", "stop_record"],
  rachio: [
    "set_zone_moisture_percent",
    "start_watering",
    "start_multiple_zone_schedule",
    "pause_watering",
    "resume_watering",
    "stop_watering",
  ],
  radarr: ["get_movies", "get_queue"],
  rainbird: ["start_irrigation", "set_rain_delay"],
  rainmachine: [
    "pause_watering",
    "restrict_watering",
    "start_program",
    "start_zone",
    "stop_all",
    "stop_program",
    "stop_zone",
    "unpause_watering",
    "push_flow_meter_data",
    "push_weather_data",
    "unrestrict_watering",
  ],
  remember_the_milk: ["create_task", "complete_task"],
  renault: [
    "ac_start",
    "ac_cancel",
    "ac_set_schedules",
    "charge_start",
    "charge_set_schedules",
  ],
  renson: ["set_timer_level", "set_breeze", "set_pollution_settings"],
  reolink: ["ptz_move", "play_chime", "snapshot_past"],
  rest: ["reload"],
  rest_command: ["reload"],
  rflink: ["send_command"],
  rfxtrx: ["send"],
  risco: ["set_time"],
  roborock: [
    "get_maps",
    "set_vacuum_goto_position",
    "set_vacuum_zoned_cleaning",
    "get_vacuum_current_position",
  ],
  roku: ["search"],
  roon: ["transfer"],
  route53: ["update_records"],
  saunum: ["start_session"],
  schlage: ["get_codes", "add_code", "delete_code"],
  screenlogic: [
    "set_color_mode",
    "start_super_chlorination",
    "stop_super_chlorination",
  ],
  sensibo: [
    "assume_state",
    "enable_timer",
    "enable_pure_boost",
    "full_state",
    "enable_climate_react",
    "get_device_capabilities",
  ],
  seventeentrack: ["get_packages", "add_package", "archive_package"],
  sharkiq: ["clean_room"],
  shell_command: ["reload"],
  shelly: ["get_kvs_value", "set_kvs_value", "set_cover_position_and_tilt"],
  simplisafe: ["remove_pin", "set_pin", "set_system_properties"],
  smarttub: [
    "set_primary_filtration",
    "set_secondary_filtration",
    "snooze_reminder",
    "reset_reminder",
  ],
  smlight: ["play_rtttl"],
  smtp: ["send_message"],
  snapcast: ["snapshot", "restore", "set_latency"],
  snooz: ["transition_on", "transition_off"],
  sofar: [
    "set_feed_in_limit",
    "set_active_power_limit",
    "set_passive_mode_timeout",
    "set_passive_mode_power",
  ],
  sonarr: [
    "get_series",
    "get_queue",
    "get_diskspace",
    "get_upcoming",
    "get_wanted",
    "get_episodes",
  ],
  songpal: ["set_sound_setting"],
  sonos: [
    "snapshot",
    "restore",
    "set_sleep_timer",
    "clear_sleep_timer",
    "play_queue",
    "remove_from_queue",
    "get_queue",
    "update_alarm",
  ],
  soundtouch: [
    "play_everywhere",
    "create_zone",
    "add_zone_slave",
    "remove_zone_slave",
  ],
  sql: ["query"],
  squeezebox: ["call_method", "call_query"],
  starline: ["update_state", "set_scan_interval", "set_scan_obd_interval"],
  statistics: ["reload"],
  stookwijzer: ["get_forecast"],
  streamlabswater: ["set_away_mode"],
  subaru: ["unlock_specific_door"],
  surepetcare: ["set_lock_state", "set_pet_location"],
  swiss_public_transport: ["fetch_connections"],
};

const ctx = (
  action: string,
  keys: string[],
  entities: QuickEntity[] = [],
  data: Record<string, unknown> = {}
): QuickContext => ({
  action,
  data,
  fields: Object.fromEntries(keys.map((key) => [key, { selector: {} }])),
  domainServices: [],
  entities,
});

const run = (
  action: string,
  keys: string[],
  entities: QuickEntity[] = [],
  data: Record<string, unknown> = {}
): QuickControl[] => {
  const [domain, service] = action.split(".");
  return INTEGRATION_EDITORS_E[domain].controls[service](
    ctx(action, keys, entities, data)
  );
};

const kinds = (controls: QuickControl[]) =>
  Object.fromEntries(
    controls.map((control) => [
      control.key,
      control.kind === "selector"
        ? `selector:${Object.keys(control.selector)[0]}`
        : control.kind,
    ])
  );

describe("integration editors, prosegur to switch", () => {
  it("has an editor for every service in the share", () => {
    const missing: string[] = [];
    Object.entries(SERVICES).forEach(([domain, services]) => {
      services.forEach((service) => {
        if (!INTEGRATION_EDITORS_E[domain]?.controls[service]) {
          missing.push(`${domain}.${service}`);
        }
      });
    });
    expect(missing).toEqual([]);
  });

  it("offers no editor for a service outside the list", () => {
    Object.entries(INTEGRATION_EDITORS_E).forEach(([domain, editor]) => {
      Object.keys(editor.controls).forEach((service) => {
        expect(SERVICES[domain], domain).toContain(service);
      });
    });
    expect(Object.keys(INTEGRATION_EDITORS_E).sort()).toEqual(
      Object.keys(SERVICES).sort()
    );
  });

  it("gives every field of a sample the expected control", () => {
    expect(
      kinds(run("prowl.send_message", ["title", "message", "priority", "url"]))
    ).toEqual({
      message: "text",
      title: "text",
      priority: "tiles",
      url: "text",
    });
    expect(
      kinds(run("rainbird.set_rain_delay", ["config_entry_id", "duration"]))
    ).toEqual({
      config_entry_id: "selector:config_entry",
      duration: "slider",
    });
    expect(
      kinds(run("rainmachine.restrict_watering", ["device_id", "duration"]))
    ).toEqual({ device_id: "selector:device", duration: "duration" });
    expect(
      kinds(run("renault.ac_start", ["vehicle", "temperature", "when"]))
    ).toEqual({
      vehicle: "selector:device",
      temperature: "slider",
      when: "datetime",
    });
    expect(
      kinds(
        run("schlage.add_code", [
          "name",
          "code",
          "notify_on_use",
          "start_datetime",
          "end_datetime",
        ])
      )
    ).toEqual({
      name: "text",
      code: "text",
      notify_on_use: "switch",
      start_datetime: "datetime",
      end_datetime: "datetime",
    });
    expect(
      kinds(
        run("sonos.update_alarm", [
          "alarm_id",
          "time",
          "volume",
          "enabled",
          "include_linked_zones",
        ])
      )
    ).toEqual({
      alarm_id: "stepper",
      time: "time",
      volume: "slider",
      enabled: "switch",
      include_linked_zones: "switch",
    });
    expect(kinds(run("soundtouch.create_zone", ["master", "slaves"]))).toEqual({
      master: "selector:entity",
      slaves: "selector:entity",
    });
    expect(
      kinds(run("smtp.send_message", ["attachments", "priority", "html"]))
    ).toEqual({
      html: "text",
      attachments: "selector:object",
      priority: "tiles",
    });
    expect(
      kinds(run("saunum.start_session", ["duration", "fan_duration"]))
    ).toEqual({ duration: "duration", fan_duration: "duration" });
  });

  it("marks password-like fields as password inputs", () => {
    const code = run("schlage.add_code", ["code"]).find(
      (control) => control.key === "code"
    );
    const pin = run("simplisafe.set_pin", ["pin"]).find(
      (control) => control.key === "pin"
    );
    expect(code?.kind === "text" && code.inputType).toBe("password");
    expect(pin?.kind === "text" && pin.inputType).toBe("password");
  });

  it("leaves out a field the service does not declare", () => {
    expect(run("prowl.send_message", ["message"]).map((c) => c.key)).toEqual([
      "message",
    ]);
  });

  it("uses the targeted entity's own attributes", () => {
    const entity: QuickEntity = {
      entity_id: "climate.office",
      attributes: {
        min_temp: 16,
        max_temp: 30,
        fan_modes: ["low", "high"],
      },
    };
    const controls = run(
      "sensibo.full_state",
      ["mode", "target_temperature", "fan_mode"],
      [entity]
    );
    const temperature = controls.find((c) => c.key === "target_temperature");
    expect(temperature).toMatchObject({ kind: "stepper", min: 16, max: 30 });
    expect(controls.find((c) => c.key === "fan_mode")?.kind).toBe("tiles");
    const rooms = run(
      "sharkiq.clean_room",
      ["rooms"],
      [{ entity_id: "vacuum.shark", attributes: { rooms: ["Kitchen"] } }]
    )[0];
    expect(rooms.kind === "selector" && rooms.selector.select.options).toEqual([
      { value: "Kitchen", label: "Kitchen" },
    ]);
  });

  it("keeps a stored value visible and editable", () => {
    const controls = run("rainbird.start_irrigation", ["duration"], [], {
      duration: 20,
    });
    expect(controls[0]).toMatchObject({ kind: "slider", value: 20 });
  });
});
