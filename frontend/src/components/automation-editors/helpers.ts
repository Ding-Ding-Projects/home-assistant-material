import { hasTemplate } from "../../common/string/has-template";
import type {
  AutomationEditorContext,
  AutomationEditorEntry,
  AutomationGroup,
  AutomationKind,
  QuickControl,
  QuickOption,
  QuickValueType,
  ThresholdPreset,
} from "./types";

/** Builders every trigger, condition and device editor is made from. */

export const L = (name: string) =>
  `ui.components.automation-editors.fields.${name}`;

export const OPTION_PREFIX = "ui.components.automation-editors.options.";

/** Whether the description declares the field, or is not known at all. */
export const has = (ctx: AutomationEditorContext, key: string): boolean =>
  Object.keys(ctx.fields).length === 0 || key in ctx.fields;

export const compact = (list: (QuickControl | undefined)[]): QuickControl[] =>
  list.filter((item): item is QuickControl => item !== undefined);

/** A stored value that is a template can only be edited as text. */
const editable = (value: unknown) => !hasTemplate(value);

const selectorControl = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  selector: Record<string, unknown>,
  valueType: QuickValueType,
  context?: Record<string, unknown>
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!has(ctx, key) || !editable(value)) return undefined;
  return {
    kind: "selector",
    key,
    labelKey,
    selector,
    valueType,
    value,
    ...(context ? { context } : {}),
  };
};

/** How a trigger or condition acts on several targeted entities. */
export const behavior = (
  ctx: AutomationEditorContext
): QuickControl | undefined =>
  selectorControl(
    ctx,
    "behavior",
    L("common__behavior"),
    { automation_behavior: { mode: ctx.kind } },
    "other"
  );

/** Keys the editor hides because they only matter for several entities. */
export const hiddenKeys = (ctx: AutomationEditorContext): string[] =>
  ctx.targetEntityCount !== undefined && ctx.targetEntityCount <= 1
    ? ["behavior"]
    : [];

/** The `for` hold time: a duration control in the form the YAML stores. */
export const holdFor = (
  ctx: AutomationEditorContext,
  key = "for",
  labelKey = L("common__for")
): QuickControl | undefined => {
  const raw = ctx.data[key];
  if (!has(ctx, key)) return undefined;
  if (raw !== undefined && !editable(raw)) return undefined;
  if (raw !== null && typeof raw === "object") {
    return selectorControl(ctx, key, labelKey, { duration: {} }, "duration");
  }
  if (raw !== undefined && typeof raw !== "string" && typeof raw !== "number") {
    return undefined;
  }
  return {
    kind: "duration",
    key,
    labelKey,
    format: typeof raw === "number" ? "seconds" : "hms",
    value: raw as string | number | undefined,
  };
};

/** A time shift before or after an event, which may be negative. */
export const offset = (
  ctx: AutomationEditorContext
): QuickControl | undefined =>
  selectorControl(
    ctx,
    "offset",
    L("common__offset"),
    { duration: { enable_day: true, mode: "offset" } },
    "duration"
  );

/**
 * A plain duration that must be set, such as the time left on a timer. The
 * backend validates it as a duration mapping (hours, minutes, seconds) and
 * refuses a text such as 0:05:00, so it is always edited as a mapping.
 */
export const durationField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string
): QuickControl | undefined => {
  const raw = ctx.data[key];
  if (raw === undefined || (raw !== null && typeof raw === "object")) {
    return selectorControl(ctx, key, labelKey, { duration: {} }, "duration");
  }
  return holdFor(ctx, key, labelKey);
};

export const threshold = (
  ctx: AutomationEditorContext,
  preset: ThresholdPreset
): QuickControl | undefined =>
  selectorControl(
    ctx,
    "threshold",
    L("common__threshold"),
    {
      numeric_threshold: {
        entity: preset.entity,
        mode: preset.mode,
        number: preset.number,
        // The selector and the backend both want the allowed units as a list.
        ...(preset.unit ? { unit_of_measurement: [preset.unit].flat() } : {}),
      },
    },
    "other"
  );

const optionList = (values: string[], prefix: string): QuickOption[] =>
  values.map((value) => ({
    value,
    labelKey: `${OPTION_PREFIX}${prefix}${value}`,
  }));

/** A short fixed list as tiles, a long one as a searchable list box. */
export const choice = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  values: string[],
  prefix: string,
  maxTiles = 10
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!has(ctx, key) || !editable(value)) return undefined;
  if (value !== undefined && typeof value !== "string") return undefined;
  if (values.length <= maxTiles) {
    const options = optionList(values, prefix);
    if (value !== undefined && !values.includes(value)) {
      options.push({ value });
    }
    return { kind: "tiles", key, labelKey, options, value };
  }
  return {
    kind: "selector",
    key,
    labelKey,
    valueType: "list",
    selector: {
      select: {
        mode: "dropdown",
        sort: true,
        options: values.map((item) => ({ value: item, label: item })),
      },
    },
    value,
  };
};

