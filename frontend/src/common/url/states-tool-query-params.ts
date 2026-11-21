import {
  createQueryString,
  decodeQueryParams,
  type QueryParamConfig,
  type QueryParamValues,
  type SearchParamsSource,
} from "./query-params";

/** The states tool opens with this entity chosen, ready to change by hand. */
export const statesToolQueryParamConfig = {
  string: ["entity_id"],
} as const satisfies QueryParamConfig;

export type StatesToolQueryParams = QueryParamValues<
  typeof statesToolQueryParamConfig
>;

export const decodeStatesToolQueryParams = (
  searchParams: SearchParamsSource
): StatesToolQueryParams =>
  decodeQueryParams(searchParams, statesToolQueryParamConfig);

/** A link to the states tool with an entity chosen. */
export const statesToolUrl = (entityId?: string): string => {
  const query = createQueryString(
    { entity_id: entityId },
    statesToolQueryParamConfig
  );
  return `/config/tools/state${query ? `?${query}` : ""}`;
};
