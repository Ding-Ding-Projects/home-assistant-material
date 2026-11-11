import {
  contrast,
  contrastGrade,
  nearestNamed,
  parseColor,
  rgbToLab,
  rgbToOklab,
} from "../color/translate-color";
import type { Rgba } from "../color/translate-color";

/**
 * Colour notations the shared translator does not write, and the contrast
 * reading the colour picker shows against the surface a colour sits on.
 */

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const polar = (a: number, b: number): [chroma: number, hue: number] => {
  const chroma = Math.hypot(a, b);
  const hue = chroma < 0.0002 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return [chroma, hue < 0 ? hue + 360 : hue];
};

/** CSS `lch()`: CIELAB in polar form. */
export const toLch = (r: number, g: number, b: number): string => {
  const [lightness, a, bb] = rgbToLab(r, g, b);
  const [chroma, hue] = polar(a, bb);
  return `lch(${round(lightness, 1)} ${round(chroma, 1)} ${round(hue, 1)})`;
};

/** CSS `oklab()`. */
export const toOklab = (r: number, g: number, b: number): string => {
  const [lightness, a, bb] = rgbToOklab(r, g, b);
  return `oklab(${round(lightness * 100, 1)}% ${round(a, 3)} ${round(bb, 3)})`;
};

/** The CSS named colour that looks closest, or the exact one. */
export const toNamed = (r: number, g: number, b: number): string => {
  const named = nearestNamed(r, g, b);
  return named.exact ? named.name : `≈ ${named.name}`;
};

export type ContrastGrade = "all" | "large" | "none";

export interface ContrastReading {
  /** WCAG contrast ratio, 1 to 21. */
  ratio: number;
  /** All text sizes (4.5 and up), large text only (3 and up), or neither. */
  grade: ContrastGrade;
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/;

/** Degrees in one full turn, by CSS angle unit. */
const ANGLE_UNITS: Record<string, number> = {
  deg: 1,
  turn: 360,
  rad: 180 / Math.PI,
  grad: 0.9,
};

const angleDegrees = (part: string): number | undefined => {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]*)$/.exec(part);
  if (!match) {
    return undefined;
  }
  const unit = match[2] || "deg";
  const factor = ANGLE_UNITS[unit];
  const degrees = factor === undefined ? NaN : parseFloat(match[1]) * factor;
  return Number.isFinite(degrees) ? degrees : undefined;
};

const isNumeric = (part: string): boolean =>
  NUMBER.test(part.endsWith("%") ? part.slice(0, -1) : part);

/**
 * Reads a colour a person typed into the picker. Stricter than the shared
 * translator: three and four digit hex needs its `#` so a word such as "bad"
 * or "face" is not read as a colour, every number in `rgb()` and `hsl()` must
 * be a real number (alpha included), and a hue may carry deg, turn, rad or
 * grad. Anything else is undefined, so nothing is guessed.
 */
export const parseTypedColor = (text: string): Rgba | undefined => {
  const value = text.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (/^[0-9a-f]+$/.test(value)) {
    // Without a `#` only a full 6 or 8 digit value counts as hex.
    return value.length === 6 || value.length === 8
      ? parseColor(value)
      : undefined;
  }
  const call = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(value);
  if (!call) {
    return parseColor(value);
  }
  const parts = call[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) {
    return undefined;
  }
  if (parts[3] !== undefined && !isNumeric(parts[3])) {
    return undefined;
  }
  if (call[1].startsWith("rgb")) {
    return parts.slice(0, 3).every(isNumeric)
      ? parseColor(`rgb(${parts.join(" ")})`)
      : undefined;
  }
  const hue = angleDegrees(parts[0]);
  if (hue === undefined || !isNumeric(parts[1]) || !isNumeric(parts[2])) {
    return undefined;
  }
  return parseColor(`hsl(${hue} ${parts.slice(1).join(" ")})`);
};

const rgbOf = (hex: string): [number, number, number] | undefined => {
  const color = parseColor(hex);
  return color ? [color.r, color.g, color.b] : undefined;
};

/**
 * How well a colour reads against another one, both given as CSS colours.
 * Returns undefined when either cannot be read.
 */
export const contrastReading = (
  colour: string,
  surface: string
): ContrastReading | undefined => {
  const first = rgbOf(colour);
  const second = rgbOf(surface);
  if (!first || !second) {
    return undefined;
  }
  const ratio = contrast(first, second);
  return { ratio, grade: contrastGrade(ratio) };
};
