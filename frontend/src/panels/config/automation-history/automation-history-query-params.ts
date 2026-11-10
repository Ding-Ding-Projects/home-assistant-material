import {
  createQueryString,
  decodeQueryParams,
  type QueryParamConfig,
  type QueryParamValues,
  type SearchParamsSource,
} from "../../../common/url/query-params";

/** How far back the version list reaches, in days. `all` shows every one. */
export const HISTORY_RANGES = ["all", "7", "30", "90"] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number];

export const HISTORY_FILTERS = ["failing", "live", "untested"] as const;

export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

/**
 * The state of the history manager that a link can carry:
 * - `search`, `status`, `automation` and `range` shape the list of versions.
 * - `repository` opens the version history of one automation, and `commit`
 *   picks the version shown there.
 */
export const automationHistoryQueryParamConfig = {
  string: ["search", "automation", "range", "repository", "commit"],
  list: ["status"],
} as const satisfies QueryParamConfig;

export type AutomationHistoryQueryParams = QueryParamValues<
  typeof automationHistoryQueryParamConfig
>;

export interface AutomationHistoryState {
  search: string;
  filters: HistoryFilter[];
  automation: string;
  range: HistoryRange;
  repository?: string;
  commit?: string;
}

export const decodeAutomationHistoryQueryParams = (
  searchParams: SearchParamsSource
): AutomationHistoryQueryParams =>
  decodeQueryParams(searchParams, automationHistoryQueryParamConfig);

/** Anything a link says that this page does not know is left out. */
export const stateFromQueryParams = (
  params: AutomationHistoryQueryParams
): AutomationHistoryState => ({
  search: params.search ?? "",
  filters: (params.status ?? []).filter((item): item is HistoryFilter =>
    (HISTORY_FILTERS as readonly string[]).includes(item)
  ),
  automation: params.automation ?? "",
  range: (HISTORY_RANGES as readonly string[]).includes(params.range ?? "")
    ? (params.range as HistoryRange)
    : "all",
  repository: params.repository || undefined,
  commit: params.commit || undefined,
});

export const queryParamsFromState = (
  state: AutomationHistoryState
): AutomationHistoryQueryParams => ({
  search: state.search,
  status: state.filters,
  automation: state.automation,
  range: state.range === "all" ? "" : state.range,
  repository: state.repository ?? "",
  commit: state.repository ? (state.commit ?? "") : "",
});

/** The address of the version history of one automation. */
export const repositoryUrl = (automationId: string, commit?: string): string =>
  `/config/automation_history?${createQueryString(
    { repository: automationId, ...(commit ? { commit } : {}) },
    automationHistoryQueryParamConfig
  )}`;
