import { hasTemplate } from "../../common/string/has-template";

/**
 * Pure description of the rich controls shown for one action. Nothing here
 * touches the DOM: the element renders the list, and tests exercise it with
 * fake state objects.
 */

export interface QuickEntity {
  entity_id: string;
  state?: string;
  attributes: Record<string, any>;
}

export interface QuickFieldInfo {
  selector?: Record<string, any> | null;
  default?: unknown;
  required?: boolean;
}

export interface QuickOption {
  value: string;
  labelKey?: string;
  label?: string;
}

export interface QuickColor {
  id: string;
  rgb: [number, number, number];
}

interface ControlBase {
  key: string;
  /** Translation key of the label, used when the service has no field name. */
  labelKey: string;
}

export type QuickControl =
  | (ControlBase & {
      kind: "slider";
      min: number;
      max: number;
      step: number;
      /** Multiplier for the displayed numeral (0.01 steps shown as percent). */
      scale?: number;
      unit?: string;
      value?: number;
    })
  | (ControlBase & {
      kind: "stepper";
      min: number;
      max: number;
      step: number;
      unit?: string;
      value?: number;
    })
  | (ControlBase & {
      kind: "tiles";
      options: QuickOption[];
      value?: string;
    })
  | (ControlBase & {
      kind: "swatches";
      colors: QuickColor[];
      value?: number[];
    })
  | (ControlBase & { kind: "switch"; value?: boolean })
  | (ControlBase & {
      kind: "text";
      multiline?: boolean;
      inputType?: string;
      value?: string | number | boolean;
      chips?: { id: string; text: string }[];
    })
  | (ControlBase & {
      kind: "time" | "date" | "datetime";
      value?: string;
    })
  | {
      kind: "services";
      key: "$action";
      labelKey: string;
      options: { value: string }[];
      value: string;
    }
  | { kind: "notice"; key: string; labelKey: string; tone: "caution" };

export interface QuickContext {
  /** Full action name, such as `light.turn_on`. */
  action: string;
  data: Record<string, unknown>;
  /** Fields the service declares, by key (top level only). */
  fields: Record<string, QuickFieldInfo>;
  /** Services that exist in the action's domain. */
  domainServices: string[];
  /** Targeted entities. Empty when unknown (areas not expanded, templates). */
  entities: QuickEntity[];
}

const IGNORED_KEYS = new Set([
  "entity_id",
  "device_id",
  "area_id",
  "floor_id",
  "label_id",
]);

export const splitAction = (action: string): [string, string] => {
  const index = action.indexOf(".");
  return index === -1
    ? [action, ""]
    : [action.slice(0, index), action.slice(index + 1)];
};

const hasFeature = (attributes: Record<string, any>, bit: number) =>
  Math.floor(Number(attributes.supported_features ?? 0) / bit) % 2 === 1;

/** Gate on the targeted entities. Unknown targets allow every declared control. */
const anyEntity = (ctx: QuickContext, test: (entity: QuickEntity) => boolean) =>
  ctx.entities.length === 0 || ctx.entities.some(test);

const attrList = (ctx: QuickContext, attribute: string): string[] => {
  const seen = new Set<string>();
  ctx.entities.forEach((entity) => {
    const list = entity.attributes[attribute];
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (typeof item === "string") seen.add(item);
      });
    }
  });
  return [...seen];
};

