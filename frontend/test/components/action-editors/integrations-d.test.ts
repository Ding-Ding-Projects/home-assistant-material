import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  INTEGRATION_EDITORS_D,
  ONKYO_MEDIA_PLAYER_CONTROLS,
} from "../../../src/components/action-editors/domains/integrations/d";
import type {
  QuickContext,
  QuickControl,
  QuickEntity,
} from "../../../src/components/action-editors/quick-types";

/** Every domain.service of the share, written out by hand. */
const EXPECTED: Record<string, string[]> = {
  melcloud: ["set_vane_horizontal", "set_vane_vertical"],
  miele: ["get_programs", "set_program", "set_program_oven"],
  mijn_farmad_apotheek: ["order_medication", "search_medication"],
  mill: ["set_room_temperature"],
  min_max: ["reload"],
  minio: ["get", "put", "remove"],
  modbus: ["reload", "write_coil", "write_register", "stop"],
  modern_forms: [
    "set_light_sleep_timer",
    "clear_light_sleep_timer",
    "set_fan_sleep_timer",
    "clear_fan_sleep_timer",
  ],
  monoprice: ["snapshot", "restore"],
  monzo: ["deposit_into_pot", "withdraw_from_pot"],
  motion_blinds: ["set_absolute_position"],
  motioneye: ["set_text_overlay", "action", "snapshot"],
  mqtt: ["publish", "dump", "reload"],
  music_assistant: [
    "play_media",
    "play_announcement",
    "transfer_queue",
    "get_queue",
    "search",
    "get_library",
  ],
  neato: ["custom_cleaning"],
  neopool: ["get_device_time", "set_device_time"],
  ness_alarm: ["aux", "panic"],
  nest: ["set_fan_timer"],
  netatmo: [
    "set_camera_light",
    "set_schedule",
    "set_preset_mode_with_end_datetime",
    "set_temperature_with_end_datetime",
    "set_temperature_with_time_period",
    "clear_temperature_setting",
    "set_persons_home",
    "set_person_away",
    "register_webhook",
    "unregister_webhook",
  ],
  netgear_lte: ["delete_sms", "set_option", "connect_lte", "disconnect_lte"],
  nexia: [
    "set_aircleaner_mode",
    "set_humidify_setpoint",
    "set_dehumidify_setpoint",
    "set_hvac_run_mode",
  ],
  nfandroidtv: ["send_message"],
  nina: ["get_details"],
  nintendo_parental_controls: [
    "add_bonus_time",
    "update_pin_code",
    "player_usage_report",
    "device_usage_report",
    "update_daily_restrictions",
  ],
  nissan_leaf: ["start_charge", "update"],
  nordpool: ["get_prices_for_date", "get_price_indices_for_date"],
  ntfy: ["publish", "clear", "delete"],
  nuki: ["lock_n_go", "set_continuous_mode"],
  nws: ["get_forecasts_extra"],
  nx584: ["bypass_zone", "unbypass_zone"],
  nzbget: ["pause", "resume", "set_speed"],
  octoprint: ["printer_connect"],
  ohme: ["list_charge_slots", "set_price_cap"],
  ombi: ["submit_movie_request", "submit_tv_request", "submit_music_request"],
  omie: ["get_prices_for_date"],
  omnilogic: ["set_pump_speed"],
  onedrive: ["upload", "delete"],
  onvif: ["ptz"],
  opendisplay: ["upload_image"],
  openevse: ["set_override"],
  openhome: ["invoke_pin"],
  opentherm_gw: [
    "reset_gateway",
    "set_central_heating_ovrd",
    "set_clock",
    "set_control_setpoint",
    "set_hot_water_ovrd",
    "set_hot_water_setpoint",
    "set_gpio_mode",
    "set_led_mode",
    "set_max_modulation",
    "set_outside_temperature",
    "set_setback_temperature",
    "send_transparent_command",
  ],
  openweathermap: ["get_minute_forecast"],
  osoenergy: [
    "get_profile",
    "set_profile",
    "set_v40_min",
    "turn_away_mode_on",
    "turn_off",
    "turn_on",
  ],
  overkiz: ["set_cover_position_and_tilt"],
  overseerr: ["get_requests", "search_media", "request_media"],
  peblar: [
    "list_rfid_tokens",
    "add_rfid_token",
    "delete_rfid_token",
    "list_vehicle_tokens",
    "add_vehicle_token",
    "delete_vehicle_token",
    "authorize_charge_session",
  ],
  pi_hole: ["disable"],
  picnic: ["add_product"],
  pilight: ["send"],
  plex: ["refresh_library"],
  portainer: ["prune_images", "prune_build_cache", "recreate_container"],
  profiler: [
    "start",
    "memory",
    "start_log_objects",
    "stop_log_objects",
    "dump_log_objects",
    "start_log_object_sources",
    "stop_log_object_sources",
    "lru_stats",
    "dump_sockets",
    "log_thread_frames",
    "log_event_loop_scheduled",
    "set_asyncio_debug",
    "log_current_tasks",
  ],
};

