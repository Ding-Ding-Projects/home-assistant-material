import type { HomeAssistant } from "../types";

/** One distinct problem recorded in the local problem log repository. */
export interface RecordedProblem {
  file: string;
  title: string;
  logger?: string;
  level?: string;
  version?: string;
  first_seen: string;
  last_seen: string;
  count: number;
  /** The recorded message and traceback, already redacted by the backend. */
  detail: string;
}

export interface ProblemLogOverview {
  /** Where the Git repository lives on the machine that runs Home Assistant. */
  path: string;
  git_available: boolean;
  /** True when the owner added a remote named origin to the repository. */
  has_remote: boolean;
  problems: RecordedProblem[];
}

export const fetchProblemLog = (hass: HomeAssistant) =>
  hass.callWS<ProblemLogOverview>({ type: "problem_log/list" });
