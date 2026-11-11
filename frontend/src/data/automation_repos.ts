import type { HomeAssistant } from "../types";
import type { AutomationConfig } from "./automation";

/**
 * Git repositories for automations: one per automation, and a master that
 * records the commit each one is at. See docs/automation-repositories.md.
 */

/** Codes the history integrations answer with, each with a localized text. */
export const HISTORY_ERROR_CODES = [
  "git_error",
  "automations_unreadable",
  "dashboard_not_found",
  "not_storage_dashboard",
  "dashboard_changed",
  "save_failed",
  "not_found",
  "unknown_error",
  "invalid_format",
] as const;

/**
 * Describes a failed history call in words. A known server code is shown as a
 * localized sentence found at `<prefix>.errors.<code>`, followed by the text
 * the server sent as detail. Any other failure keeps its own message.
 */
export const describeHistoryError = (
  hass: HomeAssistant,
  err: unknown,
  prefix: string
): string => {
  const failure = err as { code?: unknown; message?: unknown } | undefined;
  const code = failure?.code;
  const detail =
    typeof failure?.message === "string" ? failure.message : String(err);
  if (
    typeof code !== "string" ||
    !(HISTORY_ERROR_CODES as readonly string[]).includes(code)
  ) {
    return detail;
  }
  const text = hass.localize(`${prefix}.errors.${code}` as any);
  return detail && detail !== text && detail !== code
    ? `${text} ${detail}`
    : text;
};

export interface AutomationArchive {
  /** The folder it was set aside in; the name to restore it by. */
  name: string;
  /** The automation folder it came from. */
  automation: string;
  /** Seconds since 1970. */
  archived_at: number;
}

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
  /** Why the last save of this automation was not committed, when it was not. */
  error?: string | null;
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

export const fetchAutomationArchives = (hass: HomeAssistant) =>
  hass.callWS<{ archives: AutomationArchive[] }>({
    type: "automation_repos/archives",
  });

/** Brings a set-aside history back, when that automation has none now. */
export const restoreAutomationArchive = (hass: HomeAssistant, name: string) =>
  hass.callWS<{ automation: string }>({
    type: "automation_repos/restore_archive",
    name,
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
