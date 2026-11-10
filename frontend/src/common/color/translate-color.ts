/**
 * One colour written every way: hex, RGB, HSL, HSV, HWB, OKLCH, CIELAB and
 * an approximate CMYK, with its nearest named colour and how well text
 * reads on it. The colour is held as sRGB, 0 to 255, with alpha 0 to 1.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Hsv {
  /** 0 to 360. */
  h: number;
  /** 0 to 1. */
  s: number;
  /** 0 to 1. */
  v: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const hsvToRgb = ({ h, s, v }: Hsv): [number, number, number] => {
  const hue = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 1
      ? [c, x, 0]
      : hue < 2
        ? [x, c, 0]
        : hue < 3
          ? [0, c, x]
          : hue < 4
            ? [0, x, c]
            : hue < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
};

export const rgbToHsv = (r: number, g: number, b: number): Hsv => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r / 255) {
      h = ((g - b) / 255 / delta) % 6;
    } else if (max === g / 255) {
      h = (b - r) / 255 / delta + 2;
    } else {
      h = (r - g) / 255 / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return { h, s: max ? delta / max : 0, v: max };
};

export const rgbToHsl = (
  r: number,
  g: number,
  b: number
): [h: number, s: number, l: number] => {
  const { h } = rgbToHsv(r, g, b);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
};

export const rgbToHwb = (
  r: number,
  g: number,
  b: number
): [h: number, w: number, b: number] => [
  rgbToHsv(r, g, b).h,
  Math.min(r, g, b) / 255,
  1 - Math.max(r, g, b) / 255,
];

const toLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** OKLab, from sRGB. */
export const rgbToOklab = (
  r: number,
  g: number,
  b: number
): [l: number, a: number, b: number] => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

export const rgbToOklch = (
  r: number,
  g: number,
  b: number
): [l: number, c: number, h: number] => {
  const [l, a, bb] = rgbToOklab(r, g, b);
  const c = Math.hypot(a, bb);
  const h = c < 0.0002 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;
  return [l, c, h < 0 ? h + 360 : h];
};

/** CIELAB with the D50 white that CSS `lab()` uses, from sRGB. */
export const rgbToLab = (
  r: number,
  g: number,
  b: number
): [l: number, a: number, b: number] => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  // Linear sRGB to XYZ, already adapted from D65 to D50.
  const x = 0.4360747 * lr + 0.3850649 * lg + 0.1430804 * lb;
  const y = 0.2225045 * lr + 0.7168786 * lg + 0.0606169 * lb;
  const z = 0.0139322 * lr + 0.0971045 * lg + 0.7141733 * lb;
  const f = (value: number) =>
    value > 216 / 24389
      ? Math.cbrt(value)
      : (24389 / 27 / 116) * value + 16 / 116;
  const fx = f(x / 0.96422);
  const fy = f(y);
  const fz = f(z / 0.82521);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

/** CMYK without a colour profile: a rough guide, not what a press prints. */
export const rgbToCmyk = (
  r: number,
  g: number,
  b: number
): [c: number, m: number, y: number, k: number] => {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) {
    return [0, 0, 0, 1];
  }
  return [
    (1 - r / 255 - k) / (1 - k),
    (1 - g / 255 - k) / (1 - k),
    (1 - b / 255 - k) / (1 - k),
    k,
  ];
};

const hex2 = (value: number): string =>
  clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();

