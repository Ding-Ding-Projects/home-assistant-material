import type { QueryParamConfig } from "../common/url/query-params";
import { createQueryString } from "../common/url/query-params";
import type { HomeAssistant } from "../types";

/**
 * Git repositories for dashboards: one per stored dashboard, with one nested
 * repository per view (tab). See docs/features/dashboard-history/README.md.
 */

/** The id of the default dashboard, which has no URL path. */
export const DEFAULT_DASHBOARD_ID = "_default";

export interface DashboardRepositoryView {
  key: string;
  title: string;
  path: string;
  head: string | null;
  commits: number;
}

export interface DashboardRepository {
  id: string;
  url_path: string | null;
  title: string;
  repository: string;
  head: string | null;
  commits: number;
  views: DashboardRepositoryView[];
  /** Keys of views that were deleted and whose history is kept. */
  removed: string[];
  /** The remote address, with nothing a person could have typed secretly. */
  remote: string | null;
  /** A remote is set but its address cannot be shown or used. */
  remote_unsafe: boolean;
  /** The last push to the remote, when there was one. */
  last_push: DashboardPush | null;
  /** The reason the last save was not committed, when it was not. */
  error: string | null;
}

export interface DashboardPush {
  /** Seconds since 1970. */
  time: number;
  ok: boolean;
  error: string | null;
}

export interface DashboardReposStatus {
  dashboards: DashboardRepository[];
  /** Dashboards with nothing to keep: written in YAML or generated. */
  skipped: { id: string; title: string; mode: string }[];
}

export interface DashboardCommit {
  sha: string;
  short: string;
  message: string;
  author: string;
  /** Seconds since 1970. */
  timestamp: number;
}

export interface DashboardVersion {
  config: Record<string, unknown>;
  yaml: string;
}

export const fetchDashboardReposStatus = (hass: HomeAssistant) =>
  hass.callWS<DashboardReposStatus>({ type: "dashboard_repos/status" });

export const fetchDashboardHistory = (
  hass: HomeAssistant,
  dashboardId: string,
  viewKey?: string,
  limit = 200
) =>
  hass.callWS<DashboardCommit[]>({
    type: "dashboard_repos/history",
    dashboard_id: dashboardId,
    ...(viewKey ? { view_key: viewKey } : {}),
    limit,
  });

export const fetchDashboardVersion = (
  hass: HomeAssistant,
  dashboardId: string,
  sha: string,
  viewKey?: string
) =>
  hass.callWS<DashboardVersion>({
    type: "dashboard_repos/version",
    dashboard_id: dashboardId,
    sha,
    ...(viewKey ? { view_key: viewKey } : {}),
  });

export const fetchDashboardDiff = (
  hass: HomeAssistant,
  dashboardId: string,
  oldSha: string,
  newSha?: string,
  viewKey?: string
) =>
  hass.callWS<{ diff: string }>({
    type: "dashboard_repos/diff",
    dashboard_id: dashboardId,
    old: oldSha,
    ...(newSha ? { new: newSha } : {}),
    ...(viewKey ? { view_key: viewKey } : {}),
  });

/** The error code of a restore that could not record the current state first. */
export const CURRENT_STATE_NOT_RECORDED = "current_state_not_recorded";

export interface DashboardRestoreResult {
  /** The commit the restore made, when the new state was recorded. */
  commit: string | null;
  /** The tab no longer existed, so it was added as a new tab. */
  new_view: boolean;
}

/**
 * Puts a dashboard, or one of its views, back as it was at a commit. The
 * current state is recorded first; without_saving_current accepts losing it
 * when that cannot be done.
 */
export const restoreDashboardVersion = (
  hass: HomeAssistant,
  dashboardId: string,
  sha: string,
  viewKey?: string,
  withoutSavingCurrent = false
) =>
  hass.callWS<DashboardRestoreResult>({
    type: "dashboard_repos/restore",
    dashboard_id: dashboardId,
    sha,
    ...(viewKey ? { view_key: viewKey } : {}),
    ...(withoutSavingCurrent ? { without_saving_current: true } : {}),
  });

/** Deletes the whole history of a dashboard and starts it again. */
export const forgetDashboardHistory = (
  hass: HomeAssistant,
  dashboardId: string
) =>
  hass.callWS<{ commit: string | null }>({
    type: "dashboard_repos/forget",
    dashboard_id: dashboardId,
  });

/** The history of a deleted dashboard, set aside in case it is wanted. */
export interface DashboardArchive {
  name: string;
  dashboard: string;
  /** Seconds since 1970, when the name says it. */
  archived_at: number | null;
}

export const fetchDashboardArchives = (hass: HomeAssistant) =>
  hass.callWS<{ archives: DashboardArchive[] }>({
    type: "dashboard_repos/archives",
  });

/** Deletes one archived history for good. */
export const forgetDashboardArchive = (hass: HomeAssistant, name: string) =>
  hass.callWS<undefined>({
    type: "dashboard_repos/forget_archive",
    name,
  });

/** Deletes the history of a tab that was removed from a dashboard. */
export const forgetRemovedDashboardView = (
  hass: HomeAssistant,
  dashboardId: string,
  viewKey: string
) =>
  hass.callWS<undefined>({
    type: "dashboard_repos/forget_removed_view",
    dashboard_id: dashboardId,
    view_key: viewKey,
  });

export const setDashboardRemote = (
  hass: HomeAssistant,
  dashboardId: string,
  url: string | null
) =>
  hass.callWS<undefined>({
    type: "dashboard_repos/set_remote",
    dashboard_id: dashboardId,
    url,
  });

export const pushDashboardRepository = (
  hass: HomeAssistant,
  dashboardId: string
) =>
  hass.callWS<{ pushed: boolean; error: string | null; time: number }>({
    type: "dashboard_repos/push",
    dashboard_id: dashboardId,
  });

const REMOTE_LIMIT = 500;
const REMOTE_HOST = "[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?";
const REMOTE_URL = new RegExp(
  `^(?:https|ssh)://${REMOTE_HOST}(?::[0-9]{1,5})?/[A-Za-z0-9._~%+/-]*$`
);
const REMOTE_SCP = new RegExp(
  `^git@${REMOTE_HOST}:[A-Za-z0-9._~%+/][A-Za-z0-9._~%+/-]*$`
);

/**
 * The same rule the server applies: https://host/path, ssh://host/path or
 * git@host:path, with no user name, password, query, fragment or space. The
 * server stays the authority; this only answers early.
 */
export const isValidDashboardRemote = (address: string): boolean => {
  const url = address.trim();
  return (
    url.length <= REMOTE_LIMIT && (REMOTE_URL.test(url) || REMOTE_SCP.test(url))
  );
};

export const dashboardHistoryQueryParamConfig = {
  string: ["dashboard", "view", "commit"],
} as const satisfies QueryParamConfig;

/** The address of the history of a dashboard, or of one of its views. */
export const dashboardHistoryUrl = (
  dashboardUrlPath: string | null | undefined,
  viewKey?: string
): string => {
  return `/config/dashboard_history?${createQueryString(
    {
      dashboard: dashboardUrlPath ?? DEFAULT_DASHBOARD_ID,
      ...(viewKey ? { view: viewKey } : {}),
    },
    dashboardHistoryQueryParamConfig
  )}`;
};
