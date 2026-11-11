/**
 * The logic behind the practise control of `ha-setting-info`.
 *
 * Everything here is a pure function of its inputs. Nothing reads or writes
 * storage, the network or the Home Assistant connection: the practise control
 * is a sandbox, and the only state it keeps lives in the open panel.
 */

/** A pair that shows what a given input produces. */
export interface SettingInfoExample {
  /** What a person would type or choose, already localized. */
  input: string;
  /** What the setting does with it, already localized. */
  result: string;
}

/** How a practise text value is checked. */
export type PractiseTextRule =
  | {
      kind: "pattern";
      /** A regular expression source, matched against the whole value. */
      pattern: string;
      flags?: string;
    }
  | {
      kind: "length";
      min?: number;
      max?: number;
    };

export interface PractiseSwitchSpec {
  type: "switch";
  initial?: boolean;
}

export interface PractiseNumberSpec {
  type: "number";
  min: number;
  max: number;
  step?: number;
  initial?: number;
  /** A unit shown beside the value, already localized. */
  unit?: string;
}

export interface PractiseTextSpec {
  type: "text";
  rule: PractiseTextRule;
  initial?: string;
  /** A short hint about the expected shape, already localized. */
  placeholder?: string;
}

export type PractiseSpec =
  PractiseSwitchSpec | PractiseNumberSpec | PractiseTextSpec;

/**
 * The reason behind a result. The component turns a code into a localized
 * sentence, so this module never holds any wording of its own.
 */
export type PractiseCode =
  | "switch_on"
  | "switch_off"
  | "number_ok"
  | "number_clamped_min"
  | "number_clamped_max"
  | "number_snapped"
  | "number_invalid"
  | "text_ok"
  | "text_empty"
  | "text_pattern"
  | "text_too_short"
  | "text_too_long"
  | "text_rule_broken";

export interface PractiseResult {
  /** `ok` is accepted as typed, `adjusted` was changed to fit, `invalid` was refused. */
  state: "ok" | "adjusted" | "invalid";
  code: PractiseCode;
  /** The value the real control would hold after this input. */
  value: boolean | number | string;
  /** Values for the placeholders of the localized message. */
  params: Record<string, string>;
}

/** Number of decimals in a step, so snapping does not leave float noise. */
const decimalsOf = (step: number): number => {
  const text = String(step);
  if (text.includes("e-")) {
    return Number(text.split("e-")[1]);
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
};

/** Pulls a value into the range. A reversed range is treated as swapped. */
export const clampNumber = (
  value: number,
  min: number,
  max: number
): number => {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(high, Math.max(low, value));
};

/** Moves a value onto the nearest step counted from `min`. */
export const snapToStep = (
  value: number,
  min: number,
  step: number
): number => {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }
  const steps = Math.round((value - min) / step);
  return Number((min + steps * step).toFixed(decimalsOf(step)));
};

export const evaluateSwitch = (checked: boolean): PractiseResult => ({
  state: "ok",
  code: checked ? "switch_on" : "switch_off",
  value: checked,
  params: {},
});

/**
 * Checks a number the way the real control would: text that is not a number
 * is refused, anything outside the range is pulled to the nearest end, and a
 * value between steps moves to the nearest step.
 */
export const evaluateNumber = (
  spec: PractiseNumberSpec,
  raw: number | string
): PractiseResult => {
  const min = Math.min(spec.min, spec.max);
  const max = Math.max(spec.min, spec.max);
  const params = { min: String(min), max: String(max) };
  const text = typeof raw === "string" ? raw.trim() : raw;
  const parsed = typeof text === "string" ? Number(text) : text;
  if (text === "" || !Number.isFinite(parsed)) {
    return {
      state: "invalid",
      code: "number_invalid",
      value: clampNumber(spec.initial ?? min, min, max),
      params,
    };
  }
  const clamped = clampNumber(parsed, min, max);
  if (clamped !== parsed) {
    return {
      state: "adjusted",
      code: parsed < min ? "number_clamped_min" : "number_clamped_max",
      value: clamped,
      params: { ...params, entered: String(parsed), value: String(clamped) },
    };
  }
  const snapped = clampNumber(
    snapToStep(clamped, min, spec.step ?? 1),
    min,
    max
  );
  if (snapped !== clamped) {
    return {
      state: "adjusted",
      code: "number_snapped",
      value: snapped,
      params: { ...params, entered: String(parsed), value: String(snapped) },
    };
  }
  return {
    state: "ok",
    code: "number_ok",
    value: clamped,
    params: { ...params, value: String(clamped) },
  };
};

/** Checks text against the rule of the spec. Never throws. */
export const evaluateText = (
  spec: PractiseTextSpec,
  raw: string
): PractiseResult => {
  const value = raw;
  const rule = spec.rule;
  if (value.trim() === "") {
    return { state: "invalid", code: "text_empty", value, params: {} };
  }
  if (rule.kind === "length") {
    const length = [...value].length;
    const params = {
      min: String(rule.min ?? 0),
      max: rule.max === undefined ? "" : String(rule.max),
      length: String(length),
    };
    if (rule.min !== undefined && length < rule.min) {
      return { state: "invalid", code: "text_too_short", value, params };
    }
    if (rule.max !== undefined && length > rule.max) {
      return { state: "invalid", code: "text_too_long", value, params };
    }
    return { state: "ok", code: "text_ok", value, params };
  }
  let expression: RegExp;
  try {
    expression = new RegExp(`^(?:${rule.pattern})$`, rule.flags);
  } catch (_err) {
    // A page gave a rule that is not a valid expression. Say so rather than
    // letting the sandbox accept or refuse everything by accident.
    return { state: "invalid", code: "text_rule_broken", value, params: {} };
  }
  return expression.test(value)
    ? { state: "ok", code: "text_ok", value, params: {} }
    : { state: "invalid", code: "text_pattern", value, params: {} };
};

/** The value the practise control starts with. */
export const initialPractiseValue = (
  spec: PractiseSpec
): boolean | number | string => {
  switch (spec.type) {
    case "switch":
      return spec.initial ?? false;
    case "number":
      return clampNumber(spec.initial ?? spec.min, spec.min, spec.max);
    default:
      return spec.initial ?? "";
  }
};

/** Judges a value for whichever control type the spec names. */
export const evaluatePractise = (
  spec: PractiseSpec,
  value: boolean | number | string
): PractiseResult => {
  switch (spec.type) {
    case "switch":
      return evaluateSwitch(Boolean(value));
    case "number":
      return evaluateNumber(spec, typeof value === "boolean" ? "" : value);
    default:
      return evaluateText(spec, String(value));
  }
};

/** Keeps only examples that have both parts, so a page cannot show a blank row. */
export const usableExamples = (
  examples: readonly SettingInfoExample[] | undefined
): SettingInfoExample[] =>
  (examples ?? []).filter((item) => item.input !== "" && item.result !== "");
