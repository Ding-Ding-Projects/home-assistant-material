import { hasTemplate } from "../../../../common/string/has-template";
import {
  attrList,
  choice,
  claim,
  compact,
  duration,
  entityTiles,
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

/**
 * Tailored editors for the integrations duckdns to history_stats. Every
 * service of every integration listed here has an entry with one control per
 * field the service declares. Labels live under
 * `ui.components.action-editors.fields.<domain>__<field>`.
 */

type Make = (ctx: QuickContext, domain: string) => QuickControl | undefined;
type TextControl = Extract<QuickControl, { kind: "text" }>;

const key = (domain: string, field: string) => L(`${domain}__${field}`);

const text =
  (field: string, extra: Partial<TextControl> = {}): Make =>
  (ctx, d) =>
    textBox(ctx, field, key(d, field), extra);

const secret = (field: string): Make => text(field, { inputType: "password" });

const link = (field: string): Make => text(field, { inputType: "url" });

const longText = (field: string, maxLength?: number): Make =>
  text(field, {
    multiline: true,
    showCount: true,
    ...(maxLength ? { maxLength } : {}),
  });

const slide =
  (
    field: string,
    min: number,
    max: number,
    step: number,
    unit?: string,
    scale?: number
  ): Make =>
  (ctx, d) =>
    slider(ctx, field, key(d, field), min, max, step, {
      ...(unit ? { unit } : {}),
      ...(scale ? { scale } : {}),
    });

const count =
  (field: string, min: number, max: number, unit?: string): Make =>
  (ctx, d) =>
    stepper(ctx, field, key(d, field), min, max, 1, unit);

const flag =
  (field: string): Make =>
  (ctx, d) =>
    toggle(ctx, field, key(d, field));

/** Short lists become tiles, long lists a drop-down list. */
const pick =
  (field: string, values: string[]): Make =>
  (ctx, d) =>
    choice(ctx, field, key(d, field), values);

/** Tiles whose option labels are translated, under `<domain>__<field>_<value>`. */
const labeled =
  (field: string, values: string[]): Make =>
  (ctx, d) =>
    tiles(ctx, field, key(d, field), values, L(`${d}__${field}_`));

const span =
  (field: string, format?: "seconds" | "hms"): Make =>
  (ctx, d) =>
    duration(ctx, field, key(d, field), format);

const clock =
  (field: string): Make =>
  (ctx, d) =>
    temporal(ctx, field, key(d, field), "time");

const day =
  (field: string): Make =>
  (ctx, d) =>
    temporal(ctx, field, key(d, field), "date");

const stamp =
  (field: string): Make =>
  (ctx, d) =>
    temporal(ctx, field, key(d, field), "datetime");

const pickSelector =
  (
    field: string,
    config: Record<string, any>,
    valueType: Parameters<typeof selector>[4] = "other"
  ): Make =>
  (ctx, d) =>
    selector(ctx, field, key(d, field), config, valueType);

const entities =
  (field: string, domain: string, multiple = false): Make =>
  (ctx, d) =>
    entityTiles(ctx, field, key(d, field), domain, multiple);

/** The integration's own configuration entry. */
const entry =
  (field: string): Make =>
  (ctx, d) =>
    selector(
      ctx,
      field,
      key(d, field),
      { config_entry: { integration: d } },
      "other"
    );

const device =
  (field: string, config: Record<string, any> = {}): Make =>
  (ctx, d) =>
    selector(
      ctx,
      field,
      key(d, field),
      { device: { integration: d, ...config } },
      "other"
    );

const colorBox =
  (field: string): Make =>
  (ctx, d) => {
    const value = ctx.data[field];
    if (!claim(ctx, field) || hasTemplate(value)) return undefined;
    if (
      value !== undefined &&
      !(Array.isArray(value) && value.every((n) => typeof n === "number"))
    ) {
      return undefined;
    }
    return {
      kind: "color",
      key: field,
      labelKey: key(d, field),
      space: "rgb",
      swatches: true,
      value: value as number[] | undefined,
    };
  };

const humanize = (name: string) => {
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Object selector with one real selector per nested field. */
const nested = (fields: Record<string, Record<string, any>>) => ({
  object: {
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, config]) => [
        name,
        { label: humanize(name), required: false, selector: config },
      ])
    ),
  },
});

