import type { HomeAssistant } from "../types";
import type { AutomationConfig } from "./automation";

/**
 * Git repositories for automations: one per automation, and a master that
 * records the commit each one is at. See docs/automation-repositories.md.
 */

export interface AutomationRepository {
  id: string;
  alias: string;
  /** Folder of the repository inside the master, such as `automations/x`. */
  repository: string;
  head: string | null;
  commits: number;
  /** True when the automation differs from its last commit. */
  dirty: boolean;
  remote: string | null;
  /** True when a remote is set but its address is not allowed, so it is hidden. */
  remote_unsafe: boolean;
}

export interface AutomationReposStatus {
  automations: AutomationRepository[];
  master: {
    head: string | null;
    /** Seconds since 1970. */
    last_commit: number | null;
    remote: string | null;
    remote_unsafe: boolean;
  };
}

export interface AutomationCommit {
  sha: string;
  short: string;
  message: string;
  author: string;
  /** Seconds since 1970. */
  timestamp: number;
}

export interface AutomationPushResult {
  committed: { id: string; commit: string }[];
  unchanged: number;
  skipped: { id: string; reason: string }[];
  master_commit: string | null;
  pushed: string[];
  push_errors: { id: string; error: string }[];
}

export const fetchAutomationReposStatus = (hass: HomeAssistant) =>
  hass.callWS<AutomationReposStatus>({ type: "automation_repos/status" });

export const fetchAutomationHistory = (
  hass: HomeAssistant,
  automationId: string,
  limit = 100
) =>
  hass.callWS<AutomationCommit[]>({
    type: "automation_repos/history",
    automation_id: automationId,
    limit,
  });

export const fetchAutomationVersion = (
  hass: HomeAssistant,
  automationId: string,
  sha: string
) =>
  hass.callWS<AutomationConfig>({
    type: "automation_repos/version",
    automation_id: automationId,
    sha,
  });

export const fetchAutomationDiff = (
  hass: HomeAssistant,
  automationId: string,
  oldSha: string,
  newSha?: string
) =>
  hass.callWS<{ diff: string }>({
    type: "automation_repos/diff",
    automation_id: automationId,
    old: oldSha,
    ...(newSha ? { new: newSha } : {}),
  });

export const pushAutomationRepos = (
  hass: HomeAssistant,
  message?: string,
  automationIds?: string[]
) =>
  hass.callWS<AutomationPushResult>({
    type: "automation_repos/push",
    ...(message ? { message } : {}),
    ...(automationIds ? { automation_ids: automationIds } : {}),
  });

export const setAutomationRemote = (
  hass: HomeAssistant,
  automationId: string | null,
  url: string | null
) =>
  hass.callWS<undefined>({
    type: "automation_repos/set_remote",
    automation_id: automationId,
    url,
  });

/**
 * Deletes every saved version of one automation and starts a new history from
 * the automation as it is now. The automation itself does not change.
 */
export const forgetAutomationHistory = (
  hass: HomeAssistant,
  automationId: string
) =>
  hass.callWS<{ commit: string | null }>({
    type: "automation_repos/forget",
    automation_id: automationId,
  });

/**
 * Commits the automation as it is now, if it differs from its last commit, so
 * putting back an older version never loses a change that was not recorded.
 */
export const recordAutomation = (
  hass: HomeAssistant,
  automationId: string,
  message?: string
) =>
  hass.callWS<{ commit: string | null }>({
    type: "automation_repos/record",
    automation_id: automationId,
    ...(message ? { message } : {}),
  });
