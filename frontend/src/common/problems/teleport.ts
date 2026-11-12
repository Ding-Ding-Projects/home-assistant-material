/**
 * Teleport: opens the page that shows a problem, scrolls its element into
 * view, and asks the overlay to spotlight it with the details beside it.
 */
import { navigate } from "../navigate";
import { getProblem, whenTarget } from "./problem-store";
import { motionReduced } from "./problem-settings";

export const PROBLEM_SPOTLIGHT_EVENT = "ha-problem-spotlight";

export interface ProblemSpotlightDetail {
  id: string;
  /** False when the element never appeared, so the overlay can say so. */
  found: boolean;
}

const currentPath = () =>
  `${window.location.pathname}${window.location.search}`;

export const teleportToProblem = async (id: string): Promise<boolean> => {
  const problem = getProblem(id);
  if (!problem) {
    return false;
  }
  if (problem.path && problem.path !== currentPath()) {
    await navigate(problem.path);
  }
  const element = await whenTarget(id);
  if (element) {
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: motionReduced() ? "auto" : "smooth",
    });
  }
  window.dispatchEvent(
    new CustomEvent<ProblemSpotlightDetail>(PROBLEM_SPOTLIGHT_EVENT, {
      detail: { id, found: Boolean(element) },
    })
  );
  return Boolean(element);
};
