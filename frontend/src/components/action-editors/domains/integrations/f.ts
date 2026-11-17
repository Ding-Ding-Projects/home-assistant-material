import {
  choice,
  claim,
  compact,
  duration,
  L,
  notice,
  selector,
  slider,
  stepper,
  temporal,
  textBox,
  toggle,
} from "../../quick-helpers";
import { KEY_VALUE_TYPE } from "../../quick-rich";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
} from "../../quick-types";
import { NOTIFY_CHIPS } from "../media";

/**
 * Tailored editors for integration services: switchbot to zwave_js. Each
 * service is a list of small "parts"; a part builds one control from the
 * service's declared field, so a field the live service does not declare is
 * never shown and a stored template falls back to the generic form.
 */

type Part = (ctx: QuickContext, domain: string) => QuickControl | undefined;

const F = (domain: string, key: string) => L(`${domain}__${key}`);

const build =
  (domain: string, parts: Part[]) =>
  (ctx: QuickContext): QuickControl[] =>
    compact(parts.map((part) => part(ctx, domain)));

const noFields = (): QuickControl[] => [];

const reloadNote = (): QuickControl[] => [notice("reload", L("note_reload"))];

// --- parts --------------------------------------------------------------

interface TextOptions {
  multi?: boolean;
  type?: string;
  chips?: string[];
  maxLength?: number;
}

const txt =
  (key: string, options: TextOptions = {}): Part =>
  (ctx, domain) =>
    textBox(ctx, key, F(domain, key), {
      ...(options.multi ? { multiline: true, showCount: true } : {}),
      ...(options.type ? { inputType: options.type } : {}),
      ...(options.maxLength ? { maxLength: options.maxLength } : {}),
      ...(options.chips
        ? {
            chips: options.chips.map((text) => ({
              id: `${key}_${text}`,
              text,
              replace: true,
            })),
          }
        : {}),
    });

const msg = (key: string, maxLength?: number): Part =>
  txt(key, { multi: true, maxLength });

const messageWithChips =
  (key: string, maxLength?: number): Part =>
  (ctx, domain) =>
    textBox(ctx, key, F(domain, key), {
      multiline: true,
      showCount: true,
      chips: NOTIFY_CHIPS,
      ...(maxLength ? { maxLength } : {}),
    });

const pw = (key: string): Part => txt(key, { type: "password" });

const url = (key: string): Part => txt(key, { type: "url" });

interface NumberOptions {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Force a number box, for identifiers and codes. */
  box?: boolean;
}

const num =
  (key: string, options: NumberOptions = {}): Part =>
  (ctx, domain) => {
    const { min, max, unit } = options;
    const step = options.step ?? 1;
    const label = F(domain, key);
    const bounded = min !== undefined && max !== undefined;
    const steps = bounded ? (max - min) / step : Infinity;
    // Typed keys such as `duration` must not use a plain slider or stepper.
    const typed = key in KEY_VALUE_TYPE;
    if (bounded && !typed && !options.box) {
      if (steps <= 12) return stepper(ctx, key, label, min, max, step, unit);
      if (steps <= 2000) {
        return slider(ctx, key, label, min, max, step, { unit });
      }
    }
    return selector(
      ctx,
      key,
      label,
      {
        number: {
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
          step,
          ...(unit ? { unit_of_measurement: unit } : {}),
          mode: bounded && !options.box && steps <= 2000 ? "slider" : "box",
        },
      },
      "other"
    );
  };

const bool =
  (key: string): Part =>
  (ctx, domain) =>
    toggle(ctx, key, F(domain, key));

const pick =
  (key: string, values: string[]): Part =>
  (ctx, domain) =>
    choice(ctx, key, F(domain, key), values);

const pickMany =
  (key: string, values: string[]): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      {
        select: {
          multiple: true,
          mode: "list",
          options: values.map((value) => ({
            value,
            label: value.replace(/_/g, " "),
          })),
        },
      },
      "list"
    );

const pickOrType =
  (key: string, values: string[]): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      {
        select: {
          mode: "dropdown",
          custom_value: true,
          options: values.map((value) => ({
            value,
            label: value.replace(/_/g, " "),
          })),
        },
      },
      "list"
    );

const when =
  (key: string, kind: "time" | "date" | "datetime"): Part =>
  (ctx, domain) =>
    temporal(ctx, key, F(domain, key), kind);

const time = (key: string): Part => when(key, "time");
const stamp = (key: string): Part => when(key, "datetime");
const day = (key: string): Part => when(key, "date");

const span =
  (key: string, format: "seconds" | "hms"): Part =>
  (ctx, domain) =>
    duration(ctx, key, F(domain, key), format);

const entity =
  (
    key: string,
    filter: { domain?: string; integration?: string },
    multiple = false
  ): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { entity: { ...filter, ...(multiple ? { multiple: true } : {}) } },
      "entity"
    );

const device =
  (key: string, filter: Record<string, unknown>, multiple = false): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { device: { filter: [filter], ...(multiple ? { multiple: true } : {}) } },
      "other"
    );

const entry =
  (key: string, integration: string): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { config_entry: { integration } },
      "other"
    );

const areaOf =
  (key: string, integration: string): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { area: { device: [{ integration }], multiple: true } },
      "other"
    );

const place =
  (key: string): Part =>
  (ctx, domain) =>
    selector(
      ctx,
      key,
      F(domain, key),
      { location: { radius: false } },
      "location"
    );

const list =
  (key: string): Part =>
  (ctx, domain) =>
    selector(ctx, key, F(domain, key), { text: { multiple: true } }, "list");

const object =
  (key: string, config: Record<string, unknown> = {}): Part =>
  (ctx, domain) =>
    selector(ctx, key, F(domain, key), { object: config }, "object");

const rgb =
  (key: string, space: "rgb" | "hs" = "rgb"): Part =>
  (ctx, domain) => {
    const value = ctx.data[key];
    if (!claim(ctx, key)) return undefined;
    if (
      value !== undefined &&
      !(Array.isArray(value) && value.every((part) => typeof part === "number"))
    ) {
      return undefined;
    }
    return {
      kind: "color",
      key,
      labelKey: F(domain, key),
      space,
      value: value as number[] | undefined,
      swatches: true,
    };
  };

