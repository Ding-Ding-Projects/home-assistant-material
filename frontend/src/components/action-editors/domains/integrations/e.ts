import {
  attrList,
  attrNumber,
  choice,
  compact,
  duration,
  L,
  notice,
  selector,
  slider,
  stepper,
  temporal,
  textBox,
  tiles,
  toggle,
} from "../../quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
} from "../../quick-types";
import { NOTIFY_CHIPS } from "../media";

/**
 * Tailored action editors for integrations prosegur to switch (share E).
 * One entry per `domain.service`; label keys follow `<domain>__<field>`.
 */

type Make = (ctx: QuickContext) => QuickControl | undefined;

const F = (domain: string, field: string) => L(`${domain}__${field}`);

const build =
  (...makers: Make[]) =>
  (ctx: QuickContext): QuickControl[] =>
    compact(makers.map((make) => make(ctx)));

const noFields = () => [];

/** A one-line explanation shown beside a service that takes no data. */
const info =
  (domain: string, service: string): Make =>
  () =>
    notice(service, F(domain, `note_${service}`));

const text =
  (
    domain: string,
    key: string,
    extra: Partial<Extract<QuickControl, { kind: "text" }>> = {}
  ): Make =>
  (ctx) =>
    textBox(ctx, key, F(domain, key), extra);

const longText =
  (domain: string, key: string, maxLength?: number): Make =>
  (ctx) =>
    textBox(ctx, key, F(domain, key), {
      multiline: true,
      showCount: true,
      ...(maxLength ? { maxLength } : {}),
    });

const message =
  (domain: string, key: string, maxLength?: number): Make =>
  (ctx) =>
    textBox(ctx, key, F(domain, key), {
      multiline: true,
      showCount: true,
      chips: NOTIFY_CHIPS,
      ...(maxLength ? { maxLength } : {}),
    });

const secret = (domain: string, key: string): Make =>
  text(domain, key, { inputType: "password" });

const numberBox = (domain: string, key: string): Make =>
  text(domain, key, { inputType: "number" });

const range =
  (
    domain: string,
    key: string,
    min: number,
    max: number,
    step: number,
    unit?: string,
    scale?: number
  ): Make =>
  (ctx) =>
    slider(ctx, key, F(domain, key), min, max, step, {
      ...(unit ? { unit } : {}),
      ...(scale ? { scale } : {}),
    });

const count =
  (
    domain: string,
    key: string,
    min: number,
    max: number,
    step = 1,
    unit?: string
  ): Make =>
  (ctx) =>
    stepper(ctx, key, F(domain, key), min, max, step, unit);

const pick =
  (domain: string, key: string, values: string[]): Make =>
  (ctx) =>
    tiles(ctx, key, F(domain, key), values);

const pickLong =
  (domain: string, key: string, values: string[]): Make =>
  (ctx) =>
    choice(ctx, key, F(domain, key), values);

const flag =
  (domain: string, key: string): Make =>
  (ctx) =>
    toggle(ctx, key, F(domain, key));

const seconds =
  (domain: string, key: string): Make =>
  (ctx) =>
    duration(ctx, key, F(domain, key), "seconds");

const clock =
  (domain: string, key: string): Make =>
  (ctx) =>
    duration(ctx, key, F(domain, key), "hms");

const moment =
  (domain: string, key: string, kind: "time" | "date" | "datetime"): Make =>
  (ctx) =>
    temporal(ctx, key, F(domain, key), kind);

const device =
  (
    domain: string,
    key: string,
    integration: string,
    extra: Record<string, unknown> = {}
  ): Make =>
  (ctx) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { device: { integration, ...extra } },
      "other"
    );

const devices =
  (domain: string, key: string, filter: Record<string, unknown>[]): Make =>
  (ctx) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { device: { multiple: true, filter } },
      "other"
    );

const entry =
  (domain: string, key: string, integration: string): Make =>
  (ctx) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { config_entry: { integration } },
      "other"
    );

const entityOf =
  (
    domain: string,
    key: string,
    entityDomain: string,
    integration: string,
    multiple = false
  ): Make =>
  (ctx) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { entity: { domain: entityDomain, integration, multiple } },
      "entity"
    );

const listOfText =
  (domain: string, key: string, type?: string): Make =>
  (ctx) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { text: { multiple: true, ...(type ? { type } : {}) } },
      "list"
    );