const COMPONENTS = resolve(
  __dirname,
  "../../../../core/homeassistant/components"
);

type YamlFields = Record<string, any>;

/** Field name to selector, flattening sections, read from the real services.yaml. */
const yamlFields = (domain: string, service: string): YamlFields => {
  const file = resolve(COMPONENTS, domain, "services.yaml");
  const doc = load(readFileSync(file, "utf8")) as Record<string, any>;
  const out: YamlFields = {};
  const walk = (fields: YamlFields | undefined) =>
    Object.entries(fields ?? {}).forEach(([key, def]) => {
      if (key.startsWith(".")) return;
      if (def?.fields && !def.selector) walk(def.fields);
      else out[key] = { selector: def?.selector ?? null };
    });
  walk(doc?.[service]?.fields);
  return out;
};

const entity = (
  entity_id: string,
  attributes: Record<string, unknown> = {}
): QuickEntity => ({ entity_id, state: "on", attributes });

const context = (
  domain: string,
  service: string,
  data: Record<string, unknown> = {},
  entities: QuickEntity[] = [],
  fields?: YamlFields
): QuickContext => ({
  action: `${domain}.${service}`,
  data,
  fields: fields ?? yamlFields(domain, service),
  domainServices: EXPECTED[domain] ?? [],
  entities,
});

const controls = (
  domain: string,
  service: string,
  data: Record<string, unknown> = {},
  entities: QuickEntity[] = []
): QuickControl[] =>
  INTEGRATION_EDITORS_D[domain].controls[service](
    context(domain, service, data, entities)
  );

const control = (list: QuickControl[], key: string) =>
  list.find((item) => item.key === key);

const hasYaml = existsSync(COMPONENTS);

