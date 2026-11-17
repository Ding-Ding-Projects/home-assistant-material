import { describe, expect, it } from "vitest";
import { DOMAIN_EDITORS } from "../../../src/components/action-editors/descriptors";
import { INTEGRATION_EDITORS_C } from "../../../src/components/action-editors/domains/integrations/c";
import type {
  QuickContext,
  QuickControl,
} from "../../../src/components/action-editors/quick-types";

/** Every action of the integrations hive to media_extractor, written by hand. */
const EXPECTED: Record<string, string[]> = {
  hive: ["boost_heating_on", "boost_heating_off", "boost_hot_water"],
  home_connect: [
    "set_program_and_options",
    "change_setting",
    "start_selected_program",
  ],
  homekit: ["reload", "reset_accessory", "unpair"],
  homematic: [
    "virtualkey",
    "set_variable_value",
    "set_device_value",
    "reconnect",
    "set_install_mode",
    "put_paramset",
  ],
  homematicip_cloud: [
    "activate_eco_mode_with_duration",
    "activate_eco_mode_with_period",
    "activate_vacation",
    "deactivate_eco_mode",
    "deactivate_vacation",
    "set_active_climate_profile",
    "dump_hap_config",
    "reset_energy_counter",
    "set_home_cooling_mode",
    "pull_latch",
  ],
  homeworks: ["send_command"],
  html5: ["send_message", "dismiss_message"],
  huawei_lte: ["resume_integration", "suspend_integration"],
  hue: ["hue_activate_scene", "activate_scene"],
  husqvarna_automower: ["override_schedule", "override_schedule_work_area"],
  hydrawise: ["start_watering", "suspend", "resume"],
  icloud: ["update", "play_sound", "display_message", "lost_device"],
  ifttt: ["push_alarm_state", "trigger"],
  ihc: [
    "set_runtime_value_bool",
    "set_runtime_value_int",
    "set_runtime_value_float",
    "pulse",
  ],
  imap: ["seen", "move", "delete", "fetch", "fetch_part"],
  immich: ["upload_file"],
  indevolt: ["charge", "discharge"],
  insteon: [
    "add_all_link",
    "delete_all_link",
    "load_all_link_database",
    "print_all_link_database",
    "print_im_all_link_database",
    "x10_all_units_off",
    "x10_all_lights_on",
    "x10_all_lights_off",
    "scene_on",
    "scene_off",
    "add_default_links",
  ],
  intent_script: ["reload"],
  iperf3: ["speedtest"],
  isy994: [
    "send_raw_node_command",
    "send_node_command",
    "get_zwave_parameter",
    "set_zwave_parameter",
    "set_zwave_lock_user_code",
    "delete_zwave_lock_user_code",
    "rename_node",
    "send_program_command",
  ],
  izone: ["airflow_min", "airflow_max"],
  jellyfin: ["play_media_shuffle"],
  jewish_calendar: ["count_omer"],
  joaoapps_join: [
    "ring",
    "set_wallpaper",
    "send_sms",
    "send_file",
    "send_url",
    "send_tasker",
  ],
  keba: [
    "request_data",
    "authorize",
    "deauthorize",
    "set_energy",
    "set_current",
    "enable",
    "disable",
    "set_failsafe",
  ],
  kef: [
    "update_dsp",
    "set_mode",
    "set_desk_db",
    "set_wall_db",
    "set_treble_db",
    "set_high_hz",
    "set_low_hz",
    "set_sub_db",
  ],
  keymitt_ble: ["calibrate"],
  kiosker: ["navigate_url", "set_blackout"],
  kitchen_sink: [
    "test_service_1",
    "set_tracker_location",
    "set_scanner_connected",
  ],
  knx: [
    "send",
    "read",
    "event_register",
    "exposure_register",
    "reload",
    "save_scene",
  ],
  kodi: ["add_to_playlist", "call_method"],
  lametric: ["chart", "message"],
  lcn: [
    "output_abs",
    "output_rel",
    "output_toggle",
    "relays",
    "led",
    "var_abs",
    "var_reset",
    "var_rel",
    "lock_regulator",
    "send_keys",
    "lock_keys",
    "dyn_text",
    "pck",
  ],
  lifx: [
    "set_hev_cycle_state",
    "set_state",
    "effect_pulse",
    "effect_colorloop",
    "effect_move",
    "effect_colorsweep",
    "effect_flame",
    "effect_morph",
    "effect_sky",
    "effect_stop",
    "paint_theme",
  ],
  linkplay: ["play_preset"],
  litterrobot: ["set_sleep_mode"],
  local_file: ["update_file_path"],
  logger: ["set_default_level", "set_level"],
  lovelace: ["reload_resources"],
  lyric: ["set_hold_time"],
  mastodon: [
    "get_account",
    "mute_account",
    "unmute_account",
    "post",
    "update_profile",
  ],
  matrix: ["send_message", "react"],
  matter: [
    "clear_lock_credential",
    "clear_lock_user",
    "get_lock_credential_status",
    "get_lock_info",
    "get_lock_users",
    "set_lock_credential",
    "set_lock_user",
    "water_heater_boost",
  ],
  mealie: [
    "add_ingredient",
    "delete_mealplan",
    "get_mealplan",
    "get_recipe",
    "get_recipes",
    "get_shopping_list_items",
    "import_recipe",
    "parse_ingredient",
    "set_random_mealplan",
    "set_mealplan",
    "update_mealplan",
  ],
  media_extractor: ["play_media", "extract_media_url"],
};