const objectBox =
  (domain: string, key: string, config: Record<string, unknown> = {}): Make =>
  (ctx) =>
    selector(ctx, key, F(domain, key), { object: config }, "object");

/** Choice from an attribute list of the targeted entities, text otherwise. */
const fromAttribute =
  (domain: string, key: string, attribute: string): Make =>
  (ctx) => {
    const values = attrList(ctx, attribute);
    return values.length
      ? choice(ctx, key, F(domain, key), values)
      : textBox(ctx, key, F(domain, key));
  };

/* ---------------------------------------------------------------- shared */

const RENSON_LEVELS = ["level1", "level2", "level3", "level4"];
const VOLUMES = ["low", "medium", "high", "off"];
const PRIORITIES_5 = ["highest", "high", "normal", "low", "lowest"];
const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Weekly schedule rows: an id, an on switch and one slot per weekday. */
const scheduleRows = (slot: Record<string, unknown>) => ({
  multiple: true,
  label_field: "id",
  fields: {
    id: { required: true, selector: { number: { min: 1, mode: "box" } } },
    activated: { required: false, selector: { boolean: {} } },
    ...Object.fromEntries(
      WEEKDAYS.map((day) => [
        day,
        { required: false, selector: { object: { fields: slot } } },
      ])
    ),
  },
});

const CHARGE_SLOT = {
  startTime: { required: true, selector: { text: {} } },
  duration: {
    required: true,
    selector: { number: { min: 15, max: 1440, unit_of_measurement: "min" } },
  },
};

const AC_SLOT = { readyAtTime: { required: true, selector: { text: {} } } };

/** Sensibo AC state used by the climate react rules. */
const SENSIBO_STATE = {
  fields: {
    on: { required: false, selector: { boolean: {} } },
    mode: {
      required: false,
      selector: {
        select: { options: ["cool", "heat", "fan", "auto", "dry"] },
      },
    },
    targetTemperature: {
      required: false,
      selector: { number: { min: 0, max: 150, mode: "box" } },
    },
    temperatureUnit: {
      required: false,
      selector: { select: { options: ["C", "F"] } },
    },
    fanLevel: { required: false, selector: { text: {} } },
    swing: { required: false, selector: { text: {} } },
    horizontalSwing: { required: false, selector: { text: {} } },
    light: {
      required: false,
      selector: { select: { options: ["on", "off", "dim"] } },
    },
  },
};

const SMTP_ATTACHMENTS = {
  label_field: "media_source",
  description_field: "filename",
  multiple: true,
  fields: {
    media_source: { required: true, selector: { media: { accept: ["*"] } } },
    filename: { required: false, selector: { text: {} } },
    content_id: { required: false, selector: { text: {} } },
  },
};

const SCREENLOGIC_COLOR_MODES = [
  "all_off",
  "all_on",
  "american",
  "blue",
  "caribbean",
  "color_set",
  "color_swim",
  "color_sync",
  "green",
  "hold",
  "magenta",
  "next_mode",
  "party",
  "recall",
  "red",
  "reset",
  "romance",
  "royal",
  "save",
  "sunset",
  "thumper",
  "white",
];

const SMLIGHT_BPM = [
  "25",
  "28",
  "31",
  "35",
  "40",
  "45",
  "50",
  "56",
  "63",
  "70",
  "80",
  "90",
  "100",
  "112",
  "125",
  "140",
  "160",
  "180",
  "200",
  "225",
  "250",
  "285",
  "320",
  "355",
  "400",
  "450",
  "500",
  "565",
  "635",
  "715",
  "800",
  "900",
];

const RINGTONES = [
  "citybird",
  "originaltune",
  "pianokey",
  "loop",
  "attraction",
  "hophop",
  "goodday",
  "operetta",
  "moonlight",
  "waybackhome",
];

const TORRENT_FILTERS = [
  "active",
  "inactive",
  "paused",
  "all",
  "seeding",
  "started",
  "errored",
];

const reload = (domain: string): DomainEditor => ({
  controls: { reload: build(info(domain, "reload")) },
});

const entityTemperature =
  (domain: string, key: string, fallbackMin: number, fallbackMax: number) =>
  (ctx: QuickContext) =>
    stepper(
      ctx,
      key,
      F(domain, key),
      attrNumber(ctx, "min_temp", fallbackMin, "min"),
      attrNumber(ctx, "max_temp", fallbackMax, "max"),
      0.5
    );