/** Several fixed values at once, shown as a list the person ticks. */
export const multiChoice = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  values: string[],
  prefix: string
): QuickControl | undefined =>
  selectorControl(
    ctx,
    key,
    labelKey,
    {
      select: {
        multiple: true,
        mode: "list",
        options: values.map((value) => ({
          value,
          label: `${OPTION_PREFIX}${prefix}${value}`,
        })),
      },
    },
    "list"
  );

/**
 * One or several states of the targeted entities, read from their real
 * state list or from an attribute list such as `available_modes`.
 */
export const stateChoice = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  attribute?: string
): QuickControl | undefined =>
  selectorControl(
    ctx,
    key,
    labelKey,
    {
      state: {
        ...(attribute ? { attribute } : {}),
        hide_states: ["unavailable", "unknown"],
        multiple: true,
      },
    },
    "list",
    { filter_target: ctx.target, target_selector: ctx.targetSelector }
  );

export const textField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  extra: { multiple?: boolean; password?: boolean } = {}
): QuickControl | undefined => {
  if (extra.multiple) {
    return selectorControl(
      ctx,
      key,
      labelKey,
      { text: { multiple: true } },
      "list"
    );
  }
  const value = ctx.data[key];
  if (!has(ctx, key)) return undefined;
  if (
    value !== undefined &&
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return undefined;
  }
  return {
    kind: "text",
    key,
    labelKey,
    value,
    ...(extra.password ? { inputType: "password" } : {}),
  };
};

export const switchField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!has(ctx, key)) return undefined;
  if (value !== undefined && typeof value !== "boolean") return undefined;
  return { kind: "switch", key, labelKey, value };
};

export const stepperField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  min = 0,
  max = 1000000,
  step = 1
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!has(ctx, key)) return undefined;
  if (value !== undefined && typeof value !== "number") return undefined;
  return { kind: "stepper", key, labelKey, min, max, step, value };
};

export const objectField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string
): QuickControl | undefined =>
  selectorControl(ctx, key, labelKey, { object: {} }, "object");

export const deviceField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  integration: string
): QuickControl | undefined =>
  selectorControl(
    ctx,
    key,
    labelKey,
    { device: { filter: [{ integration }], multiple: true } },
    "list"
  );

export const entityField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  filter: Record<string, unknown>,
  multiple: boolean
): QuickControl | undefined =>
  selectorControl(
    ctx,
    key,
    labelKey,
    { entity: { filter: [filter], multiple } },
    "entity"
  );

/** Zones are picked with the entity control, never typed. */
export const zoneField = (
  ctx: AutomationEditorContext,
  key = "zone",
  labelKey = L("common__zone")
): QuickControl | undefined => {
  const value = ctx.data[key];
  if (!has(ctx, key) || !editable(value)) return undefined;
  if (value !== undefined && typeof value !== "string") return undefined;
  return {
    kind: "entities",
    key,
    labelKey,
    domain: "zone",
    multiple: false,
    value: value as string | undefined,
  };
};

export const configEntryField = (
  ctx: AutomationEditorContext,
  key: string,
  labelKey: string,
  integration: string
): QuickControl | undefined =>
  selectorControl(
    ctx,
    key,
    labelKey,
    { config_entry: { integration } },
    "other"
  );

/** Build one catalogue entry. `for` and `offset` stay collapsed. */
export const entry = (
  kind: AutomationKind,
  id: string,
  group: AutomationGroup,
  target: Record<string, unknown> | null,
  controls: (ctx: AutomationEditorContext) => (QuickControl | undefined)[],
  advanced: string[] = []
): AutomationEditorEntry => ({
  id,
  kind,
  group,
  target,
  advanced,
  controls: (ctx) => compact(controls(ctx)),
});

/** Every option key an entry can show, in display order. */
export const entryKeys = (item: AutomationEditorEntry): string[] =>
  item
    .controls({
      kind: item.kind,
      id: item.id,
      data: {},
      fields: {},
      entities: [],
    })
    .map((control) => control.key);

/** Split an entry's controls into the main list and the collapsed one. */
export const splitAdvanced = (
  item: AutomationEditorEntry,
  controls: QuickControl[]
): { main: QuickControl[]; advanced: QuickControl[] } => ({
  main: controls.filter((control) => !item.advanced.includes(control.key)),
  advanced: controls.filter((control) => item.advanced.includes(control.key)),
});

export const HVAC_MODES = [
  "off",
  "heat",
  "cool",
  "heat_cool",
  "auto",
  "dry",
  "fan_only",
];
