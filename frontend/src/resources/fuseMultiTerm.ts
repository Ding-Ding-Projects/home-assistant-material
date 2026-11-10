import type {
  Expression,
  FuseIndex,
  FuseOptionKey,
  IFuseOptions,
} from "fuse.js";
import Fuse from "fuse.js";
import { filterByRegexQuery } from "../common/regex/filter";

export interface FuseWeightedKey {
  name: string | string[];
  weight: number;
}

const DEFAULT_OPTIONS: IFuseOptions<any> = {
  ignoreDiacritics: true,
  isCaseSensitive: false,
  threshold: 0.3,
  minMatchCharLength: 2,
  ignoreLocation: true, // don't care where the pattern is
};

const DEFAULT_MIN_CHAR_LENGTH = 2;

interface SearchKeyLike {
  name?: string | string[];
  path?: string[];
  getFn?: ((obj: any) => readonly string[] | string | null | undefined) | null;
}

const readPath = (item: unknown, path: string[]): unknown[] => {
  let current: unknown[] = [item];
  for (const part of path) {
    const next: unknown[] = [];
    for (const value of current) {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry != null && typeof entry === "object") {
            next.push(entry[part]);
          }
        });
      } else if (value != null && typeof value === "object") {
        next.push((value as Record<string, unknown>)[part]);
      }
    }
    current = next;
  }
  return current.flat();
};

/** The text of an item under the given search keys, as written. */
const valuesForKeys = <T>(
  item: T,
  keys: readonly (string | string[] | SearchKeyLike)[]
): string[] => {
  if (typeof item === "string") {
    return [item];
  }
  const values: string[] = [];
  keys.forEach((key) => {
    let found: unknown[];
    if (typeof key === "string") {
      found = readPath(item, key.split("."));
    } else if (Array.isArray(key)) {
      found = readPath(item, key);
    } else if (key.getFn) {
      found = [key.getFn(item)].flat();
    } else if (key.path) {
      found = readPath(item, key.path);
    } else if (typeof key.name === "string") {
      found = readPath(item, key.name.split("."));
    } else {
      found = readPath(item, key.name ?? []);
    }
    found.forEach((value) => {
      if (typeof value === "string" || typeof value === "number") {
        values.push(String(value));
      }
    });
  });
  return values;
};

/**
 * Searches for a term within a collection of items using Fuse.js fuzzy search.
 * @param items - The array of items to search through.
 * @param search - The search term to look for.
 * @param fuseIndex - Optional pre-built Fuse index for improved performance.
 * @param options - Optional Fuse.js configuration options to override defaults.
 * @returns An array of search results matching the search term.
 */
function searchTerm<T>(
  items: T[],
  search: string | Expression,
  fuseIndex?: FuseIndex<T>,
  options?: IFuseOptions<T>,
  minMatchCharLength?: number
) {
  const fuse = new Fuse<T>(
    items,
    {
      ...DEFAULT_OPTIONS,
      minMatchCharLength:
        minMatchCharLength ??
        (typeof search === "string" && search.length < DEFAULT_MIN_CHAR_LENGTH
          ? search.length
          : DEFAULT_MIN_CHAR_LENGTH),
      ...(options || {}),
    },
    fuseIndex
  );

  return fuse.search(search);
}

/**
 * One fuzzy search over a list with the given Fuse.js options, in relevance
 * order. A search written as /pattern/flags is a regular expression instead:
 * it is tested against the text of every key and keeps the list's order.
 */
export function fuseSearch<T>(
  items: T[],
  search: string,
  options: IFuseOptions<T> = {}
): T[] {
  const byPattern = filterByRegexQuery(items, search, (item) =>
    valuesForKeys(
      item,
      (options.keys ?? []) as (string | string[] | SearchKeyLike)[]
    )
  );
  if (byPattern) {
    return byPattern;
  }
  return new Fuse(items, options).search(search).map((result) => result.item);
}

/**
 * Performs a multi-term search across an array of items using Fuse.js.
 * All search terms must match for an item to be included in the results.
 * Result is NOT sorted by relevance.
 *
 * @template T - The type of items being searched
 * @param items - The array of items to search through
 * @param search - The search string containing one or more space-separated terms
 * @param searchKeys - An array of weighted keys defining which properties to search
 * @param fuseIndex - Optional pre-built Fuse index for improved performance
 * @param options - Optional Fuse.js configuration options
 * @returns An array of items that match all search terms
 */