const section =
  (field: string, fields: Record<string, Record<string, any>>): Make =>
  (ctx, d) =>
    selector(ctx, field, key(d, field), nested(fields), "object");

const object =
  (field: string, config: Record<string, any> = {}): Make =>
  (ctx, d) =>
    selector(ctx, field, key(d, field), { object: config }, "object");

const textList =
  (field: string, type?: string): Make =>
  (ctx, d) =>
    selector(
      ctx,
      field,
      key(d, field),
      { text: { multiple: true, ...(type ? { type } : {}) } },
      "list"
    );

const optionList = (values: string[]) => ({
  select: { multiple: true, mode: "list", options: values },
});

const makers =
  (list: Make[]) =>
  (domain: string) =>
  (ctx: QuickContext): QuickControl[] =>
    compact(list.map((make) => make(ctx, domain)));

type ServiceMap = Record<string, Make[]>;

interface EditorExtras {
  siblings?: boolean;
  cautions?: string[];
  gates?: Record<string, number>;
}

const editor = (
  domain: string,
  services: ServiceMap,
  extras: EditorExtras = {}
): DomainEditor => {
  const names = Object.keys(services);
  return {
    ...(extras.siblings && names.length > 1 ? { siblings: names } : {}),
    ...(extras.cautions
      ? {
          cautions: Object.fromEntries(
            extras.cautions.map((name) => [
              name,
              key(domain, `caution_${name}`),
            ])
          ),
        }
      : {}),
    ...(extras.gates ? { gates: extras.gates } : {}),
    controls: Object.fromEntries(
      names.map((name) => [name, makers(services[name])(domain)])
    ),
  };
};

const reloadOnly = (): QuickControl[] => [notice("reload", L("note_reload"))];

const reloadEditor = (): DomainEditor => ({ controls: { reload: reloadOnly } });

// ---------------------------------------------------------------------------
// Shared pieces

const START_END = [stamp("start"), stamp("end")];

const PRICE_TYPES = ["market", "invoice"];

const GRANULARITY = ["hour", "quarter"];

/** Calendar creation with the same all-day switch the calendar editor uses. */
const isAllDay = (data: Record<string, unknown>) =>
  ("start_date" in data || "end_date" in data) &&
  !("start_date_time" in data || "end_date_time" in data);

const eventTimeControls = (
  ctx: QuickContext,
  d: string
): (QuickControl | undefined)[] => {
  if (ctx.data.in !== undefined) return [];
  const allDay = isAllDay(ctx.data);
  const canSwitch = claim(ctx, "start_date") && claim(ctx, "start_date_time");
  return [
    canSwitch
      ? {
          kind: "switch",
          key: "$all_day",
          labelKey: key(d, "all_day"),
          value: allDay,
        }
      : undefined,
    allDay
      ? temporal(ctx, "start_date", key(d, "start_date"), "date")
      : temporal(ctx, "start_date_time", key(d, "start_date_time"), "datetime"),
    allDay
      ? temporal(ctx, "end_date", key(d, "end_date"), "date")
      : temporal(ctx, "end_date_time", key(d, "end_date_time"), "datetime"),
  ];
};

const calendarEvent = (withCalendar: boolean, withLocation: boolean) => {
  const build = (ctx: QuickContext, d: string): QuickControl[] =>
    compact([
      withCalendar ? text("calendar_id")(ctx, d) : undefined,
      text("summary")(ctx, d),
      ...eventTimeControls(ctx, d),
      longText("description")(ctx, d),
      object("in", {
        fields: {
          days: {
            label: "Days",
            required: false,
            selector: { number: { min: 1, mode: "box" } },
          },
          weeks: {
            label: "Weeks",
            required: false,
            selector: { number: { min: 1, mode: "box" } },
          },
        },
      })(ctx, d),
      withLocation ? text("location")(ctx, d) : undefined,
    ]);
  return (domain: string) => (ctx: QuickContext) => build(ctx, domain);
};

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const weekdayEditors = (): Make[] =>
  WEEKDAYS.map((name) =>
    pickSelector(
      name,
      {
        object: {
          multiple: true,
          label_field: "from",
          description_field: "to",
          fields: {
            from: { label: "From", required: false, selector: { time: {} } },
            to: { label: "To", required: false, selector: { time: {} } },
          },
        },
      },
      "list"
    )
  );

