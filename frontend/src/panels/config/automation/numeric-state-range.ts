import { ensureArray } from "../../../common/array/ensure-array";
import { computeDomain } from "../../../common/entity/compute_domain";
import type { HomeAssistant } from "../../../types";

export interface NumericStateRange {
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const ATTRIBUTE_RANGES: Record<string, (attrs: Record<string, any>) => any> = {
  brightness: () => ({ min: 0, max: 255, step: 1 }),
  battery_level: () => ({ min: 0, max: 100, step: 1, unit: "%" }),
  percentage: () => ({ min: 0, max: 100, step: 1, unit: "%" }),
  current_position: () => ({ min: 0, max: 100, step: 1, unit: "%" }),
  current_tilt_position: () => ({ min: 0, max: 100, step: 1, unit: "%" }),
  volume_level: () => ({ min: 0, max: 1, step: 0.01 }),
  humidity: (attrs) => ({
    min: Number(attrs.min_humidity ?? 0),
    max: Number(attrs.max_humidity ?? 100),
    step: 1,
    unit: "%",
  }),
  target_humidity: (attrs) => ({
    min: Number(attrs.min_humidity ?? 0),
    max: Number(attrs.max_humidity ?? 100),
    step: 1,
    unit: "%",
  }),
  temperature: (attrs) =>
    attrs.min_temp !== undefined && attrs.max_temp !== undefined
      ? {
          min: Number(attrs.min_temp),
          max: Number(attrs.max_temp),
          step: Number(attrs.target_temp_step ?? 0.5),
        }
      : undefined,
  current_temperature: (attrs) =>
    attrs.min_temp !== undefined && attrs.max_temp !== undefined
      ? {
          min: Number(attrs.min_temp),
          max: Number(attrs.max_temp),
          step: 0.1,
        }
      : undefined,
};

const PERCENT_CLASSES = new Set(["battery", "humidity", "moisture"]);

const entityRange = (
  hass: HomeAssistant,
  entityId: string,
  attribute?: string
): NumericStateRange | undefined => {
  const stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const attrs = stateObj.attributes;
  let range: Partial<NumericStateRange> | undefined;
  if (attribute) {
    range = ATTRIBUTE_RANGES[attribute]?.(attrs);
  } else {
    const domain = computeDomain(entityId);
    if (domain === "number" || domain === "input_number") {
      range = {
        min: Number(attrs.min),
        max: Number(attrs.max),
        step: Number(attrs.step ?? 1),
        unit: attrs.unit_of_measurement,
      };
    } else if (
      domain === "sensor" &&
      (PERCENT_CLASSES.has(String(attrs.device_class)) ||
        attrs.unit_of_measurement === "%")
    ) {
      range = { min: 0, max: 100, step: 1, unit: "%" };
    }
  }
  if (
    !range ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    (range.max as number) <= (range.min as number)
  ) {
    return undefined;
  }
  return {
    min: range.min as number,
    max: range.max as number,
    step: range.step && range.step > 0 ? range.step : 1,
    unit: range.unit,
  };
};

/**
 * The range a numeric state threshold can take for the chosen entities and
 * attribute, so a threshold can be a slider with the entity's own limits.
 * Returns undefined unless every chosen entity reports one.
 */
export const numericStateRange = (
  hass: HomeAssistant,
  entityIds: string | string[] | undefined,
  attribute?: string
): NumericStateRange | undefined => {
  const ids = ensureArray(entityIds).filter(Boolean);
  if (!ids.length) return undefined;
  const ranges = ids.map((id) => entityRange(hass, id, attribute));
  if (ranges.some((range) => !range)) return undefined;
  const all = ranges as NumericStateRange[];
  return {
    min: Math.min(...all.map((range) => range.min)),
    max: Math.max(...all.map((range) => range.max)),
    step: Math.min(...all.map((range) => range.step)),
    unit: all.every((range) => range.unit === all[0].unit)
      ? all[0].unit
      : undefined,
  };
};

/** The number selector a threshold uses: a slider when a range is known. */
export const thresholdNumberSelector = (range?: NumericStateRange) =>
  range
    ? {
        number: {
          mode: "slider" as const,
          min: range.min,
          max: range.max,
          step: range.step,
          ...(range.unit ? { unit_of_measurement: range.unit } : {}),
        },
      }
    : {
        number: {
          mode: "box" as const,
          min: Number.MIN_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
          step: 0.1,
        },
      };