const attrNumber = (
  ctx: QuickContext,
  attribute: string,
  fallback: number,
  pick: "min" | "max"
): number => {
  const values = ctx.entities
    .map((entity) => Number(entity.attributes[attribute]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return fallback;
  return pick === "min" ? Math.min(...values) : Math.max(...values);
};

/** The stored value when it can be edited visually; `null` when it cannot. */
const scalar = <T extends string | number | boolean>(
  ctx: QuickContext,
  key: string,
  type: "number" | "string" | "boolean"
): T | undefined | null => {
  const value = ctx.data[key];
  if (value === undefined) return undefined;
  return typeof value === type && !hasTemplate(value) ? (value as T) : null;
};

const claim = (ctx: QuickContext, key: string) => key in ctx.fields;

const slider = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  min: number,
  max: number,
  step: number,
  extra: { scale?: number; unit?: string } = {}
): QuickControl | undefined => {
  const value = scalar<number>(ctx, key, "number");
  if (!claim(ctx, key) || value === null || min >= max) return undefined;
  return { kind: "slider", key, labelKey, min, max, step, value, ...extra };
};

const stepper = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  min: number,
  max: number,
  step: number,
  unit?: string
): QuickControl | undefined => {
  const value = scalar<number>(ctx, key, "number");
  if (!claim(ctx, key) || value === null || min >= max) return undefined;
  return { kind: "stepper", key, labelKey, min, max, step, unit, value };
};

const tiles = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  values: string[],
  optionLabelPrefix?: string
): QuickControl | undefined => {
  const value = scalar<string>(ctx, key, "string");
  if (!claim(ctx, key) || value === null || !values.length) return undefined;
  const options = values.map((item) => ({
    value: item,
    labelKey: optionLabelPrefix ? `${optionLabelPrefix}${item}` : undefined,
  }));
  // A stored value outside the known list stays visible and selected.
  if (value !== undefined && !values.includes(value)) {
    options.push({ value, labelKey: undefined });
  }
  return { kind: "tiles", key, labelKey, options, value };
};

const toggle = (
  ctx: QuickContext,
  key: string,
  labelKey: string
): QuickControl | undefined => {
  const value = scalar<boolean>(ctx, key, "boolean");
  if (!claim(ctx, key) || value === null) return undefined;
  return { kind: "switch", key, labelKey, value };
};

const textBox = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  extra: Partial<Extract<QuickControl, { kind: "text" }>> = {}
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (
    !claim(ctx, key) ||
    (value !== undefined &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean")
  ) {
    return undefined;
  }
  return { kind: "text", key, labelKey, value, ...extra };
};

const compact = (list: (QuickControl | undefined)[]): QuickControl[] =>
  list.filter((item): item is QuickControl => item !== undefined);

const L = (name: string) => `ui.components.action-editors.fields.${name}`;

export const LIGHT_COLORS: QuickColor[] = [
  { id: "red", rgb: [255, 0, 0] },
  { id: "orange", rgb: [255, 140, 0] },
  { id: "yellow", rgb: [255, 220, 0] },
  { id: "green", rgb: [0, 200, 80] },
  { id: "cyan", rgb: [0, 200, 220] },
  { id: "blue", rgb: [30, 90, 255] },
  { id: "purple", rgb: [140, 60, 220] },
  { id: "pink", rgb: [255, 80, 160] },
  { id: "white", rgb: [255, 255, 255] },
];

const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

const lightModes = (entity: QuickEntity): string[] =>
  Array.isArray(entity.attributes.supported_color_modes)
    ? entity.attributes.supported_color_modes
    : [];

const lightControls = (ctx: QuickContext): QuickControl[] => {
  const brightness = anyEntity(ctx, (e) =>
    lightModes(e).some((mode) => mode !== "onoff")
  );
  const colorTemp = anyEntity(ctx, (e) => lightModes(e).includes("color_temp"));
  const color = anyEntity(ctx, (e) =>
    lightModes(e).some((mode) => COLOR_MODES.includes(mode))
  );
  const transition = anyEntity(ctx, (e) => hasFeature(e.attributes, 32));
  const [, service] = splitAction(ctx.action);
  if (service === "turn_off") {
    return compact([
      transition
        ? slider(ctx, "transition", L("transition"), 0, 300, 1, {
            unit: "s",
          })
        : undefined,
    ]);
  }
  const swatches: QuickControl | undefined =
    color && claim(ctx, "rgb_color") && !hasTemplate(ctx.data.rgb_color)
      ? {
          kind: "swatches",
          key: "rgb_color",
          labelKey: L("rgb_color"),
          colors: LIGHT_COLORS,
          value: Array.isArray(ctx.data.rgb_color)
            ? (ctx.data.rgb_color as number[])
            : undefined,
        }
      : undefined;
  return compact([
    brightness
      ? slider(ctx, "brightness_pct", L("brightness_pct"), 0, 100, 1, {
          unit: "%",
        })
      : undefined,
    colorTemp
      ? slider(
          ctx,
          "color_temp_kelvin",
          L("color_temp_kelvin"),
          attrNumber(ctx, "min_color_temp_kelvin", 2000, "min"),
          attrNumber(ctx, "max_color_temp_kelvin", 6500, "max"),
          50,
          { unit: "K" }
        )
      : undefined,
    swatches,
    transition
      ? slider(ctx, "transition", L("transition"), 0, 300, 1, { unit: "s" })
      : undefined,
  ]);
};

