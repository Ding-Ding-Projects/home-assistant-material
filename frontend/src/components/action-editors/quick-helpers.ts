import { hasTemplate } from "../../common/string/has-template";
import type {
  QuickContext,
  QuickControl,
  QuickEntity,
  QuickOption,
  QuickOptionField,
  QuickValueType,
} from "./quick-types";

/** Helpers every domain module builds its controls from. */

export const IGNORED_KEYS = new Set([
  "entity_id",
  "device_id",
  "area_id",
  "floor_id",
  "label_id",
]);

export const splitAction = (action: string): [string, string] => {
  const index = action.indexOf(".");
  return index === -1
    ? [action, ""]
    : [action.slice(0, index), action.slice(index + 1)];
};

export const hasFeature = (attributes: Record<string, any>, bit: number) =>
  Math.floor(Number(attributes.supported_features ?? 0) / bit) % 2 === 1;

/** Gate on the targeted entities. Unknown targets allow every declared control. */
export const anyEntity = (
  ctx: QuickContext,
  test: (entity: QuickEntity) => boolean
) => ctx.entities.length === 0 || ctx.entities.some(test);

export const attrList = (ctx: QuickContext, attribute: string): string[] => {
  const seen = new Set<string>();
  ctx.entities.forEach((entity) => {
    const list = entity.attributes[attribute];
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (typeof item === "string") seen.add(item);
      });
    }
  });
  return [...seen];
};

export const attrNumber = (
  ctx: QuickContext,
  attribute: string,
  fallback: number,
  pick: "min" | "max"
): number => {
  const values = ctx.entities
    .map((entity) => Number(entity.attributes[attribute]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return fallback;
  return pick === "min" ? Math.min(...values) : Math.max(...values);
};

/** The stored value when it can be edited visually; `null` when it cannot. */
export const scalar = <T extends string | number | boolean>(
  ctx: QuickContext,
  key: string,
  type: "number" | "string" | "boolean"
): T | undefined | null => {
  const value = ctx.data[key];
  if (value === undefined) return undefined;
  return typeof value === type && !hasTemplate(value) ? (value as T) : null;
};

export const claim = (ctx: QuickContext, key: string) => key in ctx.fields;

export const slider = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  min: number,
  max: number,
  step: number,
  extra: { scale?: number; unit?: string } = {}
): QuickControl | undefined => {
  const value = scalar<number>(ctx, key, "number");
  if (!claim(ctx, key) || value === null || min >= max) return undefined;
  return { kind: "slider", key, labelKey, min, max, step, value, ...extra };
};

export const stepper = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  min: number,
  max: number,
  step: number,
  unit?: string
): QuickControl | undefined => {
  const value = scalar<number>(ctx, key, "number");
  if (!claim(ctx, key) || value === null || min >= max) return undefined;
  return { kind: "stepper", key, labelKey, min, max, step, unit, value };
};

export const tiles = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  values: string[],
  optionLabelPrefix?: string
): QuickControl | undefined => {
  const value = scalar<string>(ctx, key, "string");
  if (!claim(ctx, key) || value === null || !values.length) return undefined;
  const options: QuickOption[] = values.map((item) => ({
    value: item,
    labelKey: optionLabelPrefix ? `${optionLabelPrefix}${item}` : undefined,
  }));
  // A stored value outside the known list stays visible and selected.
  if (value !== undefined && !values.includes(value)) {
    options.push({ value, labelKey: undefined });
  }
  return { kind: "tiles", key, labelKey, options, value };
};

/** Short lists become tiles, long lists a searchable list box. */
export const choice = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  values: string[],
  optionLabelPrefix?: string
): QuickControl | undefined => {
  if (values.length <= 8) {
    return tiles(ctx, key, labelKey, values, optionLabelPrefix);
  }
  const value = scalar<string>(ctx, key, "string");
  if (!claim(ctx, key) || value === null) return undefined;
  return {
    kind: "selector",
    key,
    labelKey,
    valueType: "list",
    selector: {
      select: {
        mode: "dropdown",
        options: values.map((item) => ({
          value: item,
          label: item.replace(/_/g, " "),
        })),
      },
    },
    value,
  };
};

export const toggle = (
  ctx: QuickContext,
  key: string,
  labelKey: string
): QuickControl | undefined => {
  const value = scalar<boolean>(ctx, key, "boolean");
  if (!claim(ctx, key) || value === null) return undefined;
  return { kind: "switch", key, labelKey, value };
};

export const textBox = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  extra: Partial<Extract<QuickControl, { kind: "text" }>> = {}
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (
    !claim(ctx, key) ||
    (value !== undefined &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean")
  ) {
    return undefined;
  }
  return { kind: "text", key, labelKey, value, ...extra };
};

export const temporal = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  kind: "time" | "date" | "datetime"
): QuickControl | undefined => {
  const value = scalar<string>(ctx, key, "string");
  return claim(ctx, key) && value !== null
    ? { kind, key, labelKey, value }
    : undefined;
};

export const duration = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  format?: "seconds" | "hms"
): QuickControl | undefined => {
  const raw = ctx.data[key];
  if (!claim(ctx, key)) return undefined;
  if (raw !== undefined && typeof raw !== "number" && typeof raw !== "string") {
    return undefined;
  }
  if (typeof raw === "string" && hasTemplate(raw)) return undefined;
  const stored: "seconds" | "hms" =
    format ?? (typeof raw === "string" ? "hms" : "seconds");
  return {
    kind: "duration",
    key,
    labelKey,
    format: typeof raw === "number" ? "seconds" : stored,
    value: raw as number | string | undefined,
  };
};

export const selector = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  config: Record<string, any>,
  valueType: QuickValueType,
  context?: Record<string, unknown>
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!claim(ctx, key) || hasTemplate(value)) return undefined;
  return {
    kind: "selector",
    key,
    labelKey,
    selector: config,
    valueType,
    value,
    ...(context ? { context } : {}),
  };
};

export const entityTiles = (
  ctx: QuickContext,
  key: string,
  labelKey: string,
  domain: string,
  multiple: boolean
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!claim(ctx, key) || hasTemplate(value)) return undefined;
  if (
    value !== undefined &&
    typeof value !== "string" &&
    !(Array.isArray(value) && value.every((item) => typeof item === "string"))
  ) {
    return undefined;
  }
  return {
    kind: "entities",
    key,
    labelKey,
    domain,
    multiple,
    value: value as string | string[] | undefined,
  };
};

export const notice = (
  key: string,
  labelKey: string,
  tone: "caution" | "info" = "info"
): QuickControl => ({ kind: "notice", key: `$${key}`, labelKey, tone });

export const compact = (list: (QuickControl | undefined)[]): QuickControl[] =>
  list.filter((item): item is QuickControl => item !== undefined);

export const L = (name: string) =>
  `ui.components.action-editors.fields.${name}`;

export const stateOf = (ctx: QuickContext) => ctx.entities[0]?.attributes ?? {};

export const optionField = (
  name: string,
  type: QuickOptionField["type"],
  extra: Partial<QuickOptionField> = {}
): QuickOptionField => ({ name, type, ...extra });

/** Text of the stored object value, when it is a plain dictionary. */
export const dictionary = (
  ctx: QuickContext,
  key: string
): Record<string, unknown> | undefined | null => {
  const value = ctx.data[key];
  if (value === undefined) return undefined;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};
