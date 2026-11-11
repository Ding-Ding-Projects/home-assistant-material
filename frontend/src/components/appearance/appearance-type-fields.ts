import { FONT_CHOICES } from "../../common/appearance/reading-options";

/**
 * The type fields of one element's appearance: typeface, weight, italic, line
 * height, letter spacing, text transform, alignment and a maximum number of
 * lines. This file holds their definitions, ranges, sanitising and styles, so
 * the editor, the store and the tests all read one source.
 *
 * Every field is optional. A missing field means "from the theme".
 */

/** Typefaces stored by earlier versions, by family name. */
export const FONT_FAMILIES = [
  "theme",
  "Google Sans Flex",
  "Roboto",
  "system-ui",
  "Georgia",
  "monospace",
] as const;

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;

export const TEXT_TRANSFORMS = [
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
] as const;

export const TEXT_ALIGNMENTS = ["start", "center", "end", "justify"] as const;

export type TextTransform = (typeof TEXT_TRANSFORMS)[number];
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export interface TypeFields {
  /** A key of the fonts the fonts dialog offers, or an earlier family name. */
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  /** A multiple of the font size. */
  lineHeight?: number;
  /** In em. */
  letterSpacing?: number;
  textTransform?: TextTransform;
  textAlign?: TextAlignment;
  /** Text beyond this many lines is cut off. */
  maxLines?: number;
}

export interface TypeRange {
  min: number;
  max: number;
  step: number;
  /** Shown on the slider while no value is chosen. */
  fallback: number;
}

export const TYPE_RANGES = {
  lineHeight: { min: 0.8, max: 2.4, step: 0.05, fallback: 1.5 },
  letterSpacing: { min: -0.05, max: 0.3, step: 0.01, fallback: 0 },
  maxLines: { min: 1, max: 10, step: 1, fallback: 3 },
} as const satisfies Record<string, TypeRange>;

/** Text smaller than this many pixels is hard to read. */
export const MIN_READABLE_FONT_SIZE = 12;

/**
 * The typefaces the fonts dialog allows, read through its exported list.
 * The theme's own face is not a choice here: "from the theme" is the reset.
 */
export const typefaceChoices = (): { key: string; name: string }[] =>
  FONT_CHOICES.body
    .filter((choice) => choice.key !== "theme")
    .map((choice) => ({ key: choice.key, name: choice.name }));

const choiceByKey = (key: string) =>
  FONT_CHOICES.body.find(
    (choice) => choice.key === key && choice.key !== "theme"
  );

export const isKnownTypeface = (value: unknown): value is string =>
  typeof value === "string" &&
  (!!choiceByKey(value) ||
    (value !== "theme" &&
      (FONT_FAMILIES as readonly string[]).includes(value)));

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  decimals: number
): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const factor = 10 ** decimals;
  return Math.round(Math.min(max, Math.max(min, value)) * factor) / factor;
};

/**
 * A clean copy of the type fields in a stored value. Out-of-range numbers are
 * clamped; anything not understood is dropped, so older stored data and
 * hand-edited data still load.
 */
export const normalizeTypeFields = (
  value: Record<string, unknown>
): TypeFields => {
  const result: TypeFields = {};
  if (isKnownTypeface(value.fontFamily)) {
    result.fontFamily = value.fontFamily;
  }
  if ((FONT_WEIGHTS as readonly unknown[]).includes(value.fontWeight)) {
    result.fontWeight = value.fontWeight as number;
  }
  if (typeof value.italic === "boolean") {
    result.italic = value.italic;
  }
  const { lineHeight, letterSpacing, maxLines } = TYPE_RANGES;
  const height = clampNumber(
    value.lineHeight,
    lineHeight.min,
    lineHeight.max,
    2
  );
  if (height !== undefined) {
    result.lineHeight = height;
  }
  const spacing = clampNumber(
    value.letterSpacing,
    letterSpacing.min,
    letterSpacing.max,
    2
  );
  if (spacing !== undefined) {
    result.letterSpacing = spacing;
  }
  if ((TEXT_TRANSFORMS as readonly unknown[]).includes(value.textTransform)) {
    result.textTransform = value.textTransform as TextTransform;
  }
  if ((TEXT_ALIGNMENTS as readonly unknown[]).includes(value.textAlign)) {
    result.textAlign = value.textAlign as TextAlignment;
  }
  const lines = clampNumber(value.maxLines, maxLines.min, maxLines.max, 0);
  if (lines !== undefined) {
    result.maxLines = lines;
  }
  return result;
};

/**
 * The CSS family list for a stored typeface. The list is also written into
 * `--ha-font-family-body`, so it must never refer to that variable itself: a
 * custom property that uses itself is invalid and the face would be lost.
 */
export const typefaceToCss = (fontFamily: string): string => {
  const choice = choiceByKey(fontFamily);
  if (choice) {
    return choice.stack;
  }
  if (fontFamily === "monospace") {
    return "monospace";
  }
  if (fontFamily === "system-ui") {
    return "system-ui, Roboto, Noto, sans-serif";
  }
  return `"${fontFamily}", Roboto, Noto, sans-serif`;
};

/**
 * The inherited styles for the type fields. The maximum number of lines is
 * applied to the element itself, which must then be a block of text.
 */
export const typeFieldsToStyles = (
  fields: TypeFields
): Record<string, string> => {
  const styles: Record<string, string> = {};
  if (fields.fontFamily) {
    const family = typefaceToCss(fields.fontFamily);
    styles["font-family"] = family;
    styles["--ha-font-family-body"] = family;
    styles["--ha-font-family-heading"] = family;
  }
  if (fields.fontWeight) {
    const weight = String(fields.fontWeight);
    styles["font-weight"] = weight;
    styles["--ha-font-weight-normal"] = weight;
    styles["--ha-font-weight-medium"] = weight;
  }
  if (fields.italic !== undefined) {
    styles["font-style"] = fields.italic ? "italic" : "normal";
  }
  if (fields.lineHeight !== undefined) {
    styles["line-height"] = String(fields.lineHeight);
  }
  if (fields.letterSpacing !== undefined) {
    styles["letter-spacing"] = `${fields.letterSpacing}em`;
  }
  if (fields.textTransform) {
    styles["text-transform"] = fields.textTransform;
  }
  if (fields.textAlign) {
    styles["text-align"] = fields.textAlign;
  }
  if (fields.maxLines !== undefined) {
    styles.display = "-webkit-box";
    styles["-webkit-box-orient"] = "vertical";
    styles["-webkit-line-clamp"] = String(fields.maxLines);
    styles.overflow = "hidden";
  }
  return styles;
};

/** The size text is drawn at, in pixels, once the element's size choice is applied. */
export const effectiveFontSize = (basePx: number, zoom = 1): number =>
  basePx * zoom;

/** True when text drawn at this size is smaller than {@link MIN_READABLE_FONT_SIZE}. */
export const isTextTooSmall = (basePx: number, zoom = 1): boolean =>
  Number.isFinite(basePx) &&
  basePx > 0 &&
  effectiveFontSize(basePx, zoom) < MIN_READABLE_FONT_SIZE;
