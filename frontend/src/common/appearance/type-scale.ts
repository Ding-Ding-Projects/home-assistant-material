import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { syncCacheUsable } from "../instance-sync/sync-owner";

/**
 * Type scale: a base size and a ratio that produce five steps of text size,
 * with an optional size for any single step.
 *
 * The steps are written as theme size variables on the document root. Each
 * value is multiplied by the text size of the accessibility tools
 * (`--ha-font-size-scale`), so the two choices combine. With the scale off,
 * nothing is written and the theme's own sizes hold.
 *
 * Everything that comes from storage is sanitised here, so a damaged value
 * can never put anything but a bounded number into a style.
 */

export const TYPE_SCALE_STORAGE_KEY = "typeScale";

export type TypeScaleStep =
  "caption" | "body" | "title" | "headline" | "display";

export const TYPE_SCALE_STEPS: TypeScaleStep[] = [
  "caption",
  "body",
  "title",
  "headline",
  "display",
];

/** The theme size variable each step sets. */
export const TYPE_SCALE_TOKENS: Record<TypeScaleStep, string> = {
  caption: "--ha-font-size-s",
  body: "--ha-font-size-m",
  title: "--ha-font-size-xl",
  headline: "--ha-font-size-3xl",
  display: "--ha-font-size-5xl",
};

/**
 * Theme sizes that sit between two steps. They are derived from the sizes of
 * the steps around them, so the theme's order xs..5xl holds at any base,
 * ratio or override.
 */
export const TYPE_SCALE_DERIVED_TOKENS = {
  xs: "--ha-font-size-xs",
  l: "--ha-font-size-l",
  "2xl": "--ha-font-size-2xl",
  "4xl": "--ha-font-size-4xl",
} as const;

/** Ratios offered as presets; any ratio from RATIO_MIN to RATIO_MAX is valid. */
export const RATIO_PRESETS = [1.125, 1.2, 1.25, 1.333];
export const RATIO_MIN = 1.05;
export const RATIO_MAX = 1.6;
export const DEFAULT_RATIO = 1.2;

export const BASE_MIN = 12;
export const BASE_MAX = 20;
export const DEFAULT_BASE = 14;

export const SIZE_MIN = 8;
export const SIZE_MAX = 96;

export interface TypeScaleSettings {
  /** Whether the scale is applied. Off means the theme's own sizes. */
  enabled: boolean;
  /** The body size in pixels, before the text size of the accessibility tools. */
  base: number;
  ratio: number;
  /** A size in pixels for a single step, replacing the computed one. */
  overrides: Partial<Record<TypeScaleStep, number>>;
}

export const DEFAULT_TYPE_SCALE: TypeScaleSettings = {
  enabled: false,
  base: DEFAULT_BASE,
  ratio: DEFAULT_RATIO,
  overrides: {},
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "string" && value.trim() !== "") {
    value = Number(value);
  }
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

export const sanitizeRatio = (value: unknown): number => {
  const number = toNumber(value);
  return number === undefined
    ? DEFAULT_RATIO
    : round(clamp(number, RATIO_MIN, RATIO_MAX), 3);
};

export const sanitizeBase = (value: unknown): number => {
  const number = toNumber(value);
  return number === undefined
    ? DEFAULT_BASE
    : round(clamp(number, BASE_MIN, BASE_MAX), 1);
};

/** A size for one step; undefined when the value is not a usable number. */
export const sanitizeSize = (value: unknown): number | undefined => {
  const number = toNumber(value);
  return number === undefined
    ? undefined
    : round(clamp(number, SIZE_MIN, SIZE_MAX), 1);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Turns anything that was stored into valid settings. */
export const normalizeTypeScale = (stored?: unknown): TypeScaleSettings => {
  let source = stored;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (_err) {
      source = undefined;
    }
  }
  if (!isObject(source)) {
    return { ...DEFAULT_TYPE_SCALE, overrides: {} };
  }
  const overrides: Partial<Record<TypeScaleStep, number>> = {};
  if (isObject(source.overrides)) {
    for (const step of TYPE_SCALE_STEPS) {
      const size = sanitizeSize(source.overrides[step]);
      if (size !== undefined) {
        overrides[step] = size;
      }
    }
  }
  return {
    enabled: source.enabled === true,
    base: sanitizeBase(source.base),
    ratio: sanitizeRatio(source.ratio),
    overrides,
  };
};