const climateTemperature = (ctx: QuickContext): QuickControl[] => {
  const min = attrNumber(ctx, "min_temp", 7, "min");
  const max = attrNumber(ctx, "max_temp", 35, "max");
  const step = attrNumber(ctx, "target_temp_step", 0.5, "min");
  const range = anyEntity(ctx, (e) => hasFeature(e.attributes, 2));
  const single = anyEntity(ctx, (e) => hasFeature(e.attributes, 1));
  return compact([
    single
      ? stepper(ctx, "temperature", L("temperature"), min, max, step, "°")
      : undefined,
    range
      ? stepper(ctx, "target_temp_low", L("target_temp_low"), min, max, step)
      : undefined,
    range
      ? stepper(ctx, "target_temp_high", L("target_temp_high"), min, max, step)
      : undefined,
  ]);
};

const percentFan = (ctx: QuickContext): QuickControl | undefined =>
  anyEntity(ctx, (e) => hasFeature(e.attributes, 1))
    ? slider(
        ctx,
        "percentage",
        L("percentage"),
        0,
        100,
        attrNumber(ctx, "percentage_step", 1, "min"),
        { unit: "%" }
      )
    : undefined;

const fanPreset = (ctx: QuickContext): QuickControl | undefined =>
  anyEntity(ctx, (e) => hasFeature(e.attributes, 8))
    ? tiles(ctx, "preset_mode", L("preset_mode"), attrList(ctx, "preset_modes"))
    : undefined;

const stateOf = (ctx: QuickContext) => ctx.entities[0]?.attributes ?? {};

type ServiceBuilders = Record<string, (ctx: QuickContext) => QuickControl[]>;

interface DomainEditor {
  /** Sibling services shown as one row of action tiles. */
  siblings?: string[];
  /** Services whose use deserves a visible caution. */
  cautions?: Record<string, string>;
  controls: ServiceBuilders;
}

const onOffToggle = ["turn_on", "turn_off", "toggle"];

const numericEntity = (ctx: QuickContext): QuickControl[] => {
  const attrs = stateOf(ctx);
  return compact([
    slider(
      ctx,
      "value",
      L("value"),
      attrNumber(ctx, "min", Number(attrs.min ?? 0), "min"),
      attrNumber(ctx, "max", Number(attrs.max ?? 100), "max"),
      attrNumber(ctx, "step", Number(attrs.step ?? 1), "min"),
      { unit: attrs.unit_of_measurement }
    ),
  ]);
};

const selectEntity = (ctx: QuickContext): QuickControl[] =>
  compact([tiles(ctx, "option", L("option"), attrList(ctx, "options"))]);

const textEntity = (ctx: QuickContext): QuickControl[] =>
  compact([textBox(ctx, "value", L("value"))]);

export const NOTIFY_CHIPS = [
  { id: "time", text: "{{ now().strftime('%H:%M') }}" },
  { id: "date", text: "{{ now().strftime('%Y-%m-%d') }}" },
  { id: "state", text: "{{ states('sensor.example') }}" },
  { id: "trigger_entity", text: "{{ trigger.to_state.name }}" },
];