/** Services of the same share that existing editors already cover. */
const ALREADY_COVERED: Record<string, string[]> = {
  homeassistant: ["set_location", "update_entity", "reload_config_entry"],
  humidifier: ["set_mode", "set_humidity", "turn_on"],
  input_boolean: ["toggle", "turn_on"],
  input_button: ["press"],
  input_datetime: ["set_datetime"],
  input_number: ["set_value", "increment"],
  input_select: ["select_option", "set_options"],
  input_text: ["set_value"],
  lawn_mower: ["start_mowing", "dock"],
  light: ["turn_on", "turn_off", "toggle"],
  lock: ["lock", "unlock", "open"],
  logbook: ["log"],
  image: ["snapshot"],
  image_processing: ["scan"],
};

const number = (min: number, max: number, extra = {}) => ({
  selector: { number: { min, max, ...extra } },
});

const ctxFor = (
  action: string,
  fields: Record<string, any>,
  data: Record<string, unknown> = {}
): QuickContext => ({
  action,
  data,
  fields,
  domainServices: [],
  entities: [],
});

const kinds = (controls: QuickControl[]) =>
  Object.fromEntries(
    controls.filter((c) => !c.key.startsWith("$")).map((c) => [c.key, c.kind])
  );

const editors = { ...DOMAIN_EDITORS, ...INTEGRATION_EDITORS_C };

