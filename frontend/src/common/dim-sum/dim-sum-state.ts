import { STATE_RUNNING } from "home-assistant-js-websocket";
import { getTopOpenDialogTag } from "../../dialogs/make-dialog-manager";
import type { HomeAssistant } from "../../types";
import { hasUnsavedChanges } from "../navigate";
import { isDimSumHidden } from "../../data/dim_sum";
import type { DimSumAppState } from "./dim-sum-draw";

const ERROR_SCREEN_TAG = "hass-error-screen";

/** How many elements the search for an error screen may look at. */
const SEARCH_LIMIT = 20000;

/** True while the server is not fully running or an update is installing. */
export const isServerBusy = (hass: HomeAssistant): boolean =>
  hass.config.state !== STATE_RUNNING ||
  !!hass.config.recovery_mode ||
  Object.values(hass.states).some(
    (stateObj) =>
      stateObj.entity_id.startsWith("update.") &&
      !!stateObj.attributes.in_progress
  );

/** True when an error screen is anywhere in the page, shadow roots included. */
export const isErrorScreenShown = (root: ParentNode = document): boolean => {
  const queue: ParentNode[] = [root];
  let seen = 0;
  while (queue.length && seen < SEARCH_LIMIT) {
    const node = queue.pop()!;
    for (const element of node.querySelectorAll("*")) {
      seen++;
      if (element.localName === ERROR_SCREEN_TAG) {
        return true;
      }
      if (element.shadowRoot) {
        queue.push(element.shadowRoot);
      }
    }
  }
  return false;
};

/** What the app is doing right now, as the draw needs to know it. */
export const readDimSumState = (hass: HomeAssistant): DimSumAppState => {
  const path = window.location.pathname;
  return {
    schoolMode: isDimSumHidden(),
    onboarding: path.startsWith("/onboarding"),
    signInPage: path.startsWith("/auth/"),
    connected: hass.connected,
    serverBusy: isServerBusy(hass),
    shellLoading: !hass.panels || !hass.userData || !hass.systemData,
    errorShown: isErrorScreenShown(),
    dialogOpen: getTopOpenDialogTag() !== undefined,
    unsavedChanges: hasUnsavedChanges(),
  };
};
