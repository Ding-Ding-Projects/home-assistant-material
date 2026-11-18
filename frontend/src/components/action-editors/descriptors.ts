import { CLIMATE_EDITORS } from "./domains/climate";
import { HELPER_EDITORS } from "./domains/helpers";
import { HOUSE_EDITORS } from "./domains/house";
import { LIGHTING_EDITORS } from "./domains/lighting";
import { MEDIA_EDITORS } from "./domains/media";
import { INTEGRATION_EDITORS_A } from "./domains/integrations/a";
import { INTEGRATION_EDITORS_B } from "./domains/integrations/b";
import { INTEGRATION_EDITORS_BAMBU } from "./domains/integrations/bambu";
import { INTEGRATION_EDITORS_C } from "./domains/integrations/c";
import {
  INTEGRATION_EDITORS_D,
  ONKYO_MEDIA_PLAYER_CONTROLS,
} from "./domains/integrations/d";
import { INTEGRATION_EDITORS_E } from "./domains/integrations/e";
import { INTEGRATION_EDITORS_F } from "./domains/integrations/f";
import { SYSTEM_EDITORS } from "./domains/system";
import {
  compact,
  hasFeature,
  IGNORED_KEYS,
  L,
  notice,
  scalar,
  slider,
  splitAction,
  stepper,
  tiles,
  toggle,
} from "./quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
  QuickFieldInfo,
} from "./quick-types";

/**
 * Pure description of the rich controls shown for one action. Nothing here
 * touches the DOM: the element renders the list, and tests exercise it with
 * fake state objects. The per-domain builders live in `./domains/`.
 */

export type {
  DomainEditor,
  QuickColor,
  QuickContext,
  QuickControl,
  QuickEngineInfo,
  QuickEntity,
  QuickFieldInfo,
  QuickOption,
  QuickOptionField,
  QuickValueType,
} from "./quick-types";
export { splitAction } from "./quick-helpers";
export { LIGHT_COLORS } from "./domains/lighting";
export { NOTIFY_CHIPS } from "./domains/media";

export const DOMAIN_EDITORS: Record<string, DomainEditor> = {
  ...LIGHTING_EDITORS,
  ...CLIMATE_EDITORS,
  ...MEDIA_EDITORS,
  ...HELPER_EDITORS,
  ...HOUSE_EDITORS,
  ...SYSTEM_EDITORS,
};

/**
 * Integration editors never replace a hand-written domain editor. A domain
 * that already has one keeps it and gains only the services it lacks.
 */
[
  INTEGRATION_EDITORS_A,
  INTEGRATION_EDITORS_B,
  INTEGRATION_EDITORS_C,
  INTEGRATION_EDITORS_D,
  INTEGRATION_EDITORS_E,
  INTEGRATION_EDITORS_F,
  INTEGRATION_EDITORS_BAMBU,
].forEach((share) => {
  Object.entries(share).forEach(([domain, editor]) => {
    const existing = DOMAIN_EDITORS[domain];
    if (!existing) {
      DOMAIN_EDITORS[domain] = editor;
      return;
    }
    Object.entries(editor.controls).forEach(([service, builder]) => {
      existing.controls[service] ??= builder;
    });
    existing.cautions = { ...editor.cautions, ...existing.cautions };
    existing.gates = { ...editor.gates, ...existing.gates };
    existing.siblings = [
      ...new Set([...(existing.siblings ?? []), ...(editor.siblings ?? [])]),
    ];
  });
});

const MEDIA_PLAYER = DOMAIN_EDITORS.media_player;
if (MEDIA_PLAYER) {
  Object.entries(ONKYO_MEDIA_PLAYER_CONTROLS).forEach(([service, builder]) => {
    MEDIA_PLAYER.controls[service] ??= builder;
    if (!(MEDIA_PLAYER.siblings ?? []).includes(service)) {
      MEDIA_PLAYER.siblings = [...(MEDIA_PLAYER.siblings ?? []), service];
    }
  });
}

/** Domains whose `reload` service re-reads their YAML configuration. */
const RELOAD_DOMAINS = [
  "automation",
  "script",
  "scene",
  "schedule",
  "timer",
  "group",
  "person",
  "zone",
  "input_boolean",
  "input_button",
  "input_datetime",
  "input_number",
  "input_select",
  "input_text",
];