export const DOMAIN_EDITORS: Record<string, DomainEditor> = {
  light: {
    siblings: onOffToggle,
    controls: {
      turn_on: lightControls,
      toggle: lightControls,
      turn_off: lightControls,
    },
  },
  climate: {
    siblings: ["turn_on", "turn_off", "set_temperature", "set_hvac_mode"],
    controls: {
      set_temperature: (ctx) => [
        ...climateTemperature(ctx),
        ...compact([
          tiles(
            ctx,
            "hvac_mode",
            L("hvac_mode"),
            attrList(ctx, "hvac_modes"),
            "component.climate.entity_component._.state."
          ),
        ]),
      ],
      set_hvac_mode: (ctx) =>
        compact([
          tiles(
            ctx,
            "hvac_mode",
            L("hvac_mode"),
            attrList(ctx, "hvac_modes"),
            "component.climate.entity_component._.state."
          ),
        ]),
      set_fan_mode: (ctx) =>
        compact([
          tiles(ctx, "fan_mode", L("fan_mode"), attrList(ctx, "fan_modes")),
        ]),
      set_preset_mode: (ctx) =>
        compact([
          tiles(
            ctx,
            "preset_mode",
            L("preset_mode"),
            attrList(ctx, "preset_modes")
          ),
        ]),
      set_swing_mode: (ctx) =>
        compact([
          tiles(
            ctx,
            "swing_mode",
            L("swing_mode"),
            attrList(ctx, "swing_modes")
          ),
        ]),
    },
  },
  cover: {
    siblings: ["open_cover", "close_cover", "stop_cover", "toggle"],
    controls: {
      set_cover_position: (ctx) =>
        compact([
          slider(ctx, "position", L("position"), 0, 100, 1, { unit: "%" }),
        ]),
      set_cover_tilt_position: (ctx) =>
        compact([
          slider(ctx, "tilt_position", L("tilt_position"), 0, 100, 1, {
            unit: "%",
          }),
        ]),
    },
  },
  media_player: {
    siblings: [
      "media_play",
      "media_pause",
      "media_play_pause",
      "media_previous_track",
      "media_next_track",
      "media_stop",
      "turn_on",
      "turn_off",
    ],
    controls: {
      volume_set: (ctx) =>
        compact([
          slider(ctx, "volume_level", L("volume_level"), 0, 1, 0.01, {
            scale: 100,
            unit: "%",
          }),
        ]),
      volume_mute: (ctx) =>
        compact([toggle(ctx, "is_volume_muted", L("is_volume_muted"))]),
      select_source: (ctx) =>
        compact([
          tiles(ctx, "source", L("source"), attrList(ctx, "source_list")),
        ]),
      select_sound_mode: (ctx) =>
        compact([
          tiles(
            ctx,
            "sound_mode",
            L("sound_mode"),
            attrList(ctx, "sound_mode_list")
          ),
        ]),
      play_media: (ctx) => compact([toggle(ctx, "announce", L("announce"))]),
    },
  },
  lock: {
    siblings: ["lock", "unlock", "open"],
    cautions: { unlock: L("caution_unlock"), open: L("caution_unlock") },
    controls: {
      lock: (ctx) =>
        compact([textBox(ctx, "code", L("code"), { inputType: "password" })]),
      unlock: (ctx) =>
        compact([textBox(ctx, "code", L("code"), { inputType: "password" })]),
      open: (ctx) =>
        compact([textBox(ctx, "code", L("code"), { inputType: "password" })]),
    },
  },
  fan: {
    siblings: onOffToggle,
    controls: {
      turn_on: (ctx) => compact([percentFan(ctx), fanPreset(ctx)]),
      set_percentage: (ctx) => compact([percentFan(ctx)]),
      oscillate: (ctx) =>
        compact([toggle(ctx, "oscillating", L("oscillating"))]),
      set_preset_mode: (ctx) => compact([fanPreset(ctx)]),
      set_direction: (ctx) =>
        compact([
          tiles(ctx, "direction", L("direction"), ["forward", "reverse"]),
        ]),
    },
  },
  vacuum: {
    siblings: [
      "start",
      "pause",
      "return_to_base",
      "locate",
      "stop",
      "clean_spot",
    ],
    controls: {
      set_fan_speed: (ctx) =>
        compact([
          tiles(
            ctx,
            "fan_speed",
            L("fan_speed"),
            attrList(ctx, "fan_speed_list")
          ),
        ]),
    },
  },
  alarm_control_panel: {
    siblings: [
      "alarm_arm_home",
      "alarm_arm_away",
      "alarm_arm_night",
      "alarm_arm_vacation",
      "alarm_arm_custom_bypass",
      "alarm_disarm",
      "alarm_trigger",
    ],
    cautions: { alarm_disarm: L("caution_disarm") },
    controls: Object.fromEntries(
      [
        "alarm_arm_home",
        "alarm_arm_away",
        "alarm_arm_night",
        "alarm_arm_vacation",
        "alarm_arm_custom_bypass",
        "alarm_disarm",
        "alarm_trigger",
      ].map((service) => [
        service,
        (ctx: QuickContext) =>
          compact([textBox(ctx, "code", L("code"), { inputType: "password" })]),
      ])
    ),
  },
  valve: {
    siblings: ["open_valve", "close_valve", "stop_valve", "toggle"],
    controls: {
      set_valve_position: (ctx) =>
        compact([
          slider(ctx, "position", L("position"), 0, 100, 1, { unit: "%" }),
        ]),
    },
  },
  siren: {
    siblings: onOffToggle,
    controls: {
      turn_on: (ctx) =>
        compact([
          anyEntity(ctx, (e) => hasFeature(e.attributes, 8))
            ? slider(ctx, "volume_level", L("volume_level"), 0, 1, 0.01, {
                scale: 100,
                unit: "%",
              })
            : undefined,
          anyEntity(ctx, (e) => hasFeature(e.attributes, 16))
            ? stepper(ctx, "duration", L("duration"), 0, 3600, 1, "s")
            : undefined,
        ]),
    },
  },
  humidifier: {
    siblings: ["turn_on", "turn_off", "toggle", "set_humidity", "set_mode"],
    controls: {
      set_humidity: (ctx) =>
        compact([
          slider(
            ctx,
            "humidity",
            L("humidity"),
            attrNumber(ctx, "min_humidity", 0, "min"),
            attrNumber(ctx, "max_humidity", 100, "max"),
            1,
            { unit: "%" }
          ),
        ]),
      set_mode: (ctx) =>
        compact([
          tiles(ctx, "mode", L("mode"), attrList(ctx, "available_modes")),
        ]),
    },
  },
  water_heater: {
    siblings: ["turn_on", "turn_off", "set_temperature", "set_operation_mode"],
    controls: {
      set_temperature: (ctx) =>
        compact([
          stepper(
            ctx,
            "temperature",
            L("temperature"),
            attrNumber(ctx, "min_temp", 30, "min"),
            attrNumber(ctx, "max_temp", 90, "max"),
            attrNumber(ctx, "target_temp_step", 1, "min"),
            "°"
          ),
        ]),
      set_operation_mode: (ctx) =>
        compact([
          tiles(
            ctx,
            "operation_mode",
            L("operation_mode"),
            attrList(ctx, "operation_list")
          ),
        ]),
      set_away_mode: (ctx) =>
        compact([toggle(ctx, "away_mode", L("away_mode"))]),
    },
  },
  number: { controls: { set_value: numericEntity } },
  input_number: {
    siblings: ["set_value", "increment", "decrement"],
    controls: { set_value: numericEntity },
  },
  select: {
    siblings: [
      "select_option",
      "select_first",
      "select_last",
      "select_next",
      "select_previous",
    ],
    controls: { select_option: selectEntity },
  },
  input_select: {
    siblings: [
      "select_option",
      "select_first",
      "select_last",
      "select_next",
      "select_previous",
    ],
    controls: { select_option: selectEntity },
  },
  input_datetime: {
    controls: {
      set_datetime: (ctx) => {
        const hasDate = anyEntity(ctx, (e) => e.attributes.has_date !== false);
        const hasTime = anyEntity(ctx, (e) => e.attributes.has_time !== false);
        const make = (
          key: string,
          kind: "time" | "date" | "datetime"
        ): QuickControl | undefined => {
          const value = scalar<string>(ctx, key, "string");
          return claim(ctx, key) && value !== null
            ? { kind, key, labelKey: L(key), value }
            : undefined;
        };
        return compact([
          hasDate && hasTime ? make("datetime", "datetime") : undefined,
          hasDate && !hasTime ? make("date", "date") : undefined,
          hasTime && !hasDate ? make("time", "time") : undefined,
        ]);
      },
    },
  },
  input_text: { controls: { set_value: textEntity } },
  text: { controls: { set_value: textEntity } },
  input_boolean: { siblings: onOffToggle, controls: {} },
  switch: { siblings: onOffToggle, controls: {} },
  scene: {
    controls: {
      turn_on: (ctx) =>
        compact([
          slider(ctx, "transition", L("transition"), 0, 300, 1, { unit: "s" }),
        ]),
    },
  },
  notify: {
    controls: {
      "*": (ctx) =>
        compact([
          textBox(ctx, "title", L("title")),
          textBox(ctx, "message", L("message"), {
            multiline: true,
            chips: NOTIFY_CHIPS,
          }),
        ]),
    },
  },
  button: { siblings: ["press"], controls: {} },
  input_button: { siblings: ["press"], controls: {} },
  timer: {
    siblings: ["start", "pause", "cancel", "finish", "change"],
    controls: {
      start: (ctx) => compact([textBox(ctx, "duration", L("duration"))]),
      change: (ctx) => compact([textBox(ctx, "duration", L("duration"))]),
    },
  },
  counter: {
    siblings: ["increment", "decrement", "reset", "set_value"],
    controls: {
      set_value: (ctx) =>
        compact([stepper(ctx, "value", L("value"), -1000000, 1000000, 1)]),
    },
  },
  // Scripts are actions named `script.<id>`; their declared fields come from
  // the generic builder below.
  script: { controls: {} },
};