// --- telegram_bot -------------------------------------------------------

const TELEGRAM = { domain: "notify", integration: "telegram_bot" };
const PARSE_MODES = ["html", "markdown", "markdownv2", "plain_text"];
const AUTH_MODES = ["basic", "digest", "bearer_token"];
const REACTIONS = ["👍", "👎", "❤", "🔥", "🎉", "😁", "🤔", "😢", "👏", "🙏"];

const tgTargets = (multiple: boolean): Part =>
  entity("entity_id", TELEGRAM, multiple);

const tgDelivery: Part[] = [
  bool("disable_notification"),
  list("keyboard"),
  object("inline_keyboard"),
  txt("message_tag"),
  num("reply_to_message_id", { box: true, min: 0 }),
  num("message_thread_id", { box: true, min: 0 }),
];

const tgAdvanced: Part[] = [
  entry("config_entry_id", "telegram_bot"),
  list("chat_id"),
];

const tgUrlOptions: Part[] = [
  bool("verify_ssl"),
  pick("authentication", AUTH_MODES),
  txt("username"),
  pw("password"),
];

const tgMedia = (extra: Part[], parse: boolean, caption: boolean): Part[] => [
  tgTargets(true),
  url("url"),
  ...tgUrlOptions,
  txt("file"),
  ...(caption ? [msg("caption", 1024)] : []),
  ...(parse ? [pick("parse_mode", PARSE_MODES)] : []),
  ...extra,
  ...tgDelivery,
  ...tgAdvanced,
];

const TELEGRAM_MEDIA_ITEM = {
  multiple: true,
  label_field: "url",
  description_field: "caption",
  fields: {
    media_type: {
      selector: {
        select: { options: ["audio", "document", "photo", "video"] },
      },
    },
    caption: { selector: { text: {} } },
    url: { selector: { text: { type: "url" } } },
    verify_ssl: { selector: { boolean: {} } },
    authentication: { selector: { select: { options: AUTH_MODES } } },
    username: { selector: { text: {} } },
    password: { selector: { text: { type: "password" } } },
    file: { selector: { text: {} } },
  },
};

const TELEGRAM_EDITOR: DomainEditor = {
  cautions: { leave_chat: F("telegram_bot", "caution_leave_chat") },
  controls: {
    send_message: build("telegram_bot", [
      tgTargets(true),
      messageWithChips("message", 4096),
      txt("title"),
      pick("parse_mode", PARSE_MODES),
      bool("disable_web_page_preview"),
      ...tgDelivery,
      ...tgAdvanced,
    ]),
    send_chat_action: build("telegram_bot", [
      tgTargets(true),
      pick("chat_action", [
        "typing",
        "upload_photo",
        "record_video",
        "upload_video",
        "record_voice",
        "upload_voice",
        "upload_document",
        "choose_sticker",
        "find_location",
        "record_video_note",
        "upload_video_note",
      ]),
      num("message_thread_id", { box: true, min: 0 }),
      ...tgAdvanced,
    ]),
    send_photo: build("telegram_bot", tgMedia([], true, true)),
    send_sticker: build(
      "telegram_bot",
      tgMedia([txt("sticker_id")], false, false)
    ),
    send_animation: build("telegram_bot", tgMedia([], true, true)),
    send_video: build("telegram_bot", tgMedia([], true, true)),
    send_voice: build("telegram_bot", tgMedia([], false, true)),
    send_document: build("telegram_bot", tgMedia([], true, true)),
    send_media_group: build("telegram_bot", [
      tgTargets(true),
      object("media", TELEGRAM_MEDIA_ITEM),
      pick("parse_mode", PARSE_MODES),
      bool("disable_notification"),
      bool("protect_content"),
      num("reply_to_message_id", { box: true, min: 0 }),
      num("message_thread_id", { box: true, min: 0 }),
      ...tgAdvanced,
    ]),
    send_location: build("telegram_bot", [
      tgTargets(true),
      num("latitude", { min: -90, max: 90, step: 0.001, unit: "°" }),
      num("longitude", { min: -180, max: 180, step: 0.001, unit: "°" }),
      ...tgDelivery,
      ...tgAdvanced,
    ]),
    send_poll: build("telegram_bot", [
      tgTargets(true),
      txt("question", { multi: true, maxLength: 300 }),
      list("options"),
      bool("is_anonymous"),
      bool("allows_multiple_answers"),
      num("open_period", { min: 5, max: 600, unit: "s" }),
      bool("disable_notification"),
      num("reply_to_message_id", { box: true, min: 0 }),
      num("message_thread_id", { box: true, min: 0 }),
      ...tgAdvanced,
    ]),
    edit_message: build("telegram_bot", [
      tgTargets(false),
      txt("message_id"),
      messageWithChips("message", 4096),
      txt("title"),
      pick("parse_mode", PARSE_MODES),
      bool("disable_web_page_preview"),
      object("inline_keyboard"),
      ...tgAdvanced,
    ]),
    edit_message_media: build("telegram_bot", [
      tgTargets(false),
      txt("message_id"),
      pick("media_type", ["animation", "audio", "document", "photo", "video"]),
      url("url"),
      ...tgUrlOptions,
      txt("file"),
      msg("caption", 1024),
      object("inline_keyboard"),
      ...tgAdvanced,
    ]),
    edit_caption: build("telegram_bot", [
      tgTargets(false),
      txt("message_id"),
      msg("caption", 1024),
      object("inline_keyboard"),
      ...tgAdvanced,
    ]),
    edit_replymarkup: build("telegram_bot", [
      tgTargets(false),
      txt("message_id"),
      object("inline_keyboard"),
      ...tgAdvanced,
    ]),
    answer_callback_query: build("telegram_bot", [
      entry("config_entry_id", "telegram_bot"),
      msg("message", 200),
      txt("callback_query_id"),
      bool("show_alert"),
    ]),
    delete_message: build("telegram_bot", [
      tgTargets(false),
      txt("message_id"),
      ...tgAdvanced,
    ]),
    leave_chat: build("telegram_bot", [tgTargets(false), ...tgAdvanced]),
    set_message_reaction: build("telegram_bot", [
      tgTargets(false),
      txt("message_id"),
      txt("reaction", { chips: REACTIONS }),
      bool("is_big"),
      ...tgAdvanced,
    ]),
    download_file: build("telegram_bot", [
      entry("config_entry_id", "telegram_bot"),
      txt("file_id"),
      txt("directory_path"),
      txt("file_name"),
    ]),
    send_message_draft: build("telegram_bot", [
      tgTargets(true),
      num("draft_id", { box: true, min: 1 }),
      messageWithChips("message", 4096),
      pick("parse_mode", PARSE_MODES),
      num("message_thread_id", { box: true, min: 0 }),
      ...tgAdvanced,
    ]),
  },
};

