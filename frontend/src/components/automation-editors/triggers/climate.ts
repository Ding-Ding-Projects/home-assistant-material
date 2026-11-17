import type { AutomationEditorMap } from "../types";
import {
  entry,
  L,
  behavior,
  holdFor,
  threshold,
  multiChoice,
  stateChoice,
  HVAC_MODES,
} from "../helpers";
import * as T from "../thresholds";

/** Generated from the trigger descriptions of the climate integrations: one entry per `domain.trigger`. */
export const TRIGGER_EDITORS_CLIMATE: AutomationEditorMap = {
  "climate.started_cooling": entry(
    "trigger",
    "climate.started_cooling",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.started_drying": entry(
    "trigger",
    "climate.started_drying",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.started_heating": entry(
    "trigger",
    "climate.started_heating",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.turned_off": entry(
    "trigger",
    "climate.turned_off",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.turned_on": entry(
    "trigger",
    "climate.turned_on",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.hvac_mode_changed": entry(
    "trigger",
    "climate.hvac_mode_changed",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [
      behavior(ctx),
      multiChoice(
        ctx,
        "hvac_mode",
        L("climate__hvac_mode"),
        HVAC_MODES,
        "climate__hvac_mode__"
      ),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "climate.target_humidity_changed": entry(
    "trigger",
    "climate.target_humidity_changed",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [threshold(ctx, T.climateHumidityChanged)],
    []
  ),
  "climate.target_humidity_crossed_threshold": entry(
    "trigger",
    "climate.target_humidity_crossed_threshold",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateHumidityCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "climate.target_temperature_changed": entry(
    "trigger",
    "climate.target_temperature_changed",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [threshold(ctx, T.climateTemperatureChanged)],
    []
  ),
  "climate.target_temperature_crossed_threshold": entry(
    "trigger",
    "climate.target_temperature_crossed_threshold",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateTemperatureCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "fan.turned_on": entry(
    "trigger",
    "fan.turned_on",
    "climate",
    { entity: { domain: "fan" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "fan.turned_off": entry(
    "trigger",
    "fan.turned_off",
    "climate",
    { entity: { domain: "fan" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.started_drying": entry(
    "trigger",
    "humidifier.started_drying",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.started_humidifying": entry(
    "trigger",
    "humidifier.started_humidifying",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.turned_on": entry(
    "trigger",
    "humidifier.turned_on",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.turned_off": entry(
    "trigger",
    "humidifier.turned_off",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.mode_changed": entry(
    "trigger",
    "humidifier.mode_changed",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [
      behavior(ctx),
      stateChoice(ctx, "mode", L("humidifier__mode"), "available_modes"),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "water_heater.operation_mode_changed": entry(
    "trigger",
    "water_heater.operation_mode_changed",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [
      behavior(ctx),
      stateChoice(
        ctx,
        "operation_mode",
        L("water_heater__operation_mode"),
        "operation_mode"
      ),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "water_heater.turned_off": entry(
    "trigger",
    "water_heater.turned_off",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "water_heater.turned_on": entry(
    "trigger",
    "water_heater.turned_on",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "water_heater.target_temperature_changed": entry(
    "trigger",
    "water_heater.target_temperature_changed",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [threshold(ctx, T.climateTemperatureChanged)],
    []
  ),
  "water_heater.target_temperature_crossed_threshold": entry(
    "trigger",
    "water_heater.target_temperature_crossed_threshold",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateTemperatureCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
};
