import type { LabColor } from "./lab";
import { hex2rgb, rgb2lab } from "./convert-color";

type Rgb = [number, number, number];

/** One entry of the named palette. */
export interface NamedPaletteColour {
  /** Stable id, family and tone, for example `red_500`. */
  id: string;
  /** Material family, for example `red`. */
  family: string;
  /** Material tone: 300, 500, 700 or 900. */
  tone: number;
  /** The colour as lower-case `#rrggbb`. */
  hex: string;
  /** Translation key of the name, which has an English and a Cantonese text. */
  labelKey: string;
}

export const COLOR_NAME_KEY_PREFIX = "ui.common.color_palette.name_";

const TONES = [300, 500, 700, 900] as const;

// Twelve Material families, four tones each: 48 named colours.
const FAMILIES: Record<string, readonly [string, string, string, string]> = {
  red: ["e57373", "f44336", "d32f2f", "b71c1c"],
  orange: ["ffb74d", "ff9800", "f57c00", "e65100"],
  amber: ["ffd54f", "ffc107", "ffa000", "ff6f00"],
  yellow: ["fff176", "ffeb3b", "fbc02d", "f57f17"],
  lime: ["dce775", "cddc39", "afb42b", "827717"],
  green: ["81c784", "4caf50", "388e3c", "1b5e20"],
  teal: ["4db6ac", "009688", "00796b", "004d40"],
  cyan: ["4dd0e1", "00bcd4", "0097a7", "006064"],
  blue: ["64b5f6", "2196f3", "1976d2", "0d47a1"],
  indigo: ["7986cb", "3f51b5", "303f9f", "1a237e"],
  purple: ["ba68c8", "9c27b0", "7b1fa2", "4a148c"],
  pink: ["f06292", "e91e63", "c2185b", "880e4f"],
};

export const NAMED_PALETTE: readonly NamedPaletteColour[] = Object.entries(
  FAMILIES
).flatMap(([family, hexes]) =>
  hexes.map((hex, index) => {
    const tone = TONES[index];
    const id = `${family}_${tone}`;
    return {
      id,
      family,
      tone,
      hex: `#${hex}`,
      labelKey: `${COLOR_NAME_KEY_PREFIX}${id}`,
    };
  })
);

const PALETTE_LAB: readonly LabColor[] = NAMED_PALETTE.map((colour) =>
  rgb2lab(hex2rgb(colour.hex))
);

export interface NearestNamedColour {
  colour: NamedPaletteColour;
  /** CIE76 distance in Lab, 0 for an exact match. */
  distance: number;
}

/** The named colour closest to a Lab colour, measured in Lab space. */
export const nearestNamedByLab = (lab: LabColor): NearestNamedColour => {
  let best = 0;
  let bestDistance = Infinity;
  PALETTE_LAB.forEach((candidate, index) => {
    const distance = Math.hypot(
      candidate[0] - lab[0],
      candidate[1] - lab[1],
      candidate[2] - lab[2]
    );
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return { colour: NAMED_PALETTE[best], distance: bestDistance };
};

/** The named colour closest to an sRGB colour (components 0 to 255). */
export const nearestNamedColour = (rgb: Rgb): NearestNamedColour =>
  nearestNamedByLab(rgb2lab(rgb));

/** Where a colour sits: inside sRGB, inside Display P3 only, or beyond both. */
export type Gamut = "srgb" | "p3" | "outside";

// Small allowance for rounding at the edge of a gamut.
const EDGE = 0.0005;

const inUnit = (values: number[]): boolean =>
  values.every((value) => value >= -EDGE && value <= 1 + EDGE);

// Keeps the sign so a component beyond the gamut stays beyond it.
const srgbToLinear = (component: number): number => {
  const value = component / 255;
  const abs = Math.abs(value);
  const linear = abs <= 0.04045 ? abs / 12.92 : ((abs + 0.055) / 1.055) ** 2.4;
  return value < 0 ? -linear : linear;
};

const multiply = (
  m: readonly (readonly [number, number, number])[],
  v: [number, number, number]
): Rgb => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// D65 matrices, the same white point as the Lab helpers.
const SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;

const XYZ_TO_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

const XYZ_TO_P3 = [
  [2.4934969, -0.9313836, -0.4027108],
  [-0.829489, 1.7626641, 0.0236247],
  [0.0358458, -0.0761724, 0.9568845],
] as const;

const classify = (xyz: Rgb): Gamut => {
  if (inUnit(multiply(XYZ_TO_SRGB, xyz))) {
    return "srgb";
  }
  // Display P3 is approximated from the same D65 XYZ values.
  return inUnit(multiply(XYZ_TO_P3, xyz)) ? "p3" : "outside";
};

/**
 * The gamut of an sRGB colour whose components may lie beyond 0 to 255, such
 * as an unclamped conversion result. Every ordinary colour is inside sRGB.
 */
export const gamutOfRgb = (rgb: Rgb): Gamut =>
  classify(
    multiply(SRGB_TO_XYZ, [
      srgbToLinear(rgb[0]),
      srgbToLinear(rgb[1]),
      srgbToLinear(rgb[2]),
    ])
  );

const labToXyz = ([l, a, b]: LabColor): Rgb => {
  const f = (t: number) =>
    t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29);
  const y = (l + 16) / 116;
  return [0.95047 * f(y + a / 500), 1 * f(y), 1.08883 * f(y - b / 200)];
};

/** The gamut of a Lab colour, which can lie outside what a screen shows. */
export const gamutOfLab = (lab: LabColor): Gamut => classify(labToXyz(lab));