describe("integration editors hive to media_extractor", () => {
  it("has an editor for every service of every integration in the share", () => {
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      const editor = INTEGRATION_EDITORS_C[domain];
      expect(editor, `${domain} has no editor`).toBeDefined();
      services.forEach((service) => {
        expect(
          service in editor.controls || "*" in editor.controls,
          `${domain}.${service} has no editor`
        ).toBe(true);
      });
      // Nothing extra and nothing missing against the hand-written list.
      expect(Object.keys(editor.controls).filter((s) => s !== "*")).toEqual(
        expect.arrayContaining(services)
      );
    });
    expect(Object.keys(INTEGRATION_EDITORS_C).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    );
  });

  it("leaves services that existing editors cover to those editors", () => {
    Object.entries(ALREADY_COVERED).forEach(([domain, services]) => {
      expect(INTEGRATION_EDITORS_C[domain]).toBeUndefined();
      services.forEach((service) => {
        expect(
          service in DOMAIN_EDITORS[domain].controls ||
            "*" in DOMAIN_EDITORS[domain].controls,
          `${domain}.${service} is not covered by an existing editor`
        ).toBe(true);
      });
    });
  });

  it("gives hive a duration, a slider and tiles", () => {
    expect(
      kinds(
        INTEGRATION_EDITORS_C.hive.controls.boost_hot_water(
          ctxFor("hive.boost_hot_water", {
            time_period: { selector: { time: null }, required: true },
            on_off: {
              selector: { select: { options: ["on", "off"] } },
              required: true,
            },
          })
        )
      )
    ).toEqual({ time_period: "duration", on_off: "tiles" });
    expect(
      kinds(
        INTEGRATION_EDITORS_C.hive.controls.boost_heating_on(
          ctxFor("hive.boost_heating_on", {
            time_period: { selector: { time: null }, required: true },
            temperature: { selector: number(7, 35, { step: 0.5 }) },
          })
        )
      )
    ).toEqual({ time_period: "duration", temperature: "slider" });
  });

  it("shows only the fields a service declares", () => {
    const built = INTEGRATION_EDITORS_C.hive.controls.boost_heating_on(
      ctxFor("hive.boost_heating_on", {
        temperature: { selector: number(7, 35, { step: 0.5 }) },
      })
    );
    expect(Object.keys(kinds(built))).toEqual(["temperature"]);
  });

  it("uses a colour picker for kiosker colours and a switch for flags", () => {
    const built = INTEGRATION_EDITORS_C.kiosker.controls.set_blackout(
      ctxFor("kiosker.set_blackout", {
        visible: { selector: { boolean: null } },
        text: { selector: { text: null } },
        background: { selector: { color_rgb: null } },
        foreground: { selector: { color_rgb: null } },
        expire: {
          selector: number(0, 3600, { unit_of_measurement: "seconds" }),
        },
        dismissible: { selector: { boolean: null } },
      })
    );
    expect(kinds(built)).toEqual({
      visible: "switch",
      text: "text",
      background: "color",
      foreground: "color",
      expire: "duration",
      dismissible: "switch",
    });
  });

  it("uses a password input for lock codes and a counter for long text", () => {
    const pin = INTEGRATION_EDITORS_C.homematicip_cloud.controls.pull_latch(
      ctxFor("homematicip_cloud.pull_latch", {
        pin: { selector: { text: { type: "password" } } },
      })
    );
    expect(pin).toMatchObject([
      { key: "pin", kind: "text", inputType: "password" },
    ]);
    const post = INTEGRATION_EDITORS_C.mastodon.controls.post(
      ctxFor("mastodon.post", {
        status: { selector: { text: { multiline: true } }, required: true },
        visibility: {
          selector: {
            select: { options: ["public", "unlisted", "private", "direct"] },
          },
        },
      })
    );
    expect(post).toMatchObject([
      { key: "status", kind: "text", multiline: true, showCount: true },
      { key: "visibility", kind: "tiles" },
    ]);
  });

  it("uses dates, times and a media selector where the value is one", () => {
    expect(
      kinds(
        INTEGRATION_EDITORS_C.mealie.controls.get_mealplan(
          ctxFor("mealie.get_mealplan", {
            start_date: { selector: { date: null } },
            end_date: { selector: { date: null } },
          })
        )
      )
    ).toEqual({ start_date: "date", end_date: "date" });
    expect(
      kinds(
        INTEGRATION_EDITORS_C.litterrobot.controls.set_sleep_mode(
          ctxFor("litterrobot.set_sleep_mode", {
            enabled: { selector: { boolean: null } },
            start_time: { selector: { time: null } },
          })
        )
      )
    ).toEqual({ enabled: "switch", start_time: "time" });
    const upload = INTEGRATION_EDITORS_C.immich.controls.upload_file(
      ctxFor("immich.upload_file", {
        file: { selector: { media: {} }, required: true },
      })
    );
    expect(upload).toMatchObject([
      { key: "file", kind: "selector", valueType: "media" },
    ]);
  });

  it("builds numeric ranges and units from the service description", () => {
    const built = INTEGRATION_EDITORS_C.kef.controls.set_desk_db(
      ctxFor("kef.set_desk_db", {
        db_value: {
          selector: number(-6, 0, { step: 0.5, unit_of_measurement: "dB" }),
        },
      })
    );
    expect(built).toMatchObject([
      {
        key: "db_value",
        kind: "slider",
        min: -6,
        max: 0,
        step: 0.5,
        unit: "dB",
      },
    ]);
  });

  it("shows Home Connect options only for the program family", () => {
    const fields = {
      program: { selector: { select: { options: ["a"] } } },
    };
    const none = kinds(
      INTEGRATION_EDITORS_C.home_connect.controls.set_program_and_options(
        ctxFor("home_connect.set_program_and_options", fields)
      )
    );
    expect(none).toEqual({ program: "selector" });
    const washer = kinds(
      INTEGRATION_EDITORS_C.home_connect.controls.set_program_and_options(
        ctxFor("home_connect.set_program_and_options", fields, {
          program: "laundry_care_washer_program_cotton",
        })
      )
    );
    expect(washer).toHaveProperty("laundry_care_washer_option_spin_speed");
    expect(washer).toHaveProperty(
      "laundry_care_washer_option_prewash",
      "switch"
    );
    expect(washer).not.toHaveProperty("dishcare_dishwasher_option_half_load");
  });

  it("maps prefixed Join actions to their editors", () => {
    const direct = INTEGRATION_EDITORS_C.joaoapps_join.controls["*"](
      ctxFor("joaoapps_join.living_room_send_url", {})
    );
    expect(direct).toMatchObject([
      { key: "url", kind: "text", inputType: "url" },
    ]);
  });

  it("warns before dangerous services", () => {
    expect(INTEGRATION_EDITORS_C.icloud.cautions).toHaveProperty("lost_device");
    expect(INTEGRATION_EDITORS_C.matter.cautions).toHaveProperty(
      "clear_lock_user"
    );
  });

  it("merges into the registry without losing existing domains", () => {
    expect(editors.light).toBeDefined();
    expect(editors.hive).toBeDefined();
  });
});