RELOAD_DOMAINS.forEach((domain) => {
  const editor = DOMAIN_EDITORS[domain];
  if (!editor) return;
  editor.controls.reload ??= () => [notice("reload", L("note_reload"))];
  if (editor.siblings && !editor.siblings.includes("reload")) {
    editor.siblings = [...editor.siblings, "reload"];
  }
});

const humanKey = (key: string) => key.replace(/_/g, " ");

const optionValues = (list: unknown[]): string[] =>
  list.map((item: any) => (typeof item === "string" ? item : item.value));

const simpleOptions = (list: unknown): list is unknown[] =>
  Array.isArray(list) &&
  list.length > 0 &&
  list.every(
    (item: any) =>
      typeof item === "string" ||
      (item && typeof item === "object" && typeof item.value === "string")
  );

/** Visual controls for declared fields that no tailored editor claimed. */
const genericControls = (
  ctx: QuickContext,
  claimed: Set<string>
): QuickControl[] =>
  compact(
    Object.entries(ctx.fields).map(([key, info]) => {
      if (claimed.has(key) || IGNORED_KEYS.has(key)) return undefined;
      const labelKey = `ui.components.action-editors.field_fallback`;
      const selector = info.selector;
      // Text, date, time and selector-less fields stay with their selectors,
      // which keep legacy text, templates and nested values intact.
      if (!selector) return undefined;
      const [type, config] = Object.entries(selector)[0] ?? [];
      const options = (config ?? {}) as Record<string, any>;
      switch (type) {
        case "boolean":
          return toggle(ctx, key, labelKey);
        case "number": {
          const bounded =
            typeof options.min === "number" && typeof options.max === "number";
          const step = typeof options.step === "number" ? options.step : 1;
          const unit = options.unit_of_measurement;
          if (bounded && options.mode !== "box") {
            return slider(ctx, key, labelKey, options.min, options.max, step, {
              unit,
            });
          }
          // Unbounded numbers and box mode get a stepper, never a bare box.
          return stepper(
            ctx,
            key,
            labelKey,
            bounded ? options.min : -1000000000,
            bounded ? options.max : 1000000000,
            step,
            unit
          );
        }
        case "select": {
          const list = options.options;
          if (
            !simpleOptions(list) ||
            options.multiple ||
            options.custom_value
          ) {
            return undefined;
          }
          if (list.length > 8) {
            const value = scalar<string>(ctx, key, "string");
            if (value === null) return undefined;
            return {
              kind: "selector",
              key,
              labelKey,
              valueType: "list",
              selector: { select: { mode: "dropdown", options: list } },
              value,
            } as QuickControl;
          }
          const control = tiles(ctx, key, labelKey, optionValues(list));
          if (control && control.kind === "tiles") {
            control.options = control.options.map((option) => {
              const source = list.find(
                (item: any) =>
                  typeof item === "object" && item.value === option.value
              ) as { label?: unknown } | undefined;
              return source?.label
                ? { ...option, label: String(source.label) }
                : option;
            });
          }
          return control;
        }
        default:
          return undefined;
      }
    })
  );

export const quickEditorDomain = (action: string): DomainEditor | undefined =>
  DOMAIN_EDITORS[splitAction(action)[0]];

/** Whether a tailored editor exists for the action's domain. */
export const hasTailoredEditor = (action: string): boolean =>
  quickEditorDomain(action) !== undefined;

const gateAllows = (
  editor: DomainEditor,
  service: string,
  ctx: QuickContext
): boolean => {
  const bit = editor.gates?.[service];
  if (bit === undefined || ctx.entities.length === 0) return true;
  const known = ctx.entities.filter(
    (entity) => entity.attributes.supported_features !== undefined
  );
  if (known.length !== ctx.entities.length) return true;
  return known.some((entity) => hasFeature(entity.attributes, bit));
};

/**
 * Long dropdowns list plain code names (`out_sub`). A name made only of
 * lowercase letters, digits, dashes and underscores gets a readable label;
 * options that already carry a label keep it.
 */
const labelDropdown = (control: QuickControl): QuickControl => {
  if (control.kind !== "selector") return control;
  const config = control.selector?.select;
  if (!config || !Array.isArray(config.options)) return control;
  const options = config.options.map((option: unknown) => {
    const value = typeof option === "string" ? option : undefined;
    return value !== undefined && /^[a-z0-9_.-]+$/.test(value)
      ? { value, label: humanizeOption(value.replace(/[-.]/g, " ")) }
      : option;
  });
  return {
    ...control,
    selector: { ...control.selector, select: { ...config, options } },
  };
};

