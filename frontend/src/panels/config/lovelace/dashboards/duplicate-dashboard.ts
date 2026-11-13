import { slugify } from "../../../../common/string/slugify";
import type { LovelaceRawConfig } from "../../../../data/lovelace/config/types";
import { isStrategyDashboard } from "../../../../data/lovelace/config/types";
import { pickAvailableDashboardUrlPath } from "./pick-available-dashboard-url-path";

/**
 * Helpers for copying a dashboard. The copy is a new storage dashboard that
 * gets the same configuration (views, sections, cards, badges, theme and
 * background). Settings that belong to the dashboard record itself, such as
 * who can see it and its "show only when" rules, are not copied.
 */

export type DuplicateScope = "dashboard" | "view";

/** An address for the copy: always has a hyphen and is never already taken. */
export const duplicateDashboardUrlPath = (
  title: string,
  taken: ReadonlySet<string>
): string => {
  const slug = slugify(title, "-");
  const base = slug.includes("-") ? slug : `dashboard-${slug || "copy"}`;
  return pickAvailableDashboardUrlPath(base, taken);
};

/** The configuration the copy starts with. */
export const configForDuplicate = (
  config: LovelaceRawConfig,
  scope: DuplicateScope,
  viewIndex: number
): LovelaceRawConfig => {
  const copy = structuredClone(config) as LovelaceRawConfig;
  if (scope === "dashboard" || isStrategyDashboard(copy)) {
    return copy;
  }
  const view = copy.views?.[viewIndex];
  if (!view) {
    throw new Error("The view to copy is not there.");
  }
  return { ...copy, views: [view] };
};
