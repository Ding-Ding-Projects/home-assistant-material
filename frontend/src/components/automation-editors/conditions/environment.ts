import type { AutomationEditorMap } from "../types";
import { entry, L, behavior, holdFor, threshold, choice } from "../helpers";
import * as T from "../thresholds";

/** Generated from the condition descriptions of the environment integrations: one entry per `domain.condition`. */
export const CONDITION_EDITORS_ENVIRONMENT: AutomationEditorMap = {
  "air_quality.is_gas_detected": entry(
    "condition",
    "air_quality.is_gas_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "gas" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_gas_cleared": entry(
    "condition",
    "air_quality.is_gas_cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "gas" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_co_detected": entry(
    "condition",
    "air_quality.is_co_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_co_cleared": entry(
    "condition",
    "air_quality.is_co_cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_smoke_detected": entry(
    "condition",
    "air_quality.is_smoke_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "smoke" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_smoke_cleared": entry(
    "condition",
    "air_quality.is_smoke_cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "smoke" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_co_value": entry(
    "condition",
    "air_quality.is_co_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityCarbonMonoxideIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_ozone_value": entry(
    "condition",
    "air_quality.is_ozone_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "ozone" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.airQualityOzoneIs), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_voc_value": entry(
    "condition",
    "air_quality.is_voc_value",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "volatile_organic_compounds" },
      ],
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityVolatileOrganicCompoundsIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_voc_ratio_value": entry(
    "condition",
    "air_quality.is_voc_ratio_value",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "volatile_organic_compounds_parts" },
      ],
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityVolatileOrganicCompoundsPartsIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_no_value": entry(
    "condition",
    "air_quality.is_no_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrogen_monoxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityNitrogenMonoxideIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_no2_value": entry(
    "condition",
    "air_quality.is_no2_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrogen_dioxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityNitrogenDioxideIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_so2_value": entry(
    "condition",
    "air_quality.is_so2_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "sulphur_dioxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualitySulphurDioxideIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_radon_value": entry(
    "condition",
    "air_quality.is_radon_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "radon" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.airQualityRadonIs), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_co2_value": entry(
    "condition",
    "air_quality.is_co2_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "carbon_dioxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityCarbonDioxideIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.is_pm1_value": entry(
    "condition",
    "air_quality.is_pm1_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm1" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.airQualityPm1Is), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_pm25_value": entry(
    "condition",
    "air_quality.is_pm25_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm25" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.airQualityPm25Is), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_pm4_value": entry(
    "condition",
    "air_quality.is_pm4_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm4" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.airQualityPm4Is), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_pm10_value": entry(
    "condition",
    "air_quality.is_pm10_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm10" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.airQualityPm10Is), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.is_n2o_value": entry(
    "condition",
    "air_quality.is_n2o_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrous_oxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityNitrousOxideIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "battery.is_low": entry(
    "condition",
    "battery.is_low",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.is_not_low": entry(
    "condition",
    "battery.is_not_low",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.is_charging": entry(
    "condition",
    "battery.is_charging",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery_charging" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.is_not_charging": entry(
    "condition",
    "battery.is_not_charging",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery_charging" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.is_level": entry(
    "condition",
    "battery.is_level",
    "environment",
    {
      entity: [{ domain: "sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), threshold(ctx, T.batteryBatteryIs), holdFor(ctx)],
    ["for"]
  ),
  "humidity.is_value": entry(
    "condition",
    "humidity.is_value",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "humidity" },
        { domain: "climate" },
        { domain: "humidifier" },
        { domain: "weather" },
      ],
    },
    (ctx) => [behavior(ctx), threshold(ctx, T.climateHumidityIs), holdFor(ctx)],
    ["for"]
  ),
  "illuminance.is_detected": entry(
    "condition",
    "illuminance.is_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "light" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "illuminance.is_not_detected": entry(
    "condition",
    "illuminance.is_not_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "light" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "illuminance.is_value": entry(
    "condition",
    "illuminance.is_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "illuminance" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.illuminanceIlluminanceIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "moisture.is_detected": entry(
    "condition",
    "moisture.is_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "moisture" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "moisture.is_not_detected": entry(
    "condition",
    "moisture.is_not_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "moisture" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "moisture.is_value": entry(
    "condition",
    "moisture.is_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "moisture" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.moistureMoistureIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "moon.is_phase": entry(
    "condition",
    "moon.is_phase",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "phase",
        L("moon__phase"),
        [
          "new_moon",
          "waxing_crescent",
          "first_quarter",
          "waxing_gibbous",
          "full_moon",
          "waning_gibbous",
          "last_quarter",
          "waning_crescent",
        ],
        "moon__phase__"
      ),
    ],
    []
  ),
  "moon.is_waxing": entry(
    "condition",
    "moon.is_waxing",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "moon.is_waning": entry(
    "condition",
    "moon.is_waning",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "power.is_value": entry(
    "condition",
    "power.is_value",
    "environment",
    { entity: [{ domain: "sensor", device_class: "power" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.powerPowerIs), holdFor(ctx)],
    ["for"]
  ),
  "sun.is_up": entry(
    "condition",
    "sun.is_up",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.is_set": entry(
    "condition",
    "sun.is_set",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.is_ascending": entry(
    "condition",
    "sun.is_ascending",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.is_descending": entry(
    "condition",
    "sun.is_descending",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.is_night": entry(
    "condition",
    "sun.is_night",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.is_golden_hour": entry(
    "condition",
    "sun.is_golden_hour",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "period",
        L("sun__period"),
        ["any", "morning", "evening"],
        "sun__period__"
      ),
    ],
    []
  ),
  "sun.is_blue_hour": entry(
    "condition",
    "sun.is_blue_hour",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "period",
        L("sun__period"),
        ["any", "morning", "evening"],
        "sun__period__"
      ),
    ],
    []
  ),
  "sun.is_midnight_sun": entry(
    "condition",
    "sun.is_midnight_sun",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.is_polar_night": entry(
    "condition",
    "sun.is_polar_night",
    "environment",
    null,
    (_ctx) => [],
    []
  ),
  "sun.elevation": entry(
    "condition",
    "sun.elevation",
    "environment",
    null,
    (ctx) => [threshold(ctx, T.sunNumberIs)],
    []
  ),
  "sun.is_morning_twilight": entry(
    "condition",
    "sun.is_morning_twilight",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "type",
        L("sun__type"),
        ["any", "civil", "nautical", "astronomical"],
        "sun__type__"
      ),
    ],
    []
  ),
  "sun.is_evening_twilight": entry(
    "condition",
    "sun.is_evening_twilight",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "type",
        L("sun__type"),
        ["any", "civil", "nautical", "astronomical"],
        "sun__type__"
      ),
    ],
    []
  ),
  "temperature.is_value": entry(
    "condition",
    "temperature.is_value",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "temperature" },
        { domain: "climate" },
        { domain: "water_heater" },
        { domain: "weather" },
      ],
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateTemperatureIs),
      holdFor(ctx),
    ],
    ["for"]
  ),
};
