import { describe, expect, it } from "vitest";
import { INTEGRATION_EDITORS_F } from "../../../src/components/action-editors/domains/integrations/f";
import type {
  QuickContext,
  QuickControl,
} from "../../../src/components/action-editors/quick-types";

/** Every integration service of this share, written out by hand. */
const SERVICES: Record<string, string[]> = {
  switchbot: ["add_password"],
  switchbot_cloud: ["upload_art_frame_image"],
  switcher_kis: ["set_auto_off", "turn_on_with_timer"],
  synology_dsm: ["reboot", "shutdown"],
  system_bridge: [
    "get_process_by_id",
    "get_processes_by_name",
    "open_path",
    "open_url",
    "send_keypress",
    "send_text",
    "power_command",
  ],
  tado: [
    "set_climate_timer",
    "set_water_heater_timer",
    "set_climate_temperature_offset",
    "add_meter_reading",
  ],
  telegram_bot: [
    "send_message",
    "send_chat_action",
    "send_photo",
    "send_media_group",
    "send_sticker",
    "send_animation",
    "send_video",
    "send_voice",
    "send_document",
    "send_location",
    "send_poll",
    "edit_message",
    "edit_message_media",
    "edit_caption",
    "edit_replymarkup",
    "answer_callback_query",
    "delete_message",
    "leave_chat",
    "set_message_reaction",
    "download_file",
    "send_message_draft",
  ],
  template: ["reload"],
  tesla_fleet: [
    "navigate_to_destination",
    "navigate_to_coordinates",
    "navigate_to_waypoints",
  ],
  teslemetry: [
    "navigation_gps_request",
    "time_of_use",
    "set_scheduled_charging",
    "set_scheduled_departure",
    "valet_mode",
    "speed_limit",
    "add_charge_schedule",
    "remove_charge_schedule",
    "add_precondition_schedule",
    "remove_precondition_schedule",
    "dispatch_battery_power",
    "resume_battery_operation",
  ],
  tibber: ["get_prices"],
  todoist: ["new_task"],
  totalconnect: ["arm_away_instant", "arm_home_instant"],
  tplink: ["sequence_effect", "random_effect"],
  tplink_omada: ["reconnect_client", "set_client_name"],
  transmission: [
    "add_torrent",
    "get_torrents",
    "remove_torrent",
    "start_torrent",
    "stop_torrent",
  ],
  trend: ["reload"],
  tuya: ["get_feeder_meal_plan", "set_feeder_meal_plan"],
  unifi: ["reconnect_client", "remove_clients"],
  unifi_access: ["set_lock_rule"],
  unifiprotect: [
    "add_doorbell_text",
    "remove_doorbell_text",
    "set_chime_paired_doorbells",
    "remove_privacy_zone",
    "get_user_keyring_info",
    "ptz_goto_preset",
    "trigger_alarm_webhook",
  ],
  universal: ["reload"],
  upb: [
    "light_fade_start",
    "light_fade_stop",
    "light_blink",
    "link_deactivate",
    "link_goto",
    "link_fade_start",
    "link_fade_stop",
    "link_blink",
  ],
  utility_meter: ["reset", "calibrate"],
  vallox: [
    "set_profile_fan_speed_home",
    "set_profile_fan_speed_away",
    "set_profile_fan_speed_boost",
    "set_profile",
  ],
  velbus: ["sync_clock", "scan", "clear_cache", "set_memo_text"],
  verisure: ["capture_smartcam", "enable_autolock", "disable_autolock"],
  vesync: ["update_devices"],
  vicare: [
    "get_circulation_schedule",
    "set_circulation_schedule",
    "set_vicare_mode",
  ],
  vizio: ["send_text", "update_setting"],
  volvo: ["get_image_url"],
  wake_on_lan: ["send_magic_packet"],
  wall_tablet: ["wake", "sleep", "reload", "navigate"],
  watts: ["activate_timer_mode"],
  waze_travel_time: ["get_travel_times"],
  webostv: ["button", "command", "select_sound_output"],
  wemo: ["set_humidity", "reset_filter_life"],
  wilight: ["set_watering_time", "set_pause_time", "set_trigger"],
  wmspro: ["set_cover_position_and_tilt"],
  workday: ["check_date"],
  xiaomi_aqara: [
    "add_device",
    "play_ringtone",
    "remove_device",
    "stop_ringtone",
  ],
  xiaomi_miio: [
    "fan_reset_filter",
    "fan_set_extra_features",
    "light_set_scene",
    "light_set_delayed_turn_off",
    "light_reminder_on",
    "light_reminder_off",
    "light_night_light_mode_on",
    "light_night_light_mode_off",
    "light_eyecare_mode_on",
    "light_eyecare_mode_off",
    "remote_learn_command",
    "remote_set_led_on",
    "remote_set_led_off",
    "switch_set_wifi_led_on",
    "switch_set_wifi_led_off",
    "switch_set_power_price",
    "switch_set_power_mode",
    "vacuum_remote_control_start",
    "vacuum_remote_control_stop",
    "vacuum_remote_control_move",
    "vacuum_remote_control_move_step",
    "vacuum_clean_zone",
    "vacuum_goto",
    "vacuum_clean_segment",
  ],
  yamaha: ["enable_output", "menu_cursor", "select_scene"],
  yardian: ["start_irrigation"],
  yeelight: [
    "set_mode",
    "set_color_scene",
    "set_hsv_scene",
    "set_color_temp_scene",
    "set_color_flow_scene",
    "set_auto_delay_off_scene",
    "start_flow",
    "set_music_mode",
  ],
  yolink: ["play_on_speaker_hub"],
  zha: [
    "permit",
    "remove",
    "reconfigure_device",
    "set_zigbee_cluster_attribute",
    "issue_zigbee_cluster_command",
    "issue_zigbee_group_command",
    "warning_device_squawk",
    "warning_device_warn",
    "clear_lock_user_code",
    "enable_lock_user_code",
    "disable_lock_user_code",
    "set_lock_user_code",
  ],
  zoneminder: ["set_run_state"],
  zwave_js: [
    "clear_lock_usercode",
    "get_lock_usercode",
    "set_lock_usercode",
    "set_lock_configuration",
    "set_user",
    "delete_user",
    "delete_all_users",
    "get_credential_capabilities",
    "get_users",
    "set_credential",
    "delete_credential",
    "delete_all_credentials",
    "set_config_parameter",
    "bulk_set_partial_config_parameters",
    "refresh_value",
    "set_value",
    "multicast_set_value",
    "ping",
    "reset_meter",
    "invoke_cc_api",
    "refresh_notifications",
  ],
};