export const isDefaultTypeScale = (settings: TypeScaleSettings): boolean =>
  !settings.enabled &&
  settings.base === DEFAULT_BASE &&
  settings.ratio === DEFAULT_RATIO &&
  Object.keys(settings.overrides).length === 0;

/** The size in pixels of each step: the computed one, or the override. */
export const computeTypeScale = (
  settings: TypeScaleSettings
): Record<TypeScaleStep, number> => {
  const clean = normalizeTypeScale(settings);
  const { base, ratio } = clean;
  const computed: Record<TypeScaleStep, number> = {
    caption: base / ratio,
    body: base,
    title: base * ratio,
    headline: base * ratio ** 2,
    display: base * ratio ** 3,
  };
  const sizes = {} as Record<TypeScaleStep, number>;
  for (const step of TYPE_SCALE_STEPS) {
    sizes[step] =
      clean.overrides[step] ??
      round(clamp(computed[step], SIZE_MIN, SIZE_MAX), 1);
  }
  return sizes;
};

const mean = (a: number, b: number): number => round(Math.sqrt(a * b), 1);

/**
 * The size in pixels of every theme size variable, steps and in-between sizes
 * alike. Each in-between size lies between the steps next to it.
 */
export const computeThemeSizes = (
  settings: TypeScaleSettings
): Record<string, number> => {
  const sizes = computeTypeScale(settings);
  return {
    [TYPE_SCALE_DERIVED_TOKENS.xs]: round(
      Math.min(sizes.caption, (sizes.caption * sizes.caption) / sizes.body),
      1
    ),
    [TYPE_SCALE_TOKENS.caption]: sizes.caption,
    [TYPE_SCALE_TOKENS.body]: sizes.body,
    [TYPE_SCALE_DERIVED_TOKENS.l]: mean(sizes.body, sizes.title),
    [TYPE_SCALE_TOKENS.title]: sizes.title,
    [TYPE_SCALE_DERIVED_TOKENS["2xl"]]: mean(sizes.title, sizes.headline),
    [TYPE_SCALE_TOKENS.headline]: sizes.headline,
    [TYPE_SCALE_DERIVED_TOKENS["4xl"]]: mean(sizes.headline, sizes.display),
    [TYPE_SCALE_TOKENS.display]: sizes.display,
  };
};

/** The variables to set on the root; empty while the scale is off. */
export const typeScaleToVariables = (
  settings: TypeScaleSettings
): Record<string, string> => {
  const clean = normalizeTypeScale(settings);
  if (!clean.enabled) {
    return {};
  }
  const variables: Record<string, string> = {};
  for (const [token, size] of Object.entries(computeThemeSizes(clean))) {
    variables[token] = `calc(${size}px * var(--ha-font-size-scale, 1))`;
  }
  return variables;
};

export const applyTypeScale = (
  settings: TypeScaleSettings,
  root: HTMLElement = document.documentElement
) => {
  for (const token of [
    ...Object.values(TYPE_SCALE_TOKENS),
    ...Object.values(TYPE_SCALE_DERIVED_TOKENS),
  ]) {
    root.style.removeProperty(token);
  }
  for (const [name, value] of Object.entries(typeScaleToVariables(settings))) {
    root.style.setProperty(name, value);
  }
};

/** The stored choices, as they are now. */
export const getTypeScale = (): TypeScaleSettings => {
  if (!syncCacheUsable()) {
    return normalizeTypeScale(undefined);
  }
  // A damaged or blocked store must not stop the page: fall back to defaults.
  try {
    return normalizeTypeScale(getStorage().getValue(TYPE_SCALE_STORAGE_KEY));
  } catch (_err) {
    return normalizeTypeScale(undefined);
  }
};

export const setTypeScale = (settings: TypeScaleSettings) => {
  getStorage().setValue(TYPE_SCALE_STORAGE_KEY, normalizeTypeScale(settings));
};

export const subscribeTypeScale = (
  callback: (settings: TypeScaleSettings) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(TYPE_SCALE_STORAGE_KEY, () =>
    callback(getTypeScale())
  );

/**
 * Applies the stored scale now and whenever it changes, in this tab or
 * another. Returns the function that stops it.
 */
export const startTypeScale = (): UnsubscribeFunc => {
  applyTypeScale(getTypeScale());
  return subscribeTypeScale(applyTypeScale);
};