/* --------------------------------------------------------------- editors */

export const INTEGRATION_EDITORS_E: Record<string, DomainEditor> = {
  prosegur: {
    controls: { request_image: build(info("prosegur", "request_image")) },
  },
  prowl: {
    controls: {
      send_message: build(
        message("prowl", "message", 10000),
        text("prowl", "title", { maxLength: 1024 }),
        pick("prowl", "priority", [
          "very_low",
          "moderate",
          "normal",
          "high",
          "emergency",
        ]),
        text("prowl", "url", { inputType: "url", maxLength: 512 })
      ),
    },
  },
  ps4: {
    controls: {
      send_command: build(
        entityOf("ps4", "entity_id", "media_player", "ps4"),
        pick("ps4", "command", [
          "up",
          "down",
          "left",
          "right",
          "enter",
          "back",
          "option",
          "ps",
          "ps_hold",
        ])
      ),
    },
  },
  pushover: {
    controls: {
      cancel: build(
        entry("pushover", "entry_id", "pushover"),
        text("pushover", "tag")
      ),
    },
  },
  python_script: reload("python_script"),
  qbittorrent: {
    siblings: ["get_torrents", "get_all_torrents"],
    controls: {
      get_torrents: build(
        device("qbittorrent", "device_id", "qbittorrent"),
        pick("qbittorrent", "torrent_filter", TORRENT_FILTERS)
      ),
      get_all_torrents: build(
        pick("qbittorrent", "torrent_filter", TORRENT_FILTERS)
      ),
    },
  },
  qvr_pro: {
    siblings: ["start_record", "stop_record"],
    controls: {
      start_record: build(text("qvr_pro", "guid")),
      stop_record: build(text("qvr_pro", "guid")),
    },
  },
  rachio: {
    siblings: [
      "start_watering",
      "start_multiple_zone_schedule",
      "set_zone_moisture_percent",
      "pause_watering",
      "resume_watering",
      "stop_watering",
    ],
    cautions: { stop_watering: F("rachio", "caution_stop_watering") },
    controls: {
      set_zone_moisture_percent: build(
        range("rachio", "percent", 0, 100, 1, "%")
      ),
      start_watering: build(count("rachio", "duration", 1, 1440, 1, "min")),
      start_multiple_zone_schedule: build(
        listOfText("rachio", "duration", "number"),
        info("rachio", "start_multiple_zone_schedule")
      ),
      pause_watering: build(
        text("rachio", "devices"),
        range("rachio", "duration", 1, 60, 1, "min")
      ),
      resume_watering: build(text("rachio", "devices")),
      stop_watering: build(text("rachio", "devices")),
    },
  },
  radarr: {
    siblings: ["get_movies", "get_queue"],
    controls: {
      get_movies: build(entry("radarr", "entry_id", "radarr")),
      get_queue: build(
        entry("radarr", "entry_id", "radarr"),
        count("radarr", "max_items", 0, 500)
      ),
    },
  },
  rainbird: {
    siblings: ["start_irrigation", "set_rain_delay"],
    controls: {
      start_irrigation: build(range("rainbird", "duration", 1, 1440, 1, "min")),
      set_rain_delay: build(
        entry("rainbird", "config_entry_id", "rainbird"),
        range("rainbird", "duration", 0, 14, 1, "d")
      ),
    },
  },
  rainmachine: {
    siblings: [
      "start_program",
      "stop_program",
      "start_zone",
      "stop_zone",
      "pause_watering",
      "unpause_watering",
      "restrict_watering",
      "unrestrict_watering",
      "stop_all",
    ],
    cautions: { stop_all: F("rainmachine", "caution_stop_all") },
    controls: {
      pause_watering: build(
        device("rainmachine", "device_id", "rainmachine"),
        seconds("rainmachine", "seconds")
      ),
      restrict_watering: build(
        device("rainmachine", "device_id", "rainmachine"),
        clock("rainmachine", "duration")
      ),
      start_program: build(info("rainmachine", "start_program")),
      start_zone: build(seconds("rainmachine", "zone_run_time")),
      stop_all: build(device("rainmachine", "device_id", "rainmachine")),
      stop_program: build(info("rainmachine", "stop_program")),
      stop_zone: build(info("rainmachine", "stop_zone")),
      unpause_watering: build(
        device("rainmachine", "device_id", "rainmachine")
      ),
      unrestrict_watering: build(
        device("rainmachine", "device_id", "rainmachine")
      ),
      push_flow_meter_data: build(
        device("rainmachine", "device_id", "rainmachine"),
        count("rainmachine", "value", 0, 1000000000, 0.1),
        pick("rainmachine", "unit_of_measurement", [
          "clicks",
          "gal",
          "litre",
          "m3",
        ])
      ),
      push_weather_data: build(
        device("rainmachine", "device_id", "rainmachine"),
        numberBox("rainmachine", "timestamp"),
        range("rainmachine", "temperature", -40, 40, 0.1, "°C"),
        range("rainmachine", "mintemp", -40, 40, 0.1, "°C"),
        range("rainmachine", "maxtemp", -40, 40, 0.1, "°C"),
        range("rainmachine", "dewpoint", -40, 40, 0.1, "°C"),
        range("rainmachine", "minrh", 0, 100, 1, "%"),
        range("rainmachine", "maxrh", 0, 100, 1, "%"),
        range("rainmachine", "wind", 0, 65, 1, "m/s"),
        range("rainmachine", "solarrad", 0, 100, 0.1, "MJ/m²/d"),
        range("rainmachine", "pressure", 60, 110, 1, "kPa"),
        range("rainmachine", "et", 0, 1000, 1, "mm"),
        range("rainmachine", "qpf", 0, 1000, 1, "mm"),
        range("rainmachine", "rain", 0, 1000, 1, "mm"),
        text("rainmachine", "condition")
      ),
    },
  },
  remember_the_milk: {
    siblings: ["create_task", "complete_task"],
    controls: {
      create_task: build(
        text("remember_the_milk", "name", { showCount: true }),
        text("remember_the_milk", "id")
      ),
      complete_task: build(text("remember_the_milk", "id")),
    },
  },
  renault: {
    siblings: [
      "ac_start",
      "ac_cancel",
      "ac_set_schedules",
      "charge_start",
      "charge_set_schedules",
    ],
    controls: {
      ac_start: build(
        device("renault", "vehicle", "renault"),
        range("renault", "temperature", 15, 25, 0.5, "°C"),
        moment("renault", "when", "datetime")
      ),
      ac_cancel: build(device("renault", "vehicle", "renault")),
      ac_set_schedules: build(
        device("renault", "vehicle", "renault"),
        objectBox("renault", "schedules", scheduleRows(AC_SLOT))
      ),
      charge_start: build(
        device("renault", "vehicle", "renault"),
        moment("renault", "when", "datetime")
      ),
      charge_set_schedules: build(
        device("renault", "vehicle", "renault"),
        objectBox("renault", "schedules", scheduleRows(CHARGE_SLOT))
      ),
    },
  },
  renson: {
    siblings: ["set_timer_level", "set_breeze", "set_pollution_settings"],
    controls: {
      set_timer_level: build(
        pick("renson", "timer_level", [...RENSON_LEVELS, "holiday", "breeze"]),
        range("renson", "minutes", 0, 1440, 10, "min")
      ),
      set_breeze: build(
        flag("renson", "activate"),
        pick("renson", "breeze_level", RENSON_LEVELS),
        range("renson", "temperature", 15, 35, 1, "°C")
      ),
      set_pollution_settings: build(
        pick("renson", "day_pollution_level", RENSON_LEVELS),
        pick("renson", "night_pollution_level", RENSON_LEVELS),
        flag("renson", "humidity_control"),
        flag("renson", "airquality_control"),
        flag("renson", "co2_control"),
        range("renson", "co2_threshold", 400, 2000, 50, "ppm"),
        range("renson", "co2_hysteresis", 50, 400, 50, "ppm")
      ),
    },
  },
  reolink: {
    siblings: ["ptz_move", "play_chime", "snapshot_past"],
    controls: {
      ptz_move: build(range("reolink", "speed", 1, 64, 1)),
      play_chime: build(
        devices("reolink", "device_id", [
          { integration: "reolink", model: "Reolink Chime" },
        ]),
        pickLong("reolink", "ringtone", RINGTONES)
      ),
      snapshot_past: build(
        moment("reolink", "timestamp", "datetime"),
        text("reolink", "filename")
      ),
    },
  },
  rest: reload("rest"),
  rest_command: reload("rest_command"),
  rflink: {
    controls: {
      send_command: build(
        text("rflink", "device_id"),
        text("rflink", "command")
      ),
    },
  },
  rfxtrx: {
    controls: { send: build(text("rfxtrx", "event")) },
  },
  risco: {
    controls: {
      set_time: build(
        entry("risco", "config_entry_id", "risco"),
        moment("risco", "time", "datetime")
      ),
    },
  },
  roborock: {
    siblings: [
      "get_maps",
      "get_vacuum_current_position",
      "set_vacuum_goto_position",
      "set_vacuum_zoned_cleaning",
    ],
    controls: {
      get_maps: build(info("roborock", "get_maps")),
      get_vacuum_current_position: build(
        info("roborock", "get_vacuum_current_position")
      ),
      set_vacuum_goto_position: build(
        numberBox("roborock", "x"),
        numberBox("roborock", "y"),
        info("roborock", "set_vacuum_goto_position")
      ),
      set_vacuum_zoned_cleaning: build(
        numberBox("roborock", "x1"),
        numberBox("roborock", "y1"),
        numberBox("roborock", "x2"),
        numberBox("roborock", "y2"),
        count("roborock", "repeats", 0, 2)
      ),
    },
  },
  roku: {
    controls: { search: build(text("roku", "keyword")) },
  },
  roon: {
    controls: {
      transfer: build(entityOf("roon", "transfer_id", "media_player", "roon")),
    },
  },
  route53: {
    controls: { update_records: build(info("route53", "update_records")) },
  },
  saunum: {
    controls: {
      start_session: (ctx) =>
        compact([
          duration(ctx, "duration", F("saunum", "duration"), "seconds"),
          entityTemperature("saunum", "target_temperature", 40, 100)(ctx),
          duration(ctx, "fan_duration", F("saunum", "fan_duration"), "seconds"),
        ]),
    },
  },
  schlage: {
    siblings: ["get_codes", "add_code", "delete_code"],
    cautions: { delete_code: F("schlage", "caution_delete_code") },
    controls: {
      get_codes: build(info("schlage", "get_codes")),
      add_code: build(
        text("schlage", "name"),
        secret("schlage", "code"),
        flag("schlage", "notify_on_use"),
        moment("schlage", "start_datetime", "datetime"),
        moment("schlage", "end_datetime", "datetime")
      ),
      delete_code: build(text("schlage", "name")),
    },
  },
  screenlogic: {
    siblings: [
      "set_color_mode",
      "start_super_chlorination",
      "stop_super_chlorination",
    ],
    controls: {
      set_color_mode: build(
        entry("screenlogic", "config_entry", "screenlogic"),
        pickLong("screenlogic", "color_mode", SCREENLOGIC_COLOR_MODES)
      ),
      start_super_chlorination: build(
        entry("screenlogic", "config_entry", "screenlogic"),
        range("screenlogic", "runtime", 0, 72, 1, "h")
      ),
      stop_super_chlorination: build(
        entry("screenlogic", "config_entry", "screenlogic")
      ),
    },
  },
  sensibo: {
    siblings: [
      "assume_state",
      "full_state",
      "enable_timer",
      "enable_pure_boost",
      "enable_climate_react",
      "get_device_capabilities",
    ],
    controls: {
      assume_state: build(pick("sensibo", "state", ["on", "off"])),
      enable_timer: build(count("sensibo", "minutes", 0, 10080, 1, "min")),
      enable_pure_boost: build(
        flag("sensibo", "ac_integration"),
        flag("sensibo", "geo_integration"),
        flag("sensibo", "indoor_integration"),
        flag("sensibo", "outdoor_integration"),
        pick("sensibo", "sensitivity", ["normal", "sensitive"])
      ),
      full_state: (ctx) =>
        compact([
          pick("sensibo", "mode", [
            "cool",
            "heat",
            "fan",
            "auto",
            "dry",
            "off",
          ])(ctx),
          entityTemperature("sensibo", "target_temperature", 0, 150)(ctx),
          fromAttribute("sensibo", "fan_mode", "fan_modes")(ctx),
          fromAttribute("sensibo", "swing_mode", "swing_modes")(ctx),
          fromAttribute(
            "sensibo",
            "horizontal_swing_mode",
            "swing_horizontal_modes"
          )(ctx),
          pick("sensibo", "light", ["on", "off", "dim"])(ctx),
        ]),
      enable_climate_react: build(
        pick("sensibo", "smart_type", ["temperature", "feelslike", "humidity"]),
        count("sensibo", "high_temperature_threshold", 0, 150, 0.1),
        objectBox("sensibo", "high_temperature_state", SENSIBO_STATE),
        count("sensibo", "low_temperature_threshold", 0, 150, 0.1),
        objectBox("sensibo", "low_temperature_state", SENSIBO_STATE)
      ),
      get_device_capabilities: build(
        pick("sensibo", "hvac_mode", ["auto", "cool", "dry", "fan", "heat"])
      ),
    },
  },
  seventeentrack: {
    siblings: ["get_packages", "add_package", "archive_package"],
    controls: {
      get_packages: build(
        entry("seventeentrack", "config_entry_id", "seventeentrack"),
        (ctx) =>
          selector(
            ctx,
            "package_state",
            F("seventeentrack", "package_state"),
            {
              select: {
                multiple: true,
                mode: "list",
                options: [
                  "not_found",
                  "in_transit",
                  "expired",
                  "ready_to_be_picked_up",
                  "undelivered",
                  "delivered",
                  "alert",
                ].map((value) => ({
                  value,
                  label: value.replace(/_/g, " "),
                })),
              },
            },
            "list"
          )
      ),
      add_package: build(
        entry("seventeentrack", "config_entry_id", "seventeentrack"),
        text("seventeentrack", "package_tracking_number"),
        text("seventeentrack", "package_friendly_name")
      ),
      archive_package: build(
        entry("seventeentrack", "config_entry_id", "seventeentrack"),
        text("seventeentrack", "package_tracking_number")
      ),
    },
  },
  sharkiq: {
    controls: {
      clean_room: (ctx) => {
        const rooms = attrList(ctx, "rooms");
        return compact([
          selector(
            ctx,
            "rooms",
            F("sharkiq", "rooms"),
            {
              select: {
                multiple: true,
                custom_value: rooms.length === 0,
                mode: "list",
                options: rooms.map((value) => ({ value, label: value })),
              },
            },
            "list"
          ),
        ]);
      },
    },
  },
  shell_command: reload("shell_command"),
  shelly: {
    siblings: ["get_kvs_value", "set_kvs_value", "set_cover_position_and_tilt"],
    controls: {
      get_kvs_value: build(
        device("shelly", "device_id", "shelly"),
        text("shelly", "key")
      ),
      set_kvs_value: build(
        device("shelly", "device_id", "shelly"),
        text("shelly", "key"),
        objectBox("shelly", "value")
      ),
      set_cover_position_and_tilt: build(
        range("shelly", "position", 0, 100, 1, "%"),
        range("shelly", "tilt_position", 0, 100, 1, "%")
      ),
    },
  },
  simplisafe: {
    siblings: ["set_system_properties", "set_pin", "remove_pin"],
    cautions: { remove_pin: F("simplisafe", "caution_remove_pin") },
    controls: {
      remove_pin: build(
        device("simplisafe", "device_id", "simplisafe", {
          entity: { domain: "alarm_control_panel" },
        }),
        text("simplisafe", "label_or_pin")
      ),
      set_pin: build(
        device("simplisafe", "device_id", "simplisafe", {
          entity: { domain: "alarm_control_panel" },
        }),
        text("simplisafe", "label"),
        secret("simplisafe", "pin")
      ),
      set_system_properties: build(
        device("simplisafe", "device_id", "simplisafe", {
          entity: { domain: "alarm_control_panel" },
        }),
        range("simplisafe", "alarm_duration", 30, 480, 1, "s"),
        pick("simplisafe", "alarm_volume", VOLUMES),
        pick("simplisafe", "chime_volume", VOLUMES),
        pick("simplisafe", "voice_prompt_volume", VOLUMES),
        range("simplisafe", "entry_delay_away", 30, 255, 1, "s"),
        range("simplisafe", "entry_delay_home", 0, 255, 1, "s"),
        range("simplisafe", "exit_delay_away", 45, 255, 1, "s"),
        range("simplisafe", "exit_delay_home", 0, 255, 1, "s"),
        flag("simplisafe", "light")
      ),
    },
  },
  smarttub: {
    siblings: [
      "set_primary_filtration",
      "set_secondary_filtration",
      "snooze_reminder",
      "reset_reminder",
    ],
    controls: {
      set_primary_filtration: build(
        range("smarttub", "duration", 1, 24, 1, "h"),
        range("smarttub", "start_hour", 0, 23, 1, "h")
      ),
      set_secondary_filtration: build(
        pick("smarttub", "mode", ["frequent", "infrequent", "away"])
      ),
      snooze_reminder: build(range("smarttub", "days", 10, 120, 1, "d")),
      reset_reminder: build(range("smarttub", "days", 30, 365, 1, "d")),
    },
  },
  smlight: {
    controls: {
      play_rtttl: build(
        device("smlight", "device_id", "smlight", {
          model: "SLZB-Ultima3",
        }),
        text("smlight", "notes", { showCount: true }),
        count("smlight", "octave", 4, 7),
        pick("smlight", "duration", ["1", "2", "4", "8", "16", "32"]),
        pickLong("smlight", "bpm", SMLIGHT_BPM)
      ),
    },
  },
  smtp: {
    controls: {
      send_message: build(
        text("smtp", "title"),
        message("smtp", "message"),
        longText("smtp", "html"),
        objectBox("smtp", "attachments", SMTP_ATTACHMENTS),
        pick("smtp", "priority", PRIORITIES_5)
      ),
    },
  },
  snapcast: {
    siblings: ["snapshot", "restore", "set_latency"],
    controls: {
      snapshot: build(info("snapcast", "snapshot")),
      restore: build(info("snapcast", "restore")),
      set_latency: build(range("snapcast", "latency", 1, 1000, 1, "ms")),
    },
  },
  snooz: {
    siblings: ["transition_on", "transition_off"],
    controls: {
      transition_on: build(
        seconds("snooz", "duration"),
        range("snooz", "volume", 1, 100, 1, "%")
      ),
      transition_off: build(seconds("snooz", "duration")),
    },
  },
  sofar: {
    siblings: [
      "set_feed_in_limit",
      "set_active_power_limit",
      "set_passive_mode_timeout",
      "set_passive_mode_power",
    ],
    cautions: {
      set_feed_in_limit: F("sofar", "caution_inverter"),
      set_active_power_limit: F("sofar", "caution_inverter"),
      set_passive_mode_timeout: F("sofar", "caution_inverter"),
      set_passive_mode_power: F("sofar", "caution_inverter"),
    },
    controls: {
      set_feed_in_limit: build(
        entry("sofar", "config_entry_id", "sofar"),
        pick("sofar", "mode", [
          "disabled",
          "enabled_feed_in_limitation",
          "enabled_3_phase_limit",
        ]),
        count("sofar", "max_power", 0, 100000, 100, "W")
      ),
      set_active_power_limit: build(
        entry("sofar", "config_entry_id", "sofar"),
        flag("sofar", "enabled"),
        range("sofar", "limit", 0, 100, 0.1, "%")
      ),
      set_passive_mode_timeout: build(
        entry("sofar", "config_entry_id", "sofar"),
        seconds("sofar", "timeout"),
        pick("sofar", "action", ["force_standby", "return_to_previous_mode"])
      ),
      set_passive_mode_power: build(
        entry("sofar", "config_entry_id", "sofar"),
        count("sofar", "grid_power", -100000, 100000, 1, "W"),
        count("sofar", "battery_power_min", -100000, 100000, 1, "W"),
        count("sofar", "battery_power_max", -100000, 100000, 1, "W")
      ),
    },
  },
  sonarr: {
    siblings: [
      "get_series",
      "get_episodes",
      "get_queue",
      "get_wanted",
      "get_upcoming",
      "get_diskspace",
    ],
    controls: {
      get_series: build(entry("sonarr", "entry_id", "sonarr")),
      get_queue: build(
        entry("sonarr", "entry_id", "sonarr"),
        count("sonarr", "max_items", 0, 500)
      ),
      get_diskspace: build(
        entry("sonarr", "entry_id", "sonarr"),
        pickLong("sonarr", "space_unit", [
          "bytes",
          "kb",
          "kib",
          "mb",
          "mib",
          "gb",
          "gib",
          "tb",
          "tib",
          "pb",
          "pib",
        ])
      ),
      get_upcoming: build(
        entry("sonarr", "entry_id", "sonarr"),
        range("sonarr", "days", 1, 30, 1, "d")
      ),
      get_wanted: build(
        entry("sonarr", "entry_id", "sonarr"),
        count("sonarr", "max_items", 0, 500)
      ),
      get_episodes: build(
        entry("sonarr", "entry_id", "sonarr"),
        count("sonarr", "series_id", 1, 1000000),
        count("sonarr", "season_number", 0, 1000)
      ),
    },
  },
  songpal: {
    controls: {
      set_sound_setting: build(
        text("songpal", "name"),
        text("songpal", "value")
      ),
    },
  },
  sonos: {
    siblings: [
      "snapshot",
      "restore",
      "set_sleep_timer",
      "clear_sleep_timer",
      "play_queue",
      "remove_from_queue",
      "get_queue",
      "update_alarm",
    ],
    controls: {
      snapshot: build(flag("sonos", "with_group")),
      restore: build(flag("sonos", "with_group")),
      set_sleep_timer: build(seconds("sonos", "sleep_time")),
      clear_sleep_timer: noFields,
      play_queue: build(count("sonos", "queue_position", 0, 10000)),
      remove_from_queue: build(count("sonos", "queue_position", 0, 10000)),
      get_queue: build(info("sonos", "get_queue")),
      update_alarm: build(
        count("sonos", "alarm_id", 1, 1440),
        moment("sonos", "time", "time"),
        range("sonos", "volume", 0, 1, 0.01, "%", 100),
        flag("sonos", "enabled"),
        flag("sonos", "include_linked_zones")
      ),
    },
  },
  soundtouch: {
    siblings: [
      "play_everywhere",
      "create_zone",
      "add_zone_slave",
      "remove_zone_slave",
    ],
    controls: {
      play_everywhere: build(
        entityOf("soundtouch", "master", "media_player", "soundtouch")
      ),
      create_zone: build(
        entityOf("soundtouch", "master", "media_player", "soundtouch"),
        entityOf("soundtouch", "slaves", "media_player", "soundtouch", true)
      ),
      add_zone_slave: build(
        entityOf("soundtouch", "master", "media_player", "soundtouch"),
        entityOf("soundtouch", "slaves", "media_player", "soundtouch", true)
      ),
      remove_zone_slave: build(
        entityOf("soundtouch", "master", "media_player", "soundtouch"),
        entityOf("soundtouch", "slaves", "media_player", "soundtouch", true)
      ),
    },
  },
  sql: {
    controls: {
      query: build(longText("sql", "query"), text("sql", "db_url")),
    },
  },
  squeezebox: {
    siblings: ["call_method", "call_query"],
    controls: {
      call_method: build(
        text("squeezebox", "command"),
        listOfText("squeezebox", "parameters")
      ),
      call_query: build(
        text("squeezebox", "command"),
        listOfText("squeezebox", "parameters")
      ),
    },
  },
  starline: {
    siblings: ["update_state", "set_scan_interval", "set_scan_obd_interval"],
    controls: {
      update_state: build(info("starline", "update_state")),
      set_scan_interval: build(seconds("starline", "scan_interval")),
      set_scan_obd_interval: build(seconds("starline", "scan_interval")),
    },
  },
  statistics: reload("statistics"),
  stookwijzer: {
    controls: {
      get_forecast: build(
        entry("stookwijzer", "config_entry_id", "stookwijzer")
      ),
    },
  },
  streamlabswater: {
    controls: {
      set_away_mode: build(
        pick("streamlabswater", "away_mode", ["away", "home"]),
        text("streamlabswater", "location_id")
      ),
    },
  },
  subaru: {
    cautions: {
      unlock_specific_door: F("subaru", "caution_unlock_specific_door"),
    },
    controls: {
      unlock_specific_door: build(
        pick("subaru", "door", ["all", "driver", "tailgate"])
      ),
    },
  },
  surepetcare: {
    siblings: ["set_lock_state", "set_pet_location"],
    controls: {
      set_lock_state: build(
        numberBox("surepetcare", "flap_id"),
        pick("surepetcare", "lock_state", [
          "locked_all",
          "locked_in",
          "locked_out",
          "unlocked",
        ])
      ),
      set_pet_location: build(
        text("surepetcare", "pet_name"),
        pick("surepetcare", "location", ["Inside", "Outside"])
      ),
    },
  },
  swiss_public_transport: {
    controls: {
      fetch_connections: build(
        entry(
          "swiss_public_transport",
          "config_entry_id",
          "swiss_public_transport"
        ),
        range("swiss_public_transport", "limit", 1, 15, 1)
      ),
    },
  },
};
