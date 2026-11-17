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

/** Generated from the condition descriptions of the climate integrations: one entry per `domain.condition`. */
export const CONDITION_EDITORS_CLIMATE: AutomationEditorMap = {
  "climate.is_off": entry(
    "condition",
    "climate.is_off",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.is_on": entry(
    "condition",
    "climate.is_on",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.is_cooling": entry(
    "condition",
    "climate.is_cooling",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.is_drying": entry(
    "condition",
    "climate.is_drying",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.is_heating": entry(
    "condition",
    "climate.is_heating",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "climate.is_hvac_mode": entry(
    "condition",
    "climate.is_hvac_mode",
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
  "climate.is_target_humidity": entry(
    "condition",
    "climate.is_target_humidity",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [behavior(ctx), threshold(ctx, T.climateHumidityIs), holdFor(ctx)],
    ["for"]
  ),
  "climate.is_target_temperature": entry(
    "condition",
    "climate.is_target_temperature",
    "climate",
    { entity: { domain: "climate" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateTemperatureIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "fan.is_off": entry(
    "condition",
    "fan.is_off",
    "climate",
    { entity: { domain: "fan" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "fan.is_on": entry(
    "condition",
    "fan.is_on",
    "climate",
    { entity: { domain: "fan" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.is_off": entry(
    "condition",
    "humidifier.is_off",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.is_on": entry(
    "condition",
    "humidifier.is_on",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.is_drying": entry(
    "condition",
    "humidifier.is_drying",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.is_humidifying": entry(
    "condition",
    "humidifier.is_humidifying",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "humidifier.is_mode": entry(
    "condition",
    "humidifier.is_mode",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [
      behavior(ctx),
      stateChoice(ctx, "mode", L("humidifier__mode"), "available_modes"),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "humidifier.is_target_humidity": entry(
    "condition",
    "humidifier.is_target_humidity",
    "climate",
    { entity: { domain: "humidifier" } },
    (ctx) => [behavior(ctx), threshold(ctx, T.climateHumidityIs), holdFor(ctx)],
    ["for"]
  ),
  "water_heater.is_off": entry(
    "condition",
    "water_heater.is_off",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "water_heater.is_on": entry(
    "condition",
    "water_heater.is_on",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "water_heater.is_operation_mode": entry(
    "condition",
    "water_heater.is_operation_mode",
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
  "water_heater.is_target_temperature": entry(
    "condition",
    "water_heater.is_target_temperature",
    "climate",
    { entity: { domain: "water_heater" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateTemperatureIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
};
