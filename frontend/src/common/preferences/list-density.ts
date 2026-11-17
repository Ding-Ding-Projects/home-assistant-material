/**
 * List density: how tall the rows of every list page are. The choice is a
 * personal preference; this module turns it into CSS custom properties on the
 * document root, which the data table and the settings front read.
 */

export type ListDensity = "compact" | "comfortable" | "cosy";

export const LIST_DENSITIES: ListDensity[] = ["compact", "comfortable", "cosy"];

export const DEFAULT_LIST_DENSITY: ListDensity = "compact";

/** Never smaller than the 44 px touch target. */
export const LIST_ROW_MIN_TOUCH_TARGET = 44;

export const LIST_DENSITY_VARIABLES: Record<
  ListDensity,
  Record<string, string>
> = {
  compact: {
    "--ha-list-row-min": "52px",
    "--ha-list-row-max": "60px",
    "--ha-list-row-gap": "6px",
    "--ha-list-row-radius": "16px",
    "--ha-list-row-title-size": "14px",
    "--ha-list-row-title-weight": "600",
    "--ha-list-row-icon-tile": "34px",
    "--ha-list-tile-min": "120px",
  },
  comfortable: {
    "--ha-list-row-min": "64px",
    "--ha-list-row-max": "64px",
    "--ha-list-row-gap": "8px",
    "--ha-list-row-radius": "20px",
    "--ha-list-row-title-size": "16px",
    "--ha-list-row-title-weight": "700",
    "--ha-list-row-icon-tile": "40px",
    "--ha-list-tile-min": "168px",
  },
  cosy: {
    "--ha-list-row-min": "44px",
    "--ha-list-row-max": "44px",
    "--ha-list-row-gap": "4px",
    "--ha-list-row-radius": "12px",
    "--ha-list-row-title-size": "14px",
    "--ha-list-row-title-weight": "600",
    "--ha-list-row-icon-tile": "30px",
    "--ha-list-tile-min": "96px",
  },
};

/** Any stored value that is not a known density reads as compact. */
export const normalizeListDensity = (
  value: unknown,
  fallback: ListDensity = DEFAULT_LIST_DENSITY
): ListDensity =>
  LIST_DENSITIES.includes(value as ListDensity)
    ? (value as ListDensity)
    : fallback;

/** Sets the density variables on the given element (the document root). */
export const applyListDensity = (
  density: ListDensity,
  root: HTMLElement = document.documentElement
): void => {
  const variables = LIST_DENSITY_VARIABLES[normalizeListDensity(density)];
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  root.setAttribute("data-list-density", normalizeListDensity(density));
};