export const toHex = ({ r, g, b }: Rgba): string =>
  `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export const toHex8 = (color: Rgba): string =>
  `${toHex(color)}${hex2(color.a * 255)}`;

export interface ColorFormats {
  hex: string;
  hex8: string;
  rgb: string;
  hsl: string;
  hsv: string;
  hwb: string;
  oklch: string;
  lab: string;
  cmyk: string;
}

/** The colour in each notation, as CSS writes it where CSS has one. */
export const formatColor = (color: Rgba): ColorFormats => {
  const { r, g, b, a } = color;
  const alpha = `${round(a * 100)}%`;
  const [hh, hs, hl] = rgbToHsl(r, g, b);
  const hsv = rgbToHsv(r, g, b);
  const [wh, ww, wb] = rgbToHwb(r, g, b);
  const [ol, oc, oh] = rgbToOklch(r, g, b);
  const [ll, la, lb] = rgbToLab(r, g, b);
  const [c, m, y, k] = rgbToCmyk(r, g, b);
  return {
    hex: toHex(color),
    hex8: toHex8(color),
    rgb: `rgb(${r} ${g} ${b} / ${alpha})`,
    hsl: `hsl(${round(hh)} ${round(hs * 100)}% ${round(hl * 100)}% / ${alpha})`,
    hsv: `hsv(${round(hsv.h)} ${round(hsv.s * 100)}% ${round(hsv.v * 100)}%)`,
    hwb: `hwb(${round(wh)} ${round(ww * 100)}% ${round(wb * 100)}% / ${alpha})`,
    oklch: `oklch(${round(ol * 100, 1)}% ${round(oc, 3)} ${round(oh, 1)} / ${alpha})`,
    lab: `lab(${round(ll, 1)} ${round(la, 1)} ${round(lb, 1)} / ${alpha})`,
    cmyk: `${round(c * 100)} ${round(m * 100)} ${round(y * 100)} ${round(k * 100)}`,
  };
};

/**
 * Reads a colour a person typed: hex with 3, 4, 6 or 8 digits, or `rgb()`
 * and `hsl()` with numbers and percentages. Returns undefined for anything
 * else, so nothing is guessed.
 */
export const parseColor = (text: string): Rgba | undefined => {
  const value = text.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full =
      hex.length <= 4
        ? hex
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? round(parseInt(full.slice(6, 8), 16) / 255, 3) : 1,
    };
  }
  const call = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(value);
  if (!call) {
    return undefined;
  }
  const parts = call[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) {
    return undefined;
  }
  const number = (part: string, scale: number): number =>
    part.endsWith("%") ? (parseFloat(part) / 100) * scale : parseFloat(part);
  const alpha = parts[3] === undefined ? 1 : clamp(number(parts[3], 1), 0, 1);
  if (call[1].startsWith("rgb")) {
    const [r, g, b] = parts
      .slice(0, 3)
      .map((part) => clamp(Math.round(number(part, 255)), 0, 255));
    return [r, g, b].some(Number.isNaN) ? undefined : { r, g, b, a: alpha };
  }
  const h = parseFloat(parts[0]);
  const s = clamp(number(parts[1], 1), 0, 1);
  const l = clamp(number(parts[2], 1), 0, 1);
  if ([h, s, l].some(Number.isNaN) || !parts[1].endsWith("%")) {
    return undefined;
  }
  const v = l + s * Math.min(l, 1 - l);
  const [r, g, b] = hsvToRgb({ h, s: v ? 2 * (1 - l / v) : 0, v });
  return { r, g, b, a: alpha };
};

const luminance = (r: number, g: number, b: number): number =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** WCAG contrast of two opaque colours, 1 to 21. */
export const contrast = (
  a: [number, number, number],
  b: [number, number, number]
): number => {
  const la = luminance(...a);
  const lb = luminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** What the contrast is good for: all text, large text only, or nothing. */
export const contrastGrade = (ratio: number): "all" | "large" | "none" =>
  ratio >= 4.5 ? "all" : ratio >= 3 ? "large" : "none";

/** The CSS named colours, by name. */
export const NAMED_COLORS: Record<string, string> = {
  aliceblue: "f0f8ff",
  antiquewhite: "faebd7",
  aqua: "00ffff",
  aquamarine: "7fffd4",
  azure: "f0ffff",
  beige: "f5f5dc",
  bisque: "ffe4c4",
  black: "000000",
  blanchedalmond: "ffebcd",
  blue: "0000ff",
  blueviolet: "8a2be2",
  brown: "a52a2a",
  burlywood: "deb887",
  cadetblue: "5f9ea0",
  chartreuse: "7fff00",
  chocolate: "d2691e",
  coral: "ff7f50",
  cornflowerblue: "6495ed",
  cornsilk: "fff8dc",
  crimson: "dc143c",
  darkblue: "00008b",
  darkcyan: "008b8b",
  darkgoldenrod: "b8860b",
  darkgray: "a9a9a9",
  darkgreen: "006400",
  darkkhaki: "bdb76b",
  darkmagenta: "8b008b",
  darkolivegreen: "556b2f",
  darkorange: "ff8c00",
  darkorchid: "9932cc",
  darkred: "8b0000",
  darksalmon: "e9967a",
  darkseagreen: "8fbc8f",
  darkslateblue: "483d8b",
  darkslategray: "2f4f4f",
  darkturquoise: "00ced1",
  darkviolet: "9400d3",
  deeppink: "ff1493",
  deepskyblue: "00bfff",
  dimgray: "696969",
  dodgerblue: "1e90ff",
  firebrick: "b22222",
  floralwhite: "fffaf0",
  forestgreen: "228b22",
  fuchsia: "ff00ff",
  gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff",
  gold: "ffd700",
  goldenrod: "daa520",
  gray: "808080",
  green: "008000",
  greenyellow: "adff2f",
  honeydew: "f0fff0",
  hotpink: "ff69b4",
  indianred: "cd5c5c",
  indigo: "4b0082",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  lavenderblush: "fff0f5",
  lawngreen: "7cfc00",
  lemonchiffon: "fffacd",
  lightblue: "add8e6",
  lightcoral: "f08080",
  lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3",
  lightgreen: "90ee90",
  lightpink: "ffb6c1",
  lightsalmon: "ffa07a",
  lightseagreen: "20b2aa",
  lightskyblue: "87cefa",
  lightslategray: "778899",
  lightsteelblue: "b0c4de",
  lightyellow: "ffffe0",
  lime: "00ff00",
  limegreen: "32cd32",
  linen: "faf0e6",
  maroon: "800000",
  mediumaquamarine: "66cdaa",
  mediumblue: "0000cd",
  mediumorchid: "ba55d3",
  mediumpurple: "9370db",
  mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc",
  mediumvioletred: "c71585",
  midnightblue: "191970",
  mintcream: "f5fffa",
  mistyrose: "ffe4e1",
  moccasin: "ffe4b5",
  navajowhite: "ffdead",
  navy: "000080",
  oldlace: "fdf5e6",
  olive: "808000",
  olivedrab: "6b8e23",
  orange: "ffa500",
  orangered: "ff4500",
  orchid: "da70d6",
  palegoldenrod: "eee8aa",
  palegreen: "98fb98",
  paleturquoise: "afeeee",
  palevioletred: "db7093",
  papayawhip: "ffefd5",
  peachpuff: "ffdab9",
  peru: "cd853f",
  pink: "ffc0cb",
  plum: "dda0dd",
  powderblue: "b0e0e6",
  purple: "800080",
  rebeccapurple: "663399",
  red: "ff0000",
  rosybrown: "bc8f8f",
  royalblue: "4169e1",
  saddlebrown: "8b4513",
  salmon: "fa8072",
  sandybrown: "f4a460",
  seagreen: "2e8b57",
  seashell: "fff5ee",
  sienna: "a0522d",
  silver: "c0c0c0",
  skyblue: "87ceeb",
  slateblue: "6a5acd",
  slategray: "708090",
  snow: "fffafa",
  springgreen: "00ff7f",
  steelblue: "4682b4",
  tan: "d2b48c",
  teal: "008080",
  thistle: "d8bfd8",
  tomato: "ff6347",
  turquoise: "40e0d0",
  violet: "ee82ee",
  wheat: "f5deb3",
  white: "ffffff",
  whitesmoke: "f5f5f5",
  yellow: "ffff00",
  yellowgreen: "9acd32",
};

/** The named colour that looks closest, measured in OKLab. */
export const nearestNamed = (
  r: number,
  g: number,
  b: number
): { name: string; hex: string; exact: boolean } => {
  const target = rgbToOklab(r, g, b);
  let best = { name: "", hex: "", distance: Infinity };
  Object.entries(NAMED_COLORS).forEach(([name, hex]) => {
    const lab = rgbToOklab(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    );
    const distance = Math.hypot(
      lab[0] - target[0],
      lab[1] - target[1],
      lab[2] - target[2]
    );
    if (distance < best.distance) {
      best = { name, hex: `#${hex.toUpperCase()}`, distance };
    }
  });
  return { name: best.name, hex: best.hex, exact: best.distance < 0.0005 };
};
