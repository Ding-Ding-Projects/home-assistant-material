import type { ThresholdPreset } from "./types";

/** Numeric threshold settings read from the integrations' trigger and condition descriptions. */
export const airQualityCarbonMonoxideChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    {
      domain: "input_number",
      unit_of_measurement: ["ppb", "ppm", "mg/m³", "μg/m³"],
    },
    { domain: "sensor", device_class: "carbon_monoxide" },
    { domain: "number", device_class: "carbon_monoxide" },
  ],
  unit: ["ppb", "ppm", "mg/m³", "μg/m³"],
};

export const airQualityCarbonMonoxideCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    {
      domain: "input_number",
      unit_of_measurement: ["ppb", "ppm", "mg/m³", "μg/m³"],
    },
    { domain: "sensor", device_class: "carbon_monoxide" },
    { domain: "number", device_class: "carbon_monoxide" },
  ],
  unit: ["ppb", "ppm", "mg/m³", "μg/m³"],
};

export const airQualityCarbonDioxideChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "ppm" },
  entity: [
    { domain: "input_number", unit_of_measurement: "ppm" },
    { domain: "sensor", device_class: "carbon_dioxide" },
    { domain: "number", device_class: "carbon_dioxide" },
  ],
};

export const airQualityCarbonDioxideCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "ppm" },
  entity: [
    { domain: "input_number", unit_of_measurement: "ppm" },
    { domain: "sensor", device_class: "carbon_dioxide" },
    { domain: "number", device_class: "carbon_dioxide" },
  ],
};

export const airQualityPm1Changed: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm1" },
    { domain: "number", device_class: "pm1" },
  ],
};

export const airQualityPm1Crossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm1" },
    { domain: "number", device_class: "pm1" },
  ],
};

export const airQualityPm25Changed: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm25" },
    { domain: "number", device_class: "pm25" },
  ],
};

export const airQualityPm25Crossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm25" },
    { domain: "number", device_class: "pm25" },
  ],
};

export const airQualityPm4Changed: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm4" },
    { domain: "number", device_class: "pm4" },
  ],
};

export const airQualityPm4Crossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm4" },
    { domain: "number", device_class: "pm4" },
  ],
};

export const airQualityPm10Changed: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm10" },
    { domain: "number", device_class: "pm10" },
  ],
};

export const airQualityPm10Crossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm10" },
    { domain: "number", device_class: "pm10" },
  ],
};

export const airQualityOzoneChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm", "μg/m³"] },
    { domain: "sensor", device_class: "ozone" },
    { domain: "number", device_class: "ozone" },
  ],
  unit: ["ppb", "ppm", "μg/m³"],
};

export const airQualityOzoneCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm", "μg/m³"] },
    { domain: "sensor", device_class: "ozone" },
    { domain: "number", device_class: "ozone" },
  ],
  unit: ["ppb", "ppm", "μg/m³"],
};

export const airQualityVolatileOrganicCompoundsChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["μg/m³", "mg/m³"] },
    { domain: "sensor", device_class: "volatile_organic_compounds" },
    { domain: "number", device_class: "volatile_organic_compounds" },
  ],
  unit: ["μg/m³", "mg/m³"],
};

export const airQualityVolatileOrganicCompoundsCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["μg/m³", "mg/m³"] },
    { domain: "sensor", device_class: "volatile_organic_compounds" },
    { domain: "number", device_class: "volatile_organic_compounds" },
  ],
  unit: ["μg/m³", "mg/m³"],
};

export const airQualityVolatileOrganicCompoundsPartsChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm"] },
    { domain: "sensor", device_class: "volatile_organic_compounds_parts" },
    { domain: "number", device_class: "volatile_organic_compounds_parts" },
  ],
  unit: ["ppb", "ppm"],
};

export const airQualityVolatileOrganicCompoundsPartsCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm"] },
    { domain: "sensor", device_class: "volatile_organic_compounds_parts" },
    { domain: "number", device_class: "volatile_organic_compounds_parts" },
  ],
  unit: ["ppb", "ppm"],
};

export const airQualityNitrogenMonoxideChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "μg/m³"] },
    { domain: "sensor", device_class: "nitrogen_monoxide" },
    { domain: "number", device_class: "nitrogen_monoxide" },
  ],
  unit: ["ppb", "μg/m³"],
};

export const airQualityNitrogenMonoxideCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "μg/m³"] },
    { domain: "sensor", device_class: "nitrogen_monoxide" },
    { domain: "number", device_class: "nitrogen_monoxide" },
  ],
  unit: ["ppb", "μg/m³"],
};

export const airQualityNitrogenDioxideChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm", "μg/m³"] },
    { domain: "sensor", device_class: "nitrogen_dioxide" },
    { domain: "number", device_class: "nitrogen_dioxide" },
  ],
  unit: ["ppb", "ppm", "μg/m³"],
};

export const airQualityNitrogenDioxideCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm", "μg/m³"] },
    { domain: "sensor", device_class: "nitrogen_dioxide" },
    { domain: "number", device_class: "nitrogen_dioxide" },
  ],
  unit: ["ppb", "ppm", "μg/m³"],
};

export const airQualityNitrousOxideChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "nitrous_oxide" },
    { domain: "number", device_class: "nitrous_oxide" },
  ],
};

export const airQualityNitrousOxideCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "nitrous_oxide" },
    { domain: "number", device_class: "nitrous_oxide" },
  ],
};

export const airQualitySulphurDioxideChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "μg/m³"] },
    { domain: "sensor", device_class: "sulphur_dioxide" },
    { domain: "number", device_class: "sulphur_dioxide" },
  ],
  unit: ["ppb", "μg/m³"],
};

export const airQualitySulphurDioxideCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "μg/m³"] },
    { domain: "sensor", device_class: "sulphur_dioxide" },
    { domain: "number", device_class: "sulphur_dioxide" },
  ],
  unit: ["ppb", "μg/m³"],
};

export const airQualityRadonChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["Bq/m³", "pCi/L"] },
    { domain: "sensor", device_class: "radon" },
    { domain: "number", device_class: "radon" },
  ],
  unit: ["Bq/m³", "pCi/L"],
};

export const airQualityRadonCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["Bq/m³", "pCi/L"] },
    { domain: "sensor", device_class: "radon" },
    { domain: "number", device_class: "radon" },
  ],
  unit: ["Bq/m³", "pCi/L"],
};

export const batteryBatteryChanged: ThresholdPreset = {
  mode: "changed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", device_class: "battery" },
    { domain: "sensor", device_class: "battery" },
  ],
};

export const batteryBatteryCrossed: ThresholdPreset = {
  mode: "crossed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", device_class: "battery" },
    { domain: "sensor", device_class: "battery" },
  ],
};

export const climateHumidityChanged: ThresholdPreset = {
  mode: "changed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "sensor", device_class: "humidity" },
    { domain: "number", device_class: "humidity" },
  ],
};

export const climateHumidityCrossed: ThresholdPreset = {
  mode: "crossed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "sensor", device_class: "humidity" },
    { domain: "number", device_class: "humidity" },
  ],
};

export const climateTemperatureChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["°C", "°F"] },
    { domain: "sensor", device_class: "temperature" },
    { domain: "number", device_class: "temperature" },
  ],
  unit: ["°C", "°F"],
};

export const climateTemperatureCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["°C", "°F"] },
    { domain: "sensor", device_class: "temperature" },
    { domain: "number", device_class: "temperature" },
  ],
  unit: ["°C", "°F"],
};

export const illuminanceIlluminanceChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box", unit_of_measurement: "lx" },
  entity: [
    { domain: "input_number", unit_of_measurement: "lx" },
    { domain: "sensor", device_class: "illuminance" },
    { domain: "number", device_class: "illuminance" },
  ],
};

export const illuminanceIlluminanceCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box", unit_of_measurement: "lx" },
  entity: [
    { domain: "input_number", unit_of_measurement: "lx" },
    { domain: "sensor", device_class: "illuminance" },
    { domain: "number", device_class: "illuminance" },
  ],
};

export const lightNumberChanged: ThresholdPreset = {
  mode: "changed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", unit_of_measurement: "%" },
    { domain: "sensor", unit_of_measurement: "%" },
  ],
};