// --- zwave_js -----------------------------------------------------------

const zTargets: Part[] = [
  areaOf("area_id", "zwave_js"),
  device("device_id", { integration: "zwave_js" }, true),
  entity("entity_id", { integration: "zwave_js" }, true),
];

const zSensorTargets: Part[] = [
  (ctx, domain) =>
    selector(
      ctx,
      "area_id",
      F(domain, "area_id"),
      {
        area: {
          entity: [{ integration: "zwave_js", domain: "sensor" }],
          multiple: true,
        },
      },
      "other"
    ),
  (ctx, domain) =>
    selector(
      ctx,
      "device_id",
      F(domain, "device_id"),
      {
        device: {
          entity: [{ integration: "zwave_js", domain: "sensor" }],
          multiple: true,
        },
      },
      "other"
    ),
  entity("entity_id", { integration: "zwave_js", domain: "sensor" }, true),
];

const SLOT = { box: true, min: 1, max: 65535 };
const USER_TYPES = [
  "general",
  "programming",
  "non_access",
  "duress",
  "disposable",
  "expiring",
  "remote_only",
];
const CREDENTIAL_TYPES = ["pin_code", "password"];

const ZWAVE_EDITOR: DomainEditor = {
  cautions: {
    delete_all_users: F("zwave_js", "caution_delete_all_users"),
    delete_all_credentials: F("zwave_js", "caution_delete_all_credentials"),
  },
  controls: {
    clear_lock_usercode: build("zwave_js", [txt("code_slot")]),
    get_lock_usercode: build("zwave_js", [txt("code_slot")]),
    set_lock_usercode: build("zwave_js", [txt("code_slot"), pw("usercode")]),
    set_lock_configuration: build("zwave_js", [
      pick("operation_type", ["constant", "timed"]),
      num("lock_timeout", { min: 0, max: 65535, unit: "s", box: true }),
      num("auto_relock_time", { min: 0, max: 65535, unit: "s", box: true }),
      num("hold_and_release_time", {
        min: 0,
        max: 65535,
        unit: "s",
        box: true,
      }),
      bool("twist_assist"),
      bool("block_to_block"),
    ]),
    set_user: build("zwave_js", [
      num("user_id", SLOT),
      txt("user_name"),
      pick("user_type", USER_TYPES),
      pick("credential_rule", ["single", "dual", "triple"]),
      bool("active"),
      pick("credential_type", CREDENTIAL_TYPES),
      num("credential_slot", SLOT),
      pw("credential_data"),
    ]),
    delete_user: build("zwave_js", [num("user_id", SLOT)]),
    delete_all_users: noFields,
    get_credential_capabilities: noFields,
    get_users: noFields,
    set_credential: build("zwave_js", [
      num("user_id", SLOT),
      pick("credential_type", CREDENTIAL_TYPES),
      pw("credential_data"),
      num("credential_slot", SLOT),
    ]),
    delete_credential: build("zwave_js", [
      num("user_id", SLOT),
      pick("credential_type", CREDENTIAL_TYPES),
      num("credential_slot", SLOT),
    ]),
    delete_all_credentials: build("zwave_js", [num("user_id", SLOT)]),
    set_config_parameter: build("zwave_js", [
      ...zTargets,
      txt("parameter"),
      txt("value"),
      txt("endpoint"),
      txt("bitmask"),
      num("value_size", { min: 1, max: 4 }),
      num("value_format", { min: 0, max: 3 }),
    ]),
    bulk_set_partial_config_parameters: build("zwave_js", [
      ...zTargets,
      txt("parameter"),
      object("value"),
      txt("endpoint"),
    ]),
    refresh_value: build("zwave_js", [
      entity("entity_id", { integration: "zwave_js" }, true),
      bool("refresh_all_values"),
    ]),
    set_value: build("zwave_js", [
      ...zTargets,
      txt("command_class"),
      txt("property"),
      object("value"),
      txt("endpoint"),
      txt("property_key"),
      object("options"),
      bool("wait_for_result"),
    ]),
    multicast_set_value: build("zwave_js", [
      ...zTargets,
      bool("broadcast"),
      txt("command_class"),
      txt("property"),
      object("value"),
      txt("endpoint"),
      txt("property_key"),
      object("options"),
    ]),
    ping: build("zwave_js", zTargets),
    reset_meter: build("zwave_js", [
      ...zSensorTargets,
      txt("meter_type"),
      txt("value", { type: "number" }),
    ]),
    invoke_cc_api: build("zwave_js", [
      ...zTargets,
      txt("command_class"),
      txt("method_name"),
      object("parameters"),
      txt("endpoint"),
    ]),
    refresh_notifications: build("zwave_js", [
      ...zTargets,
      num("notification_type", { min: 1, max: 22, box: true }),
      num("notification_event", { min: 1, max: 255, box: true }),
    ]),
  },
};

// --- zha ----------------------------------------------------------------

const ZIGBEE_CLUSTER = { min: 1, max: 65535, box: true };

