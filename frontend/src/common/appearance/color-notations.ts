import {
  contrast,
  contrastGrade,
  nearestNamed,
  parseColor,
  rgbToLab,
  rgbToOklab,
} from "../color/translate-color";

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
