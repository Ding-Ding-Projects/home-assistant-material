import { hasTemplate } from "../../../../common/string/has-template";
import {
  attrList,
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
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
  QuickOption,
  QuickValueType,
} from "../../quick-types";

/**
 * Tailored action editors for the integrations media_player through
 * profiler. Each service is described as a short list of field specs and one
 * interpreter turns a spec into the rich control that fits it, so every field
 * of every service gets the right control and none falls back to a bare box.
 */

interface SpecOption {
  value: string;
  /** English label; the translated label is read from the field's label keys. */
  label?: string;
}

interface Range {
  min: number;
  max: number;
  step: number;
  unit?: string;
}

type Spec =
  | ({ t: "slider"; key: string } & Range)
  | ({ t: "stepper"; key: string } & Range)
  | { t: "toggle"; key: string }
  | { t: "tiles"; key: string; options: SpecOption[] }
  | { t: "multi"; key: string; options: SpecOption[] }
  | {
      t: "text";
      key: string;
      multiline?: boolean;
      inputType?: string;
    }
  | { t: "list"; key: string }
  | { t: "duration"; key: string; format?: "seconds" | "hms" }
  | { t: "time" | "date" | "datetime"; key: string }
  | {
      t: "selector";
      key: string;
      selector: Record<string, any>;
      valueType: QuickValueType;
    }
  | { t: "state"; key: string; selector: Record<string, any> }
  | { t: "attr"; key: string; attr: string }
  | { t: "either"; key: string; scalar: Spec }
  | { t: "textOrObject"; key: string };

const plainObject = (value: unknown): boolean =>
  typeof value === "object" && value !== null;

