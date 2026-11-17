import { hasTemplate } from "../../../common/string/has-template";
import {
  anyEntity,
  attrList,
  attrNumber,
  choice,
  claim,
  compact,
  duration,
  hasFeature,
  L,
  notice,
  slider,
  splitAction,
  textBox,
  tiles,
} from "../quick-helpers";
import type {
  DomainEditor,
  QuickColor,
  QuickContext,
  QuickControl,
  QuickEntity,
} from "../quick-types";

const onOffToggle = ["turn_on", "turn_off", "toggle"];

export const LIGHT_COLORS: QuickColor[] = [
  { id: "red", rgb: [255, 0, 0] },
  { id: "orange", rgb: [255, 140, 0] },
  { id: "yellow", rgb: [255, 220, 0] },
  { id: "green", rgb: [0, 200, 80] },
  { id: "cyan", rgb: [0, 200, 220] },
  { id: "blue", rgb: [30, 90, 255] },
  { id: "purple", rgb: [140, 60, 220] },
  { id: "pink", rgb: [255, 80, 160] },
  { id: "white", rgb: [255, 255, 255] },
];

const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

const lightModes = (entity: QuickEntity): string[] =>
  Array.isArray(entity.attributes.supported_color_modes)
    ? entity.attributes.supported_color_modes
    : [];

const colorValue = (ctx: QuickContext, key: string) => {
  const value = ctx.data[key];
  return Array.isArray(value) && value.every((part) => typeof part === "number")
    ? (value as number[])
    : undefined;
};

const colorControl = (
  ctx: QuickContext,
  key: string,
  space: "rgb" | "hs" | "xy" | "rgbw" | "rgbww",
  swatches: boolean
): QuickControl | undefined => {
  if (!claim(ctx, key) || hasTemplate(ctx.data[key])) return undefined;
  const stored = ctx.data[key];
  if (stored !== undefined && !Array.isArray(stored)) return undefined;
  return {
    kind: "color",
    key,
    labelKey: L(key),
    space,
    swatches,
    value: colorValue(ctx, key),
  };
};

const lightControls = (ctx: QuickContext): QuickControl[] => {
  const brightness = anyEntity(ctx, (e) =>
    lightModes(e).some((mode) => mode !== "onoff")
  );
  const colorTemp = anyEntity(ctx, (e) => lightModes(e).includes("color_temp"));
  const color = anyEntity(ctx, (e) =>
    lightModes(e).some((mode) => COLOR_MODES.includes(mode))
  );
  const transition = anyEntity(ctx, (e) => hasFeature(e.attributes, 32));
  const flash = anyEntity(ctx, (e) => hasFeature(e.attributes, 8));
  const [, service] = splitAction(ctx.action);
  const flashTiles = flash
    ? tiles(ctx, "flash", L("flash"), ["short", "long"])
    : undefined;
  if (service === "turn_off") {
    return compact([
      transition ? duration(ctx, "transition", L("transition")) : undefined,
      flashTiles,
    ]);
  }
  const effects = attrList(ctx, "effect_list");
  const effect =
    anyEntity(ctx, (e) => hasFeature(e.attributes, 4)) &&
    (effects.length || ctx.entities.length === 0)
      ? choice(ctx, "effect", L("effect"), effects)
      : undefined;
  const kelvinMin = attrNumber(ctx, "min_color_temp_kelvin", 2000, "min");
  const kelvinMax = attrNumber(ctx, "max_color_temp_kelvin", 6500, "max");
  const kelvinValue = ctx.data.color_temp_kelvin;
  const kelvin: QuickControl | undefined =
    colorTemp &&
    claim(ctx, "color_temp_kelvin") &&
    !hasTemplate(kelvinValue) &&
    (kelvinValue === undefined || typeof kelvinValue === "number") &&
    kelvinMin < kelvinMax
      ? {
          kind: "selector",
          key: "color_temp_kelvin",
          labelKey: L("color_temp_kelvin"),
          valueType: "color_temp",
          selector: {
            color_temp: { unit: "kelvin", min: kelvinMin, max: kelvinMax },
          },
          value: kelvinValue,
        }
      : undefined;
  const wantsModel = (mode: string, key: string) =>
    ctx.data[key] !== undefined ||
    (ctx.entities.length > 0 &&
      ctx.entities.some((e) => lightModes(e).includes(mode)));
  const names = ctx.fields.color_name?.selector?.select?.options;
  return compact([
    brightness
      ? slider(ctx, "brightness_pct", L("brightness_pct"), 0, 100, 1, {
          unit: "%",
        })
      : undefined,
    brightness
      ? slider(
          ctx,
          "brightness_step_pct",
          L("brightness_step_pct"),
          -100,
          100,
          1,
          {
            unit: "%",
          }
        )
      : undefined,
    kelvin,
    color ? colorControl(ctx, "rgb_color", "rgb", true) : undefined,
    wantsModel("rgbw", "rgbw_color")
      ? colorControl(ctx, "rgbw_color", "rgbw", false)
      : undefined,
    wantsModel("rgbww", "rgbww_color")
      ? colorControl(ctx, "rgbww_color", "rgbww", false)
      : undefined,
    wantsModel("hs", "hs_color") && ctx.data.hs_color !== undefined
      ? colorControl(ctx, "hs_color", "hs", false)
      : undefined,
    wantsModel("xy", "xy_color") && ctx.data.xy_color !== undefined
      ? colorControl(ctx, "xy_color", "xy", false)
      : undefined,
    color && Array.isArray(names) && names.length
      ? choice(
          ctx,
          "color_name",
          L("color_name"),
          names.map((item: any) =>
            typeof item === "string" ? item : String(item.value)
          )
        )
      : undefined,
    effect,
    flashTiles,
    transition ? duration(ctx, "transition", L("transition")) : undefined,
    claim(ctx, "profile") ? textBox(ctx, "profile", L("profile")) : undefined,
  ]);
};

const noFields = () => [];

const onOffControls = {
  turn_on: noFields,
  turn_off: noFields,
  toggle: noFields,
};

export const LIGHTING_EDITORS: Record<string, DomainEditor> = {
  light: {
    siblings: onOffToggle,
    controls: {
      turn_on: lightControls,
      toggle: lightControls,
      turn_off: lightControls,
    },
  },
  scene: {
    siblings: ["turn_on", "apply", "create", "delete"],
    cautions: { delete: L("caution_scene_delete") },
    controls: {
      turn_on: (ctx) =>
        compact([duration(ctx, "transition", L("transition"), "seconds")]),
      apply: (ctx) =>
        compact([
          duration(ctx, "transition", L("transition"), "seconds"),
          notice("scene_apply", L("note_scene_apply")),
        ]),
      create: (ctx) =>
        compact([
          textBox(ctx, "scene_id", L("scene_id")),
          notice("scene_create", L("note_scene_create")),
        ]),
      delete: () => [],
    },
  },
  switch: { siblings: onOffToggle, controls: { ...onOffControls } },
  input_boolean: { siblings: onOffToggle, controls: { ...onOffControls } },
  alert: { siblings: onOffToggle, controls: { ...onOffControls } },
};
