import type { AutomationEditorMap } from "../types";
import {
  entry,
  L,
  behavior,
  holdFor,
  offset,
  threshold,
  choice,
} from "../helpers";
import * as T from "../thresholds";

/** Generated from the trigger descriptions of the environment integrations: one entry per `domain.trigger`. */
export const TRIGGER_EDITORS_ENVIRONMENT: AutomationEditorMap = {
  "air_quality.gas_detected": entry(
    "trigger",
    "air_quality.gas_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "gas" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.gas_cleared": entry(
    "trigger",
    "air_quality.gas_cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "gas" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.co_detected": entry(
    "trigger",
    "air_quality.co_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.co_cleared": entry(
    "trigger",
    "air_quality.co_cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.smoke_detected": entry(
    "trigger",
    "air_quality.smoke_detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "smoke" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.smoke_cleared": entry(
    "trigger",
    "air_quality.smoke_cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "smoke" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "air_quality.co_changed": entry(
    "trigger",
    "air_quality.co_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [threshold(ctx, T.airQualityCarbonMonoxideChanged)],
    []
  ),
  "air_quality.co_crossed_threshold": entry(
    "trigger",
    "air_quality.co_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "carbon_monoxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityCarbonMonoxideCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.co2_changed": entry(
    "trigger",
    "air_quality.co2_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "carbon_dioxide" }] },
    (ctx) => [threshold(ctx, T.airQualityCarbonDioxideChanged)],
    []
  ),
  "air_quality.co2_crossed_threshold": entry(
    "trigger",
    "air_quality.co2_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "carbon_dioxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityCarbonDioxideCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.pm1_changed": entry(
    "trigger",
    "air_quality.pm1_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm1" }] },
    (ctx) => [threshold(ctx, T.airQualityPm1Changed)],
    []
  ),
  "air_quality.pm1_crossed_threshold": entry(
    "trigger",
    "air_quality.pm1_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm1" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityPm1Crossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.pm25_changed": entry(
    "trigger",
    "air_quality.pm25_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm25" }] },
    (ctx) => [threshold(ctx, T.airQualityPm25Changed)],
    []
  ),
  "air_quality.pm25_crossed_threshold": entry(
    "trigger",
    "air_quality.pm25_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm25" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityPm25Crossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.pm4_changed": entry(
    "trigger",
    "air_quality.pm4_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm4" }] },
    (ctx) => [threshold(ctx, T.airQualityPm4Changed)],
    []
  ),
  "air_quality.pm4_crossed_threshold": entry(
    "trigger",
    "air_quality.pm4_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm4" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityPm4Crossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.pm10_changed": entry(
    "trigger",
    "air_quality.pm10_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm10" }] },
    (ctx) => [threshold(ctx, T.airQualityPm10Changed)],
    []
  ),
  "air_quality.pm10_crossed_threshold": entry(
    "trigger",
    "air_quality.pm10_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "pm10" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityPm10Crossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.ozone_changed": entry(
    "trigger",
    "air_quality.ozone_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "ozone" }] },
    (ctx) => [threshold(ctx, T.airQualityOzoneChanged)],
    []
  ),
  "air_quality.ozone_crossed_threshold": entry(
    "trigger",
    "air_quality.ozone_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "ozone" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityOzoneCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.voc_changed": entry(
    "trigger",
    "air_quality.voc_changed",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "volatile_organic_compounds" },
      ],
    },
    (ctx) => [threshold(ctx, T.airQualityVolatileOrganicCompoundsChanged)],
    []
  ),
  "air_quality.voc_crossed_threshold": entry(
    "trigger",
    "air_quality.voc_crossed_threshold",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "volatile_organic_compounds" },
      ],
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityVolatileOrganicCompoundsCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.voc_ratio_changed": entry(
    "trigger",
    "air_quality.voc_ratio_changed",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "volatile_organic_compounds_parts" },
      ],
    },
    (ctx) => [threshold(ctx, T.airQualityVolatileOrganicCompoundsPartsChanged)],
    []
  ),
  "air_quality.voc_ratio_crossed_threshold": entry(
    "trigger",
    "air_quality.voc_ratio_crossed_threshold",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "volatile_organic_compounds_parts" },
      ],
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityVolatileOrganicCompoundsPartsCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.no_changed": entry(
    "trigger",
    "air_quality.no_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrogen_monoxide" }] },
    (ctx) => [threshold(ctx, T.airQualityNitrogenMonoxideChanged)],
    []
  ),
  "air_quality.no_crossed_threshold": entry(
    "trigger",
    "air_quality.no_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrogen_monoxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityNitrogenMonoxideCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.no2_changed": entry(
    "trigger",
    "air_quality.no2_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrogen_dioxide" }] },
    (ctx) => [threshold(ctx, T.airQualityNitrogenDioxideChanged)],
    []
  ),
  "air_quality.no2_crossed_threshold": entry(
    "trigger",
    "air_quality.no2_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrogen_dioxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityNitrogenDioxideCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.n2o_changed": entry(
    "trigger",
    "air_quality.n2o_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrous_oxide" }] },
    (ctx) => [threshold(ctx, T.airQualityNitrousOxideChanged)],
    []
  ),
  "air_quality.n2o_crossed_threshold": entry(
    "trigger",
    "air_quality.n2o_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "nitrous_oxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityNitrousOxideCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.so2_changed": entry(
    "trigger",
    "air_quality.so2_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "sulphur_dioxide" }] },
    (ctx) => [threshold(ctx, T.airQualitySulphurDioxideChanged)],
    []
  ),
  "air_quality.so2_crossed_threshold": entry(
    "trigger",
    "air_quality.so2_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "sulphur_dioxide" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualitySulphurDioxideCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "air_quality.radon_changed": entry(
    "trigger",
    "air_quality.radon_changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "radon" }] },
    (ctx) => [threshold(ctx, T.airQualityRadonChanged)],
    []
  ),
  "air_quality.radon_crossed_threshold": entry(
    "trigger",
    "air_quality.radon_crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "radon" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.airQualityRadonCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "battery.became_low": entry(
    "trigger",
    "battery.became_low",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.no_longer_low": entry(
    "trigger",
    "battery.no_longer_low",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.started_charging": entry(
    "trigger",
    "battery.started_charging",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery_charging" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.stopped_charging": entry(
    "trigger",
    "battery.stopped_charging",
    "environment",
    {
      entity: [{ domain: "binary_sensor", device_class: "battery_charging" }],
      primary_entities_only: false,
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "battery.level_changed": entry(
    "trigger",
    "battery.level_changed",
    "environment",
    {
      entity: [{ domain: "sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [threshold(ctx, T.batteryBatteryChanged)],
    []
  ),
  "battery.level_crossed_threshold": entry(
    "trigger",
    "battery.level_crossed_threshold",
    "environment",
    {
      entity: [{ domain: "sensor", device_class: "battery" }],
      primary_entities_only: false,
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.batteryBatteryCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "humidity.changed": entry(
    "trigger",
    "humidity.changed",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "humidity" },
        { domain: "climate" },
        { domain: "humidifier" },
        { domain: "weather" },
      ],
    },
    (ctx) => [threshold(ctx, T.climateHumidityChanged)],
    []
  ),
  "humidity.crossed_threshold": entry(
    "trigger",
    "humidity.crossed_threshold",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "humidity" },
        { domain: "climate" },
        { domain: "humidifier" },
        { domain: "weather" },
      ],
    },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.climateHumidityCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "illuminance.detected": entry(
    "trigger",
    "illuminance.detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "light" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "illuminance.cleared": entry(
    "trigger",
    "illuminance.cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "light" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "illuminance.changed": entry(
    "trigger",
    "illuminance.changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "illuminance" }] },
    (ctx) => [threshold(ctx, T.illuminanceIlluminanceChanged)],
    []
  ),
  "illuminance.crossed_threshold": entry(
    "trigger",
    "illuminance.crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "illuminance" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.illuminanceIlluminanceCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "moisture.detected": entry(
    "trigger",
    "moisture.detected",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "moisture" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "moisture.cleared": entry(
    "trigger",
    "moisture.cleared",
    "environment",
    { entity: [{ domain: "binary_sensor", device_class: "moisture" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "moisture.changed": entry(
    "trigger",
    "moisture.changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "moisture" }] },
    (ctx) => [threshold(ctx, T.moistureMoistureChanged)],
    []
  ),
  "moisture.crossed_threshold": entry(
    "trigger",
    "moisture.crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "moisture" }] },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.moistureMoistureCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "moon.phase_changed": entry(
    "trigger",
    "moon.phase_changed",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "phase",
        L("moon__phase"),
        [
          "any",
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
  "power.changed": entry(
    "trigger",
    "power.changed",
    "environment",
    { entity: [{ domain: "sensor", device_class: "power" }] },
    (ctx) => [threshold(ctx, T.powerPowerChanged)],
    []
  ),
  "power.crossed_threshold": entry(
    "trigger",
    "power.crossed_threshold",
    "environment",
    { entity: [{ domain: "sensor", device_class: "power" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.powerPowerCrossed), holdFor(ctx)],
    ["for"]
  ),
  "sun.sunrise": entry(
    "trigger",
    "sun.sunrise",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.sunset": entry(
    "trigger",
    "sun.sunset",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.solar_noon": entry(
    "trigger",
    "sun.solar_noon",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.solar_midnight": entry(
    "trigger",
    "sun.solar_midnight",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.dawn": entry(
    "trigger",
    "sun.dawn",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "type",
        L("sun__type"),
        ["civil", "nautical", "astronomical"],
        "sun__type__"
      ),
      offset(ctx),
    ],
    []
  ),
  "sun.dusk": entry(
    "trigger",
    "sun.dusk",
    "environment",
    null,
    (ctx) => [
      choice(
        ctx,
        "type",
        L("sun__type"),
        ["civil", "nautical", "astronomical"],
        "sun__type__"
      ),
      offset(ctx),
    ],
    []
  ),
  "sun.golden_hour_started": entry(
    "trigger",
    "sun.golden_hour_started",
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
      offset(ctx),
    ],
    []
  ),
  "sun.golden_hour_ended": entry(
    "trigger",
    "sun.golden_hour_ended",
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
      offset(ctx),
    ],
    []
  ),
  "sun.blue_hour_started": entry(
    "trigger",
    "sun.blue_hour_started",
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
      offset(ctx),
    ],
    []
  ),
  "sun.blue_hour_ended": entry(
    "trigger",
    "sun.blue_hour_ended",
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
      offset(ctx),
    ],
    []
  ),
  "sun.midnight_sun_started": entry(
    "trigger",
    "sun.midnight_sun_started",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.midnight_sun_ended": entry(
    "trigger",
    "sun.midnight_sun_ended",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.polar_night_started": entry(
    "trigger",
    "sun.polar_night_started",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.polar_night_ended": entry(
    "trigger",
    "sun.polar_night_ended",
    "environment",
    null,
    (ctx) => [offset(ctx)],
    []
  ),
  "sun.elevation_changed": entry(
    "trigger",
    "sun.elevation_changed",
    "environment",
    null,
    (ctx) => [threshold(ctx, T.sunNumberChanged)],
    []
  ),
  "sun.elevation_crossed_threshold": entry(
    "trigger",
    "sun.elevation_crossed_threshold",
    "environment",
    null,
    (ctx) => [threshold(ctx, T.sunNumberCrossed), holdFor(ctx)],
    ["for"]
  ),
  "temperature.changed": entry(
    "trigger",
    "temperature.changed",
    "environment",
    {
      entity: [
        { domain: "sensor", device_class: "temperature" },
        { domain: "climate" },
        { domain: "water_heater" },
        { domain: "weather" },
      ],
    },
    (ctx) => [threshold(ctx, T.climateTemperatureChanged)],
    []
  ),
  "temperature.crossed_threshold": entry(
    "trigger",
    "temperature.crossed_threshold",
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
      threshold(ctx, T.climateTemperatureCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
};