const humanLabel = (value: string): string => {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Short lists become tiles, long ones a searchable list box. A stored number
 * is shown as its text, so an option list that is numeric in the service
 * still selects the stored value.
 */
const pick = (
  ctx: QuickContext,
  domain: string,
  spec: Extract<Spec, { t: "tiles" }>
): QuickControl | undefined => {
  const raw = ctx.data[spec.key];
  if (!claim(ctx, spec.key) || hasTemplate(raw)) return undefined;
  if (raw !== undefined && typeof raw !== "string" && typeof raw !== "number") {
    return undefined;
  }
  const value = raw === undefined ? undefined : String(raw);
  const labelKey = L(`${domain}__${spec.key}`);
  const known = spec.options.map((option) => option.value);
  const extra = value !== undefined && !known.includes(value) ? [value] : [];
  if (spec.options.length + extra.length <= 8) {
    const options: QuickOption[] = [
      ...spec.options.map((option) => ({
        value: option.value,
        labelKey:
          option.label !== undefined
            ? L(`${domain}__${spec.key}__${option.value}`)
            : undefined,
      })),
      ...extra.map((item) => ({ value: item })),
    ];
    return { kind: "tiles", key: spec.key, labelKey, options, value };
  }
  return {
    kind: "selector",
    key: spec.key,
    labelKey,
    valueType: "list",
    selector: {
      select: {
        mode: "dropdown",
        options: [...spec.options.map((o) => o.value), ...extra].map(
          (item) => ({
            value: item,
            label:
              spec.options.find((o) => o.value === item)?.label ??
              humanLabel(item),
          })
        ),
      },
    },
    value,
  };
};

const durationField = (
  ctx: QuickContext,
  domain: string,
  spec: Extract<Spec, { t: "duration" }>
): QuickControl | undefined => {
  const labelKey = L(`${domain}__${spec.key}`);
  // A duration stored as hours, minutes and seconds keeps its own editor.
  if (plainObject(ctx.data[spec.key])) {
    return selector(ctx, spec.key, labelKey, { duration: {} }, "other");
  }
  return duration(ctx, spec.key, labelKey, spec.format);
};

const build = (
  ctx: QuickContext,
  domain: string,
  spec: Spec
): QuickControl | undefined => {
  const key = spec.key;
  const labelKey = L(`${domain}__${key}`);
  switch (spec.t) {
    case "slider":
      return slider(ctx, key, labelKey, spec.min, spec.max, spec.step, {
        unit: spec.unit,
      });
    case "stepper":
      return stepper(
        ctx,
        key,
        labelKey,
        spec.min,
        spec.max,
        spec.step,
        spec.unit
      );
    case "toggle":
      return toggle(ctx, key, labelKey);
    case "tiles":
      return pick(ctx, domain, spec);
    case "multi":
      return selector(
        ctx,
        key,
        labelKey,
        {
          select: {
            multiple: true,
            mode: "dropdown",
            options: spec.options.map((option) => ({
              value: option.value,
              label: option.label ?? humanLabel(option.value),
            })),
          },
        },
        "list"
      );
    case "text":
      return textBox(ctx, key, labelKey, {
        ...(spec.multiline ? { multiline: true, showCount: true } : {}),
        ...(spec.inputType ? { inputType: spec.inputType } : {}),
      });
    case "list":
      return selector(ctx, key, labelKey, { text: { multiple: true } }, "list");
    case "duration":
      return durationField(ctx, domain, spec);
    case "time":
    case "date":
    case "datetime":
      return temporal(ctx, key, labelKey, spec.t);
    case "selector":
      return selector(ctx, key, labelKey, spec.selector, spec.valueType);
    case "state":
      return selector(ctx, key, labelKey, spec.selector, "entity");
    case "attr": {
      const values = attrList(ctx, spec.attr);
      return values.length
        ? choice(ctx, key, labelKey, values)
        : textBox(ctx, key, labelKey);
    }
    case "either":
      // Lists and dictionaries keep the object editor; one value gets its own.
      return plainObject(ctx.data[key])
        ? selector(ctx, key, labelKey, { object: {} }, "object")
        : build(ctx, domain, spec.scalar);
    case "textOrObject":
      return plainObject(ctx.data[key])
        ? selector(ctx, key, labelKey, { object: {} }, "object")
        : textBox(ctx, key, labelKey);
    default:
      return undefined;
  }
};

interface IntegrationSpec {
  /** Services in the order their action tiles are shown. */
  siblings: string[];
  /** Services with a visible caution. */
  cautions?: string[];
  gates?: Record<string, number>;
  services: Record<string, Spec[]>;
}

const integration = (domain: string, spec: IntegrationSpec): DomainEditor => ({
  siblings: spec.siblings.length > 1 ? spec.siblings : undefined,
  cautions: spec.cautions?.length
    ? Object.fromEntries(
        spec.cautions.map((service) => [
          service,
          L(`${domain}__caution_${service}`),
        ])
      )
    : undefined,
  gates: spec.gates,
  controls: Object.fromEntries(
    Object.entries(spec.services).map(([service, specs]) => [
      service,
      (ctx: QuickContext): QuickControl[] =>
        service === "reload" && !specs.length
          ? [notice("reload", L("note_reload"))]
          : compact(specs.map((item) => build(ctx, domain, item))),
    ])
  ),
});

/** Field specs of every service, by integration domain. Read by the tests. */
export const INTEGRATION_SERVICE_SPECS_D: Record<string, IntegrationSpec> = {
  melcloud: {
    siblings: ["set_vane_horizontal", "set_vane_vertical"],
    services: {
      set_vane_horizontal: [
        { t: "attr", key: "position", attr: "vane_horizontal_positions" },
      ],
      set_vane_vertical: [
        { t: "attr", key: "position", attr: "vane_vertical_positions" },
      ],
    },
  },
  miele: {
    siblings: ["get_programs", "set_program", "set_program_oven"],
    services: {
      get_programs: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "miele" } },
          valueType: "entity",
        },
      ],
      set_program: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "miele" } },
          valueType: "entity",
        },
        { t: "stepper", key: "program_id", min: 0, max: 99999, step: 1 },
      ],
      set_program_oven: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "miele" } },
          valueType: "entity",
        },
        { t: "stepper", key: "program_id", min: 0, max: 99999, step: 1 },
        {
          t: "stepper",
          key: "temperature",
          min: 30,
          max: 300,
          step: 1,
          unit: "°C",
        },
        { t: "duration", key: "duration" },
      ],
    },
  },
  mijn_farmad_apotheek: {
    siblings: ["order_medication", "search_medication"],
    cautions: ["order_medication"],
    services: {
      order_medication: [
        { t: "text", key: "product" },
        { t: "text", key: "apb" },
        { t: "stepper", key: "quantity", min: 1, max: 1000000000, step: 1 },
        { t: "text", key: "comment" },
      ],
      search_medication: [
        { t: "text", key: "query" },
        { t: "text", key: "apb" },
      ],
    },
  },
  mill: {
    siblings: ["set_room_temperature"],
    services: {
      set_room_temperature: [
        { t: "text", key: "room_name" },
        { t: "slider", key: "away_temp", min: 0, max: 100, step: 1, unit: "°" },
        {
          t: "slider",
          key: "comfort_temp",
          min: 0,
          max: 100,
          step: 1,
          unit: "°",
        },
        {
          t: "slider",
          key: "sleep_temp",
          min: 0,
          max: 100,
          step: 1,
          unit: "°",
        },
      ],
    },
  },
  min_max: { siblings: ["reload"], services: { reload: [] } },
  minio: {
    siblings: ["get", "put", "remove"],
    cautions: ["remove"],
    services: {
      get: [
        { t: "text", key: "bucket" },
        { t: "text", key: "key" },
        { t: "text", key: "file_path" },
      ],
      put: [
        { t: "text", key: "bucket" },
        { t: "text", key: "key" },
        { t: "text", key: "file_path" },
      ],
      remove: [
        { t: "text", key: "bucket" },
        { t: "text", key: "key" },
      ],
    },
  },
  modbus: {
    siblings: ["reload", "write_coil", "write_register", "stop"],
    cautions: ["write_coil", "write_register", "stop"],
    services: {
      reload: [],
      write_coil: [
        { t: "stepper", key: "address", min: 0, max: 65535, step: 1 },
        { t: "either", key: "state", scalar: { t: "toggle", key: "state" } },
        { t: "slider", key: "slave", min: 1, max: 255, step: 1 },
        { t: "text", key: "hub" },
      ],
      write_register: [
        { t: "stepper", key: "address", min: 0, max: 65535, step: 1 },
        {
          t: "either",
          key: "value",
          scalar: {
            t: "stepper",
            key: "value",
            min: -32768,
            max: 65535,
            step: 1,
          },
        },
        { t: "slider", key: "slave", min: 1, max: 255, step: 1 },
        { t: "text", key: "hub" },
      ],
      stop: [{ t: "text", key: "hub" }],
    },
  },
  modern_forms: {
    siblings: [
      "set_light_sleep_timer",
      "clear_light_sleep_timer",
      "set_fan_sleep_timer",
      "clear_fan_sleep_timer",
    ],
    services: {
      set_light_sleep_timer: [
        {
          t: "stepper",
          key: "sleep_time",
          min: 1,
          max: 1440,
          step: 1,
          unit: "minutes",
        },
      ],
      clear_light_sleep_timer: [],
      set_fan_sleep_timer: [
        {
          t: "stepper",
          key: "sleep_time",
          min: 1,
          max: 1440,
          step: 1,
          unit: "minutes",
        },
      ],
      clear_fan_sleep_timer: [],
    },
  },
  monoprice: {
    siblings: ["snapshot", "restore"],
    services: { snapshot: [], restore: [] },
  },
  monzo: {
    siblings: ["deposit_into_pot", "withdraw_from_pot"],
    cautions: ["deposit_into_pot", "withdraw_from_pot"],
    services: {
      deposit_into_pot: [
        {
          t: "selector",
          key: "account",
          selector: {
            device: { filter: { integration: "monzo", model: "Account" } },
          },
          valueType: "entity",
        },
        {
          t: "selector",
          key: "pot",
          selector: {
            device: { filter: { integration: "monzo", model: "Pot" } },
          },
          valueType: "entity",
        },
        { t: "stepper", key: "amount", min: 0.01, max: 1000000000, step: 0.01 },
      ],
      withdraw_from_pot: [
        {
          t: "selector",
          key: "account",
          selector: {
            device: { filter: { integration: "monzo", model: "Account" } },
          },
          valueType: "entity",
        },
        {
          t: "selector",
          key: "pot",
          selector: {
            device: { filter: { integration: "monzo", model: "Pot" } },
          },
          valueType: "entity",
        },
        { t: "stepper", key: "amount", min: 0.01, max: 1000000000, step: 0.01 },
      ],
    },
  },
  motion_blinds: {
    siblings: ["set_absolute_position"],
    services: {
      set_absolute_position: [
        {
          t: "slider",
          key: "absolute_position",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
        },
        {
          t: "slider",
          key: "tilt_position",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
        },
        { t: "slider", key: "width", min: 1, max: 100, step: 1, unit: "%" },
      ],
    },
  },
  motioneye: {
    siblings: ["set_text_overlay", "action", "snapshot"],
    services: {
      set_text_overlay: [
        {
          t: "tiles",
          key: "left_text",
          options: [
            { value: "disabled" },
            { value: "camera-name" },
            { value: "timestamp" },
            { value: "custom-text" },
          ],
        },
        { t: "text", key: "custom_left_text", multiline: true },
        {
          t: "tiles",
          key: "right_text",
          options: [
            { value: "disabled" },
            { value: "camera-name" },
            { value: "timestamp" },
            { value: "custom-text" },
          ],
        },
        { t: "text", key: "custom_right_text", multiline: true },
      ],
      action: [
        {
          t: "tiles",
          key: "action",
          options: [
            { value: "snapshot" },
            { value: "record_start" },
            { value: "record_stop" },
            { value: "lock" },
            { value: "unlock" },
            { value: "light_on" },
            { value: "light_off" },
            { value: "alarm_on" },
            { value: "alarm_off" },
            { value: "up" },
            { value: "right" },
            { value: "down" },
            { value: "left" },
            { value: "zoom_in" },
            { value: "zoom_out" },
            { value: "preset1" },
            { value: "preset2" },
            { value: "preset3" },
            { value: "preset4" },
            { value: "preset5" },
            { value: "preset6" },
            { value: "preset7" },
            { value: "preset8" },
            { value: "preset9" },
          ],
        },
      ],
      snapshot: [],
    },
  },
  mqtt: {
    siblings: ["publish", "dump", "reload"],
    services: {
      publish: [
        { t: "text", key: "topic" },
        { t: "text", key: "payload", multiline: true },
        { t: "toggle", key: "evaluate_payload" },
        {
          t: "tiles",
          key: "qos",
          options: [{ value: "0" }, { value: "1" }, { value: "2" }],
        },
        { t: "toggle", key: "retain" },
        { t: "duration", key: "message_expiry_interval" },
      ],
      dump: [
        { t: "text", key: "topic" },
        {
          t: "slider",
          key: "duration",
          min: 1,
          max: 300,
          step: 1,
          unit: "seconds",
        },
      ],
      reload: [],
    },
  },
  music_assistant: {
    siblings: [
      "play_media",
      "play_announcement",
      "transfer_queue",
      "get_queue",
      "search",
      "get_library",
    ],
    gates: { play_announcement: 1048576, play_media: 512, get_queue: 512 },
    services: {
      play_media: [
        { t: "textOrObject", key: "media_id" },
        {
          t: "tiles",
          key: "media_type",
          options: [
            { value: "artist", label: "Artist" },
            { value: "album", label: "Album" },
            { value: "audiobook", label: "Audiobook" },
            { value: "folder", label: "Folder" },
            { value: "playlist", label: "Playlist" },
            { value: "podcast", label: "Podcast" },
            { value: "track", label: "Track" },
            { value: "radio", label: "Radio" },
          ],
        },
        { t: "text", key: "artist" },
        { t: "text", key: "album" },
        {
          t: "tiles",
          key: "enqueue",
          options: [
            { value: "play", label: "Play" },
            { value: "replace", label: "Play now and clear queue" },
            { value: "next", label: "Play next" },
            { value: "replace_next", label: "Play next and clear queue" },
            { value: "add", label: "Add to queue" },
          ],
        },
        { t: "toggle", key: "radio_mode" },
        { t: "text", key: "start_item" },
        { t: "text", key: "username" },
      ],
      play_announcement: [
        { t: "text", key: "message", multiline: true },
        {
          t: "selector",
          key: "tts_entity_id",
          selector: { entity: { domain: "tts" } },
          valueType: "entity",
        },
        { t: "text", key: "url" },
        { t: "toggle", key: "use_pre_announce" },
        { t: "text", key: "pre_announce_url" },
        { t: "slider", key: "announce_volume", min: 1, max: 100, step: 1 },
      ],
      transfer_queue: [
        {
          t: "selector",
          key: "source_player",
          selector: {
            entity: {
              domain: "media_player",
              integration: "music_assistant",
              device_class: "speaker",
            },
          },
          valueType: "entity",
        },
        { t: "toggle", key: "auto_play" },
      ],
      get_queue: [],
      search: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "music_assistant" } },
          valueType: "entity",
        },
        { t: "text", key: "name" },
        {
          t: "multi",
          key: "media_type",
          options: [
            { value: "artist", label: "Artist" },
            { value: "album", label: "Album" },
            { value: "audiobook", label: "Audiobook" },
            { value: "playlist", label: "Playlist" },
            { value: "podcast", label: "Podcast" },
            { value: "track", label: "Track" },
            { value: "radio", label: "Radio" },
          ],
        },
        { t: "text", key: "artist" },
        { t: "text", key: "album" },
        { t: "slider", key: "limit", min: 1, max: 100, step: 1 },
        { t: "toggle", key: "library_only" },
        { t: "text", key: "username" },
      ],
      get_library: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "music_assistant" } },
          valueType: "entity",
        },
        {
          t: "tiles",
          key: "media_type",
          options: [
            { value: "artist", label: "Artist" },
            { value: "album", label: "Album" },
            { value: "audiobook", label: "Audiobook" },
            { value: "playlist", label: "Playlist" },
            { value: "podcast", label: "Podcast" },
            { value: "track", label: "Track" },
            { value: "radio", label: "Radio" },
          ],
        },
        { t: "toggle", key: "favorite" },
        { t: "text", key: "search" },
        { t: "slider", key: "limit", min: 1, max: 500, step: 1 },
        { t: "stepper", key: "offset", min: 0, max: 1000000, step: 1 },
        {
          t: "tiles",
          key: "order_by",
          options: [
            { value: "name", label: "Name" },
            { value: "name_desc", label: "Name (desc)" },
            { value: "sort_name", label: "Sort name" },
            { value: "sort_name_desc", label: "Sort name (desc)" },
            { value: "timestamp_added", label: "Added" },
            { value: "timestamp_added_desc", label: "Added (desc)" },
            { value: "last_played", label: "Last played" },
            { value: "last_played_desc", label: "Last played (desc)" },
            { value: "play_count", label: "Play count" },
            { value: "play_count_desc", label: "Play count (desc)" },
            { value: "year", label: "Year" },
            { value: "year_desc", label: "Year (desc)" },
            { value: "position", label: "Position" },
            { value: "position_desc", label: "Position (desc)" },
            { value: "artist_name", label: "Artist name" },
            { value: "artist_name_desc", label: "Artist name (desc)" },
            { value: "random", label: "Random" },
            { value: "random_play_count", label: "Random + least played" },
          ],
        },
        {
          t: "multi",
          key: "album_type",
          options: [
            { value: "album", label: "Album" },
            { value: "single", label: "Single" },
            { value: "compilation", label: "Compilation" },
            { value: "ep", label: "EP" },
            { value: "unknown", label: "Unknown" },
          ],
        },
        { t: "toggle", key: "album_artists_only" },
        { t: "text", key: "username" },
      ],
    },
  },
  neato: {
    siblings: ["custom_cleaning"],
    services: {
      custom_cleaning: [
        { t: "stepper", key: "mode", min: 1, max: 2, step: 1 },
        { t: "stepper", key: "navigation", min: 1, max: 3, step: 1 },
        { t: "stepper", key: "category", min: 2, max: 4, step: 2 },
        { t: "text", key: "zone" },
      ],
    },
  },
  neopool: {
    siblings: ["get_device_time", "set_device_time"],
    services: {
      get_device_time: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "neopool" } },
          valueType: "entity",
        },
      ],
      set_device_time: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "neopool" } },
          valueType: "entity",
        },
      ],
    },
  },
  ness_alarm: {
    siblings: ["aux", "panic"],
    cautions: ["panic"],
    services: {
      aux: [
        { t: "slider", key: "output_id", min: 1, max: 8, step: 1 },
        { t: "toggle", key: "state" },
      ],
      panic: [{ t: "text", key: "code", inputType: "password" }],
    },
  },
  nest: {
    siblings: ["set_fan_timer"],
    gates: { set_fan_timer: 8 },
    services: { set_fan_timer: [{ t: "duration", key: "duration" }] },
  },
  netatmo: {
    siblings: [
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
    services: {
      set_camera_light: [
        {
          t: "tiles",
          key: "camera_light_mode",
          options: [{ value: "on" }, { value: "off" }, { value: "auto" }],
        },
      ],
      set_schedule: [{ t: "text", key: "schedule_name" }],
      set_preset_mode_with_end_datetime: [
        {
          t: "tiles",
          key: "preset_mode",
          options: [{ value: "away" }, { value: "frost_guard" }],
        },
        { t: "datetime", key: "end_datetime" },
      ],
      set_temperature_with_end_datetime: [
        { t: "slider", key: "target_temperature", min: 7, max: 30, step: 0.5 },
        { t: "datetime", key: "end_datetime" },
      ],
      set_temperature_with_time_period: [
        { t: "slider", key: "target_temperature", min: 7, max: 30, step: 0.5 },
        { t: "duration", key: "time_period" },
      ],
      clear_temperature_setting: [],
      set_persons_home: [{ t: "list", key: "persons" }],
      set_person_away: [{ t: "text", key: "person" }],
      register_webhook: [],
      unregister_webhook: [],
    },
  },
  netgear_lte: {
    siblings: ["delete_sms", "set_option", "connect_lte", "disconnect_lte"],
    cautions: ["delete_sms"],
    services: {
      delete_sms: [
        {
          t: "either",
          key: "sms_id",
          scalar: {
            t: "stepper",
            key: "sms_id",
            min: 0,
            max: 1000000,
            step: 1,
          },
        },
        { t: "text", key: "host" },
      ],
      set_option: [
        { t: "text", key: "host" },
        {
          t: "tiles",
          key: "failover",
          options: [{ value: "auto" }, { value: "mobile" }, { value: "wire" }],
        },
        {
          t: "tiles",
          key: "autoconnect",
          options: [{ value: "always" }, { value: "home" }, { value: "never" }],
        },
      ],
      connect_lte: [{ t: "text", key: "host" }],
      disconnect_lte: [{ t: "text", key: "host" }],
    },
  },
  nexia: {
    siblings: [
      "set_aircleaner_mode",
      "set_humidify_setpoint",
      "set_dehumidify_setpoint",
      "set_hvac_run_mode",
    ],
    services: {
      set_aircleaner_mode: [
        {
          t: "tiles",
          key: "aircleaner_mode",
          options: [
            { value: "allergy" },
            { value: "auto" },
            { value: "quick" },
          ],
        },
      ],
      set_humidify_setpoint: [
        { t: "slider", key: "humidity", min: 10, max: 45, step: 1, unit: "%" },
      ],
      set_dehumidify_setpoint: [
        { t: "slider", key: "humidity", min: 35, max: 65, step: 1, unit: "%" },
      ],
      set_hvac_run_mode: [
        {
          t: "tiles",
          key: "run_mode",
          options: [{ value: "permanent_hold" }, { value: "run_schedule" }],
        },
        {
          t: "tiles",
          key: "hvac_mode",
          options: [{ value: "auto" }, { value: "cool" }, { value: "heat" }],
        },
      ],
    },
  },
  nfandroidtv: {
    siblings: ["send_message"],
    services: {
      send_message: [
        { t: "text", key: "message", multiline: true },
        { t: "text", key: "title" },
        {
          t: "selector",
          key: "image",
          selector: { media: {} },
          valueType: "media",
        },
        {
          t: "selector",
          key: "icon",
          selector: { media: {} },
          valueType: "media",
        },
        {
          t: "tiles",
          key: "position",
          options: [
            { value: "bottom-right", label: "Bottom right" },
            { value: "bottom-left", label: "Bottom left" },
            { value: "top-right", label: "Top right" },
            { value: "top-left", label: "Top left" },
            { value: "center", label: "Center" },
          ],
        },
        { t: "duration", key: "duration" },
        { t: "toggle", key: "interactive" },
        {
          t: "tiles",
          key: "background_color",
          options: [
            { value: "grey", label: "Grey" },
            { value: "black", label: "Black" },
            { value: "indigo", label: "Indigo" },
            { value: "green", label: "Green" },
            { value: "red", label: "Red" },
            { value: "cyan", label: "Cyan" },
            { value: "teal", label: "Teal" },
            { value: "amber", label: "Amber" },
            { value: "pink", label: "Pink" },
          ],
        },
        {
          t: "tiles",
          key: "fontsize",
          options: [
            { value: "small", label: "Small" },
            { value: "medium" },
            { value: "large", label: "Large" },
            { value: "max", label: "Maximum" },
          ],
        },
        {
          t: "tiles",
          key: "transparency",
          options: [
            { value: "0%" },
            { value: "25%" },
            { value: "50%" },
            { value: "75%" },
            { value: "100%" },
          ],
        },
      ],
    },
  },
  nina: { siblings: ["get_details"], services: { get_details: [] } },
  nintendo_parental_controls: {
    siblings: [
      "add_bonus_time",
      "update_pin_code",
      "player_usage_report",
      "device_usage_report",
      "update_daily_restrictions",
    ],
    cautions: ["update_pin_code"],
    services: {
      add_bonus_time: [
        {
          t: "stepper",
          key: "bonus_time",
          min: -1,
          max: 1440,
          step: 1,
          unit: "minutes",
        },
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "nintendo_parental_controls" } },
          valueType: "entity",
        },
      ],
      update_pin_code: [
        { t: "text", key: "pin", inputType: "password" },
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "nintendo_parental_controls" } },
          valueType: "entity",
        },
      ],
      player_usage_report: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "nintendo_parental_controls" } },
          valueType: "entity",
        },
        {
          t: "selector",
          key: "entity_id",
          selector: {
            entity: {
              integration: "nintendo_parental_controls",
              domain: "sensor",
            },
          },
          valueType: "entity",
        },
      ],
      device_usage_report: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "nintendo_parental_controls" } },
          valueType: "entity",
        },
      ],
      update_daily_restrictions: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "nintendo_parental_controls" } },
          valueType: "entity",
        },
        {
          t: "tiles",
          key: "day_of_week",
          options: [
            { value: "monday" },
            { value: "tuesday" },
            { value: "wednesday" },
            { value: "thursday" },
            { value: "friday" },
            { value: "saturday" },
            { value: "sunday" },
          ],
        },
        { t: "time", key: "bedtime_start" },
        { t: "time", key: "bedtime_end" },
        {
          t: "stepper",
          key: "max_play_time",
          min: 0,
          max: 360,
          step: 1,
          unit: "minutes",
        },
      ],
    },
  },
  nissan_leaf: {
    siblings: ["start_charge", "update"],
    services: {
      start_charge: [{ t: "text", key: "vin" }],
      update: [{ t: "text", key: "vin" }],
    },
  },
  nordpool: {
    siblings: ["get_prices_for_date", "get_price_indices_for_date"],
    services: {
      get_prices_for_date: [
        {
          t: "selector",
          key: "config_entry",
          selector: { config_entry: { integration: "nordpool" } },
          valueType: "entity",
        },
        { t: "date", key: "date" },
        {
          t: "multi",
          key: "areas",
          options: [
            { value: "EE" },
            { value: "LT" },
            { value: "LV" },
            { value: "AT" },
            { value: "BE" },
            { value: "FR" },
            { value: "GER" },
            { value: "NL" },
            { value: "PL" },
            { value: "DK1" },
            { value: "DK2" },
            { value: "FI" },
            { value: "NO1" },
            { value: "NO2" },
            { value: "NO3" },
            { value: "NO4" },
            { value: "NO5" },
            { value: "SE1" },
            { value: "SE2" },
            { value: "SE3" },
            { value: "SE4" },
            { value: "BG" },
            { value: "TEL" },
            { value: "SYS" },
          ],
        },
        {
          t: "tiles",
          key: "currency",
          options: [
            { value: "DKK" },
            { value: "EUR" },
            { value: "NOK" },
            { value: "PLN" },
            { value: "SEK" },
          ],
        },
      ],
      get_price_indices_for_date: [
        {
          t: "selector",
          key: "config_entry",
          selector: { config_entry: { integration: "nordpool" } },
          valueType: "entity",
        },
        { t: "date", key: "date" },
        {
          t: "multi",
          key: "areas",
          options: [
            { value: "EE" },
            { value: "LT" },
            { value: "LV" },
            { value: "AT" },
            { value: "BE" },
            { value: "FR" },
            { value: "GER" },
            { value: "NL" },
            { value: "PL" },
            { value: "DK1" },
            { value: "DK2" },
            { value: "FI" },
            { value: "NO1" },
            { value: "NO2" },
            { value: "NO3" },
            { value: "NO4" },
            { value: "NO5" },
            { value: "SE1" },
            { value: "SE2" },
            { value: "SE3" },
            { value: "SE4" },
            { value: "BG" },
            { value: "TEL" },
            { value: "SYS" },
          ],
        },
        {
          t: "tiles",
          key: "currency",
          options: [
            { value: "DKK" },
            { value: "EUR" },
            { value: "NOK" },
            { value: "PLN" },
            { value: "SEK" },
          ],
        },
        {
          t: "tiles",
          key: "resolution",
          options: [{ value: "15" }, { value: "30" }, { value: "60" }],
        },
      ],
    },
  },
  ntfy: {
    siblings: ["publish", "clear", "delete"],
    cautions: ["delete"],
    services: {
      publish: [
        { t: "text", key: "title" },
        { t: "text", key: "message", multiline: true },
        { t: "toggle", key: "markdown" },
        { t: "list", key: "tags" },
        {
          t: "tiles",
          key: "priority",
          options: [
            { value: "5", label: "max" },
            { value: "4", label: "high" },
            { value: "3", label: "default" },
            { value: "2", label: "low" },
            { value: "1", label: "min" },
          ],
        },
        { t: "text", key: "click", inputType: "url" },
        { t: "duration", key: "delay" },
        { t: "text", key: "attach", inputType: "url" },
        {
          t: "selector",
          key: "attach_file",
          selector: { media: {} },
          valueType: "media",
        },
        { t: "text", key: "filename" },
        { t: "text", key: "email", inputType: "email" },
        { t: "text", key: "call", inputType: "tel" },
        { t: "text", key: "icon", inputType: "url" },
        {
          t: "selector",
          key: "actions",
          selector: {
            object: {
              label_field: "label",
              description_field: "url",
              multiple: true,
              translation_key: "actions",
              fields: {
                action: {
                  required: true,
                  selector: {
                    select: {
                      options: [
                        { value: "view", label: "Open website/app" },
                        { value: "http", label: "Send HTTP request" },
                        { value: "broadcast", label: "Send Android broadcast" },
                        { value: "copy", label: "Copy to clipboard" },
                      ],
                      translation_key: "action_type",
                      mode: "dropdown",
                    },
                  },
                },
                label: { selector: { text: null }, required: true },
                clear: { selector: { boolean: null } },
                url: { selector: { text: { type: "url" } } },
                method: {
                  selector: {
                    select: {
                      options: ["GET", "POST", "PUT", "DELETE"],
                      custom_value: true,
                    },
                  },
                },
                headers: { selector: { object: null } },
                body: { selector: { text: { multiline: true } } },
                intent: { selector: { text: null } },
                extras: { selector: { object: null } },
                value: { selector: { text: null } },
              },
            },
          },
          valueType: "object",
        },
        { t: "text", key: "sequence_id" },
      ],
      clear: [{ t: "text", key: "sequence_id" }],
      delete: [{ t: "text", key: "sequence_id" }],
    },
  },
  nuki: {
    siblings: ["lock_n_go", "set_continuous_mode"],
    services: {
      lock_n_go: [{ t: "toggle", key: "unlatch" }],
      set_continuous_mode: [{ t: "toggle", key: "enable" }],
    },
  },
  nws: {
    siblings: ["get_forecasts_extra"],
    services: {
      get_forecasts_extra: [
        {
          t: "tiles",
          key: "type",
          options: [
            { value: "hourly", label: "Hourly" },
            { value: "twice_daily", label: "Twice daily" },
          ],
        },
      ],
    },
  },
  nx584: {
    siblings: ["bypass_zone", "unbypass_zone"],
    services: {
      bypass_zone: [{ t: "slider", key: "zone", min: 1, max: 255, step: 1 }],
      unbypass_zone: [{ t: "slider", key: "zone", min: 1, max: 255, step: 1 }],
    },
  },
  nzbget: {
    siblings: ["pause", "resume", "set_speed"],
    services: {
      pause: [],
      resume: [],
      set_speed: [
        {
          t: "stepper",
          key: "speed",
          min: 0,
          max: 1000000,
          step: 100,
          unit: "kB/s",
        },
      ],
    },
  },
  octoprint: {
    siblings: ["printer_connect"],
    services: {
      printer_connect: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "octoprint" } },
          valueType: "entity",
        },
        { t: "text", key: "profile_name" },
        { t: "text", key: "port" },
        {
          t: "tiles",
          key: "baudrate",
          options: [
            { value: "9600" },
            { value: "19200" },
            { value: "38400" },
            { value: "57600" },
            { value: "115200" },
            { value: "230400" },
            { value: "250000" },
          ],
        },
      ],
    },
  },
  ohme: {
    siblings: ["list_charge_slots", "set_price_cap"],
    services: {
      list_charge_slots: [
        {
          t: "selector",
          key: "config_entry",
          selector: { config_entry: { integration: "ohme" } },
          valueType: "entity",
        },
      ],
      set_price_cap: [
        {
          t: "selector",
          key: "config_entry",
          selector: { config_entry: { integration: "ohme" } },
          valueType: "entity",
        },
        { t: "stepper", key: "price_cap", min: 0, max: 1000000, step: 0.01 },
      ],
    },
  },
  ombi: {
    siblings: [
      "submit_movie_request",
      "submit_tv_request",
      "submit_music_request",
    ],
    cautions: [
      "submit_movie_request",
      "submit_tv_request",
      "submit_music_request",
    ],
    services: {
      submit_movie_request: [{ t: "text", key: "name" }],
      submit_tv_request: [
        { t: "text", key: "name" },
        {
          t: "tiles",
          key: "season",
          options: [{ value: "all" }, { value: "first" }, { value: "latest" }],
        },
      ],
      submit_music_request: [{ t: "text", key: "name" }],
    },
  },
  omie: {
    siblings: ["get_prices_for_date"],
    services: {
      get_prices_for_date: [
        { t: "date", key: "date" },
        {
          t: "multi",
          key: "countries",
          options: [
            { value: "es", label: "Spain" },
            { value: "pt", label: "Portugal" },
          ],
        },
      ],
    },
  },
  omnilogic: {
    siblings: ["set_pump_speed"],
    services: {
      set_pump_speed: [
        { t: "stepper", key: "speed", min: 0, max: 100000, step: 1 },
      ],
    },
  },
  onedrive: {
    siblings: ["upload", "delete"],
    cautions: ["delete"],
    services: {
      upload: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "onedrive" } },
          valueType: "entity",
        },
        { t: "list", key: "filename" },
        { t: "text", key: "destination_folder" },
      ],
      delete: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "onedrive" } },
          valueType: "entity",
        },
        { t: "list", key: "destination_path" },
      ],
    },
  },
  onvif: {
    siblings: ["ptz"],
    services: {
      ptz: [
        {
          t: "tiles",
          key: "tilt",
          options: [{ value: "DOWN" }, { value: "UP" }],
        },
        {
          t: "tiles",
          key: "pan",
          options: [{ value: "LEFT" }, { value: "RIGHT" }],
        },
        {
          t: "tiles",
          key: "zoom",
          options: [{ value: "ZOOM_IN" }, { value: "ZOOM_OUT" }],
        },
        { t: "slider", key: "distance", min: 0, max: 1, step: 0.01 },
        { t: "slider", key: "speed", min: 0, max: 1, step: 0.01 },
        { t: "slider", key: "continuous_duration", min: 0, max: 1, step: 0.01 },
        { t: "attr", key: "preset", attr: "preset_list" },
        {
          t: "tiles",
          key: "move_mode",
          options: [
            { value: "AbsoluteMove" },
            { value: "ContinuousMove" },
            { value: "GotoPreset" },
            { value: "RelativeMove" },
            { value: "Stop" },
          ],
        },
      ],
    },
  },
  opendisplay: {
    siblings: ["upload_image"],
    services: {
      upload_image: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "opendisplay" } },
          valueType: "entity",
        },
        {
          t: "selector",
          key: "image",
          selector: { media: {} },
          valueType: "media",
        },
        { t: "slider", key: "rotation", min: 0, max: 270, step: 90 },
        {
          t: "tiles",
          key: "dither_mode",
          options: [
            { value: "none", label: "None" },
            { value: "burkes", label: "Burkes" },
            { value: "ordered", label: "Ordered" },
            { value: "floyd_steinberg", label: "Floyd-Steinberg" },
            { value: "atkinson", label: "Atkinson" },
            { value: "stucki", label: "Stucki" },
            { value: "sierra", label: "Sierra" },
            { value: "sierra_lite", label: "Sierra Lite" },
            { value: "jarvis_judice_ninke", label: "Jarvis, Judice & Ninke" },
          ],
        },
        {
          t: "tiles",
          key: "refresh_mode",
          options: [
            { value: "full", label: "Full" },
            { value: "fast", label: "Fast" },
          ],
        },
        {
          t: "tiles",
          key: "fit_mode",
          options: [
            { value: "stretch", label: "Stretch" },
            { value: "contain", label: "Contain" },
            { value: "cover", label: "Cover" },
            { value: "crop", label: "Crop" },
          ],
        },
        {
          t: "slider",
          key: "tone_compression",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
        },
      ],
    },
  },
  openevse: {
    siblings: ["set_override"],
    services: {
      set_override: [
        {
          t: "tiles",
          key: "state",
          options: [
            { value: "active", label: "Active" },
            { value: "disabled", label: "Disabled" },
          ],
        },
        {
          t: "stepper",
          key: "charge_current",
          min: 6,
          max: 80,
          step: 1,
          unit: "A",
        },
        {
          t: "stepper",
          key: "max_current",
          min: 6,
          max: 80,
          step: 1,
          unit: "A",
        },
        {
          t: "stepper",
          key: "energy_limit",
          min: 1,
          max: 1000000000,
          step: 1,
          unit: "Wh",
        },
        { t: "duration", key: "time_limit" },
        { t: "toggle", key: "auto_release" },
      ],
    },
  },
  openhome: {
    siblings: ["invoke_pin"],
    services: {
      invoke_pin: [{ t: "slider", key: "pin", min: 0, max: 1000, step: 1 }],
    },
  },
  opentherm_gw: {
    siblings: [
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
    cautions: ["reset_gateway", "send_transparent_command"],
    services: {
      reset_gateway: [{ t: "text", key: "gateway_id" }],
      set_central_heating_ovrd: [
        { t: "text", key: "gateway_id" },
        { t: "toggle", key: "ch_override" },
      ],
      set_clock: [
        { t: "text", key: "gateway_id" },
        { t: "date", key: "date" },
        { t: "time", key: "time" },
      ],
      set_control_setpoint: [
        { t: "text", key: "gateway_id" },
        {
          t: "slider",
          key: "temperature",
          min: 0,
          max: 90,
          step: 0.1,
          unit: "°",
        },
      ],
      set_hot_water_ovrd: [
        { t: "text", key: "gateway_id" },
        {
          t: "tiles",
          key: "dhw_override",
          options: [
            { value: "A", label: "Automatic" },
            { value: "1", label: "On" },
            { value: "0", label: "Off" },
          ],
        },
      ],
      set_hot_water_setpoint: [
        { t: "text", key: "gateway_id" },
        {
          t: "slider",
          key: "temperature",
          min: 0,
          max: 90,
          step: 0.1,
          unit: "°",
        },
      ],
      set_gpio_mode: [
        { t: "text", key: "gateway_id" },
        { t: "tiles", key: "id", options: [{ value: "A" }, { value: "B" }] },
        { t: "slider", key: "mode", min: 0, max: 7, step: 1 },
      ],
      set_led_mode: [
        { t: "text", key: "gateway_id" },
        {
          t: "tiles",
          key: "id",
          options: [
            { value: "A" },
            { value: "B" },
            { value: "C" },
            { value: "D" },
            { value: "E" },
            { value: "F" },
          ],
        },
        {
          t: "tiles",
          key: "mode",
          options: [
            { value: "B" },
            { value: "C" },
            { value: "E" },
            { value: "F" },
            { value: "H" },
            { value: "M" },
            { value: "O" },
            { value: "P" },
            { value: "R" },
            { value: "T" },
            { value: "W" },
            { value: "X" },
          ],
        },
      ],
      set_max_modulation: [
        { t: "text", key: "gateway_id" },
        { t: "slider", key: "level", min: -1, max: 100, step: 1 },
      ],
      set_outside_temperature: [
        { t: "text", key: "gateway_id" },
        {
          t: "slider",
          key: "temperature",
          min: -40,
          max: 99,
          step: 1,
          unit: "°",
        },
      ],
      set_setback_temperature: [
        { t: "text", key: "gateway_id" },
        {
          t: "slider",
          key: "temperature",
          min: 0,
          max: 30,
          step: 0.1,
          unit: "°",
        },
      ],
      send_transparent_command: [
        { t: "text", key: "gateway_id" },
        { t: "text", key: "transp_cmd" },
        { t: "text", key: "transp_arg" },
      ],
    },
  },
  openweathermap: {
    siblings: ["get_minute_forecast"],
    services: { get_minute_forecast: [] },
  },
  osoenergy: {
    siblings: [
      "get_profile",
      "set_profile",
      "set_v40_min",
      "turn_away_mode_on",
      "turn_off",
      "turn_on",
    ],
    services: {
      get_profile: [],
      set_profile: [
        { t: "slider", key: "hour_00", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_01", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_02", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_03", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_04", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_05", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_06", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_07", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_08", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_09", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_10", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_11", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_12", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_13", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_14", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_15", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_16", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_17", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_18", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_19", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_20", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_21", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_22", min: 10, max: 75, step: 1, unit: "°C" },
        { t: "slider", key: "hour_23", min: 10, max: 75, step: 1, unit: "°C" },
      ],
      set_v40_min: [
        { t: "slider", key: "v40_min", min: 200, max: 550, step: 1, unit: "L" },
      ],
      turn_away_mode_on: [
        {
          t: "slider",
          key: "duration_days",
          min: 1,
          max: 365,
          step: 1,
          unit: "days",
        },
      ],
      turn_off: [{ t: "toggle", key: "until_temp_limit" }],
      turn_on: [{ t: "toggle", key: "until_temp_limit" }],
    },
  },
  overkiz: {
    siblings: ["set_cover_position_and_tilt"],
    services: {
      set_cover_position_and_tilt: [
        { t: "slider", key: "position", min: 0, max: 100, step: 1, unit: "%" },
        {
          t: "slider",
          key: "tilt_position",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
        },
      ],
    },
  },
  overseerr: {
    siblings: ["get_requests", "search_media", "request_media"],
    cautions: ["request_media"],
    services: {
      get_requests: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "overseerr" } },
          valueType: "entity",
        },
        {
          t: "tiles",
          key: "status",
          options: [
            { value: "approved", label: "Approved" },
            { value: "pending", label: "Pending" },
            { value: "available", label: "Available" },
            { value: "processing", label: "Processing" },
            { value: "unavailable", label: "Unavailable" },
            { value: "failed", label: "Failed" },
          ],
        },
        {
          t: "tiles",
          key: "sort_order",
          options: [
            { value: "added", label: "Added" },
            { value: "modified", label: "Modified" },
          ],
        },
        { t: "stepper", key: "requested_by", min: 0, max: 1000000000, step: 1 },
      ],
      search_media: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "overseerr" } },
          valueType: "entity",
        },
        { t: "text", key: "query" },
      ],
      request_media: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "overseerr" } },
          valueType: "entity",
        },
        {
          t: "tiles",
          key: "media_type",
          options: [
            { value: "movie", label: "Movie" },
            { value: "tv", label: "TV" },
          ],
        },
        { t: "stepper", key: "media_id", min: 1, max: 1000000000, step: 1 },
        { t: "text", key: "seasons" },
      ],
    },
  },
  peblar: {
    siblings: [
      "list_rfid_tokens",
      "add_rfid_token",
      "delete_rfid_token",
      "list_vehicle_tokens",
      "add_vehicle_token",
      "delete_vehicle_token",
      "authorize_charge_session",
    ],
    cautions: [
      "delete_rfid_token",
      "delete_vehicle_token",
      "authorize_charge_session",
    ],
    services: {
      list_rfid_tokens: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
      ],
      add_rfid_token: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
        { t: "text", key: "uid" },
        { t: "text", key: "description" },
      ],
      delete_rfid_token: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
        { t: "text", key: "uid" },
      ],
      list_vehicle_tokens: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
      ],
      add_vehicle_token: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
        { t: "text", key: "evcc_id" },
        { t: "text", key: "alias" },
      ],
      delete_vehicle_token: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
        { t: "text", key: "evcc_id" },
      ],
      authorize_charge_session: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "peblar" } },
          valueType: "entity",
        },
        { t: "text", key: "uid" },
        { t: "text", key: "description" },
      ],
    },
  },
  pi_hole: {
    siblings: ["disable"],
    cautions: ["disable"],
    services: { disable: [{ t: "duration", key: "duration", format: "hms" }] },
  },
  picnic: {
    siblings: ["add_product"],
    cautions: ["add_product"],
    services: {
      add_product: [
        {
          t: "selector",
          key: "config_entry_id",
          selector: { config_entry: { integration: "picnic" } },
          valueType: "entity",
        },
        { t: "text", key: "product_id" },
        { t: "text", key: "gtin" },
        { t: "text", key: "product_name" },
        { t: "slider", key: "amount", min: 1, max: 50, step: 1 },
      ],
    },
  },
  pilight: {
    siblings: ["send"],
    services: {
      send: [
        {
          t: "selector",
          key: "protocol",
          selector: { object: {} },
          valueType: "object",
        },
      ],
    },
  },
  plex: {
    siblings: ["refresh_library"],
    services: {
      refresh_library: [
        { t: "text", key: "library_name" },
        { t: "text", key: "server_name" },
      ],
    },
  },
  portainer: {
    siblings: ["prune_images", "prune_build_cache", "recreate_container"],
    cautions: ["prune_images", "prune_build_cache", "recreate_container"],
    services: {
      prune_images: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "portainer", model: "Endpoint" } },
          valueType: "entity",
        },
        { t: "duration", key: "until" },
        { t: "toggle", key: "dangling" },
      ],
      prune_build_cache: [
        {
          t: "selector",
          key: "device_id",
          selector: { device: { integration: "portainer", model: "Endpoint" } },
          valueType: "entity",
        },
        { t: "toggle", key: "all" },
        { t: "duration", key: "until" },
      ],
      recreate_container: [
        {
          t: "selector",
          key: "container_device_id",
          selector: {
            device: { integration: "portainer", model: "Container" },
          },
          valueType: "entity",
        },
        { t: "duration", key: "timeout" },
        { t: "toggle", key: "pull_image" },
      ],
    },
  },
  profiler: {
    siblings: [
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
    services: {
      start: [
        {
          t: "stepper",
          key: "seconds",
          min: 1,
          max: 3600,
          step: 1,
          unit: "seconds",
        },
      ],
      memory: [
        {
          t: "stepper",
          key: "seconds",
          min: 1,
          max: 3600,
          step: 1,
          unit: "seconds",
        },
      ],
      start_log_objects: [
        {
          t: "stepper",
          key: "scan_interval",
          min: 1,
          max: 3600,
          step: 1,
          unit: "seconds",
        },
      ],
      stop_log_objects: [],
      dump_log_objects: [{ t: "text", key: "type" }],
      start_log_object_sources: [
        {
          t: "stepper",
          key: "scan_interval",
          min: 1,
          max: 3600,
          step: 1,
          unit: "seconds",
        },
        {
          t: "slider",
          key: "max_objects",
          min: 1,
          max: 30,
          step: 1,
          unit: "objects",
        },
      ],
      stop_log_object_sources: [],
      lru_stats: [],
      dump_sockets: [],
      log_thread_frames: [],
      log_event_loop_scheduled: [],
      set_asyncio_debug: [{ t: "toggle", key: "enabled" }],
      log_current_tasks: [],
    },
  },
};

/**
 * Onkyo registers `media_player.onkyo_select_hdmi_output` in Python, with an
 * empty services.yaml. It belongs to the media_player domain, whose editor is
 * not in this file, so the builder is exported for the integrator to add to
 * `MEDIA_EDITORS.media_player.controls`.
 */
export const ONKYO_MEDIA_PLAYER_CONTROLS: Record<
  string,
  (ctx: QuickContext) => QuickControl[]
> = {
  onkyo_select_hdmi_output: (ctx) =>
    compact([
      pick(ctx, "onkyo", {
        t: "tiles",
        key: "hdmi_output",
        options: [
          "analog",
          "no",
          "yes",
          "out",
          "out-sub",
          "sub",
          "hdbaset",
          "both",
        ].map((value) => ({ value })),
      }),
    ]),
};

export const INTEGRATION_EDITORS_D: Record<string, DomainEditor> =
  Object.fromEntries(
    Object.entries(INTEGRATION_SERVICE_SPECS_D).map(([domain, spec]) => [
      domain,
      integration(domain, spec),
    ])
  );
