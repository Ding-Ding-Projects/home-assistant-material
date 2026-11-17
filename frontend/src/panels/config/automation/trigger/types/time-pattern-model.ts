export const TIME_PATTERN_UNITS = ["hours", "minutes", "seconds"] as const;

export type TimePatternUnit = (typeof TIME_PATTERN_UNITS)[number];

export type TimePatternMode = "any" | "every" | "at" | "custom";

export interface TimePatternField {
  mode: TimePatternMode;
  /** Number for "every" and "at", free text for "custom". */
  value?: number | string;
}

export const TIME_PATTERN_MAX: Record<TimePatternUnit, number> = {
  hours: 23,
  minutes: 59,
  seconds: 59,
};

type RawValue = string | number | undefined | null;

/** Read one stored value into the mode and value the editor shows. */
export const parseTimePatternValue = (raw: RawValue): TimePatternField => {
  if (raw === undefined || raw === null || raw === "" || raw === "*") {
    return { mode: "any" };
  }
  if (typeof raw === "number") {
    return { mode: "at", value: raw };
  }
  const every = /^\/(\d+)$/.exec(raw);
  if (every) {
    return { mode: "every", value: Number(every[1]) };
  }
  if (/^\d+$/.test(raw)) {
    return { mode: "at", value: Number(raw) };
  }
  return { mode: "custom", value: raw };
};

/**
 * Turn an editor field back into the stored value. Returns undefined when the
 * key should be left out.
 */
export const serializeTimePatternField = (
  field: TimePatternField
): string | undefined => {
  switch (field.mode) {
    case "every":
      return field.value === undefined || field.value === ""
        ? undefined
        : `/${Number(field.value)}`;
    case "at":
      return field.value === undefined || field.value === ""
        ? undefined
        : String(Number(field.value));
    case "custom":
      return field.value === undefined || field.value === ""
        ? undefined
        : String(field.value);
    default:
      return undefined;
  }
};

/** The flat object ha-form shows. */
export const toTimePatternFormData = (
  trigger: Partial<Record<TimePatternUnit, RawValue>>
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (const unit of TIME_PATTERN_UNITS) {
    const field = parseTimePatternValue(trigger[unit]);
    data[`${unit}_mode`] = field.mode;
    if (field.mode === "custom") {
      data[`${unit}_expression`] = field.value;
    } else if (field.value !== undefined) {
      data[`${unit}_value`] = field.value;
    }
  }
  return data;
};

/**
 * Apply a changed form value to the trigger. Units the form did not change keep
 * their stored value exactly as it was.
 */
export const applyTimePatternFormData = <
  T extends Partial<Record<TimePatternUnit, RawValue>>,
>(
  trigger: T,
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): T => {
  const result: Record<string, unknown> = { ...trigger };
  for (const unit of TIME_PATTERN_UNITS) {
    const keys = [`${unit}_mode`, `${unit}_value`, `${unit}_expression`];
    if (keys.every((key) => previous[key] === next[key])) {
      continue;
    }
    const mode = (next[keys[0]] as TimePatternMode | undefined) ?? "any";
    let value: number | string | undefined;
    if (mode === "custom") {
      value = (next[keys[2]] as string | undefined) ?? undefined;
    } else if (mode !== "any") {
      value = (next[keys[1]] as number | undefined) ?? 0;
    }
    const stored = serializeTimePatternField({ mode, value });
    if (stored === undefined) {
      delete result[unit];
    } else {
      result[unit] = stored;
    }
  }
  return result as T;
};
