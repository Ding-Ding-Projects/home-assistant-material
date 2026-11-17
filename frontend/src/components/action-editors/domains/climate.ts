import {
  anyEntity,
  attrList,
  attrNumber,
  compact,
  duration,
  hasFeature,
  L,
  slider,
  stepper,
  tiles,
  toggle,
} from "../quick-helpers";
import type { DomainEditor, QuickContext, QuickControl } from "../quick-types";

const onOffToggle = ["turn_on", "turn_off", "toggle"];

const HVAC_PREFIX = "component.climate.entity_component._.state.";

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

const modeTiles = (
  key: string,
  attribute: string,
  prefix?: string
): ((ctx: QuickContext) => QuickControl[]) => {
  return (ctx) =>
    compact([tiles(ctx, key, L(key), attrList(ctx, attribute), prefix)]);
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

const fanStep = (ctx: QuickContext): QuickControl[] =>
  compact([
    slider(ctx, "percentage_step", L("percentage_step"), 1, 100, 1, {
      unit: "%",
    }),
  ]);

const position = (key: string) => (ctx: QuickContext) =>
  compact([slider(ctx, key, L(key), 0, 100, 1, { unit: "%" })]);

export const CLIMATE_EDITORS: Record<string, DomainEditor> = {
  climate: {
    siblings: [
      "turn_on",
      "turn_off",
      "set_temperature",
      "set_hvac_mode",
      "set_humidity",
    ],
    controls: {
      set_temperature: (ctx) => [
        ...climateTemperature(ctx),
        ...compact([
          tiles(
            ctx,
            "hvac_mode",
            L("hvac_mode"),
            attrList(ctx, "hvac_modes"),
            HVAC_PREFIX
          ),
        ]),
      ],
      set_hvac_mode: modeTiles("hvac_mode", "hvac_modes", HVAC_PREFIX),
      set_fan_mode: modeTiles("fan_mode", "fan_modes"),
      set_preset_mode: modeTiles("preset_mode", "preset_modes"),
      set_swing_mode: modeTiles("swing_mode", "swing_modes"),
      set_swing_horizontal_mode: modeTiles(
        "swing_horizontal_mode",
        "swing_horizontal_modes"
      ),
      set_humidity: (ctx) =>
        compact([
          slider(
            ctx,
            "humidity",
            L("humidity"),
            attrNumber(ctx, "min_humidity", 30, "min"),
            attrNumber(ctx, "max_humidity", 99, "max"),
            1,
            { unit: "%" }
          ),
        ]),
      turn_on: () => [],
      turn_off: () => [],
      toggle: () => [],
    },
  },
  cover: {
    siblings: [
      "open_cover",
      "close_cover",
      "stop_cover",
      "toggle",
      "set_cover_position",
    ],
    gates: {
      open_cover: 1,
      close_cover: 2,
      set_cover_position: 4,
      stop_cover: 8,
    },
    controls: {
      set_cover_position: position("position"),
      set_cover_tilt_position: position("tilt_position"),
      open_cover: () => [],
      close_cover: () => [],
      stop_cover: () => [],
      toggle: () => [],
      open_cover_tilt: () => [],
      close_cover_tilt: () => [],
      toggle_cover_tilt: () => [],
      stop_cover_tilt: () => [],
    },
  },
  fan: {
    siblings: onOffToggle,
    controls: {
      turn_on: (ctx) => compact([percentFan(ctx), fanPreset(ctx)]),
      turn_off: () => [],
      toggle: () => [],
      set_percentage: (ctx) => compact([percentFan(ctx)]),
      oscillate: (ctx) =>
        compact([toggle(ctx, "oscillating", L("oscillating"))]),
      set_preset_mode: (ctx) => compact([fanPreset(ctx)]),
      set_direction: (ctx) =>
        compact([
          tiles(ctx, "direction", L("direction"), ["forward", "reverse"]),
        ]),
      increase_speed: fanStep,
      decrease_speed: fanStep,
    },
  },
  humidifier: {
    siblings: ["turn_on", "turn_off", "toggle", "set_humidity", "set_mode"],
    controls: {
      turn_on: () => [],
      turn_off: () => [],
      toggle: () => [],
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
      set_mode: modeTiles("mode", "available_modes"),
    },
  },
  water_heater: {
    siblings: [
      "turn_on",
      "turn_off",
      "set_temperature",
      "set_operation_mode",
      "set_away_mode",
    ],
    controls: {
      turn_on: () => [],
      turn_off: () => [],
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
          anyEntity(ctx, (e) => hasFeature(e.attributes, 2))
            ? tiles(
                ctx,
                "operation_mode",
                L("operation_mode"),
                attrList(ctx, "operation_list")
              )
            : undefined,
        ]),
      set_operation_mode: modeTiles("operation_mode", "operation_list"),
      set_away_mode: (ctx) =>
        compact([toggle(ctx, "away_mode", L("away_mode"))]),
    },
  },
  valve: {
    siblings: [
      "open_valve",
      "close_valve",
      "stop_valve",
      "toggle",
      "set_valve_position",
    ],
    controls: {
      set_valve_position: position("position"),
      open_valve: () => [],
      close_valve: () => [],
      stop_valve: () => [],
      toggle: () => [],
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
            ? duration(ctx, "duration", L("duration"), "seconds")
            : undefined,
        ]),
      turn_off: () => [],
      toggle: () => [],
    },
  },
};
