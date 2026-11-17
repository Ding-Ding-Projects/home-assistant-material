import {
  compact,
  L,
  notice,
  selector,
  slider,
  stepper,
  temporal,
  textBox,
  tiles,
  choice,
  toggle,
  duration,
} from "../../quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
} from "../../quick-types";

/**
 * Tailored editors for the integrations from `abode` to `downloader` that
 * offer their own actions. Entity pickers for `entity_id` stay with the
 * action's target or entity picker; every other field gets its own control.
 * Labels live under `<domain>__<field>`.
 */

type Ctx = QuickContext;
type Extra = Partial<Extract<QuickControl, { kind: "text" }>>;

const noFields = (): QuickControl[] => [];

const lab = (domain: string, name: string) => L(`${domain}__${name}`);

/** Control factories bound to one integration so every label key is prefixed. */
const bind = (domain: string) => ({
  text: (ctx: Ctx, key: string, extra: Extra = {}) =>
    textBox(ctx, key, lab(domain, key), extra),
  url: (ctx: Ctx, key: string) =>
    textBox(ctx, key, lab(domain, key), { inputType: "url" }),
  secret: (ctx: Ctx, key: string) =>
    textBox(ctx, key, lab(domain, key), { inputType: "password" }),
  message: (ctx: Ctx, key: string, extra: Extra = {}) =>
    textBox(ctx, key, lab(domain, key), {
      multiline: true,
      showCount: true,
      ...extra,
    }),
  tiles: (ctx: Ctx, key: string, values: string[], translated = true) =>
    tiles(
      ctx,
      key,
      lab(domain, key),
      values,
      translated ? lab(domain, `${key}__`) : undefined
    ),
  choice: (ctx: Ctx, key: string, values: string[]) =>
    choice(ctx, key, lab(domain, key), values),
  toggle: (ctx: Ctx, key: string) => toggle(ctx, key, lab(domain, key)),
  slider: (
    ctx: Ctx,
    key: string,
    min: number,
    max: number,
    step: number,
    unit?: string
  ) => slider(ctx, key, lab(domain, key), min, max, step, unit ? { unit } : {}),
  stepper: (
    ctx: Ctx,
    key: string,
    min: number,
    max: number,
    step: number,
    unit?: string
  ) => stepper(ctx, key, lab(domain, key), min, max, step, unit),
  duration: (ctx: Ctx, key: string) =>
    duration(ctx, key, lab(domain, key), "hms"),
  datetime: (ctx: Ctx, key: string) =>
    temporal(ctx, key, lab(domain, key), "datetime"),
  device: (ctx: Ctx) =>
    selector(
      ctx,
      "device_id",
      lab(domain, "device_id"),
      { device: { filter: { integration: domain } } },
      "other"
    ),
  entry: (ctx: Ctx) =>
    selector(
      ctx,
      "config_entry_id",
      lab(domain, "config_entry_id"),
      { config_entry: { integration: domain } },
      "other"
    ),
  entity: (ctx: Ctx, key: string, entityDomain: string) =>
    selector(
      ctx,
      key,
      lab(domain, key),
      { entity: { domain: entityDomain, integration: domain } },
      "entity"
    ),
  select: (ctx: Ctx, key: string, config: Record<string, any>) =>
    selector(ctx, key, lab(domain, key), config, "other"),
  list: (ctx: Ctx, key: string) =>
    selector(ctx, key, lab(domain, key), { text: { multiple: true } }, "list"),
  object: (ctx: Ctx, key: string) =>
    selector(ctx, key, lab(domain, key), { object: {} }, "object"),
  note: (name: string, tone: "caution" | "info" = "info") =>
    notice(
      name,
      lab(domain, `${tone === "caution" ? "caution" : "note"}_${name}`),
      tone
    ),
  caution: (name: string) => lab(domain, `caution_${name}`),
});

const reloadOnly = (): DomainEditor => ({
  siblings: ["reload"],
  controls: { reload: () => [notice("reload", L("note_reload"))] },
});

const abode = bind("abode");
const adguard = bind("adguard");
const ads = bind("ads");
const advantage = bind("advantage_air");
const aftership = bind("aftership");
const alarmdecoder = bind("alarmdecoder");
const alexaDevices = bind("alexa_devices");
const amber = bind("amberelectric");
const amcrest = bind("amcrest");
const androidtv = bind("androidtv");
const appleTv = bind("apple_tv");
const bang = bind("bang_olufsen");
const besen = bind("besen");
const blackbird = bind("blackbird");
const blink = bind("blink");
const blueCurrent = bind("blue_current");
const bond = bind("bond");
const bosch = bind("bosch_alarm");
const bring = bind("bring");
const browser = bind("browser");
const bsblan = bind("bsblan");
const cast = bind("cast");
const channels = bind("channels");
const collection = bind("collection_image");
const extractor = bind("color_extractor");
const daikin = bind("daikin");
const deconz = bind("deconz");
const denon = bind("denonavr");
const downloader = bind("downloader");