export function multiTermSearch<T>(
  items: T[],
  search: string,
  searchKeys: FuseOptionKey<T>[],
  fuseIndex?: FuseIndex<T>,
  options: IFuseOptions<T> = {}
): T[] {
  // A search written as /pattern/flags is a regular expression, tested
  // against the text of every search key.
  const byPattern = filterByRegexQuery(items, search, (item) =>
    valuesForKeys(item, searchKeys as (string | string[] | SearchKeyLike)[])
  );
  if (byPattern) {
    return byPattern;
  }

  const terms = search
    .toLowerCase()
    .split(" ")
    .filter((t) => t.trim());

  if (!terms.length) {
    return items;
  }

  // be sure that all terms are used in the search
  // just use DEFAULT_MIN_CHAR_LENGTH if the terms are at least that long
  let minLength = DEFAULT_MIN_CHAR_LENGTH;
  terms.forEach((term) => {
    if (term.length < minLength) {
      minLength = term.length;
    }
  });

  const expression: Expression = {
    $and: terms.map((term) => ({
      $or: searchKeys.map((key) => ({
        $path:
          typeof key === "string"
            ? key
            : Array.isArray(key)
              ? key.join(".")
              : typeof key.name === "string"
                ? key.name
                : key.name.join("."),
        $val: term,
      })),
    })),
  };

  return searchTerm<T>(
    items,
    expression,
    fuseIndex,
    {
      ...options,
      shouldSort: false,
    },
    minLength
  ).map((r) => r.item);
}

/**
 * Performs a multi-term search across items using Fuse.js, returning results sorted by relevance.
 *
 * This function splits the search string into individual terms and searches for each term
 * independently. Results are aggregated and scored based on:
 * - Number of terms matched (items must match ALL terms to be included)
 * - The Fuse.js relevance score of each term, which reflects key weight,
 *   match quality and field length
 *
 * @template T - The type of items being searched
 * @param items - The array of items to search through
 * @param search - The search string, which will be split by spaces into multiple terms
 * @param getItemId - Function to extract a unique identifier from each item
 * @param fuseIndex - Optional but highly recommended! Pre-built Fuse.js index for improved performance
 * @param options - Optional Fuse.js options to customize search behavior
 * @returns An array of items that match all search terms, sorted by relevance score (highest first).
 *          Returns all items if search is empty, or empty array if not all terms have matches.
 */
export function multiTermSortedSearch<T>(
  items: T[],
  search: string,
  getItemId: (item: T) => string,
  fuseIndex?: FuseIndex<T>,
  options: IFuseOptions<T> = {}
) {
  // A search written as /pattern/flags is a regular expression, tested
  // against the text of every search key. The order of the items is kept.
  const patternKeys = (fuseIndex?.keys ?? options.keys ?? []) as (
    string | string[] | SearchKeyLike
  )[];
  const byPattern = filterByRegexQuery(items, search, (item) =>
    valuesForKeys(item, patternKeys)
  );
  if (byPattern) {
    return byPattern;
  }

  const terms = search
    .toLowerCase()
    .split(" ")
    .filter((t) => t.trim());

  if (!terms.length) {
    return items;
  }

  if (terms.length === 1) {
    return searchTerm<T>(items, terms[0], fuseIndex, options).map(
      (r) => r.item
    );
  }

  const searchResults: Record<
    string,
    { item: T; hits: number; score: number }
  > = {};

  let termHits = 0;

  terms.forEach((term) => {
    if (!term.trim()) {
      return;
    }

    const termResults = searchTerm<T>(items, term, fuseIndex, {
      ...options,
      shouldSort: false,
      includeScore: true,
    });

    if (termResults.length) {
      termHits++;
      termResults.forEach((r) => {
        const itemId = getItemId(r.item);
        if (!searchResults[itemId]) {
          searchResults[itemId] = {
            item: r.item,
            hits: 0,
            score: 0,
          };
        }

        searchResults[itemId].hits += 1;

        // Multiply the terms' scores to combine them; summing -log does the same
        // while turning a lower (better) Fuse score into a bigger contribution.
        searchResults[itemId].score += -Math.log(r.score || Number.MIN_VALUE);
      });
    }
  });

  // just return smth if for the full terms combination are results
  if (termHits !== terms.length) {
    return [];
  }

  // Filter to only items that matched all terms
  const results = Object.values(searchResults).filter(
    ({ hits }) => hits === terms.length
  );

  // Sort by aggregated relevance (higher is better)
  results.sort((a, b) => b.score - a.score);

  return results.map(({ item }) => item);
}