/** Switches over a constant-true field remove the key when off. */
const markConstants = (
  ctx: QuickContext,
  control: QuickControl
): QuickControl => {
  if (control.kind !== "switch") return control;
  const selector = ctx.fields[control.key]?.selector;
  return selector && "constant" in selector
    ? { ...control, constant: true }
    : control;
};

/** Every control for one action, tailored first and generic second. */
export const buildQuickControls = (ctx: QuickContext): QuickControl[] => {
  const [domain, service] = splitAction(ctx.action);
  const editor = DOMAIN_EDITORS[domain];
  const controls: QuickControl[] = [];
  const siblings = (editor?.siblings ?? []).filter(
    (name) =>
      ctx.domainServices.includes(name) &&
      (name === service || gateAllows(editor!, name, ctx))
  );
  if (editor && siblings.length > 1 && siblings.includes(service)) {
    controls.push({
      kind: "services",
      key: "$action",
      labelKey: "ui.components.action-editors.fields.action",
      options: siblings.map((name) => ({ value: `${domain}.${name}` })),
      value: ctx.action,
    });
  }
  const caution = editor?.cautions?.[service];
  if (caution) {
    controls.push({
      kind: "notice",
      key: "$caution",
      labelKey: caution,
      tone: "caution",
    });
  }
  const builder = editor?.controls[service] ?? editor?.controls["*"];
  const tailored = builder ? builder(ctx) : [];
  controls.push(...tailored);
  // Fields a tailored editor can ever show stay with it, even when the
  // targeted entities do not support them, so the generic form never
  // re-adds a control that was gated out on purpose.
  const claimed = new Set(
    (builder ? builder({ ...ctx, entities: [], data: {} }) : []).map(
      (control) => control.key
    )
  );
  tailored.forEach((control) => claimed.add(control.key));
  controls.push(...genericControls(ctx, claimed));
  return controls.map((control) => labelDropdown(markConstants(ctx, control)));
};

/**
 * Fields a tailored editor can show but hides because none of the targeted
 * entities supports them. A stored value keeps its field visible, so nothing
 * saved is ever hidden.
 */
export const unsupportedKeys = (
  ctx: QuickContext,
  controls: QuickControl[]
): Set<string> => {
  const [domain, service] = splitAction(ctx.action);
  const builder = DOMAIN_EDITORS[domain]?.controls[service];
  if (!builder || ctx.entities.length === 0) return new Set();
  const shown = claimedKeys(controls);
  return new Set(
    builder({ ...ctx, entities: [], data: {} })
      .map((control) => control.key)
      .filter(
        (key) =>
          !key.startsWith("$") && !shown.has(key) && ctx.data[key] === undefined
      )
  );
};

/** Keys the quick controls own, so the generic fields skip them. */
export const claimedKeys = (controls: QuickControl[]): Set<string> =>
  new Set(
    controls.filter((c) => !c.key.startsWith("$")).map((control) => control.key)
  );

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Write one control value into action data. Other keys keep their order and
 * value, so a trip through code view and back loses nothing.
 */
export const applyControlValue = (
  data: Record<string, unknown> | undefined,
  key: string,
  value: unknown
): Record<string, unknown> | undefined => {
  const current = data ?? {};
  if (value === undefined || value === "") {
    if (!(key in current)) return data;
    const next = { ...current };
    delete next[key];
    return next;
  }
  if (key in current && sameValue(current[key], value)) return data;
  return { ...current, [key]: value };
};

const pad = (value: number) => String(value).padStart(2, "0");

const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Rename the keys of an event's dates when it changes between dated and timed. */
const switchAllDay = (
  data: Record<string, unknown>,
  allDay: boolean,
  now: Date
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const day = (value: unknown) =>
    typeof value === "string" ? value.slice(0, 10) : undefined;
  Object.entries(data).forEach(([key, value]) => {
    if (allDay && key === "start_date_time") out.start_date = day(value);
    else if (allDay && key === "end_date_time") out.end_date = day(value);
    else if (!allDay && key === "start_date") {
      out.start_date_time = `${day(value) ?? localDate(now)} 00:00:00`;
    } else if (!allDay && key === "end_date") {
      out.end_date_time = `${day(value) ?? localDate(now)} 00:00:00`;
    } else out[key] = value;
  });
  if (allDay && !("start_date" in out)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    out.start_date = localDate(now);
    out.end_date = localDate(tomorrow);
  }
  Object.keys(out).forEach((key) => out[key] === undefined && delete out[key]);
  return out;
};

