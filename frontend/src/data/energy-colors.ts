/**
 * Colors for energy sources and devices.
 *
 * By default every series follows the theme palette. The energy preferences
 * may hold an optional `colors` map (statistic id to `#rrggbb`) that pins one
 * source or device to a color of its own. Every energy chart, table and graph
 * resolves its color through {@link resolveEnergyColor}, so one stored choice
 * shows up everywhere.
 */

export type EnergyColors = Record<string, string>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const isEnergyColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR.test(value);

/** Keep only usable `#rrggbb` entries, lower-cased. */
export const normalizeEnergyColors = (colors?: unknown): EnergyColors => {
  const result: EnergyColors = {};
  if (!colors || typeof colors !== "object") {
    return result;
  }
  for (const [statId, value] of Object.entries(colors)) {
    if (statId && isEnergyColor(value)) {
      result[statId] = value.toLowerCase();
    }
  }
  return result;
};

let overrides: EnergyColors = {};

/** Set the colors chosen in the energy settings, as loaded from the preferences. */
export const setEnergyColorOverrides = (colors?: unknown): void => {
  overrides = normalizeEnergyColors(colors);
};

export const getEnergyColorOverride = (statId?: string): string | undefined =>
  statId ? overrides[statId] : undefined;

/**
 * The color for one source or device: the one chosen in the energy settings,
 * or the theme color the caller computed when none is chosen.
 */
export const resolveEnergyColor = (
  statId: string | undefined,
  themeColor: string
): string => getEnergyColorOverride(statId) ?? themeColor;

/** The preferences' colors after setting or clearing one entry. */
export const withEnergyColor = (
  colors: EnergyColors | undefined,
  statId: string,
  color?: string
): EnergyColors => {
  const next = normalizeEnergyColors(colors);
  if (color && isEnergyColor(color)) {
    next[statId] = color.toLowerCase();
  } else {
    delete next[statId];
  }
  return next;
};