const ALEXA_SOUNDS = [
  "air_horn_03",
  "amzn_sfx_cat_meow_1x_01",
  "amzn_sfx_church_bell_1x_02",
  "amzn_sfx_crowd_applause_01",
  "amzn_sfx_dog_med_bark_1x_02",
  "amzn_sfx_doorbell_01",
  "amzn_sfx_doorbell_chime_01",
  "amzn_sfx_doorbell_chime_02",
  "amzn_sfx_large_crowd_cheer_01",
  "amzn_sfx_lion_roar_02",
  "amzn_sfx_rooster_crow_01",
  "amzn_sfx_scifi_alarm_01",
  "amzn_sfx_scifi_alarm_04",
  "amzn_sfx_scifi_engines_on_02",
  "amzn_sfx_scifi_sheilds_up_01",
  "amzn_sfx_trumpet_bugle_04",
  "amzn_sfx_wolf_howl_02",
  "bell_02",
  "boing_01",
  "boing_03",
  "buzzers_pistols_01",
  "camera_01",
  "christmas_05",
  "clock_01",
  "futuristic_10",
  "halloween_bats",
  "halloween_crows",
  "halloween_footsteps",
  "halloween_wind",
  "halloween_wolf",
  "holiday_halloween_ghost",
  "horror_10",
  "med_system_alerts_minimal_dragon_short",
  "med_system_alerts_minimal_owl_short",
  "med_system_alerts_minimals_blue_wave_small",
  "med_system_alerts_minimals_galaxy_short",
  "med_system_alerts_minimals_panda_short",
  "med_system_alerts_minimals_tiger_short",
  "med_ui_success_generic_1-1",
  "squeaky_12",
  "zap_01",
];

const ALEXA_INFO_SKILLS = [
  "calendar_today",
  "calendar_tomorrow",
  "calendar_next",
  "date",
  "time",
  "national_news",
  "flash_briefing",
  "traffic",
  "weather",
  "cleanup",
  "good_morning",
  "sing_song",
  "fun_fact",
  "tell_joke",
  "tell_story",
  "im_home",
  "goodnight",
];

const ADS_TYPES = ["bool", "byte", "dint", "int", "udint", "uint"];

const PTZ_MOVES = [
  "up",
  "down",
  "left",
  "right",
  "left_up",
  "left_down",
  "right_up",
  "right_down",
  "zoom_in",
  "zoom_out",
];

const ADB_KEYS = [
  "HOME",
  "BACK",
  "MENU",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "ENTER",
  "SPACE",
  "PLAY",
  "PAUSE",
  "POWER",
  "SLEEP",
  "WAKEUP",
  "VOLUME_UP",
  "VOLUME_DOWN",
  "MUTE",
].map((name) => ({ id: `adb_${name}`, text: name, replace: true }));

const KEYPAD_CHIPS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "*",
  "#",
].map((name) => ({ id: `keypad_${name}`, text: name }));

const BEOLINK_SOURCES = [
  "beoradio",
  "deezer",
  "spotify",
  "tidal",
  "radio",
  "tp1",
  "tp2",
  "cd",
  "aux_a",
  "ph",
];

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** One day of a weekly schedule: a list of start and end times. */
const SLOT_SELECTOR = {
  object: {
    multiple: true,
    label_field: "start_time",
    description_field: "end_time",
    fields: {
      start_time: { selector: { time: {} }, required: true },
      end_time: { selector: { time: {} }, required: true },
    },
  },
};

const scheduleDays = (ctx: Ctx) =>
  WEEKDAYS.map((day) =>
    selector(
      ctx,
      `${day}_slots`,
      lab("bsblan", `${day}_slots`),
      SLOT_SELECTOR,
      "list"
    )
  );