/** Preset names of the targeted thermostats, or a text box when unknown. */
const presetOrText: Make = (ctx, d) =>
  attrList(ctx, "preset_modes").length
    ? choice(
        ctx,
        "preset_mode",
        key(d, "preset_mode"),
        attrList(ctx, "preset_modes")
      )
    : textBox(ctx, "preset_mode", key(d, "preset_mode"));

const ELK_CODE = [secret("code")];

const elkCode = (): Make[] => ELK_CODE;

const POWER_PERIODS = (): Make[] =>
  [1, 2, 3].flatMap((n) => [
    clock(`period_${n}_start`),
    clock(`period_${n}_end`),
    flag(`period_${n}_enabled`),
  ]);

const PRIORITIES = ["trivial", "easy", "medium", "hard"];
const UP_DOWN_OPTIONS = {
  select: {
    multiple: true,
    mode: "list",
    options: [
      { value: "up", label: "➕" },
      { value: "down", label: "➖" },
    ],
  },
};
const FREQUENCIES = ["daily", "weekly", "monthly"];
const COLLAPSE = ["collapsed", "expanded"];
const TEXT_MULTIPLE = { text: { multiple: true } };
const ALIAS = { alias: { text: {} } };
const TAG_OPTIONS = { tag: TEXT_MULTIPLE, remove_tag: TEXT_MULTIPLE };
const CLEAR = { constant: { value: true, label: "🗑️" } };
const COST = {
  number: { min: 0, step: 0.01, unit_of_measurement: "🪙", mode: "box" },
};
const CHECKLIST_OPTIONS = {
  add_checklist_item: TEXT_MULTIPLE,
  remove_checklist_item: TEXT_MULTIPLE,
  score_checklist_item: TEXT_MULTIPLE,
  unscore_checklist_item: TEXT_MULTIPLE,
  collapse_checklist: { select: { mode: "list", options: COLLAPSE } },
};
const DAILY_REMINDERS = {
  reminder: { text: { type: "time", multiple: true } },
  remove_reminder: { text: { type: "time", multiple: true } },
  clear_reminder: CLEAR,
};
const TODO_REMINDERS = {
  reminder: { text: { type: "datetime-local", multiple: true } },
  remove_reminder: { text: { type: "datetime-local", multiple: true } },
  clear_reminder: CLEAR,
};
const WEEKLY_REPEAT = {
  repeat: optionList(["m", "t", "w", "th", "f", "s", "su"]),
};
const MONTHLY_REPEAT = {
  repeat_monthly: {
    select: { mode: "list", options: ["day_of_month", "day_of_week"] },
  },
};
const BACKUP_FOLDERS = [
  "homeassistant",
  "share",
  "ssl",
  "media",
  "addons/local",
];

const habiticaTask: Make[] = [entry("config_entry"), text("task")];

const habiticaPriority = pick("priority", PRIORITIES);

const noteBox = longText("notes");

// ---------------------------------------------------------------------------
// The editors

