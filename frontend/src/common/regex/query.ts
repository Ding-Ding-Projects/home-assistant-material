import { stripDiacritics } from "../string/strip-diacritics";
import { analyzeRisk } from "./risk";

/**
 * Search queries that can be plain text or a regular expression.
 *
 * Plain text is the default. A query written as `/pattern/flags` is a regular
 * expression, evaluated by this browser's JavaScript (ECMAScript) engine.
 * The pattern workbench writes that form into a search field; a person can
 * also type it.
 */

/** Bounds that keep evaluation cheap wherever a query is used. */
export const REGEX_LIMITS = {
  /** Longest pattern accepted, in characters. */
  pattern: 2000,
  /** Longest sample text the workbench evaluates, in characters. */
  sample: 100000,
  /** Most matches the workbench lists. */
  matches: 1000,
  /** Longest value a list filter tests; longer values are cut to this. */
  value: 4000,
  /** Time limit for one workbench evaluation, in milliseconds. */
  timeoutMs: 1000,
};

export const ALL_FLAGS = ["d", "g", "i", "m", "s", "u", "v", "y"] as const;

export type RegexFlag = (typeof ALL_FLAGS)[number];

const flagSupported = (flag: string): boolean => {
  try {
    new RegExp("", flag);
    return true;
  } catch (_err) {
    return false;
  }
};

/** The flags this browser's engine accepts. */
export const SUPPORTED_FLAGS: RegexFlag[] = ALL_FLAGS.filter(flagSupported);

export type SearchQueryMode = "text" | "regex";

export interface SearchQuery {
  mode: SearchQueryMode;
  /** The query exactly as written. */
  raw: string;
  /** The pattern between the slashes, or the plain text. */
  pattern: string;
  flags: string;
}

const REGEX_QUERY = /^\/([\s\S]+)\/([a-z]*)$/;

/** True when the text is written as `/pattern/flags`. */
export const isRegexQuery = (raw: string): boolean =>
  REGEX_QUERY.test(raw.trim());

export const parseSearchQuery = (raw: string): SearchQuery => {
  const match = REGEX_QUERY.exec(raw.trim());
  if (!match) {
    return { mode: "text", raw, pattern: raw, flags: "" };
  }
  return { mode: "regex", raw, pattern: match[1], flags: match[2] };
};

/** Writes a pattern and flags as a search query. */
export const formatRegexQuery = (pattern: string, flags: string): string =>
  `/${pattern}/${flags}`;

/** Escapes text so a regular expression matches it literally. */
export const escapeLiteral = (text: string): string =>
  text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

export type SearchQueryError =
  "too_long" | "invalid" | "unsupported_flag" | "risky";

export interface CompiledQuery {
  mode: SearchQueryMode;
  /** Set when a regular expression cannot be used. Nothing matches then. */
  error?: SearchQueryError;
  /** The engine's own message for an invalid pattern. */
  message?: string;
  test: (value: string) => boolean;
}

export interface CompileOptions {
  /**
   * Refuse patterns that static screening marks as likely to backtrack
   * without bound. Use where the test runs on the main thread, where a slow
   * pattern cannot be stopped.
   */
  screen?: boolean;
}

/**
 * Compiles a regular expression for filtering. The global and sticky flags
 * are dropped so that each test starts from the beginning of the value.
 */
export const compileRegex = (
  pattern: string,
  flags: string,
  options: CompileOptions = {}
): { regex?: RegExp; error?: SearchQueryError; message?: string } => {
  if (pattern.length > REGEX_LIMITS.pattern) {
    return { error: "too_long" };
  }
  const cleaned = Array.from(new Set(flags.split("")))
    .filter((flag) => flag !== "g" && flag !== "y")
    .join("");
  if (
    cleaned
      .split("")
      .some((flag) => !(SUPPORTED_FLAGS as string[]).includes(flag))
  ) {
    return { error: "unsupported_flag" };
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, cleaned);
  } catch (err: unknown) {
    return {
      error: "invalid",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (
    options.screen &&
    analyzeRisk(pattern, cleaned).some((finding) => finding.level === "high")
  ) {
    return { error: "risky" };
  }
  return { regex };
};

const normalize = (value: string) => stripDiacritics(value.toLowerCase());

/**
 * Turns a search query into a test for one value.
 *
 * Plain text: every word of the query must be found in the value, ignoring
 * case and accents. Regular expression: the value is tested as written, so
 * case matters unless the `i` flag is set.
 */
export const compileSearchQuery = (
  raw: string,
  options: CompileOptions = {}
): CompiledQuery => {
  const query = parseSearchQuery(raw);
  if (query.mode === "text") {
    const terms = normalize(query.pattern).split(/\s+/).filter(Boolean);
    return {
      mode: "text",
      test: (value) => {
        if (!terms.length) {
          return true;
        }
        const normalized = normalize(value);
        return terms.every((term) => normalized.includes(term));
      },
    };
  }
  const { regex, error, message } = compileRegex(
    query.pattern,
    query.flags,
    options
  );
  if (!regex) {
    return { mode: "regex", error, message, test: () => false };
  }
  return {
    mode: "regex",
    test: (value) =>
      regex.test(
        value.length > REGEX_LIMITS.value
          ? value.slice(0, REGEX_LIMITS.value)
          : value
      ),
  };
};
