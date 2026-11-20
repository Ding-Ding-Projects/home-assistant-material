import type { SVGTemplateResult } from "lit";
import { svg } from "lit";

/**
 * The shapes behind a shaped icon, drawn in a 52 by 52 box. Each one is a
 * plain filled shape in the tone's container colour, so an icon on top keeps
 * its contrast. Pure, so the list can be checked on its own.
 */
export type ShapedIconShape =
  | "circle"
  | "scallop"
  | "tilted-square"
  | "pill"
  | "ring"
  | "diamond"
  | "warning";

export const SHAPED_ICON_SHAPES: ShapedIconShape[] = [
  "circle",
  "scallop",
  "tilted-square",
  "pill",
  "ring",
  "diamond",
  "warning",
];

/** The tonal colour pairs a shaped icon can take, from the theme. */
export type ShapedIconTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "success"
  | "warning"
  | "error"
  | "neutral";

export const SHAPED_ICON_TONES: ShapedIconTone[] = [
  "primary",
  "secondary",
  "tertiary",
  "success",
  "warning",
  "error",
  "neutral",
];

/** Anything that is not a known shape reads as a circle. */
export const normalizeShape = (value: unknown): ShapedIconShape =>
  SHAPED_ICON_SHAPES.includes(value as ShapedIconShape)
    ? (value as ShapedIconShape)
    : "circle";

/** Anything that is not a known tone reads as primary. */
export const normalizeTone = (value: unknown): ShapedIconTone =>
  SHAPED_ICON_TONES.includes(value as ShapedIconTone)
    ? (value as ShapedIconTone)
    : "primary";

/**
 * The scallop is a circle with a thick round-capped stroke dashed into
 * bumps: 10 bumps around a radius of 17.
 */
const SCALLOP_RADIUS = 17;
const SCALLOP_BUMPS = 10;
export const SCALLOP_DASH = (2 * Math.PI * SCALLOP_RADIUS) / SCALLOP_BUMPS;

export const shapeTemplate = (shape: ShapedIconShape): SVGTemplateResult => {
  switch (shape) {
    case "scallop":
      return svg`<circle class="shape" cx="26" cy="26" r=${SCALLOP_RADIUS}
        stroke-width="9" stroke-dasharray=${`0 ${SCALLOP_DASH.toFixed(2)}`}
        stroke-linecap="round"></circle>`;
    case "tilted-square":
      return svg`<rect class="shape" x="5" y="5" width="42" height="42" rx="15"
        transform="rotate(12 26 26)"></rect>`;
    case "pill":
      return svg`<rect class="shape" x="4" y="12" width="44" height="28"
        rx="14" transform="rotate(-18 26 26)"></rect>`;
    case "ring":
      return svg`<circle class="shape" cx="26" cy="26" r="20"></circle>
        <circle class="ring" cx="26" cy="26" r="23" fill="none"
          stroke-width="3"></circle>`;
    case "diamond":
      return svg`<rect class="shape" x="10" y="10" width="32" height="32"
        rx="9" transform="rotate(45 26 26)"></rect>`;
    case "warning":
      return svg`<path class="shape" d="M26 7 L47 43 H5 Z" stroke-width="7"
        stroke-linejoin="round"></path>`;
    default:
      return svg`<circle class="shape" cx="26" cy="26" r="24"></circle>`;
  }
};