export const INTEGRATION_EDITORS_B: Record<string, DomainEditor> = {
  duckdns: editor("duckdns", {
    set_txt: [entry("config_entry_id"), text("txt")],
  }),
  dynalite: editor(
    "dynalite",
    {
      request_area_preset: [
        text("host"),
        count("area", 1, 9999),
        count("channel", 1, 9999),
      ],
      request_channel_level: [
        text("host"),
        count("area", 1, 9999),
        count("channel", 1, 9999),
      ],
    },
    { siblings: true }
  ),
  easyenergy: editor(
    "easyenergy",
    {
      get_gas_prices: [
        entry("config_entry"),
        flag("incl_vat"),
        pick("price_type", PRICE_TYPES),
        ...START_END,
      ],
      get_energy_usage_prices: [
        entry("config_entry"),
        flag("incl_vat"),
        pick("granularity", GRANULARITY),
        pick("price_type", PRICE_TYPES),
        ...START_END,
      ],
      get_energy_return_prices: [
        entry("config_entry"),
        pick("granularity", GRANULARITY),
        ...START_END,
      ],
    },
    { siblings: true }
  ),
  ebusd: editor("ebusd", {
    write: [
      object("call", {
        fields: {
          name: { label: "Name", required: true, selector: { text: {} } },
          value: { label: "Value", required: false, selector: { text: {} } },
        },
      }),
    ],
  }),
  ecobee: editor(
    "ecobee",
    {
      create_vacation: [
        entities("entity_id", "climate"),
        text("vacation_name"),
        slide("cool_temp", 7, 95, 0.5, "°"),
        slide("heat_temp", 7, 95, 0.5, "°"),
        day("start_date"),
        clock("start_time"),
        day("end_date"),
        clock("end_time"),
        pick("fan_mode", ["on", "auto"]),
        slide("fan_min_on_time", 0, 60, 1, "min"),
      ],
      delete_vacation: [
        entities("entity_id", "climate"),
        text("vacation_name"),
      ],
      resume_program: [entities("entity_id", "climate"), flag("resume_all")],
      set_fan_min_on_time: [
        entities("entity_id", "climate"),
        slide("fan_min_on_time", 0, 60, 1, "min"),
      ],
      set_dst_mode: [flag("dst_enabled")],
      set_mic_mode: [flag("mic_enabled")],
      set_occupancy_modes: [flag("auto_away"), flag("follow_me")],
      set_sensors_used_in_climate: [
        presetOrText,
        pickSelector("device_ids", {
          device: {
            multiple: true,
            integration: "ecobee",
            entity: [{ domain: "climate" }, { domain: "sensor" }],
          },
        }),
      ],
    },
    { siblings: true, cautions: ["delete_vacation"] }
  ),
  ecosmart: editor("ecosmart", {
    get_forecasts: [device("device_id")],
  }),
  ecovacs: editor("ecovacs", { raw_get_positions: [] }),
  elgato: editor("elgato", { identify: [] }),
  elkm1: editor("elkm1", {
    alarm_bypass: elkCode(),
    alarm_clear_bypass: elkCode(),
    alarm_arm_home_instant: elkCode(),
    alarm_arm_night_instant: elkCode(),
    alarm_arm_vacation: elkCode(),
    alarm_display_message: [
      slide("clear", 0, 2, 1),
      flag("beep"),
      span("timeout", "seconds"),
      text("line1", { showCount: true, maxLength: 16 }),
      text("line2", { showCount: true, maxLength: 16 }),
    ],
    set_time: [text("prefix")],
    speak_phrase: [text("number"), text("prefix")],
    speak_word: [count("number", 1, 473), text("prefix")],
    sensor_counter_refresh: [],
    sensor_counter_set: [count("value", 0, 65536)],
    sensor_zone_bypass: elkCode(),
    sensor_zone_trigger: [],
    switch_output_turn_on_for: [span("duration", "seconds")],
  }),
  energyzero: editor(
    "energyzero",
    {
      get_gas_prices: [entry("config_entry"), flag("incl_vat"), ...START_END],
      get_energy_prices: [
        entry("config_entry"),
        flag("incl_vat"),
        pick("price_type", ["market", "all_in"]),
        pick("interval", GRANULARITY),
        ...START_END,
      ],
    },
    { siblings: true }
  ),
  environment_canada: editor(
    "environment_canada",
    {
      get_alerts: [entry("config_entry_id")],
      get_forecasts: [],
      get_precipitation_forecast: [
        entry("config_entry_id"),
        pick("precip_type", ["auto", "rain", "snow"]),
        slide("past_minutes", 0, 180, 1, "min"),
        slide("future_minutes", 0, 72, 1, "min"),
        slide("hourly_hours", 0, 48, 1, "h"),
      ],
      set_radar_type: [
        pick("radar_type", ["Auto", "Rain", "Snow", "Precipitation type"]),
      ],
    },
    { siblings: true }
  ),
  envisalink: editor(
    "envisalink",
    {
      alarm_keypress: [text("keypress")],
      invoke_custom_function: [text("partition"), slide("pgm", 1, 4, 1)],
    },
    { siblings: true }
  ),
  epson: editor("epson", { select_cmode: [text("cmode")] }),
  eurotronic_cometblue: editor(
    "eurotronic_cometblue",
    {
      get_schedule: [],
      set_schedule: weekdayEditors(),
      set_holiday: [
        stamp("from"),
        stamp("to"),
        slide("temperature", 8, 28, 0.5, "°C"),
      ],
    },
    { siblings: true }
  ),
  evohome: editor(
    "evohome",
    {
      set_system_mode: [
        labeled("mode", [
          "Auto",
          "AutoWithEco",
          "Away",
          "Custom",
          "DayOff",
          "HeatingOff",
        ]),
        span("duration", "hms"),
        span("period", "seconds"),
      ],
      refresh_system: [],
      set_zone_override: [
        slide("setpoint", 4, 35, 0.1, "°"),
        span("duration", "hms"),
      ],
      set_dhw_override: [flag("state"), span("duration", "hms")],
    },
    { siblings: true }
  ),
  ezviz: editor(
    "ezviz",
    {
      set_alarm_detection_sensibility: [
        slide("level", 1, 100, 1),
        pick("type_value", ["0", "3"]),
      ],
      wake_device: [],
    },
    { siblings: true }
  ),
  ffmpeg: editor(
    "ffmpeg",
    {
      start: [entities("entity_id", "binary_sensor", true)],
      stop: [entities("entity_id", "binary_sensor", true)],
      restart: [entities("entity_id", "binary_sensor", true)],
    },
    { siblings: true }
  ),
  file: editor("file", {
    read_file: [text("file_name"), pick("file_encoding", ["JSON", "YAML"])],
  }),
  filter: reloadEditor(),
  flo: editor(
    "flo",
    {
      set_sleep_mode: [
        labeled("sleep_minutes", ["120", "1440", "4320"]),
        pick("revert_to_mode", ["away", "home"]),
      ],
      set_away_mode: [],
      set_home_mode: [],
      run_health_test: [],
    },
    { siblings: true }
  ),
  flume: editor("flume", { list_notifications: [entry("config_entry")] }),
  flux_led: editor(
    "flux_led",
    {
      set_custom_effect: [
        pickSelector("colors", { object: { multiple: true } }, "list"),
        slide("speed_pct", 1, 100, 1, "%"),
        pick("transition", ["gradual", "jump", "strobe"]),
      ],
      set_zones: [
        pickSelector("colors", { object: { multiple: true } }, "list"),
        slide("speed_pct", 1, 100, 1, "%"),
        pick("effect", [
          "static",
          "running_water",
          "strobe",
          "jump",
          "breathing",
        ]),
      ],
      set_music_mode: [
        slide("sensitivity", 1, 100, 1, "%"),
        slide("brightness", 1, 100, 1, "%"),
        flag("light_screen"),
        slide("effect", 0, 16, 1),
        colorBox("foreground_color"),
        colorBox("background_color"),
      ],
    },
    { siblings: true }
  ),
  forecast_solar: editor("forecast_solar", {
    get_forecast: [
      entry("config_entry"),
      stamp("start"),
      stamp("end"),
      pick("resolution", ["raw", "hourly"]),
    ],
  }),
  foscam: editor(
    "foscam",
    {
      ptz: [
        pick("movement", [
          "top_left",
          "up",
          "top_right",
          "left",
          "right",
          "bottom_left",
          "down",
          "bottom_right",
        ]),
        slide("travel_time", 0, 1, 0.005, "s"),
      ],
      ptz_preset: [text("preset_name")],
    },
    { siblings: true }
  ),
  foursquare: editor("foursquare", {
    checkin: [
      text("venueId"),
      longText("shout", 140),
      text("broadcast"),
      text("ll"),
      text("llAcc"),
      text("alt"),
      text("altAcc"),
      text("eventId"),
      text("mentions"),
    ],
  }),
  fritz: editor(
    "fritz",
    {
      set_guest_wifi_password: [
        device("device_id", {
          entity: { integration: "fritz", domain: "update" },
        }),
        secret("password"),
        slide("length", 8, 63, 1),
      ],
      dial: [
        device("device_id", {
          entity: { integration: "fritz", domain: "update" },
        }),
        text("number"),
        slide("max_ring_seconds", 1, 300, 1, "s"),
      ],
    },
    { siblings: true }
  ),
  fully_kiosk: editor(
    "fully_kiosk",
    {
      load_url: [device("device_id"), link("url")],
      set_config: [device("device_id"), text("key"), text("value")],
      start_application: [device("device_id"), text("application")],
    },
    { siblings: true }
  ),
  generic: reloadEditor(),
  generic_thermostat: reloadEditor(),
  geniushub: editor(
    "geniushub",
    {
      set_zone_mode: [
        entities("entity_id", "climate"),
        pick("mode", ["off", "timer", "footprint"]),
      ],
      set_zone_override: [
        entities("entity_id", "climate"),
        slide("temperature", 4, 28, 0.1, "°"),
        span("duration", "hms"),
      ],
      set_switch_override: [span("duration", "hms")],
    },
    { siblings: true }
  ),
  google: {
    siblings: ["add_event", "create_event"],
    controls: {
      add_event: calendarEvent(true, false)("google"),
      create_event: calendarEvent(false, true)("google"),
    },
  },
  google_air_quality: editor("google_air_quality", {
    get_forecast: [device("device_id"), slide("hours", 1, 96, 1, "h")],
  }),
  google_assistant: {
    siblings: ["request_sync", "reload"],
    controls: {
      request_sync: makers([text("agent_user_id")])("google_assistant"),
      reload: reloadOnly,
    },
  },
  google_assistant_sdk: editor("google_assistant_sdk", {
    send_text_command: [
      longText("command"),
      entities("media_player", "media_player"),
    ],
  }),
  google_mail: editor("google_mail", {
    set_vacation: [
      flag("enabled"),
      text("title"),
      longText("message"),
      flag("plain_text"),
      flag("restrict_contacts"),
      flag("restrict_domain"),
      day("start"),
      day("end"),
    ],
  }),
  google_photos: editor("google_photos", {
    upload: [entry("config_entry_id"), text("album"), textList("filename")],
  }),
  google_sheets: editor(
    "google_sheets",
    {
      append_sheet: [
        entry("config_entry"),
        text("worksheet"),
        flag("add_created_column"),
        object("data"),
      ],
      get_sheet: [
        entry("config_entry"),
        text("worksheet"),
        count("rows", 1, 1000000),
      ],
    },
    { siblings: true }
  ),
  google_travel_time: editor(
    "google_travel_time",
    {
      get_travel_times: [
        entry("config_entry_id"),
        text("origin"),
        text("destination"),
        pick("mode", ["driving", "walking", "bicycling"]),
        pick("units", ["metric", "imperial"]),
        pickSelector("language", { language: {} }, "language"),
        pick("avoid", ["tolls", "highways", "ferries", "indoor"]),
        pick("traffic_model", ["best_guess", "pessimistic", "optimistic"]),
        clock("departure_time"),
      ],
      get_transit_times: [
        entry("config_entry_id"),
        text("origin"),
        text("destination"),
        pick("transit_mode", ["bus", "subway", "train", "tram", "rail"]),
        pick("transit_routing_preference", ["less_walking", "fewer_transfers"]),
        pick("units", ["metric", "imperial"]),
        pickSelector("language", { language: {} }, "language"),
        clock("departure_time"),
        clock("arrival_time"),
      ],
    },
    { siblings: true }
  ),
  green_planet_energy: editor(
    "green_planet_energy",
    {
      get_cheapest_duration: [
        pickSelector("duration", {
          number: {
            min: 0.5,
            max: 24,
            step: 0.25,
            unit_of_measurement: "h",
            mode: "slider",
          },
        }),
        labeled("time_range", ["full_day", "day", "night"]),
      ],
      get_prices: [
        entry("config_entry_id"),
        slide("hours", 0.25, 24, 0.25, "h"),
      ],
    },
    { siblings: true }
  ),
  growatt_server: editor(
    "growatt_server",
    {
      update_time_segment: [
        device("device_id"),
        slide("segment_id", 1, 9, 1),
        pick("batt_mode", ["load_first", "battery_first", "grid_first"]),
        clock("start_time"),
        clock("end_time"),
        flag("enabled"),
      ],
      read_time_segments: [device("device_id")],
      write_ac_charge_times: [
        device("device_id"),
        slide("charge_power", 0, 100, 1, "%"),
        slide("charge_stop_soc", 0, 100, 1, "%"),
        flag("mains_enabled"),
        ...POWER_PERIODS(),
      ],
      write_ac_discharge_times: [
        device("device_id"),
        slide("discharge_power", 0, 100, 1, "%"),
        slide("discharge_stop_soc", 0, 100, 1, "%"),
        ...POWER_PERIODS(),
      ],
      read_ac_charge_times: [device("device_id")],
      read_ac_discharge_times: [device("device_id")],
    },
    { siblings: true }
  ),
  guardian: editor(
    "guardian",
    {
      pair_sensor: [device("device_id"), text("uid")],
      unpair_sensor: [device("device_id"), text("uid")],
      upgrade_firmware: [
        device("device_id"),
        link("url"),
        count("port", 1, 65535),
        text("filename"),
      ],
    },
    { siblings: true, cautions: ["unpair_sensor", "upgrade_firmware"] }
  ),
  harmony: editor(
    "harmony",
    { sync: [], change_channel: [count("channel", 1, 100000)] },
    { siblings: true }
  ),
  hassio: editor(
    "hassio",
    {
      addon_start: [pickSelector("addon", { addon: {} })],
      addon_restart: [pickSelector("addon", { addon: {} })],
      addon_stdin: [pickSelector("addon", { addon: {} })],
      addon_stop: [pickSelector("addon", { addon: {} })],
      app_start: [pickSelector("app", { app: {} })],
      app_restart: [pickSelector("app", { app: {} })],
      app_stdin: [pickSelector("app", { app: {} }), object("input")],
      app_stop: [pickSelector("app", { app: {} })],
      host_reboot: [],
      host_shutdown: [],
      backup_full: [
        text("name"),
        secret("password"),
        flag("compressed"),
        pickSelector("location", { backup_location: {} }),
        flag("homeassistant_exclude_database"),
      ],
      backup_partial: [
        flag("homeassistant"),
        flag("homeassistant_exclude_database"),
        pickSelector("folders", optionList(BACKUP_FOLDERS), "list"),
        textList("apps"),
        textList("addons"),
        text("name"),
        secret("password"),
        flag("compressed"),
        pickSelector("location", { backup_location: {} }),
      ],
      restore_full: [text("slug"), secret("password")],
      restore_partial: [
        text("slug"),
        flag("homeassistant"),
        pickSelector("folders", optionList(BACKUP_FOLDERS), "list"),
        textList("apps"),
        textList("addons"),
        secret("password"),
      ],
      mount_reload: [
        pickSelector("device_id", {
          device: {
            filter: { integration: "hassio", model: "Home Assistant Mount" },
          },
        }),
      ],
    },
    {
      cautions: [
        "host_reboot",
        "host_shutdown",
        "restore_full",
        "restore_partial",
      ],
    }
  ),
  hdmi_cec: editor(
    "hdmi_cec",
    {
      power_on: [],
      standby: [],
      update: [],
      select_device: [text("device")],
      send_command: [
        text("cmd"),
        text("dst"),
        text("src"),
        text("raw"),
        object("att"),
      ],
      volume: [
        count("up", 1, 100),
        count("down", 1, 100),
        pick("mute", ["off", "on", "toggle"]),
      ],
    },
    { siblings: true, cautions: ["standby"] }
  ),
  heos: editor(
    "heos",
    {
      get_queue: [],
      remove_from_queue: [textList("queue_ids", "number")],
      move_queue_item: [
        textList("queue_ids", "number"),
        count("destination_position", 1, 1000),
      ],
      group_volume_set: [slide("volume_level", 0, 1, 0.01, "%", 100)],
      group_volume_down: [],
      group_volume_up: [],
    },
    { siblings: true }
  ),
  history_stats: reloadEditor(),
  habitica: editor("habitica", {
    cast_skill: [
      entry("config_entry"),
      pick("skill", ["pickpocket", "backstab", "smash", "fireball"]),
      text("task"),
    ],
    accept_quest: [entry("config_entry")],
    reject_quest: [entry("config_entry")],
    start_quest: [entry("config_entry")],
    cancel_quest: [entry("config_entry")],
    abort_quest: [entry("config_entry")],
    leave_quest: [entry("config_entry")],
    score_habit: [...habiticaTask, pick("direction", ["up", "down"])],
    score_reward: habiticaTask,
    transformation: [
      entry("config_entry"),
      pick("item", ["snowball", "spooky_sparkles", "seafoam", "shiny_seed"]),
      text("target"),
    ],
    get_tasks: [
      entry("config_entry"),
      section("filter", {
        type: optionList(["habit", "daily", "todo", "reward"]),
        priority: optionList(PRIORITIES),
        task: TEXT_MULTIPLE,
        tag: TEXT_MULTIPLE,
        keyword: { text: {} },
      }),
    ],
    update_reward: [
      ...habiticaTask,
      text("rename"),
      noteBox,
      pickSelector("cost", COST),
      section("tag_options", TAG_OPTIONS),
      section("developer_options", ALIAS),
    ],
    create_reward: [
      entry("config_entry"),
      text("name"),
      noteBox,
      pickSelector("cost", COST),
      textList("tag"),
      section("developer_options", ALIAS),
    ],
    update_habit: [
      ...habiticaTask,
      text("rename"),
      noteBox,
      pickSelector("up_down", UP_DOWN_OPTIONS, "list"),
      habiticaPriority,
      pick("frequency", FREQUENCIES),
      section("tag_options", TAG_OPTIONS),
      section("developer_options", {
        counter_up: {
          number: { min: 0, step: 1, unit_of_measurement: "➕", mode: "box" },
        },
        counter_down: {
          number: { min: 0, step: 1, unit_of_measurement: "➖", mode: "box" },
        },
        ...ALIAS,
      }),
    ],
    create_habit: [
      entry("config_entry"),
      text("name"),
      noteBox,
      pickSelector("up_down", UP_DOWN_OPTIONS, "list"),
      habiticaPriority,
      pick("frequency", FREQUENCIES),
      textList("tag"),
      section("developer_options", ALIAS),
    ],
    update_todo: [
      ...habiticaTask,
      text("rename"),
      noteBox,
      habiticaPriority,
      section("duedate_options", { date: { date: {} }, clear_date: CLEAR }),
      section("checklist_options", CHECKLIST_OPTIONS),
      section("reminder_options", TODO_REMINDERS),
      section("tag_options", TAG_OPTIONS),
      section("developer_options", ALIAS),
    ],
    create_todo: [
      entry("config_entry"),
      text("name"),
      noteBox,
      habiticaPriority,
      day("date"),
      textList("add_checklist_item"),
      pick("collapse_checklist", COLLAPSE),
      pickSelector(
        "reminder",
        {
          text: { type: "datetime-local", multiple: true },
        },
        "list"
      ),
      textList("tag"),
      section("developer_options", ALIAS),
    ],
    update_daily: [
      ...habiticaTask,
      text("rename"),
      noteBox,
      habiticaPriority,
      day("start_date"),
      pick("frequency", [...FREQUENCIES, "yearly"]),
      count("every_x", 0, 1000),
      section("repeat_weekly_options", WEEKLY_REPEAT),
      section("repeat_monthly_options", MONTHLY_REPEAT),
      section("checklist_options", CHECKLIST_OPTIONS),
      section("reminder_options", DAILY_REMINDERS),
      section("tag_options", TAG_OPTIONS),
      section("developer_options", {
        streak: {
          number: { min: 0, step: 1, unit_of_measurement: "▶▶", mode: "box" },
        },
        ...ALIAS,
      }),
    ],
    create_daily: [
      entry("config_entry"),
      text("name"),
      noteBox,
      habiticaPriority,
      day("start_date"),
      pick("frequency", [...FREQUENCIES, "yearly"]),
      count("every_x", 0, 1000),
      section("repeat_weekly_options", WEEKLY_REPEAT),
      section("repeat_monthly_options", MONTHLY_REPEAT),
      textList("add_checklist_item"),
      pick("collapse_checklist", COLLAPSE),
      pickSelector(
        "reminder",
        {
          text: { type: "time", multiple: true },
        },
        "list"
      ),
      textList("tag"),
      section("developer_options", ALIAS),
    ],
  }),
};
