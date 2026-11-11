import memoizeOne from "memoize-one";
import type { CloudStatus } from "../../../../data/cloud";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import type { HomeAssistant } from "../../../../types";

export const getAvailableAssistants = memoizeOne(
  (_cloudStatus: CloudStatus | undefined, hass: HomeAssistant) => {
    const showAssistants: string[] = [];

    if (isComponentLoaded(hass.config, "conversation")) {
      showAssistants.push("conversation");
    }

    return showAssistants;
  }
);