const text = { selector: { text: {} } };

const context = (
  action: string,
  keys: string[],
  data: Record<string, unknown> = {}
): QuickContext => ({
  action,
  data,
  fields: Object.fromEntries(keys.map((key) => [key, text])),
  domainServices: [],
  entities: [],
});

const kinds = (
  action: string,
  keys: string[],
  data: Record<string, unknown> = {}
) => {
  const [domain, service] = action.split(".");
  const controls: QuickControl[] = INTEGRATION_EDITORS_F[domain].controls[
    service
  ](context(action, keys, data));
  return Object.fromEntries(
    controls.map((control) => [
      control.key,
      control.kind === "selector"
        ? `selector:${control.valueType}`
        : control.kind === "text" && control.inputType
          ? `text:${control.inputType}`
          : control.kind,
    ])
  );
};

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

describe("integration editors switchbot to zwave_js", () => {
  it("has exactly the services of the share, no more and no fewer", () => {
    Object.entries(SERVICES).forEach(([domain, services]) => {
      expect(
        Object.keys(INTEGRATION_EDITORS_F[domain].controls).sort()
      ).toEqual([...services].sort());
    });
    expect(Object.keys(INTEGRATION_EDITORS_F).sort()).toEqual(
      Object.keys(SERVICES).sort()
    );
  });

  it("gives every service a builder that returns a list", () => {
    Object.entries(SERVICES).forEach(([domain, services]) => {
      services.forEach((service) => {
        const result = INTEGRATION_EDITORS_F[domain].controls[service](
          context(`${domain}.${service}`, [])
        );
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  it("lists sibling tiles only for services the domain really has", () => {
    Object.entries(INTEGRATION_EDITORS_F).forEach(([domain, editor]) => {
      (editor.siblings ?? []).forEach((name) =>
        expect(SERVICES[domain], `${domain}.${name}`).toContain(name)
      );
    });
  });

  it("builds the right control for each field of a sample of services", () => {
    expect(
      kinds("telegram_bot.send_message", [
        "entity_id",
        "message",
        "title",
        "parse_mode",
        "disable_notification",
        "keyboard",
        "reply_to_message_id",
        "chat_id",
        "config_entry_id",
      ])
    ).toEqual({
      entity_id: "selector:entity",
      message: "text",
      title: "text",
      parse_mode: "tiles",
      disable_notification: "switch",
      keyboard: "selector:list",
      reply_to_message_id: "selector:other",
      chat_id: "selector:list",
      config_entry_id: "selector:other",
    });
    expect(
      kinds("tado.set_climate_timer", [
        "temperature",
        "time_period",
        "requested_overlay",
      ])
    ).toEqual({
      temperature: "slider",
      time_period: "duration",
      requested_overlay: "tiles",
    });
    expect(
      kinds("teslemetry.add_charge_schedule", [
        "device_id",
        "days_of_week",
        "enable",
        "start_time",
        "end_time",
        "location",
        "id",
      ])
    ).toEqual({
      device_id: "selector:other",
      days_of_week: "selector:list",
      enable: "switch",
      start_time: "time",
      end_time: "time",
      location: "selector:location",
      id: "selector:other",
    });
    expect(
      kinds("zha.permit", ["duration", "ieee", "install_code", "qr_code"])
    ).toEqual({
      duration: "duration",
      ieee: "text",
      install_code: "text:password",
      qr_code: "text:password",
    });
    expect(
      kinds("yeelight.set_color_scene", ["rgb_color", "brightness"])
    ).toEqual({ rgb_color: "color", brightness: "slider" });
    expect(kinds("yeelight.set_hsv_scene", ["hs_color", "brightness"])).toEqual(
      { hs_color: "color", brightness: "slider" }
    );
    expect(
      kinds("zwave_js.set_user", [
        "user_id",
        "user_type",
        "active",
        "credential_data",
      ])
    ).toEqual({
      user_id: "selector:other",
      user_type: "tiles",
      active: "switch",
      credential_data: "text:password",
    });
    expect(kinds("vicare.set_circulation_schedule", DAYS)).toEqual(
      Object.fromEntries(DAYS.map((day) => [day, "selector:object"]))
    );
    expect(
      kinds("waze_travel_time.get_travel_times", [
        "origin",
        "region",
        "realtime",
        "time_delta",
        "base_coordinates",
      ])
    ).toEqual({
      origin: "text",
      region: "tiles",
      realtime: "switch",
      time_delta: "duration",
      base_coordinates: "selector:location",
    });
    expect(
      kinds("xiaomi_miio.vacuum_remote_control_move", [
        "velocity",
        "rotation",
        "duration",
      ])
    ).toEqual({ velocity: "slider", rotation: "slider", duration: "duration" });
    expect(
      kinds("upb.light_fade_start", ["brightness", "brightness_pct", "rate"])
    ).toEqual({
      brightness: "slider",
      brightness_pct: "slider",
      rate: "selector:other",
    });
    expect(
      kinds("todoist.new_task", ["content", "labels", "due_date", "priority"])
    ).toEqual({
      content: "text",
      labels: "selector:list",
      due_date: "datetime",
      priority: "stepper",
    });
  });

  it("shows only the fields the live service declares", () => {
    expect(kinds("tado.set_climate_timer", ["temperature"])).toEqual({
      temperature: "slider",
    });
    expect(kinds("zha.permit", [])).toEqual({});
  });

  it("leaves a stored template to the generic form", () => {
    expect(
      kinds("tado.set_climate_timer", ["temperature"], {
        temperature: "{{ 21 }}",
      })
    ).toEqual({});
    expect(kinds("zha.permit", ["duration"], { duration: "{{ 60 }}" })).toEqual(
      {}
    );
  });

  it("never uses a plain slider, stepper or text box for a typed key", () => {
    const plain = new Set(["slider", "stepper", "text"]);
    const typed = ["duration", "timeout", "transition", "time", "start_time"];
    Object.entries(SERVICES).forEach(([domain, services]) => {
      services.forEach((service) => {
        const controls = INTEGRATION_EDITORS_F[domain].controls[service](
          context(`${domain}.${service}`, typed)
        );
        controls.forEach((control) => {
          if (typed.includes(control.key)) {
            expect(
              plain.has(control.kind),
              `${domain}.${service} ${control.key}`
            ).toBe(false);
          }
        });
      });
    });
  });
});
