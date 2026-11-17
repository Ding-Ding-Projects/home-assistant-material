import { hasTemplate } from "../../../common/string/has-template";
import type {
  DeviceContext,
  DeviceEditorEntry,
  DeviceExtraField,
  DeviceAutomationKind,
  QuickControl,
  QuickEntity,
  QuickOption,
} from "../types";

/** Control builders for the extra fields of device automations. */

export const DL = (name: string) =>
  `ui.components.automation-editors.device-fields.${name}`;

const DOPT = "ui.components.automation-editors.device-options.";

const plain = (value: unknown): boolean => !hasTemplate(value);

const firstEntity = (ctx: DeviceContext): QuickEntity | undefined =>
  ctx.entities[0];

/** Hold time, stored as the dictionary or `H:MM:SS` text the editor found. */
export const dFor = (): DeviceExtraField => ({
  key: "for",
  build: (ctx) => {
    const raw = ctx.data.for;
    if (raw !== undefined && !plain(raw)) return undefined;
    if (raw !== null && typeof raw === "object") {
      return {
        kind: "selector",
        key: "for",
        labelKey: DL("for"),
        selector: { duration: {} },
        valueType: "duration",
        value: raw,
      };
    }
    return {
      kind: "duration",
      key: "for",
      labelKey: DL("for"),
      format: typeof raw === "number" ? "seconds" : "hms",
      value: raw as string | number | undefined,
    };
  },
});

/** A bounded whole number such as a position or a humidity, as a slider. */
export const dSlider = (
  key: string,
  min: number,
  max: number,
  types?: string[],
  unit?: string
): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (value !== undefined && typeof value !== "number") return undefined;
    return {
      kind: "slider",
      key,
      labelKey: DL(key),
      min,
      max,
      step: 1,
      unit,
      value,
    };
  },
});

/** A number with no fixed range; the unit comes from the sensor, if known. */
export const dNumber = (
  key: string,
  types?: string[],
  min = -1000000000,
  max = 1000000000,
  step = 0.1
): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (value !== undefined && typeof value !== "number") return undefined;
    const unit = firstEntity(ctx)?.attributes.unit_of_measurement;
    return {
      kind: "stepper",
      key,
      labelKey: DL(key),
      min,
      max,
      step,
      unit: typeof unit === "string" ? unit : undefined,
      value,
    };
  },
});

export const dInteger = (
  key: string,
  min: number,
  max: number,
  types?: string[]
): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (value !== undefined && typeof value !== "number") return undefined;
    return {
      kind: "stepper",
      key,
      labelKey: DL(key),
      min,
      max,
      step: 1,
      value,
    };
  },
});

/** Fixed list of choices as tiles. */
export const dTiles = (
  key: string,
  values: string[],
  types?: string[]
): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (value !== undefined && typeof value !== "string") return undefined;
    const options: QuickOption[] = values.map((item) => ({
      value: item,
      labelKey: `${DOPT}${key}__${item}`,
    }));
    if (value !== undefined && !values.includes(value) && plain(value)) {
      options.push({ value, label: value });
    }
    return { kind: "tiles", key, labelKey: DL(key), options, value };
  },
});

/**
 * A choice among the values the entity itself reports, such as `options`,
 * `preset_modes` or `available_modes`. Tiles when the entity is known and
 * the list is short, a text box otherwise.
 */
export const dFromAttribute = (
  key: string,
  attribute: string,
  types?: string[]
): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (value !== undefined && typeof value !== "string") return undefined;
    const list = firstEntity(ctx)?.attributes[attribute];
    if (Array.isArray(list) && list.length > 0 && list.length <= 10) {
      const values = list.filter((item) => typeof item === "string");
      const options: QuickOption[] = values.map((item: string) => ({
        value: item,
        label: item,
      }));
      if (value !== undefined && !values.includes(value)) {
        options.push({ value, label: value });
      }
      return { kind: "tiles", key, labelKey: DL(key), options, value };
    }
    return { kind: "text", key, labelKey: DL(key), value };
  },
});

export const dText = (
  key: string,
  types?: string[],
  extra: { multiline?: boolean; password?: boolean; max?: number } = {}
): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (
      value !== undefined &&
      typeof value !== "string" &&
      typeof value !== "number"
    ) {
      return undefined;
    }
    const maxLength = extra.max ?? Number(firstEntity(ctx)?.attributes.max);
    return {
      kind: "text",
      key,
      labelKey: DL(key),
      value,
      multiline: extra.multiline,
      ...(extra.password ? { inputType: "password" } : {}),
      ...(Number.isFinite(maxLength) && maxLength > 0
        ? { maxLength, showCount: true }
        : {}),
    };
  },
});

export const dSwitch = (key: string, types?: string[]): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (value !== undefined && typeof value !== "boolean") return undefined;
    return { kind: "switch", key, labelKey: DL(key), value };
  },
});

export const dObject = (key: string, types?: string[]): DeviceExtraField => ({
  key,
  types,
  build: (ctx) => {
    const value = ctx.data[key];
    if (!plain(value)) return undefined;
    return {
      kind: "selector",
      key,
      labelKey: DL(key),
      selector: { object: {} },
      valueType: "object",
      value,
    };
  },
});

export const dZone = (types?: string[]): DeviceExtraField => ({
  key: "zone",
  types,
  build: (ctx) => {
    const value = ctx.data.zone;
    if (value !== undefined && typeof value !== "string") return undefined;
    return {
      kind: "entities",
      key: "zone",
      labelKey: DL("zone"),
      domain: "zone",
      multiple: false,
      value,
    };
  },
});

export interface DeviceSpec {
  entityDomain?: string;
  /** `static` only when the integration's source lists every type. */
  types?: string[];
  subtype?: boolean;
  extra?: DeviceExtraField[];
}

export const device = (
  domain: string,
  kind: DeviceAutomationKind,
  spec: DeviceSpec = {}
): [string, DeviceEditorEntry] => [
  `${domain}.${kind}`,
  {
    domain,
    kind,
    entityDomain: spec.entityDomain,
    typeSource: spec.types && spec.types.length > 0 ? "static" : "device",
    types: spec.types ?? [],
    subtype: spec.subtype ?? false,
    extra: spec.extra ?? [],
  },
];

/** The extra controls that apply to the picked type. */
export const deviceControls = (
  entry: DeviceEditorEntry,
  ctx: DeviceContext
): QuickControl[] =>
  entry.extra
    .filter(
      (field) =>
        !field.types ||
        field.types.length === 0 ||
        (ctx.type !== undefined && field.types.includes(ctx.type))
    )
    .map((field) => field.build(ctx))
    .filter((control): control is QuickControl => control !== undefined);
