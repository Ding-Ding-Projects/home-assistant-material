import type { HomeAssistant } from "../../../types";

/**
 * True when the person may make an editable copy of a generated page: an
 * administrator, outside kiosk mode and outside recovery mode. Every place
 * that offers "Edit cards and layout" uses this one check.
 */
export const canEditCardsAndLayout = (
  hass: Pick<HomeAssistant, "user" | "kioskMode" | "config">
): boolean =>
  Boolean(hass.user?.is_admin) &&
  !hass.kioskMode &&
  !hass.config?.recovery_mode;