describe("integration editors, share D", () => {
  it("has an editor for every domain.service of the share", () => {
    const missing: string[] = [];
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      services.forEach((service) => {
        if (!INTEGRATION_EDITORS_D[domain]?.controls[service]) {
          missing.push(`${domain}.${service}`);
        }
      });
    });
    expect(missing).toEqual([]);
    // No editor exists for a service that was not expected, so the list and
    // the editors cannot drift apart.
    const extra: string[] = [];
    Object.entries(INTEGRATION_EDITORS_D).forEach(([domain, editor]) => {
      Object.keys(editor.controls).forEach((service) => {
        if (!EXPECTED[domain]?.includes(service)) {
          extra.push(`${domain}.${service}`);
        }
      });
    });
    expect(extra).toEqual([]);
  });

  it.skipIf(!hasYaml)(
    "shows a control for every field the services.yaml declares",
    () => {
      const missing: string[] = [];
      Object.entries(EXPECTED).forEach(([domain, services]) => {
        services.forEach((service) => {
          const declared = Object.keys(yamlFields(domain, service));
          const shown = controls(domain, service).map((item) => item.key);
          declared.forEach((key) => {
            if (!shown.includes(key)) {
              missing.push(`${domain}.${service}.${key}`);
            }
          });
        });
      });
      expect(missing).toEqual([]);
    }
  );

  it.skipIf(!hasYaml)(
    "never falls back to a bare text box where a proper control exists",
    () => {
      const bareBoxes: string[] = [];
      Object.entries(EXPECTED).forEach(([domain, services]) => {
        services.forEach((service) => {
          const fields = yamlFields(domain, service);
          controls(domain, service).forEach((item) => {
            const type = Object.keys(fields[item.key]?.selector ?? {})[0];
            if (
              item.kind === "text" &&
              ["number", "boolean", "duration", "date", "time", "datetime"]
                .concat(["select", "media"])
                .includes(type)
            ) {
              bareBoxes.push(`${domain}.${service}.${item.key} (${type})`);
            }
          });
        });
      });
      expect(bareBoxes).toEqual([]);
    }
  );

  it("gives the sample fields the expected control kinds", () => {
    const publish = controls("mqtt", "publish");
    expect(control(publish, "topic")?.kind).toBe("text");
    expect(control(publish, "payload")).toMatchObject({
      kind: "text",
      multiline: true,
      showCount: true,
    });
    expect(control(publish, "qos")).toMatchObject({ kind: "tiles" });
    expect(control(publish, "retain")?.kind).toBe("switch");
    expect(control(publish, "evaluate_payload")?.kind).toBe("switch");
    expect(control(publish, "message_expiry_interval")?.kind).toBe("duration");

    const temperature = controls(
      "netatmo",
      "set_temperature_with_end_datetime"
    );
    expect(control(temperature, "target_temperature")).toMatchObject({
      kind: "slider",
      min: 7,
      max: 30,
      step: 0.5,
    });
    expect(control(temperature, "end_datetime")?.kind).toBe("datetime");

    const restrictions = controls(
      "nintendo_parental_controls",
      "update_daily_restrictions"
    );
    expect(control(restrictions, "day_of_week")).toMatchObject({
      kind: "tiles",
    });
    expect(control(restrictions, "bedtime_start")?.kind).toBe("time");
    expect(control(restrictions, "max_play_time")).toMatchObject({
      kind: "stepper",
      max: 360,
    });
    expect(
      control(controls("nintendo_parental_controls", "update_pin_code"), "pin")
    ).toMatchObject({ kind: "text", inputType: "password" });

    const prices = controls("nordpool", "get_prices_for_date");
    expect(control(prices, "date")?.kind).toBe("date");
    expect(control(prices, "currency")).toMatchObject({ kind: "tiles" });
    expect(control(prices, "areas")).toMatchObject({
      kind: "selector",
      selector: { select: { multiple: true } },
    });
    expect(control(prices, "config_entry")).toMatchObject({
      kind: "selector",
      selector: { config_entry: { integration: "nordpool" } },
    });

    const library = controls("music_assistant", "get_library");
    expect(control(library, "order_by")).toMatchObject({ kind: "selector" });
    expect(control(library, "limit")).toMatchObject({
      kind: "slider",
      min: 1,
      max: 500,
    });
    expect(control(library, "favorite")?.kind).toBe("switch");

    const announcement = controls("music_assistant", "play_announcement");
    expect(control(announcement, "message")).toMatchObject({
      kind: "text",
      multiline: true,
    });
    expect(control(announcement, "announce_volume")?.kind).toBe("slider");
    expect(control(announcement, "tts_entity_id")).toMatchObject({
      kind: "selector",
      selector: { entity: { domain: "tts" } },
    });

    const message = controls("nfandroidtv", "send_message");
    expect(control(message, "image")).toMatchObject({
      kind: "selector",
      selector: { media: {} },
    });
    expect(control(message, "duration")?.kind).toBe("duration");
    expect(control(message, "position")).toMatchObject({ kind: "tiles" });
    expect(control(message, "interactive")?.kind).toBe("switch");

    expect(control(controls("opentherm_gw", "set_clock"), "time")?.kind).toBe(
      "time"
    );
    expect(control(controls("opentherm_gw", "set_clock"), "date")?.kind).toBe(
      "date"
    );
    expect(
      control(controls("opentherm_gw", "set_control_setpoint"), "temperature")
    ).toMatchObject({ kind: "slider", max: 90, step: 0.1 });
  });

  it("selects a stored number in a numeric option list", () => {
    const publish = controls("ntfy", "publish", { priority: 4 });
    expect(control(publish, "priority")).toMatchObject({
      kind: "tiles",
      value: "4",
    });
    const qos = controls("mqtt", "publish", { qos: 2 });
    expect(control(qos, "qos")).toMatchObject({ kind: "tiles", value: "2" });
    expect(control(controls("ntfy", "publish"), "actions")).toMatchObject({
      kind: "selector",
      valueType: "object",
    });
  });

  it("lists the positions the targeted climate entity reports", () => {
    const withList = controls("melcloud", "set_vane_horizontal", {}, [
      entity("climate.hall", {
        vane_horizontal_positions: ["auto", "swing", "1"],
      }),
    ]);
    expect(control(withList, "position")).toMatchObject({
      kind: "tiles",
      options: [{ value: "auto" }, { value: "swing" }, { value: "1" }],
    });
    // Without a known entity the field still has a control to type into.
    expect(
      control(controls("melcloud", "set_vane_horizontal"), "position")?.kind
    ).toBe("text");
    const presets = controls("onvif", "ptz", {}, [
      entity("camera.door", { preset_list: ["1", "2"] }),
    ]);
    expect(control(presets, "preset")).toMatchObject({ kind: "tiles" });
  });

  it("keeps lists and dictionaries in the object editor", () => {
    expect(control(controls("modbus", "write_coil"), "state")?.kind).toBe(
      "switch"
    );
    expect(
      control(
        controls("modbus", "write_coil", { state: [true, false] }),
        "state"
      )
    ).toMatchObject({ kind: "selector", valueType: "object" });
    expect(
      control(controls("modbus", "write_register", { value: [1, 2] }), "value")
    ).toMatchObject({ kind: "selector", valueType: "object" });
    expect(
      control(controls("modbus", "write_register", { value: 5 }), "value")
    ).toMatchObject({ kind: "stepper", value: 5 });
  });

  it("claims only fields the service declares", () => {
    // The field list of the service decides; a key the service does not
    // declare must not get a control.
    const ctx = context("mqtt", "publish", {}, [], {
      topic: { selector: { text: null } },
    });
    const shown = INTEGRATION_EDITORS_D.mqtt.controls.publish(ctx);
    expect(shown.map((item) => item.key)).toEqual(["topic"]);
  });

  it("warns before the risky services and gates by supported feature", () => {
    expect(INTEGRATION_EDITORS_D.minio.cautions?.remove).toBe(
      "ui.components.action-editors.fields.minio__caution_remove"
    );
    expect(INTEGRATION_EDITORS_D.monzo.cautions?.deposit_into_pot).toBeTruthy();
    expect(INTEGRATION_EDITORS_D.mqtt.cautions).toBeUndefined();
    expect(INTEGRATION_EDITORS_D.nest.gates?.set_fan_timer).toBe(8);
    expect(INTEGRATION_EDITORS_D.music_assistant.gates?.play_announcement).toBe(
      1048576
    );
  });

  it("builds the 24 hourly temperature sliders of the OSO profile", () => {
    const profile = controls("osoenergy", "set_profile");
    expect(profile).toHaveLength(24);
    expect(profile.every((item) => item.kind === "slider")).toBe(true);
    expect(control(profile, "hour_07")).toMatchObject({ min: 10, max: 75 });
  });

  it("offers the Onkyo HDMI output service that is registered in Python", () => {
    const fields = { hdmi_output: { selector: null } };
    const list = ONKYO_MEDIA_PLAYER_CONTROLS.onkyo_select_hdmi_output({
      action: "media_player.onkyo_select_hdmi_output",
      data: {},
      fields,
      domainServices: [],
      entities: [],
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "tiles", key: "hdmi_output" });
  });
});