const ZHA_EDITOR: DomainEditor = {
  cautions: {
    remove: F("zha", "caution_remove"),
    reconfigure_device: F("zha", "caution_reconfigure_device"),
  },
  controls: {
    permit: build("zha", [
      span("duration", "seconds"),
      txt("ieee"),
      txt("source_ieee"),
      pw("install_code"),
      pw("qr_code"),
    ]),
    remove: build("zha", [txt("ieee")]),
    reconfigure_device: build("zha", [txt("ieee")]),
    set_zigbee_cluster_attribute: build("zha", [
      txt("ieee"),
      num("endpoint_id", ZIGBEE_CLUSTER),
      num("cluster_id", ZIGBEE_CLUSTER),
      pick("cluster_type", ["in", "out"]),
      num("attribute", ZIGBEE_CLUSTER),
      txt("value"),
      txt("manufacturer"),
    ]),
    issue_zigbee_cluster_command: build("zha", [
      txt("ieee"),
      num("endpoint_id", ZIGBEE_CLUSTER),
      num("cluster_id", ZIGBEE_CLUSTER),
      pick("cluster_type", ["in", "out"]),
      num("command", ZIGBEE_CLUSTER),
      pick("command_type", ["client", "server"]),
      object("args"),
      object("params"),
      txt("manufacturer"),
    ]),
    issue_zigbee_group_command: build("zha", [
      txt("group"),
      num("cluster_id", ZIGBEE_CLUSTER),
      pick("cluster_type", ["in", "out"]),
      num("command", ZIGBEE_CLUSTER),
      object("args"),
      txt("manufacturer"),
    ]),
    warning_device_squawk: build("zha", [
      txt("ieee"),
      num("mode", { min: 0, max: 1 }),
      num("strobe", { min: 0, max: 1 }),
      num("level", { min: 0, max: 3 }),
    ]),
    warning_device_warn: build("zha", [
      txt("ieee"),
      num("mode", { min: 0, max: 6 }),
      num("strobe", { min: 0, max: 1 }),
      num("level", { min: 0, max: 3 }),
      span("duration", "seconds"),
      num("duty_cycle", { min: 0, max: 100, step: 10 }),
      num("intensity", { min: 0, max: 3 }),
    ]),
    clear_lock_user_code: build("zha", [txt("code_slot")]),
    enable_lock_user_code: build("zha", [txt("code_slot")]),
    disable_lock_user_code: build("zha", [txt("code_slot")]),
    set_lock_user_code: build("zha", [txt("code_slot"), pw("user_code")]),
  },
};

// --- xiaomi_miio --------------------------------------------------------

const MOVE_FIELDS: Part[] = [
  num("velocity", { min: -0.29, max: 0.29, step: 0.01 }),
  num("rotation", { min: -179, max: 179, unit: "°" }),
  span("duration", "seconds"),
];

const XIAOMI_MIIO_EDITOR: DomainEditor = {
  controls: {
    fan_reset_filter: noFields,
    fan_set_extra_features: build("xiaomi_miio", [
      num("features", { min: 0, max: 1 }),
    ]),
    light_set_scene: build("xiaomi_miio", [num("scene", { min: 1, max: 6 })]),
    light_set_delayed_turn_off: build("xiaomi_miio", [
      span("time_period", "hms"),
    ]),
    light_reminder_on: noFields,
    light_reminder_off: noFields,
    light_night_light_mode_on: noFields,
    light_night_light_mode_off: noFields,
    light_eyecare_mode_on: noFields,
    light_eyecare_mode_off: noFields,
    remote_learn_command: build("xiaomi_miio", [
      num("slot", { min: 1, max: 1000000, box: true }),
      span("timeout", "seconds"),
    ]),
    remote_set_led_on: noFields,
    remote_set_led_off: noFields,
    switch_set_wifi_led_on: noFields,
    switch_set_wifi_led_off: noFields,
    switch_set_power_price: build("xiaomi_miio", [
      num("mode", { min: 0, max: 999 }),
    ]),
    switch_set_power_mode: build("xiaomi_miio", [
      pick("mode", ["green", "normal"]),
    ]),
    vacuum_remote_control_start: noFields,
    vacuum_remote_control_stop: noFields,
    vacuum_remote_control_move: build("xiaomi_miio", MOVE_FIELDS),
    vacuum_remote_control_move_step: build("xiaomi_miio", MOVE_FIELDS),
    vacuum_clean_zone: build("xiaomi_miio", [
      object("zone"),
      num("repeats", { min: 1, max: 3 }),
    ]),
    vacuum_goto: build("xiaomi_miio", [
      txt("x_coord", { type: "number" }),
      txt("y_coord", { type: "number" }),
    ]),
    vacuum_clean_segment: build("xiaomi_miio", [object("segments")]),
  },
};

// --- yeelight -----------------------------------------------------------

const BRIGHTNESS_PCT = num("brightness", { min: 0, max: 100, unit: "%" });
const FLOW: Part[] = [
  num("count", { min: 0, max: 100 }),
  pick("action", ["off", "recover", "stay"]),
  object("transitions"),
];

const YEELIGHT_EDITOR: DomainEditor = {
  siblings: [
    "set_mode",
    "set_color_scene",
    "set_hsv_scene",
    "set_color_temp_scene",
    "set_color_flow_scene",
    "set_auto_delay_off_scene",
    "start_flow",
    "set_music_mode",
  ],
  controls: {
    set_mode: build("yeelight", [
      pick("mode", ["color_flow", "hsv", "last", "moonlight", "normal", "rgb"]),
    ]),
    set_color_scene: build("yeelight", [rgb("rgb_color"), BRIGHTNESS_PCT]),
    set_hsv_scene: build("yeelight", [rgb("hs_color", "hs"), BRIGHTNESS_PCT]),
    set_color_temp_scene: build("yeelight", [
      num("kelvin", { min: 1700, max: 6500, step: 100, unit: "K" }),
      BRIGHTNESS_PCT,
    ]),
    set_color_flow_scene: build("yeelight", FLOW),
    set_auto_delay_off_scene: build("yeelight", [
      num("minutes", { min: 1, max: 60, unit: "min" }),
      BRIGHTNESS_PCT,
    ]),
    start_flow: build("yeelight", FLOW),
    set_music_mode: build("yeelight", [bool("music_mode")]),
  },
};

// --- the rest, alphabetical ---------------------------------------------

const WEBOS_BUTTONS = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "ENTER",
  "BACK",
  "HOME",
  "MENU",
  "EXIT",
  "INFO",
  "VOLUMEUP",
  "VOLUMEDOWN",
  "MUTE",
  "CHANNELUP",
  "CHANNELDOWN",
  "PLAY",
  "PAUSE",
  "STOP",
  "REWIND",
  "FASTFORWARD",
  "RED",
  "GREEN",
  "YELLOW",
  "BLUE",
];