export const INTEGRATION_EDITORS_A: Record<string, DomainEditor> = {
  abode: {
    siblings: ["capture_image", "trigger_automation", "change_setting"],
    controls: {
      capture_image: noFields,
      trigger_automation: noFields,
      change_setting: (ctx) =>
        compact([abode.text(ctx, "setting"), abode.text(ctx, "value")]),
    },
  },
  adguard: {
    siblings: ["add_url", "remove_url", "enable_url", "disable_url", "refresh"],
    cautions: { remove_url: adguard.caution("remove_url") },
    controls: {
      add_url: (ctx) =>
        compact([adguard.text(ctx, "name"), adguard.url(ctx, "url")]),
      remove_url: (ctx) => compact([adguard.url(ctx, "url")]),
      enable_url: (ctx) => compact([adguard.url(ctx, "url")]),
      disable_url: (ctx) => compact([adguard.url(ctx, "url")]),
      refresh: (ctx) => compact([adguard.toggle(ctx, "force")]),
    },
  },
  ads: {
    controls: {
      write_data_by_name: (ctx) =>
        compact([
          ads.text(ctx, "adsvar"),
          ads.tiles(ctx, "adstype", ADS_TYPES, false),
          ads.slider(ctx, "value", 0, 10000, 1),
        ]),
    },
  },
  advantage_air: {
    controls: {
      set_time_to: (ctx) =>
        compact([advantage.slider(ctx, "minutes", 0, 1440, 1, "min")]),
    },
  },
  aftership: {
    siblings: ["add_tracking", "remove_tracking"],
    controls: {
      add_tracking: (ctx) =>
        compact([
          aftership.text(ctx, "tracking_number"),
          aftership.text(ctx, "title"),
          aftership.text(ctx, "slug"),
        ]),
      remove_tracking: (ctx) =>
        compact([
          aftership.text(ctx, "tracking_number"),
          aftership.text(ctx, "slug"),
        ]),
    },
  },
  agent_dvr: {
    siblings: [
      "start_recording",
      "stop_recording",
      "enable_alerts",
      "disable_alerts",
      "snapshot",
    ],
    controls: {
      start_recording: noFields,
      stop_recording: noFields,
      enable_alerts: noFields,
      disable_alerts: noFields,
      snapshot: noFields,
    },
  },
  alarmdecoder: {
    siblings: ["alarm_keypress", "alarm_toggle_chime"],
    controls: {
      alarm_keypress: (ctx) =>
        compact([alarmdecoder.text(ctx, "keypress", { chips: KEYPAD_CHIPS })]),
      alarm_toggle_chime: (ctx) => compact([alarmdecoder.secret(ctx, "code")]),
    },
  },
  alexa_devices: {
    siblings: ["send_text_command", "send_sound", "send_info_skill"],
    controls: {
      send_text_command: (ctx) =>
        compact([
          alexaDevices.device(ctx),
          alexaDevices.message(ctx, "text_command"),
        ]),
      send_sound: (ctx) =>
        compact([
          alexaDevices.device(ctx),
          alexaDevices.choice(ctx, "sound", ALEXA_SOUNDS),
        ]),
      send_info_skill: (ctx) =>
        compact([
          alexaDevices.device(ctx),
          alexaDevices.choice(ctx, "info_skill", ALEXA_INFO_SKILLS),
        ]),
    },
  },
  amberelectric: {
    controls: {
      get_forecasts: (ctx) =>
        compact([
          amber.entry(ctx),
          amber.tiles(ctx, "channel_type", [
            "general",
            "controlled_load",
            "feed_in",
          ]),
        ]),
    },
  },
  amcrest: {
    siblings: [
      "enable_recording",
      "disable_recording",
      "enable_audio",
      "disable_audio",
      "enable_motion_recording",
      "disable_motion_recording",
      "goto_preset",
      "set_color_bw",
      "start_tour",
      "stop_tour",
      "ptz_control",
    ],
    controls: {
      enable_recording: noFields,
      disable_recording: noFields,
      enable_audio: noFields,
      disable_audio: noFields,
      enable_motion_recording: noFields,
      disable_motion_recording: noFields,
      start_tour: noFields,
      stop_tour: noFields,
      goto_preset: (ctx) =>
        compact([amcrest.stepper(ctx, "preset", 1, 1000, 1)]),
      set_color_bw: (ctx) =>
        compact([amcrest.tiles(ctx, "color_bw", ["auto", "bw", "color"])]),
      ptz_control: (ctx) =>
        compact([
          amcrest.tiles(ctx, "movement", PTZ_MOVES),
          amcrest.slider(ctx, "travel_time", 0, 1, 0.01, "s"),
        ]),
    },
  },
  androidtv: {
    siblings: ["adb_command", "download", "upload", "learn_sendevent"],
    cautions: { upload: androidtv.caution("upload") },
    controls: {
      adb_command: (ctx) =>
        compact([androidtv.text(ctx, "command", { chips: ADB_KEYS })]),
      download: (ctx) =>
        compact([
          androidtv.text(ctx, "device_path"),
          androidtv.text(ctx, "local_path"),
        ]),
      upload: (ctx) =>
        compact([
          androidtv.text(ctx, "local_path"),
          androidtv.text(ctx, "device_path"),
        ]),
      learn_sendevent: () => [androidtv.note("learn_sendevent")],
    },
  },
  apple_tv: {
    siblings: [
      "set_keyboard_text",
      "append_keyboard_text",
      "clear_keyboard_text",
    ],
    controls: {
      set_keyboard_text: (ctx) =>
        compact([appleTv.entry(ctx), appleTv.text(ctx, "text")]),
      append_keyboard_text: (ctx) =>
        compact([appleTv.entry(ctx), appleTv.text(ctx, "text")]),
      clear_keyboard_text: (ctx) => compact([appleTv.entry(ctx)]),
    },
  },
  bang_olufsen: {
    siblings: [
      "beolink_join",
      "beolink_expand",
      "beolink_unexpand",
      "beolink_leave",
      "beolink_allstandby",
    ],
    cautions: { beolink_allstandby: bang.caution("beolink_allstandby") },
    controls: {
      beolink_allstandby: noFields,
      beolink_leave: noFields,
      beolink_expand: (ctx) =>
        compact([
          bang.toggle(ctx, "all_discovered"),
          bang.list(ctx, "beolink_jids"),
        ]),
      beolink_join: (ctx) =>
        compact([
          bang.text(ctx, "beolink_jid"),
          bang.choice(ctx, "source_id", BEOLINK_SOURCES),
        ]),
      beolink_unexpand: (ctx) => compact([bang.list(ctx, "beolink_jids")]),
    },
  },
  bayesian: reloadOnly(),
  besen: {
    controls: {
      start_charging: (ctx) =>
        compact([
          besen.datetime(ctx, "start"),
          besen.duration(ctx, "duration"),
        ]),
    },
  },
  blackbird: {
    controls: {
      set_all_zones: (ctx) => compact([blackbird.text(ctx, "source")]),
    },
  },
  blink: {
    siblings: ["record", "trigger_camera", "save_video", "save_recent_clips"],
    controls: {
      record: noFields,
      trigger_camera: noFields,
      save_video: (ctx) => compact([blink.text(ctx, "filename")]),
      save_recent_clips: (ctx) => compact([blink.text(ctx, "file_path")]),
    },
  },
  blue_current: {
    controls: {
      start_charge_session: (ctx) =>
        compact([
          blueCurrent.device(ctx),
          blueCurrent.text(ctx, "charging_card_id"),
        ]),
    },
  },
  bond: {
    siblings: [
      "set_fan_speed_tracked_state",
      "set_switch_power_tracked_state",
      "set_light_power_tracked_state",
      "set_light_brightness_tracked_state",
      "start_increasing_brightness",
      "start_decreasing_brightness",
      "stop",
    ],
    controls: {
      set_fan_speed_tracked_state: (ctx) =>
        compact([bond.slider(ctx, "speed", 0, 100, 1, "%")]),
      set_switch_power_tracked_state: (ctx) =>
        compact([bond.toggle(ctx, "power_state")]),
      set_light_power_tracked_state: (ctx) =>
        compact([bond.toggle(ctx, "power_state")]),
      set_light_brightness_tracked_state: (ctx) =>
        compact([bond.slider(ctx, "brightness", 0, 255, 1)]),
      start_increasing_brightness: noFields,
      start_decreasing_brightness: noFields,
      stop: noFields,
    },
  },
  bosch_alarm: {
    controls: {
      set_date_time: (ctx) =>
        compact([bosch.entry(ctx), bosch.datetime(ctx, "datetime")]),
    },
  },
  bring: {
    siblings: ["send_message", "send_reaction"],
    controls: {
      send_message: (ctx) =>
        compact([
          bring.tiles(ctx, "message", [
            "going_shopping",
            "changed_list",
            "shopping_done",
            "urgent_message",
          ]),
          bring.text(ctx, "item"),
        ]),
      send_reaction: (ctx) =>
        compact([
          bring.tiles(ctx, "reaction", [
            "thumbs_up",
            "monocle",
            "drooling",
            "heart",
          ]),
        ]),
    },
  },
  browser: {
    controls: {
      browse_url: (ctx) => compact([browser.url(ctx, "url")]),
    },
  },
  bsblan: {
    siblings: ["sync_time", "set_hot_water_schedule", "set_heating_schedule"],
    controls: {
      sync_time: (ctx) => compact([bsblan.device(ctx)]),
      set_hot_water_schedule: (ctx) =>
        compact([bsblan.device(ctx), ...scheduleDays(ctx)]),
      set_heating_schedule: (ctx) =>
        compact([bsblan.device(ctx), ...scheduleDays(ctx)]),
    },
  },
  cast: {
    controls: {
      show_lovelace_view: (ctx) =>
        compact([
          cast.text(ctx, "view_path"),
          cast.text(ctx, "dashboard_path"),
        ]),
    },
  },
  channels: {
    siblings: ["seek_forward", "seek_backward", "seek_by"],
    controls: {
      seek_forward: noFields,
      seek_backward: noFields,
      seek_by: (ctx) =>
        compact([channels.stepper(ctx, "seconds", -3600, 3600, 1, "s")]),
    },
  },
  cloud: {
    siblings: ["remote_connect", "remote_disconnect"],
    cautions: { remote_disconnect: lab("cloud", "caution_remote_disconnect") },
    controls: {
      remote_connect: noFields,
      remote_disconnect: noFields,
    },
  },
  cloudflare: {
    controls: { update_records: noFields },
  },
  collection_image: {
    siblings: [
      "select_first",
      "select_previous",
      "select_next",
      "select_last",
      "shuffle",
      "select_image",
    ],
    controls: {
      shuffle: noFields,
      select_first: noFields,
      select_last: noFields,
      select_next: (ctx) => compact([collection.toggle(ctx, "wrap")]),
      select_previous: (ctx) => compact([collection.toggle(ctx, "wrap")]),
      select_image: (ctx) =>
        compact([
          selector(
            ctx,
            "image",
            lab("collection_image", "image"),
            { media: { accept: ["image/*"] } },
            "media"
          ),
        ]),
    },
  },
  color_extractor: {
    siblings: ["turn_on", "get_color"],
    controls: {
      turn_on: (ctx) =>
        compact([
          extractor.url(ctx, "color_extract_url"),
          extractor.text(ctx, "color_extract_path"),
        ]),
      get_color: (ctx) =>
        compact([
          extractor.url(ctx, "color_extract_url"),
          extractor.text(ctx, "color_extract_path"),
        ]),
    },
  },
  command_line: reloadOnly(),
  configurator: {
    controls: {
      configure: () => [
        notice("configure", lab("configurator", "note_configure")),
      ],
    },
  },
  daikin: {
    controls: {
      set_demand_control: (ctx) =>
        compact([
          daikin.device(ctx),
          daikin.toggle(ctx, "en_demand"),
          daikin.tiles(ctx, "mode", ["manual", "auto"]),
          daikin.slider(ctx, "max_pow", 40, 100, 1, "%"),
        ]),
    },
  },
  debugpy: {
    cautions: { start: lab("debugpy", "caution_start") },
    controls: { start: noFields },
  },
  deconz: {
    siblings: ["configure", "device_refresh", "remove_orphaned_entries"],
    cautions: {
      remove_orphaned_entries: deconz.caution("remove_orphaned_entries"),
    },
    controls: {
      configure: (ctx) =>
        compact([
          deconz.entity(ctx, "entity", "light"),
          deconz.text(ctx, "field"),
          deconz.object(ctx, "data"),
          deconz.text(ctx, "bridgeid"),
        ]),
      device_refresh: (ctx) => compact([deconz.text(ctx, "bridgeid")]),
      remove_orphaned_entries: (ctx) => compact([deconz.text(ctx, "bridgeid")]),
    },
  },
  demo: {
    controls: { randomize_device_tracker_data: noFields },
  },
  denonavr: {
    siblings: ["get_command", "set_dynamic_eq", "update_audyssey"],
    controls: {
      get_command: (ctx) => compact([denon.text(ctx, "command")]),
      set_dynamic_eq: (ctx) => compact([denon.toggle(ctx, "dynamic_eq")]),
      update_audyssey: noFields,
    },
  },
  derivative: reloadOnly(),
  downloader: {
    controls: {
      download_file: (ctx) =>
        compact([
          downloader.url(ctx, "url"),
          downloader.text(ctx, "subdir"),
          downloader.text(ctx, "filename"),
          downloader.toggle(ctx, "overwrite"),
          downloader.object(ctx, "headers"),
        ]),
    },
  },
};
