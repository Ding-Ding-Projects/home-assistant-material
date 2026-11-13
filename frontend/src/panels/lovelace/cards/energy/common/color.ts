import {
  hex2rgb,
  lab2rgb,
  rgb2hex,
  rgb2lab,
  theme2hex,
} from "../../../../../common/color/convert-color";
import { getEnergyColorOverride } from "../../../../../data/energy-colors";
import { labBrighten, labDarken } from "../../../../../common/color/lab";

export function getEnergyColor(
  computedStyles: CSSStyleDeclaration,
  darkMode: boolean,
  background: boolean,
  compare: boolean,
  propertyName: string,
  idx?: number,
  statId?: string
): string {
  // A color chosen for this source or device in the energy settings wins over
  // the theme palette and is used as is (no brightening by position).
  const chosen = getEnergyColorOverride(statId);
  if (chosen) {
    return withAlpha(chosen, background, compare);
  }

  const themeIdxColor = computedStyles
    .getPropertyValue(propertyName + "-" + idx)
    .trim();

  const themeColor =
    themeIdxColor.length > 0
      ? themeIdxColor
      : computedStyles.getPropertyValue(propertyName).trim();

  let hexColor = theme2hex(themeColor);

  if (themeIdxColor.length === 0 && idx) {
    // Brighten or darken the color based on set position.
    // Skip if theme already provides a color for this set.

    hexColor = rgb2hex(
      lab2rgb(
        darkMode
          ? labBrighten(rgb2lab(hex2rgb(hexColor)), idx)
          : labDarken(rgb2lab(hex2rgb(hexColor)), idx)
      )
    );
  }

  return withAlpha(hexColor, background, compare);
}

function withAlpha(
  hexColor: string,
  background: boolean,
  compare: boolean
): string {
  if (compare) {
    return hexColor + (background ? "32" : "7F");
  }
  return background ? hexColor + "7F" : hexColor;
}
