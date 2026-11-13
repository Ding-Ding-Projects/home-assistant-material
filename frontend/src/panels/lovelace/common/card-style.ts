import {
  THEME_COLORS,
  computeCssColor,
} from "../../../common/color/compute-color";

/**
 * Per-card style block, stored as `style` in a card configuration.
 *
 * Every value is validated here and turned into CSS custom properties that the
 * shared card components already read. No text from the configuration is ever
 * placed in a style sheet; a value that is not a plain length or colour is
 * dropped.
 */
export interface CardStyleConfig {
  /** Text size, for example `18` or `1.1rem`. */
  font_size?: string | number;
  /** Text colour: a theme colour name, a hex or rgb()/hsl() value, or var(--name). */
  text_color?: string;
  /** Icon colour, same formats as the text colour. */
  icon_color?: string;
  /** Border width, for example `2` or `2px`. */
  border_width?: string | number;
  /** Border colour, same formats as the text colour. */
  border_color?: string;
  /** Corner radius, for example `24` or `1.5rem`. */
  border_radius?: string | number;
  /** Background colour, same formats as the text colour. */
  background?: string;
  /** Inner padding, for example `16` or `1rem`. */
  padding?: string | number;
  /** Shadow strength: none, soft, medium or strong. */
  shadow?: string;
}

/** The shadow choices, each mapped to a fixed shadow built from theme colours. */
export const CARD_SHADOWS: Record<string, string> = {
  none: "none",
  soft: "0 1px 3px 0 rgb(0 0 0 / 12%), 0 1px 2px -1px rgb(0 0 0 / 12%)",
  medium: "0 4px 8px -2px rgb(0 0 0 / 18%), 0 2px 4px -2px rgb(0 0 0 / 14%)",
  strong: "0 12px 24px -6px rgb(0 0 0 / 28%), 0 4px 8px -4px rgb(0 0 0 / 20%)",
};

export const CARD_STYLE_KEYS = [
  "font_size",
  "text_color",
  "icon_color",
  "border_width",
  "border_color",
  "border_radius",
  "background",
  "padding",
  "shadow",
] as const;

export type CardStyleKey = (typeof CARD_STYLE_KEYS)[number];

const MAX_LENGTH = 400;

const LENGTH = /^(\d{1,3}(?:\.\d{1,3})?)(px|rem|em)?$/;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/deg-]{1,60}\)$/i;
const CSS_VARIABLE = /^var\(--[a-z0-9-]{1,60}\)$/i;
const KEYWORD = /^(?:transparent|currentcolor)$/i;

/** A length in CSS pixels, rem or em, or undefined when the value is not one. */
export const sanitizeCardStyleLength = (value: unknown): string | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= MAX_LENGTH
      ? `${value}px`
      : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const match = LENGTH.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "px";
  if (amount > (unit === "px" ? MAX_LENGTH : 40)) {
    return undefined;
  }
  return `${amount}${unit}`;
};

/** A colour value that is safe to use as a custom property, or undefined. */
export const sanitizeCardStyleColor = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const color = value.trim();
  if (THEME_COLORS.has(color)) {
    return computeCssColor(color);
  }
  if (
    HEX.test(color) ||
    COLOR_FUNCTION.test(color) ||
    CSS_VARIABLE.test(color) ||
    KEYWORD.test(color)
  ) {
    return color;
  }
  return undefined;
};

/** The custom properties and plain properties a style block produces. */
export const computeCardStyleProperties = (
  style: CardStyleConfig | undefined
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!style || typeof style !== "object") {
    return result;
  }

  const fontSize = sanitizeCardStyleLength(style.font_size);
  if (fontSize) {
    result["font-size"] = fontSize;
    result["--ha-tile-info-primary-font-size"] = fontSize;
    result["--ha-tile-info-secondary-font-size"] = `calc(${fontSize} * 0.85)`;
    result["--ha-card-header-font-size"] = fontSize;
  }

  const textColor = sanitizeCardStyleColor(style.text_color);
  if (textColor) {
    result["--primary-text-color"] = textColor;
    result.color = textColor;
  }

  const iconColor = sanitizeCardStyleColor(style.icon_color);
  if (iconColor) {
    result["--state-icon-color"] = iconColor;
    result["--icon-primary-color"] = iconColor;
  }

  const borderWidth = sanitizeCardStyleLength(style.border_width);
  if (borderWidth) {
    result["--ha-card-border-width"] = borderWidth;
  }

  const borderColor = sanitizeCardStyleColor(style.border_color);
  if (borderColor) {
    result["--ha-card-border-color"] = borderColor;
  }

  const borderRadius = sanitizeCardStyleLength(style.border_radius);
  if (borderRadius) {
    result["--ha-card-border-radius"] = borderRadius;
  }

  const background = sanitizeCardStyleColor(style.background);
  if (background) {
    result["--ha-card-background"] = background;
  }

  const padding = sanitizeCardStyleLength(style.padding);
  if (padding) {
    result["--ha-card-padding"] = padding;
  }

  if (
    typeof style.shadow === "string" &&
    Object.prototype.hasOwnProperty.call(CARD_SHADOWS, style.shadow)
  ) {
    result["--ha-card-box-shadow"] = CARD_SHADOWS[style.shadow];
  }

  return result;
};

/** True when the style block has no value that takes effect. */
export const isCardStyleEmpty = (style: CardStyleConfig | undefined) =>
  Object.keys(computeCardStyleProperties(style)).length === 0;

/**
 * The card configuration with one style value changed. An empty value removes
 * the key, and an empty style block removes `style` entirely.
 */
export const setCardStyleValue = <T extends object>(
  card: T,
  key: CardStyleKey,
  value: string | number | undefined
): T => {
  const style: Record<string, unknown> = {
    ...((card as { style?: CardStyleConfig }).style ?? {}),
  };
  if (value === undefined || value === "") {
    delete style[key];
  } else {
    style[key] = value;
  }
  const next: Record<string, unknown> = { ...card, style };
  if (Object.keys(style).length === 0) {
    delete next.style;
  }
  return next as T;
};

/** The card configuration without any style block. */
export const resetCardStyle = <T extends object>(card: T): T => {
  const next: Record<string, unknown> = {
    ...(card as Record<string, unknown>),
  };
  delete next.style;
  return next as T;
};
