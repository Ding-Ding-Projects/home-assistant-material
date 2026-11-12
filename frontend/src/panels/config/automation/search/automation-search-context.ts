import { createContext } from "@lit/context";
import type { SearchQueryError } from "../../../../common/regex/query";
import type { EntitySummary, SearchStep } from "./automation-search";

/** A list shows its own search field from this many rows on. */
export const LIST_SEARCH_THRESHOLD = 5;

/**
 * What the editor search knows at one moment. The scope that owns the search
 * makes a new snapshot for every change, so a row or a list that consumes it
 * updates exactly when something it shows could have changed.
 */
export interface AutomationSearchSnapshot {
  query: string;
  /** Entity ids the editor is filtered to. */
  entityFilter: readonly string[];
  /** Hide the steps that do not match, keeping the ancestors of a match. */
  onlyMatching: boolean;
  /** True when there is a query or an entity filter. */
  active: boolean;
  /** Why the pattern was not run, when it was not. */
  error?: SearchQueryError;
  matches: readonly SearchStep[];
  matchSet: ReadonlySet<object>;
  /** Matching steps and every ancestor of one. */
  visibleSet: ReadonlySet<object>;
  /** The match the person is looking at, or -1. */
  currentIndex: number;
  current?: SearchStep;
  /** Ancestors of the current match: rows that must be open to show it. */
  revealSet: ReadonlySet<object>;
  /** Changes when the person moves to a match; lists open rows and scroll. */
  navigationToken: number;
  /** Every entity the steps use, most used first. */
  entities: readonly EntitySummary[];
  /** True when the configuration has any step to search. */
  hasSteps: boolean;
  setQuery(query: string): void;
  setEntityFilter(entityIds: readonly string[]): void;
  setOnlyMatching(value: boolean): void;
  next(): void;
  previous(): void;
  clear(): void;
  /** A list's own search: does the item or anything in it match the text? */
  subtreeMatches(item: object, query: string): boolean;
}

export const automationSearchContext = createContext<
  AutomationSearchSnapshot | undefined
>("automation-search");

/** A row a list can open and close to show a match inside it. */
export interface SearchRevealRow extends HTMLElement {
  expand(): void;
  collapse(): void;
  isExpanded(): boolean;
}

export const isRevealRow = (row: HTMLElement): row is SearchRevealRow => {
  const candidate = row as Partial<SearchRevealRow>;
  return (
    typeof candidate.expand === "function" &&
    typeof candidate.collapse === "function" &&
    typeof candidate.isExpanded === "function"
  );
};