const humanKey = (key: string) => key.replace(/_/g, " ");

/** Visual controls for declared fields that no tailored editor claimed. */
const genericControls = (
  ctx: QuickContext,
  claimed: Set<string>
): QuickControl[] =>
  compact(
    Object.entries(ctx.fields).map(([key, info]) => {
      if (claimed.has(key) || IGNORED_KEYS.has(key)) return undefined;
      const labelKey = `ui.components.action-editors.field_fallback`;
      const selector = info.selector;
      // Text, date, time and selector-less fields stay with the selectors,
      // which keep legacy text, templates and nested values intact.
      if (!selector) return undefined;
      const [type, config] = Object.entries(selector)[0] ?? [];
      const options = (config ?? {}) as Record<string, any>;
      switch (type) {
        case "boolean":
          return toggle(ctx, key, labelKey);
        case "number": {
          if (
            typeof options.min !== "number" ||
            typeof options.max !== "number"
          ) {
            return undefined;
          }
          if (options.mode === "box") return undefined;
          return slider(
            ctx,
            key,
            labelKey,
            options.min,
            options.max,
            typeof options.step === "number" ? options.step : 1,
            { unit: options.unit_of_measurement }
          );
        }
        case "select": {
          const list = options.options;
          if (
            !Array.isArray(list) ||
            options.multiple ||
            options.custom_value ||
            list.length === 0 ||
            list.length > 8 ||
            list.some(
              (item: unknown) =>
                typeof item !== "string" &&
                !(
                  item &&
                  typeof item === "object" &&
                  typeof (item as any).value === "string"
                )
            )
          ) {
            return undefined;
          }
          const control = tiles(
            ctx,
            key,
            labelKey,
            list.map((item: any) =>
              typeof item === "string" ? item : item.value
            )
          );
          if (control && control.kind === "tiles") {
            control.options = control.options.map((option) => {
              const source = list.find(
                (item: any) =>
                  typeof item === "object" && item.value === option.value
              );
              return source?.label
                ? { ...option, label: String(source.label) }
                : option;
            });
          }
          return control;
        }
        default:
          return undefined;
      }
    })
  );