const WEBOS_OUTPUTS = [
  "tv_speaker",
  "external_speaker",
  "external_optical",
  "external_arc",
  "lineout",
  "headphone",
  "tv_external_speaker",
  "bt_soundbar",
  "soundbar",
];

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const TESLEMETRY = { integration: "teslemetry" };
const TESLA_DEVICE = device("device_id", TESLEMETRY);
const TESLA_PIN = num("pin", { min: 1000, max: 9999, box: true });

const CIRCULATION_SLOT = {
  multiple: true,
  label_field: "from",
  description_field: "to",
  fields: {
    from: { required: true, selector: { time: {} } },
    to: { required: true, selector: { time: {} } },
    mode: {
      required: true,
      selector: {
        select: { options: ["on", "cycles_5_25", "cycles_5_10"] },
      },
    },
  },
};

const MEAL_PLAN = {
  description_field: "portion",
  multiple: true,
  fields: {
    days: {
      selector: { select: { options: DAYS, multiple: true, mode: "list" } },
    },
    time: { selector: { time: {} } },
    portion: {
      selector: {
        number: { min: 0, max: 100, mode: "box", unit_of_measurement: "g" },
      },
    },
    enabled: { selector: { boolean: {} } },
  },
};

const LANGS = [
  "da",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "sv",
  "zh",
];

const tplinkBase: Part[] = [
  object("segments"),
  num("brightness", { min: 1, max: 100, unit: "%" }),
  num("duration", { min: 0, max: 5000, unit: "ms" }),
  num("transition", { min: 0, max: 6000, unit: "ms" }),
];

const upbRate = (min: number, max: number): Part =>
  num("rate", { min, max, step: 0.01, unit: "s" });

const upbFade: Part[] = [
  num("brightness", { min: 0, max: 255 }),
  num("brightness_pct", { min: 0, max: 100, unit: "%" }),
  upbRate(-1, 3600),
];

