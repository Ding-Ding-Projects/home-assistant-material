import type { HomeAssistant } from "../../types";
import type { DishProvider, SurpriseDish } from "./download";

type RandomDishFunction = (
  hass: HomeAssistant
) => Promise<SurpriseDish | undefined>;

/**
 * The dish provider of the running interface: the dim sum feature's random
 * dish. A missing feature, a missing export or a failing call all mean that
 * no dish is available, and the download simply stays a plain file.
 */
export const dimSumDishProvider =
  (api: Pick<HomeAssistant, "callWS" | "fetchWithAuth">): DishProvider =>
  async () => {
    try {
      const feature = (await import("../../data/dim_sum")) as unknown as {
        fetchRandomDish?: RandomDishFunction;
      };
      if (typeof feature.fetchRandomDish !== "function") {
        return undefined;
      }
      // The feature only reads the API calls of the interface object
      return await feature.fetchRandomDish(api as HomeAssistant);
    } catch (_err) {
      return undefined;
    }
  };