export const quickEditorDomain = (action: string): DomainEditor | undefined =>
  DOMAIN_EDITORS[splitAction(action)[0]];

/** Whether a tailored editor exists for the action's domain. */
export const hasTailoredEditor = (action: string): boolean =>
  quickEditorDomain(action) !== undefined;

/** Every control for one action, tailored first and generic second. */
export const buildQuickControls = (ctx: QuickContext): QuickControl[] => {
  const [domain, service] = splitAction(ctx.action);
  const editor = DOMAIN_EDITORS[domain];
  const controls: QuickControl[] = [];
  const siblings = (editor?.siblings ?? []).filter((name) =>
    ctx.domainServices.includes(name)
  );
  if (editor && siblings.length > 1 && siblings.includes(service)) {
    controls.push({
      kind: "services",
      key: "$action",
      labelKey: L("action"),
      options: siblings.map((name) => ({ value: `${domain}.${name}` })),
      value: ctx.action,
    });
  }
  const caution = editor?.cautions?.[service];
  if (caution) {
    controls.push({
      kind: "notice",
      key: "$caution",
      labelKey: caution,
      tone: "caution",
    });
  }
  const builder = editor?.controls[service] ?? editor?.controls["*"];
  const tailored = builder ? builder(ctx) : [];
  controls.push(...tailored);
  // Fields a tailored editor can ever show stay with it, even when the
  // targeted entities do not support them, so the generic form never
  // re-adds a control that was gated out on purpose.
  const claimed = new Set(
    (builder ? builder({ ...ctx, entities: [], data: {} }) : []).map(
      (control) => control.key
    )
  );
  tailored.forEach((control) => claimed.add(control.key));
  controls.push(...genericControls(ctx, claimed));
  return controls;
};

