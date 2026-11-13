/**
 * Reports a "missing entity" problem for one element on screen: a dashboard
 * card or an automation step that names entities Home Assistant does not
 * know. Clears the problem when the entities are back.
 */
import type { HomeAssistant } from "../../types";
import { missingEntities } from "./missing-entities";
import type { Problem } from "./problem-store";
import {
  bindTarget,
  clearProblem,
  setProblem,
  unbindTarget,
} from "./problem-store";

export interface EntityDetectorOptions {
  id: string;
  element: Element;
  config: unknown;
  hass: HomeAssistant;
  source: string;
  /** Where it is, already localized. */
  location: string;
  /** Steps to fix it by hand, already localized. */
  manualSteps: string[];
  fix?: Problem["fix"];
  fixLabel?: string;
}

/** Returns true when a problem was reported. */
export const detectMissingEntities = (
  options: EntityDetectorOptions
): boolean => {
  const { id, element, config, hass } = options;
  // Before the first states arrive every entity would look missing.
  if (!hass.states || !Object.keys(hass.states).length) {
    return false;
  }
  const missing = missingEntities(config, hass.states);
  if (!missing.length) {
    clearProblem(id);
    unbindTarget(id, element);
    return false;
  }
  setProblem({
    id,
    source: options.source,
    severity: "error",
    title: hass.localize("ui.problems.missing_entity.title", {
      entities: missing.join(", "),
      count: missing.length,
    }),
    why: hass.localize("ui.problems.missing_entity.why"),
    location: options.location,
    path: `${window.location.pathname}${window.location.search}`,
    manualSteps: options.manualSteps,
    fix: options.fix,
    fixLabel: options.fixLabel,
  });
  bindTarget(id, element);
  return true;
};

/** Lets go of the element (it left the page) but keeps the problem listed. */
export const releaseTarget = (id: string | undefined, element: Element) => {
  if (id) {
    unbindTarget(id, element);
  }
};