export const lightNumberCrossed: ThresholdPreset = {
  mode: "crossed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", unit_of_measurement: "%" },
    { domain: "sensor", unit_of_measurement: "%" },
  ],
};

export const moistureMoistureChanged: ThresholdPreset = {
  mode: "changed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", device_class: "moisture" },
    { domain: "sensor", device_class: "moisture" },
  ],
};

export const moistureMoistureCrossed: ThresholdPreset = {
  mode: "crossed",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", device_class: "moisture" },
    { domain: "sensor", device_class: "moisture" },
  ],
};

export const powerPowerChanged: ThresholdPreset = {
  mode: "changed",
  number: { mode: "box" },
  entity: [
    {
      domain: "input_number",
      unit_of_measurement: ["mW", "W", "kW", "MW", "GW", "TW", "BTU/h"],
    },
    { domain: "sensor", device_class: "power" },
    { domain: "number", device_class: "power" },
  ],
  unit: ["mW", "W", "kW", "MW", "GW", "TW", "BTU/h"],
};

export const powerPowerCrossed: ThresholdPreset = {
  mode: "crossed",
  number: { mode: "box" },
  entity: [
    {
      domain: "input_number",
      unit_of_measurement: ["mW", "W", "kW", "MW", "GW", "TW", "BTU/h"],
    },
    { domain: "sensor", device_class: "power" },
    { domain: "number", device_class: "power" },
  ],
  unit: ["mW", "W", "kW", "MW", "GW", "TW", "BTU/h"],
};

export const sunNumberChanged: ThresholdPreset = {
  mode: "changed",
  number: {
    min: -90,
    max: 90,
    step: "any",
    mode: "slider",
    unit_of_measurement: "°",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "°" },
    { domain: "number", unit_of_measurement: "°" },
    { domain: "sensor", unit_of_measurement: "°" },
  ],
};

export const sunNumberCrossed: ThresholdPreset = {
  mode: "crossed",
  number: {
    min: -90,
    max: 90,
    step: "any",
    mode: "slider",
    unit_of_measurement: "°",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "°" },
    { domain: "number", unit_of_measurement: "°" },
    { domain: "sensor", unit_of_measurement: "°" },
  ],
};

export const airQualityCarbonMonoxideIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    {
      domain: "input_number",
      unit_of_measurement: ["ppb", "ppm", "mg/m³", "μg/m³"],
    },
    { domain: "sensor", device_class: "carbon_monoxide" },
    { domain: "number", device_class: "carbon_monoxide" },
  ],
  unit: ["ppb", "ppm", "mg/m³", "μg/m³"],
};

export const airQualityOzoneIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm", "μg/m³"] },
    { domain: "sensor", device_class: "ozone" },
    { domain: "number", device_class: "ozone" },
  ],
  unit: ["ppb", "ppm", "μg/m³"],
};

export const airQualityVolatileOrganicCompoundsIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["μg/m³", "mg/m³"] },
    { domain: "sensor", device_class: "volatile_organic_compounds" },
    { domain: "number", device_class: "volatile_organic_compounds" },
  ],
  unit: ["μg/m³", "mg/m³"],
};

export const airQualityVolatileOrganicCompoundsPartsIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm"] },
    { domain: "sensor", device_class: "volatile_organic_compounds_parts" },
    { domain: "number", device_class: "volatile_organic_compounds_parts" },
  ],
  unit: ["ppb", "ppm"],
};

export const airQualityNitrogenMonoxideIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "μg/m³"] },
    { domain: "sensor", device_class: "nitrogen_monoxide" },
    { domain: "number", device_class: "nitrogen_monoxide" },
  ],
  unit: ["ppb", "μg/m³"],
};

export const airQualityNitrogenDioxideIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "ppm", "μg/m³"] },
    { domain: "sensor", device_class: "nitrogen_dioxide" },
    { domain: "number", device_class: "nitrogen_dioxide" },
  ],
  unit: ["ppb", "ppm", "μg/m³"],
};

export const airQualitySulphurDioxideIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["ppb", "μg/m³"] },
    { domain: "sensor", device_class: "sulphur_dioxide" },
    { domain: "number", device_class: "sulphur_dioxide" },
  ],
  unit: ["ppb", "μg/m³"],
};