export const INTEGRATION_EDITORS_F: Record<string, DomainEditor> = {
  switchbot: {
    controls: {
      add_password: build("switchbot", [
        device("device_id", { integration: "switchbot" }),
        pw("password"),
      ]),
    },
  },
  switchbot_cloud: {
    controls: {
      upload_art_frame_image: build("switchbot_cloud", [
        device(
          "device_id",
          { integration: "switchbot_cloud", model: "AI Art Frame" },
          true
        ),
        url("image_url"),
      ]),
    },
  },
  switcher_kis: {
    siblings: ["set_auto_off", "turn_on_with_timer"],
    controls: {
      set_auto_off: build("switcher_kis", [span("auto_off", "hms")]),
      turn_on_with_timer: build("switcher_kis", [
        num("timer_minutes", { min: 1, max: 150, unit: "min" }),
      ]),
    },
  },
  synology_dsm: {
    siblings: ["reboot", "shutdown"],
    cautions: {
      reboot: F("synology_dsm", "caution_reboot"),
      shutdown: F("synology_dsm", "caution_shutdown"),
    },
    controls: {
      reboot: build("synology_dsm", [txt("serial")]),
      shutdown: build("synology_dsm", [txt("serial")]),
    },
  },
  system_bridge: {
    siblings: [
      "get_process_by_id",
      "get_processes_by_name",
      "open_path",
      "open_url",
      "send_keypress",
      "send_text",
      "power_command",
    ],
    cautions: { power_command: F("system_bridge", "caution_power_command") },
    controls: {
      get_process_by_id: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        num("id", { box: true, min: 0 }),
      ]),
      get_processes_by_name: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        txt("name"),
      ]),
      open_path: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        txt("path"),
      ]),
      open_url: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        url("url"),
      ]),
      send_keypress: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        pickOrType("key", [
          "backspace",
          "delete",
          "enter",
          "tab",
          "escape",
          "up",
          "down",
          "right",
          "left",
          "home",
          "end",
          "pageup",
          "pagedown",
          "f1",
          "f2",
          "f3",
          "f4",
          "f5",
          "f6",
          "f7",
          "f8",
          "f9",
          "f10",
          "f11",
          "f12",
          "command",
          "alt",
          "control",
          "shift",
          "right_shift",
          "space",
          "printscreen",
          "insert",
          "audio_mute",
          "audio_vol_down",
          "audio_vol_up",
          "audio_play",
          "audio_stop",
          "audio_pause",
          "audio_prev",
          "audio_next",
          "audio_rewind",
          "audio_forward",
          "audio_repeat",
          "audio_random",
          "numpad_0",
          "numpad_1",
          "numpad_2",
          "numpad_3",
          "numpad_4",
          "numpad_5",
          "numpad_6",
          "numpad_7",
          "numpad_8",
          "numpad_9",
          "lights_mon_up",
          "lights_mon_down",
          "lights_kbd_toggle",
          "lights_kbd_up",
          "lights_kbd_down",
        ]),
      ]),
      send_text: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        msg("text"),
      ]),
      power_command: build("system_bridge", [
        device("bridge", { integration: "system_bridge" }),
        pick("command", [
          "hibernate",
          "lock",
          "logout",
          "restart",
          "shutdown",
          "sleep",
        ]),
      ]),
    },
  },
  tado: {
    siblings: [
      "set_climate_timer",
      "set_water_heater_timer",
      "set_climate_temperature_offset",
      "add_meter_reading",
    ],
    controls: {
      set_climate_timer: build("tado", [
        num("temperature", { min: 0, max: 100, step: 0.5, unit: "°" }),
        span("time_period", "hms"),
        pick("requested_overlay", [
          "NEXT_TIME_BLOCK",
          "MANUAL",
          "TADO_DEFAULT",
        ]),
      ]),
      set_water_heater_timer: build("tado", [
        span("time_period", "hms"),
        num("temperature", { min: 0, max: 100, step: 0.5, unit: "°" }),
      ]),
      set_climate_temperature_offset: build("tado", [
        num("offset", { min: -10, max: 10, step: 0.01, unit: "°" }),
      ]),
      add_meter_reading: build("tado", [
        entry("config_entry", "tado"),
        num("reading", { min: 0, box: true }),
      ]),
    },
  },
  telegram_bot: TELEGRAM_EDITOR,
  template: { controls: { reload: reloadNote } },
  tesla_fleet: {
    siblings: [
      "navigate_to_destination",
      "navigate_to_coordinates",
      "navigate_to_waypoints",
    ],
    controls: {
      navigate_to_destination: build("tesla_fleet", [
        device("device_id", { integration: "tesla_fleet" }),
        txt("destination"),
      ]),
      navigate_to_coordinates: build("tesla_fleet", [
        device("device_id", { integration: "tesla_fleet" }),
        place("gps"),
      ]),
      navigate_to_waypoints: build("tesla_fleet", [
        device("device_id", { integration: "tesla_fleet" }),
        list("place_ids"),
      ]),
    },
  },
  teslemetry: {
    cautions: {
      valet_mode: F("teslemetry", "caution_pin"),
      speed_limit: F("teslemetry", "caution_pin"),
    },
    controls: {
      navigation_gps_request: build("teslemetry", [
        TESLA_DEVICE,
        place("gps"),
        num("order", { min: 1, box: true }),
      ]),
      time_of_use: build("teslemetry", [TESLA_DEVICE, object("tou_settings")]),
      set_scheduled_charging: build("teslemetry", [
        TESLA_DEVICE,
        bool("enable"),
        time("time"),
      ]),
      set_scheduled_departure: build("teslemetry", [
        TESLA_DEVICE,
        bool("enable"),
        time("departure_time"),
        bool("preconditioning_enabled"),
        bool("preconditioning_weekdays_only"),
        time("end_off_peak_time"),
        bool("off_peak_charging_enabled"),
        bool("off_peak_charging_weekdays_only"),
      ]),
      valet_mode: build("teslemetry", [
        TESLA_DEVICE,
        bool("enable"),
        TESLA_PIN,
      ]),
      speed_limit: build("teslemetry", [
        TESLA_DEVICE,
        bool("enable"),
        TESLA_PIN,
      ]),
      add_charge_schedule: build("teslemetry", [
        TESLA_DEVICE,
        pickMany("days_of_week", DAYS),
        bool("enable"),
        time("start_time"),
        time("end_time"),
        place("location"),
        bool("one_time"),
        num("id", { min: 1, box: true }),
        txt("name"),
      ]),
      remove_charge_schedule: build("teslemetry", [
        TESLA_DEVICE,
        num("id", { min: 1, box: true }),
      ]),
      add_precondition_schedule: build("teslemetry", [
        TESLA_DEVICE,
        pickMany("days_of_week", DAYS),
        bool("enable"),
        time("precondition_time"),
        place("location"),
        bool("one_time"),
        num("id", { min: 1, box: true }),
        txt("name"),
      ]),
      remove_precondition_schedule: build("teslemetry", [
        TESLA_DEVICE,
        num("id", { min: 1, box: true }),
      ]),
      dispatch_battery_power: build("teslemetry", [
        TESLA_DEVICE,
        num("power", { min: -100000, max: 100000, unit: "W", box: true }),
        span("duration", "seconds"),
      ]),
      resume_battery_operation: build("teslemetry", [TESLA_DEVICE]),
    },
  },
  tibber: {
    controls: {
      get_prices: build("tibber", [stamp("start"), stamp("end")]),
    },
  },
  todoist: {
    controls: {
      new_task: build("todoist", [
        txt("content"),
        msg("description"),
        txt("project"),
        txt("section"),
        list("labels"),
        txt("assignee"),
        num("priority", { min: 1, max: 4 }),
        txt("due_date_string"),
        pick("due_date_lang", LANGS),
        stamp("due_date"),
        txt("reminder_date_string"),
        pick("reminder_date_lang", LANGS),
        stamp("reminder_date"),
      ]),
    },
  },
  totalconnect: {
    siblings: ["arm_away_instant", "arm_home_instant"],
    controls: { arm_away_instant: noFields, arm_home_instant: noFields },
  },
  tplink: {
    siblings: ["sequence_effect", "random_effect"],
    controls: {
      sequence_effect: build("tplink", [
        object("sequence"),
        ...tplinkBase,
        num("repeat_times", { min: 0, max: 10 }),
        num("spread", { min: 0, max: 16 }),
        num("direction", { min: 1, max: 4 }),
      ]),
      random_effect: build("tplink", [
        object("init_states"),
        object("backgrounds"),
        ...tplinkBase,
        num("fadeoff", { min: 0, max: 3000, unit: "ms" }),
        object("hue_range"),
        object("saturation_range"),
        object("brightness_range"),
        object("transition_range"),
        num("random_seed", { min: 1, max: 600 }),
      ]),
    },
  },
  tplink_omada: {
    siblings: ["reconnect_client", "set_client_name"],
    controls: {
      reconnect_client: build("tplink_omada", [
        entry("config_entry_id", "tplink_omada"),
        txt("mac"),
      ]),
      set_client_name: build("tplink_omada", [
        entry("config_entry_id", "tplink_omada"),
        (ctx, domain) =>
          selector(
            ctx,
            "device_id",
            F(domain, "device_id"),
            { device: {} },
            "other"
          ),
        txt("name"),
      ]),
    },
  },
  transmission: {
    siblings: [
      "add_torrent",
      "get_torrents",
      "remove_torrent",
      "start_torrent",
      "stop_torrent",
    ],
    cautions: { remove_torrent: F("transmission", "caution_remove_torrent") },
    controls: {
      add_torrent: build("transmission", [
        entry("entry_id", "transmission"),
        txt("torrent"),
        txt("download_path"),
        txt("labels"),
      ]),
      get_torrents: build("transmission", [
        entry("entry_id", "transmission"),
        pick("torrent_filter", [
          "all",
          "active",
          "started",
          "paused",
          "completed",
        ]),
      ]),
      remove_torrent: build("transmission", [
        entry("entry_id", "transmission"),
        txt("id"),
        bool("delete_data"),
      ]),
      start_torrent: build("transmission", [
        entry("entry_id", "transmission"),
        txt("id"),
      ]),
      stop_torrent: build("transmission", [
        entry("entry_id", "transmission"),
        txt("id"),
      ]),
    },
  },
  trend: { controls: { reload: reloadNote } },
  tuya: {
    siblings: ["get_feeder_meal_plan", "set_feeder_meal_plan"],
    controls: {
      get_feeder_meal_plan: build("tuya", [
        device("device_id", { integration: "tuya" }),
      ]),
      set_feeder_meal_plan: build("tuya", [
        device("device_id", { integration: "tuya" }),
        object("meal_plan", MEAL_PLAN),
      ]),
    },
  },
  unifi: {
    siblings: ["reconnect_client", "remove_clients"],
    cautions: { remove_clients: F("unifi", "caution_remove_clients") },
    controls: {
      reconnect_client: build("unifi", [
        device("device_id", { integration: "unifi" }),
      ]),
      remove_clients: noFields,
    },
  },
  unifi_access: {
    controls: {
      set_lock_rule: build("unifi_access", [
        device("device_id", { integration: "unifi_access" }),
        pick("rule", [
          "keep_lock",
          "keep_unlock",
          "custom",
          "reset",
          "lock_early",
        ]),
        span("interval", "hms"),
      ]),
    },
  },
  unifiprotect: {
    siblings: [
      "add_doorbell_text",
      "remove_doorbell_text",
      "set_chime_paired_doorbells",
      "remove_privacy_zone",
      "get_user_keyring_info",
      "ptz_goto_preset",
      "trigger_alarm_webhook",
    ],
    controls: {
      add_doorbell_text: build("unifiprotect", [
        device("device_id", { integration: "unifiprotect" }),
        txt("message", { maxLength: 30 }),
      ]),
      remove_doorbell_text: build("unifiprotect", [
        device("device_id", { integration: "unifiprotect" }),
        txt("message", { maxLength: 30 }),
      ]),
      set_chime_paired_doorbells: build("unifiprotect", [
        device("device_id", { integration: "unifiprotect" }),
        (ctx, domain) =>
          selector(
            ctx,
            "doorbells",
            F(domain, "doorbells"),
            {
              target: {
                entity: [
                  {
                    integration: "unifiprotect",
                    domain: "event",
                    device_class: "doorbell",
                  },
                  {
                    integration: "unifiprotect",
                    domain: "binary_sensor",
                    device_class: "occupancy",
                  },
                ],
              },
            },
            "entity"
          ),
      ]),
      remove_privacy_zone: build("unifiprotect", [
        (ctx, domain) =>
          selector(
            ctx,
            "device_id",
            F(domain, "device_id"),
            {
              device: {
                integration: "unifiprotect",
                entity: { domain: "camera" },
              },
            },
            "other"
          ),
        txt("name"),
      ]),
      get_user_keyring_info: build("unifiprotect", [
        device("device_id", { integration: "unifiprotect" }),
      ]),
      ptz_goto_preset: build("unifiprotect", [
        (ctx, domain) =>
          selector(
            ctx,
            "device_id",
            F(domain, "device_id"),
            {
              device: {
                integration: "unifiprotect",
                entity: { domain: "camera" },
              },
            },
            "other"
          ),
        txt("preset"),
      ]),
      trigger_alarm_webhook: build("unifiprotect", [
        entry("config_entry_id", "unifiprotect"),
        txt("trigger_id"),
      ]),
    },
  },
  universal: { controls: { reload: reloadNote } },
  upb: {
    controls: {
      light_fade_start: build("upb", upbFade),
      light_fade_stop: noFields,
      light_blink: build("upb", [upbRate(0, 4.25)]),
      link_deactivate: noFields,
      link_goto: build("upb", upbFade),
      link_fade_start: build("upb", upbFade),
      link_fade_stop: noFields,
      link_blink: build("upb", [
        num("blink_rate", { min: 0, max: 4.25, step: 0.01, unit: "s" }),
      ]),
    },
  },
  utility_meter: {
    siblings: ["reset", "calibrate"],
    controls: {
      reset: noFields,
      calibrate: build("utility_meter", [txt("value", { type: "number" })]),
    },
  },
  vallox: {
    siblings: [
      "set_profile",
      "set_profile_fan_speed_home",
      "set_profile_fan_speed_away",
      "set_profile_fan_speed_boost",
    ],
    controls: {
      set_profile_fan_speed_home: build("vallox", [
        num("fan_speed", { min: 0, max: 100, unit: "%" }),
      ]),
      set_profile_fan_speed_away: build("vallox", [
        num("fan_speed", { min: 0, max: 100, unit: "%" }),
      ]),
      set_profile_fan_speed_boost: build("vallox", [
        num("fan_speed", { min: 0, max: 100, unit: "%" }),
      ]),
      set_profile: build("vallox", [
        pick("profile", [
          "home",
          "away",
          "boost",
          "fireplace",
          "extra",
          "auto",
        ]),
        num("duration", { min: 1, max: 65535, unit: "min", box: true }),
      ]),
    },
  },
  velbus: {
    siblings: ["sync_clock", "scan", "clear_cache", "set_memo_text"],
    controls: {
      sync_clock: build("velbus", [entry("config_entry", "velbus")]),
      scan: build("velbus", [entry("config_entry", "velbus")]),
      clear_cache: build("velbus", [
        entry("config_entry", "velbus"),
        num("address", { min: 1, max: 254, box: true }),
      ]),
      set_memo_text: build("velbus", [
        num("address", { min: 1, max: 254, box: true }),
        entry("config_entry", "velbus"),
        txt("memo_text", { maxLength: 64 }),
      ]),
    },
  },
  verisure: {
    siblings: ["capture_smartcam", "enable_autolock", "disable_autolock"],
    controls: {
      capture_smartcam: noFields,
      enable_autolock: noFields,
      disable_autolock: noFields,
    },
  },
  vesync: { controls: { update_devices: noFields } },
  vicare: {
    siblings: [
      "get_circulation_schedule",
      "set_circulation_schedule",
      "set_vicare_mode",
    ],
    controls: {
      get_circulation_schedule: noFields,
      set_circulation_schedule: build(
        "vicare",
        DAYS.map((name) => object(name, CIRCULATION_SLOT))
      ),
      set_vicare_mode: build("vicare", [
        pick("vicare_mode", [
          "dhw",
          "dhwAndHeating",
          "dhwAndHeatingCooling",
          "forcedNormal",
          "forcedReduced",
          "heating",
          "standby",
        ]),
      ]),
    },
  },
  vizio: {
    siblings: ["send_text", "update_setting"],
    controls: {
      send_text: build("vizio", [msg("text")]),
      update_setting: build("vizio", [
        txt("setting_type", { chips: ["audio", "picture"] }),
        txt("setting_name"),
        txt("new_value"),
      ]),
    },
  },
  volvo: {
    controls: {
      get_image_url: build("volvo", [
        entry("entry", "volvo"),
        pickMany("images", [
          "exterior_back",
          "exterior_back_left",
          "exterior_back_right",
          "exterior_front",
          "exterior_front_left",
          "exterior_front_right",
          "exterior_side_left",
          "exterior_side_right",
          "interior",
        ]),
      ]),
    },
  },
  wake_on_lan: {
    controls: {
      send_magic_packet: build("wake_on_lan", [
        txt("mac"),
        pw("secureon_password"),
        txt("broadcast_address"),
        num("broadcast_port", { min: 1, max: 65535, box: true }),
      ]),
    },
  },
  wall_tablet: {
    siblings: ["wake", "sleep", "reload", "navigate"],
    controls: {
      wake: build("wall_tablet", [txt("tablet_id")]),
      sleep: build("wall_tablet", [txt("tablet_id")]),
      reload: build("wall_tablet", [txt("tablet_id")]),
      navigate: build("wall_tablet", [txt("path"), txt("tablet_id")]),
    },
  },
  watts: {
    controls: {
      activate_timer_mode: build("watts", [
        num("temperature", { step: 0.5, unit: "°", box: true }),
        span("duration", "hms"),
      ]),
    },
  },
  waze_travel_time: {
    controls: {
      get_travel_times: build("waze_travel_time", [
        txt("origin"),
        txt("destination"),
        pick("region", ["us", "na", "eu", "il", "au"]),
        pick("units", ["metric", "imperial"]),
        pick("vehicle_type", ["car", "taxi", "motorcycle"]),
        bool("realtime"),
        bool("avoid_toll_roads"),
        bool("avoid_ferries"),
        bool("avoid_subscription_roads"),
        list("incl_filter"),
        list("excl_filter"),
        span("time_delta", "hms"),
        place("base_coordinates"),
      ]),
    },
  },
  webostv: {
    siblings: ["button", "command", "select_sound_output"],
    controls: {
      button: build("webostv", [
        entity("entity_id", { integration: "webostv", domain: "media_player" }),
        txt("button", { chips: WEBOS_BUTTONS }),
      ]),
      command: build("webostv", [
        entity("entity_id", { integration: "webostv", domain: "media_player" }),
        txt("command"),
        object("payload"),
      ]),
      select_sound_output: build("webostv", [
        entity("entity_id", { integration: "webostv", domain: "media_player" }),
        txt("sound_output", { chips: WEBOS_OUTPUTS }),
      ]),
    },
  },
  wemo: {
    siblings: ["set_humidity", "reset_filter_life"],
    controls: {
      set_humidity: build("wemo", [
        num("target_humidity", { min: 0, max: 100, step: 5, unit: "%" }),
      ]),
      reset_filter_life: noFields,
    },
  },
  wilight: {
    siblings: ["set_watering_time", "set_pause_time", "set_trigger"],
    controls: {
      set_watering_time: build("wilight", [
        num("watering_time", { min: 1, max: 1800 }),
      ]),
      set_pause_time: build("wilight", [
        num("pause_time", { min: 1, max: 24 }),
      ]),
      set_trigger: build("wilight", [
        num("trigger_index", { min: 1, max: 4 }),
        txt("trigger"),
      ]),
    },
  },
  wmspro: {
    controls: {
      set_cover_position_and_tilt: build("wmspro", [
        num("position", { min: 0, max: 100, unit: "%" }),
        num("tilt_position", { min: 0, max: 100, unit: "%" }),
      ]),
    },
  },
  workday: {
    controls: { check_date: build("workday", [day("check_date")]) },
  },
  xiaomi_aqara: {
    siblings: ["add_device", "remove_device", "play_ringtone", "stop_ringtone"],
    cautions: { remove_device: F("xiaomi_aqara", "caution_remove_device") },
    controls: {
      add_device: build("xiaomi_aqara", [txt("gw_mac")]),
      play_ringtone: build("xiaomi_aqara", [
        txt("gw_mac"),
        txt("ringtone_id"),
        num("ringtone_vol", { min: 0, max: 100 }),
      ]),
      remove_device: build("xiaomi_aqara", [txt("gw_mac"), txt("device_id")]),
      stop_ringtone: build("xiaomi_aqara", [txt("gw_mac")]),
    },
  },
  xiaomi_miio: XIAOMI_MIIO_EDITOR,
  yamaha: {
    siblings: ["enable_output", "menu_cursor", "select_scene"],
    controls: {
      enable_output: build("yamaha", [
        txt("port", { chips: ["hdmi1", "hdmi2"] }),
        bool("enabled"),
      ]),
      menu_cursor: build("yamaha", [
        pick("cursor", ["down", "left", "return", "right", "select", "up"]),
      ]),
      select_scene: build("yamaha", [txt("scene")]),
    },
  },
  yardian: {
    controls: {
      start_irrigation: build("yardian", [
        num("duration", { min: 1, max: 1440, unit: "min" }),
      ]),
    },
  },
  yeelight: YEELIGHT_EDITOR,
  yolink: {
    controls: {
      play_on_speaker_hub: build("yolink", [
        device("target_device", { integration: "yolink", model: "SpeakerHub" }),
        msg("message"),
        pick("tone", ["emergency", "alert", "warn", "tip"]),
        num("volume", { min: 0, max: 15 }),
        num("repeat", { min: 0, max: 10 }),
      ]),
    },
  },
  zha: ZHA_EDITOR,
  zoneminder: {
    controls: { set_run_state: build("zoneminder", [txt("name")]) },
  },
  zwave_js: ZWAVE_EDITOR,
};
