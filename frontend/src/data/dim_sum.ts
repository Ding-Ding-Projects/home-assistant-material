import { getStoredPreferences } from "../common/preferences/personal-preferences";
import type { HomeAssistant } from "../types";

export interface DimSumDish {
  id: string;
  name_en: string;
  name_yue: string;
  picture_url: string;
  content_type: string;
}

/** True while School mode is on: the surprise behaves as if not installed. */
export const isDimSumHidden = (): boolean => {
  try {
    return getStoredPreferences().schoolMode;
  } catch (_err) {
    return false;
  }
};

const isDish = (value: unknown): value is DimSumDish =>
  !!value &&
  typeof value === "object" &&
  ["id", "name_en", "name_yue", "picture_url", "content_type"].every(
    (key) => typeof (value as Record<string, unknown>)[key] === "string"
  );

/**
 * Asks the server for one random dish with a picture, or resolves
 * `undefined` when there is none, the command fails or School mode is on.
 */
export const fetchRandomDish = async (
  hass: HomeAssistant
): Promise<DimSumDish | undefined> => {
  if (isDimSumHidden()) {
    return undefined;
  }
  try {
    const dish = await hass.callWS<DimSumDish | null>({
      type: "dim_sum/random",
    });
    return isDish(dish) ? dish : undefined;
  } catch (_err) {
    return undefined;
  }
};
