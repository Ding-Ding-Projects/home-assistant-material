import type { HassEntities } from "home-assistant-js-websocket";
import { UNKNOWN, UNAVAILABLE } from "../../data/entity/entity";
import type { NumberSelector } from "../../data/selector";

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const numberActionInputValue = (value: unknown): number | undefined => {
  if (finiteNumber(value)) return value;
  if (
    typeof value === "string" &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
  ) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/** Presentation metadata only; never coerce, clamp, or rewrite action data. */
export const numberActionValueSelector = (
  entityIds: readonly string[] | null | undefined,
  states: HassEntities,
  value?: unknown
): NumberSelector => {
  const number: NonNullable<NumberSelector["number"]> = {
    mode: "box",
    // Core accepts floats within the range, without enforcing the device step.
    step: "any",
  };
  const ids = [...new Set(entityIds)];
  if (!ids.length) return { number };
  const entities = ids.map((id) => states[id]);
  if (
    ids.some((id) => !id.startsWith("number.")) ||
    entities.some(
      (entity) =>
        !entity || entity.state === UNAVAILABLE || entity.state === UNKNOWN
    )
  ) {
    return { number };
  }
  const attributes = entities.map((entity) => entity.attributes);
  const unit = attributes[0].unit_of_measurement;
  if (
    typeof unit === "string" &&
    unit.length > 0 &&
    attributes.every((entry) => entry.unit_of_measurement === unit)
  ) {
    number.unit_of_measurement = unit;
  }
  if (
    attributes.some(
      ({ min, max }) => !finiteNumber(min) || !finiteNumber(max) || min > max
    )
  ) {
    return { number };
  }
  const min = Math.max(...attributes.map((entry) => entry.min));
  const max = Math.min(...attributes.map((entry) => entry.max));
  if (min > max) return { number };
  number.min = min;
  number.max = max;

  // Several targets can share bounds without sharing an input grid or mode.
  if (attributes.length !== 1 || value === undefined) return { number };
  const { step, mode } = attributes[0];
  const range = max - min;
  if (
    !finiteNumber(step) ||
    step <= 0 ||
    !Number.isFinite(range) ||
    range <= 0 ||
    step > range ||
    !Number.isFinite(range / step) ||
    !(mode === "slider" || (mode === "auto" && range / step <= 256))
  ) {
    return { number };
  }
  const parsed = numberActionInputValue(value);
  if (parsed === undefined || parsed < min || parsed > max) return { number };
  const offset = (parsed - min) / step;
  // Keep off-grid historical values editable with Core's float semantics.
  if (
    !Number.isSafeInteger(Math.round(offset)) ||
    Math.abs(offset - Math.round(offset)) >
      Number.EPSILON * Math.max(1, Math.abs(offset)) * 4
  ) {
    return { number };
  }
  number.mode = "slider";
  number.step = step;
  return { number };
};