/**
 * Apply one change from a quick control. The virtual all-day switch renames
 * the event's date keys; every other key goes through `applyControlValue`.
 */
export const applyQuickChange = (
  data: Record<string, unknown> | undefined,
  key: string,
  value: unknown,
  now: Date = new Date()
): Record<string, unknown> | undefined => {
  if (key === "$all_day") {
    return switchAllDay(data ?? {}, value === true, now);
  }
  return applyControlValue(data, key, value);
};

/** Text boxes keep the stored type: a number stays a number when typed as one. */
export const coerceText = (text: string, previous: unknown): unknown => {
  if (text === "") return undefined;
  if (
    typeof previous === "number" &&
    text.trim() !== "" &&
    Number.isFinite(Number(text))
  ) {
    return Number(text);
  }
  if (typeof previous === "boolean" && (text === "true" || text === "false")) {
    return text === "true";
  }
  return text;
};

/** Plain readable fallback when no translation exists for an option. */
export const humanizeOption = (value: string): string => {
  const text = humanKey(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Clamp and align a stepper or slider value to its bounds and step. */
export const snapToStep = (
  value: number,
  min: number,
  max: number,
  step: number
): number => {
  const clamped = Math.min(max, Math.max(min, value));
  const decimals = (String(step).split(".")[1] ?? "").length;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, snapped).toFixed(decimals));
};

/** Controls shown before the rest fold into one advanced group. */
export const ADVANCED_FOLD_THRESHOLD = 6;

/** Controls that always stay visible, even when every field is optional. */
const MIN_VISIBLE_CONTROLS = 4;

/**
 * A short form keeps its fields whole, except for plain on or off switches
 * nobody has to set: when two or more of them are optional and still unset,
 * and at least one other field stays in view, they fold into the advanced
 * group. A switch that is required or already holds a value stays visible.
 */
const foldOptionalSwitches = (
  controls: QuickControl[],
  dataControls: QuickControl[],
  fields: Record<string, QuickFieldInfo>,
  values: Record<string, unknown>
): { main: QuickControl[]; advanced: QuickControl[] } => {
  const optional = (control: QuickControl) =>
    control.kind === "switch" &&
    fields[control.key]?.required !== true &&
    values[control.key] === undefined;
  const folded = dataControls.filter(optional);
  if (folded.length < 2 || folded.length === dataControls.length) {
    return { main: controls, advanced: [] };
  }
  return {
    main: controls.filter((control) => !folded.includes(control)),
    advanced: folded,
  };
};

/**
 * Splits the controls of one action into the ones always shown and an
 * advanced group. Only long forms fold. A control stays visible when its
 * field is required or already holds a value, so nothing set is ever hidden.
 */
export const splitAdvancedControls = (
  controls: QuickControl[],
  fields: Record<string, QuickFieldInfo>,
  values: Record<string, unknown>
): { main: QuickControl[]; advanced: QuickControl[] } => {
  const dataControls = controls.filter(
    (control) => !control.key.startsWith("$")
  );
  if (dataControls.length <= ADVANCED_FOLD_THRESHOLD) {
    return foldOptionalSwitches(controls, dataControls, fields, values);
  }
  const main: QuickControl[] = [];
  const advanced: QuickControl[] = [];
  let shown = 0;
  controls.forEach((control) => {
    const data = !control.key.startsWith("$");
    const folds =
      data &&
      control.kind !== "notice" &&
      control.kind !== "run" &&
      fields[control.key]?.required !== true &&
      values[control.key] === undefined;
    // The first few controls always stay visible, so a form whose fields are
    // all optional still opens with something to fill in.
    if (folds && shown >= MIN_VISIBLE_CONTROLS) {
      advanced.push(control);
      return;
    }
    if (data) shown += 1;
    main.push(control);
  });
  // A single folded control is not worth a group.
  return advanced.length > 1
    ? { main, advanced }
    : { main: controls, advanced: [] };
};
