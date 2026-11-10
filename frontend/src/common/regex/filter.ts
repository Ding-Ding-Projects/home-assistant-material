import type { CompiledQuery } from "./query";
import {
  compileSearchQuery,
  isRegexQuery,
  parseSearchQuery,
  REGEX_LIMITS,
} from "./query";

/**
 * Helpers for search consumers: the lists, tables and pickers that filter by
 * the text of a search field.
 *
 * A consumer keeps its own plain text matching. It asks here first whether
 * the text is a regular expression (`/pattern/flags`); if so the pattern
 * decides, tested against each value as written.
 *
 * Patterns are screened before use: these filters run where a slow pattern
 * cannot be stopped, so one that static screening marks as likely to
 * backtrack without bound matches nothing and reports `risky`.
 */

type SearchValue = string | number | null | undefined;

let last: { raw: string; query: CompiledQuery } | undefined;

/**
 * The compiled regular expression for a search text, or `undefined` when the
 * text is plain. Check `error` on the result: an unusable pattern matches
 * nothing.
 */
export const regexQuery = (
  raw: string | null | undefined
): CompiledQuery | undefined => {
  if (!raw || !isRegexQuery(raw)) {
    return undefined;
  }
  if (last?.raw !== raw) {
    last = { raw, query: compileSearchQuery(raw, { screen: true }) };
  }
  return last.query;
};

/** True when any of the values matches the compiled query. */
export const matchesAny = (
  query: CompiledQuery,
  values: readonly SearchValue[]
): boolean =>
  values.some((value) => value != null && query.test(String(value)));

/**
 * Filters items by a regular expression search text.
 *
 * Returns `undefined` when the text is plain, so the caller continues with
 * its own matching:
 *
 * ```ts
 * const byPattern = filterByRegexQuery(items, filter, (item) => [item.name]);
 * if (byPattern) {
 *   return byPattern;
 * }
 * ```
 */
export const filterByRegexQuery = <T>(
  items: readonly T[],
  raw: string | null | undefined,
  getValues: (item: T) => readonly SearchValue[]
): T[] | undefined => {
  const query = regexQuery(raw);
  if (!query) {
    return undefined;
  }
  if (query.error) {
    return [];
  }
  return items.filter((item) => matchesAny(query, getValues(item)));
};

/**
 * Lower-cases a plain search text and leaves a regular expression as
 * written, where case is part of the pattern (`\D` is not `\d`).
 */
export const normalizeSearchText = (raw: string | null | undefined): string =>
  !raw ? "" : isRegexQuery(raw) ? raw.trim() : raw.toLowerCase();

/**
 * A test for one search text, for lists that match by "contains".
 *
 * Plain text: true when any value contains the text, ignoring case. Regular
 * expression: true when any value matches the pattern as written. Empty text
 * matches everything; an unusable pattern matches nothing.
 */
export const searchMatcher = (
  raw: string | null | undefined
): ((...values: SearchValue[]) => boolean) => {
  const query = regexQuery(raw);
  if (query) {
    return query.error ? () => false : (...values) => matchesAny(query, values);
  }
  const needle = (raw ?? "").trim().toLowerCase();
  if (!needle) {
    return () => true;
  }
  return (...values) =>
    values.some(
      (value) => value != null && String(value).toLowerCase().includes(needle)
    );
};

/** Most ranges `regexRanges` returns for one text. */
const MAX_RANGES = 200;

/**
 * Where a regular expression search text matches inside a text, for
 * highlighting. Returns `undefined` when the search text is plain, and no
 * ranges for an unusable pattern. Empty matches are left out.
 */
export const regexRanges = (
  raw: string | null | undefined,
  text: string
): [start: number, end: number][] | undefined => {
  const query = regexQuery(raw);
  if (!query) {
    return undefined;
  }
  if (query.error) {
    return [];
  }
  const { pattern, flags } = parseSearchQuery(raw!);
  const cleaned = Array.from(new Set(flags.split("")))
    .filter((flag) => flag !== "g" && flag !== "y")
    .join("");
  const ranges: [number, number][] = [];
  const bounded =
    text.length > REGEX_LIMITS.value ? text.slice(0, REGEX_LIMITS.value) : text;
  for (const match of bounded.matchAll(new RegExp(pattern, `${cleaned}g`))) {
    if (match[0].length) {
      ranges.push([match.index, match.index + match[0].length]);
    }
    if (ranges.length >= MAX_RANGES) {
      break;
    }
  }
  return ranges;
};
