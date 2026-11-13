/**
 * Colour maths for the accessibility checker: parsing the colours a browser
 * reports for computed styles, layering transparent colours, and the WCAG
 * contrast ratio.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Reads `rgb()`, `rgba()` and `color(srgb ...)` values, which is what
 * `getComputedStyle` returns for the colours a page can use. Anything else
 * (gradients, other colour spaces) returns undefined: it cannot be judged.
 */
export const parseColor = (value: string): Rgba | undefined => {
  const text = value.trim().toLowerCase();
  if (text === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      text
    );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: alpha(rgb[4]),
    };
  }
  const srgb =
    /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
      text
    );
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: alpha(srgb[4]),
    };
  }
  return undefined;
};

function alpha(raw: string | undefined): number {
  if (raw === undefined) {
    return 1;
  }
  return clamp01(
    raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw)
  );
}

/** Puts `top` over `bottom`; the result is opaque when `bottom` is. */
export const compose = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const mix = (t: number, b: number) =>
    (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return {
    r: mix(top.r, bottom.r),
    g: mix(top.g, bottom.g),
    b: mix(top.b, bottom.b),
    a,
  };
};

const channel = (value: number): number => {
  const c = clamp01(value / 255);
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = (c: Rgba): number =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

/** WCAG contrast ratio between two opaque colours, 1 to 21. */
export const contrastRatio = (a: Rgba, b: Rgba): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * The contrast ratio WCAG asks for: 4.5 for normal text, 3 for large text
 * (24 px, or 18.66 px and bold).
 */
export const requiredContrast = (fontSizePx: number, weight: number): number =>
  fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700) ? 3 : 4.5;