export const airQualityRadonIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["Bq/m³", "pCi/L"] },
    { domain: "sensor", device_class: "radon" },
    { domain: "number", device_class: "radon" },
  ],
  unit: ["Bq/m³", "pCi/L"],
};

export const airQualityCarbonDioxideIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box", unit_of_measurement: "ppm" },
  entity: [
    { domain: "input_number", unit_of_measurement: "ppm" },
    { domain: "sensor", device_class: "carbon_dioxide" },
    { domain: "number", device_class: "carbon_dioxide" },
  ],
};

export const airQualityPm1Is: ThresholdPreset = {
  mode: "is",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm1" },
    { domain: "number", device_class: "pm1" },
  ],
};

export const airQualityPm25Is: ThresholdPreset = {
  mode: "is",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm25" },
    { domain: "number", device_class: "pm25" },
  ],
};

export const airQualityPm4Is: ThresholdPreset = {
  mode: "is",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm4" },
    { domain: "number", device_class: "pm4" },
  ],
};

export const airQualityPm10Is: ThresholdPreset = {
  mode: "is",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "pm10" },
    { domain: "number", device_class: "pm10" },
  ],
};

export const airQualityNitrousOxideIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box", unit_of_measurement: "μg/m³" },
  entity: [
    { domain: "input_number", unit_of_measurement: "μg/m³" },
    { domain: "sensor", device_class: "nitrous_oxide" },
    { domain: "number", device_class: "nitrous_oxide" },
  ],
};

export const batteryBatteryIs: ThresholdPreset = {
  mode: "is",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "sensor", device_class: "battery" },
    { domain: "number", device_class: "battery" },
  ],
};

export const climateHumidityIs: ThresholdPreset = {
  mode: "is",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "sensor", device_class: "humidity" },
    { domain: "number", device_class: "humidity" },
  ],
};

export const climateTemperatureIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "input_number", unit_of_measurement: ["°C", "°F"] },
    { domain: "sensor", device_class: "temperature" },
    { domain: "number", device_class: "temperature" },
  ],
  unit: ["°C", "°F"],
};

export const counterNumberIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    { domain: "counter" },
    { domain: "input_number" },
    { domain: "number" },
  ],
};

export const illuminanceIlluminanceIs: ThresholdPreset = {
  mode: "is",
  number: { min: 0, mode: "box", unit_of_measurement: "lx" },
  entity: [
    { domain: "input_number", unit_of_measurement: "lx" },
    { domain: "sensor", device_class: "illuminance" },
    { domain: "number", device_class: "illuminance" },
  ],
};

export const lightNumberIs: ThresholdPreset = {
  mode: "is",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "number", unit_of_measurement: "%" },
    { domain: "sensor", unit_of_measurement: "%" },
  ],
};

export const moistureMoistureIs: ThresholdPreset = {
  mode: "is",
  number: {
    min: 0,
    max: 100,
    step: "any",
    mode: "slider",
    unit_of_measurement: "%",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "%" },
    { domain: "sensor", device_class: "moisture" },
    { domain: "number", device_class: "moisture" },
  ],
};

export const powerPowerIs: ThresholdPreset = {
  mode: "is",
  number: { mode: "box" },
  entity: [
    {
      domain: "input_number",
      unit_of_measurement: ["mW", "W", "kW", "MW", "GW", "TW", "BTU/h"],
    },
    { domain: "sensor", device_class: "power" },
    { domain: "number", device_class: "power" },
  ],
  unit: ["mW", "W", "kW", "MW", "GW", "TW", "BTU/h"],
};

export const sunNumberIs: ThresholdPreset = {
  mode: "is",
  number: {
    min: -90,
    max: 90,
    step: "any",
    mode: "slider",
    unit_of_measurement: "°",
  },
  entity: [
    { domain: "input_number", unit_of_measurement: "°" },
    { domain: "number", unit_of_measurement: "°" },
    { domain: "sensor", unit_of_measurement: "°" },
  ],
};

export const todoNumberIs: ThresholdPreset = {
  mode: "is",
  number: { min: 0, mode: "box" },
  entity: [
    { domain: "input_number" },
    { domain: "number" },
    { domain: "sensor" },
  ],
};