/** Keys the quick controls own, so the generic fields skip them. */
export const claimedKeys = (controls: QuickControl[]): Set<string> =>
  new Set(
    controls.filter((c) => !c.key.startsWith("$")).map((control) => control.key)
  );

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Write one control value into action data. Other keys keep their order and
 * value, so a trip through code view and back loses nothing.
 */
export const applyControlValue = (
  data: Record<string, unknown> | undefined,
  key: string,
  value: unknown
): Record<string, unknown> | undefined => {
  const current = data ?? {};
  if (value === undefined || value === "") {
    if (!(key in current)) return data;
    const next = { ...current };
    delete next[key];
    return next;
  }
  if (key in current && sameValue(current[key], value)) return data;
  return { ...current, [key]: value };
};

/** Text boxes keep the stored type: a number stays a number when typed as one. */
export const coerceText = (text: string, previous: unknown): unknown => {
  if (text === "") return undefined;
  if (
    typeof previous === "number" &&
    text.trim() !== "" &&
    Number.isFinite(Number(text))
  ) {
    return Number(text);
  }
  if (typeof previous === "boolean" && (text === "true" || text === "false")) {
    return text === "true";
  }
  return text;
};

/** Plain readable fallback when no translation exists for an option. */
export const humanizeOption = (value: string): string => {
  const text = humanKey(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Clamp and align a stepper or slider value to its bounds and step. */
export const snapToStep = (
  value: number,
  min: number,
  max: number,
  step: number
): number => {
  const clamped = Math.min(max, Math.max(min, value));
  const decimals = (String(step).split(".")[1] ?? "").length;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, snapped).toFixed(decimals));
};
