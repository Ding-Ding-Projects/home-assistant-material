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
  remote: string | null;
  /** The reason the last save was not committed, when it was not. */
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

/** Puts a dashboard, or one of its views, back as it was at a commit. */
export const restoreDashboardVersion = (
  hass: HomeAssistant,
  dashboardId: string,
  sha: string,
  viewKey?: string
) =>
  hass.callWS<undefined>({
    type: "dashboard_repos/restore",
    dashboard_id: dashboardId,
    sha,
    ...(viewKey ? { view_key: viewKey } : {}),
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
  hass.callWS<{ pushed: boolean; error: string | null }>({
    type: "dashboard_repos/push",
    dashboard_id: dashboardId,
  });

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
