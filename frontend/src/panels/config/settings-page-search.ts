import type { TemplateResult } from "lit";
import { html } from "lit";
import { yueString } from "../../common/language-mode/language-mode";
import { regexRanges, searchMatcher } from "../../common/regex/filter";

/**
 * Search for the settings pages that list other pages as tiles or rows: the
 * Settings home, the System page and the Connectivity page.
 *
 * A page matches by its name and its description, and also by the words that
 * appear inside it. Those words are the page's own interface text: the
 * strings of its translation block (`ui.panel.config.<page>.`), read from the
 * English source the help articles already load on demand, with the Cantonese
 * of the same keys when the language mode shows Cantonese.
 *
 * The search only hides pages. It never removes one from the list it is
 * given, and it reports how many it hides.
 */

export type FlatStrings = Record<string, string>;

/** Flattens a nested translation object into `key.path: text`. */
export const flattenStrings = (
  node: unknown,
  prefix = "",
  out: FlatStrings = {}
): FlatStrings => {
  if (!node || typeof node !== "object") {
    return out;
  }
  for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string") {
      out[key] = value;
    } else {
      flattenStrings(value, key, out);
    }
  }
  return out;
};

/**
 * The readable words of a message: placeholders and plural rules (anything in
 * braces) and markup are left out, and white space is collapsed.
 */
export const plainMessage = (text: string): string => {
  let depth = 0;
  let out = "";
  for (const char of text) {
    if (char === "{") {
      depth++;
      out += " ";
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += char;
    }
  }
  return out
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// The strings of a page block that only name or describe the page itself;
// those are matched as the page's name and description already.
const OWN_NAME_KEYS = new Set(["caption", "description", "main", "secondary"]);

/** The prefix of the translation block that holds a page's interface text. */
export const pageBlockPrefix = (
  translationKey: string | undefined
): string | undefined => {
  if (!translationKey) {
    return undefined;
  }
  if (translationKey.startsWith("ui.panel.config.")) {
    const parts = translationKey.split(".");
    // "ui.panel.config.info.caption" belongs to "ui.panel.config.info.".
    return parts.length > 4 ? `${parts.slice(0, 4).join(".")}.` : undefined;
  }
  if (translationKey.includes(".")) {
    return undefined;
  }
  return `ui.panel.config.${translationKey}.`;
};

/**
 * The words inside one page, in the order they are written. With
 * `cantonese`, the Cantonese text of each key comes first.
 */
export const pageWords = (
  strings: FlatStrings,
  translationKey: string | undefined,
  cantonese = false,
  cantoneseText: (key: string) => string | undefined = yueString
): string[] => {
  const prefix = pageBlockPrefix(translationKey);
  if (!prefix) {
    return [];
  }
  const seen = new Set<string>();
  const words: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw || raw.startsWith("[%key:")) {
      return;
    }
    const text = plainMessage(raw);
    if (text.length < 2 || seen.has(text)) {
      return;
    }
    seen.add(text);
    words.push(text);
  };
  for (const [key, value] of Object.entries(strings)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const rest = key.slice(prefix.length);
    if (OWN_NAME_KEYS.has(rest)) {
      continue;
    }
    if (cantonese) {
      add(cantoneseText(key));
    }
    add(value);
  }
  return words;
};

export interface PageMatch<T> {
  page: T;
  /** Set when only words inside the page matched: the words that did. */
  foundIn?: string;
}

export interface PageSearchResult<T> {
  /** The pages to show, in the order they were given. */
  shown: PageMatch<T>[];
  /** How many of the given pages the search hides. */
  hidden: number;
  /** How many pages were given. */
  total: number;
}

/**
 * Which pages a search shows. A page matches by its name or description, or
 * else by the first word inside it that matches. An empty search shows every
 * page; an unusable pattern shows none. Nothing is removed from `pages`.
 */
export const searchPages = <T>(
  pages: readonly T[],
  query: string | undefined,
  text: (page: T) => { name: string; description?: string },
  words: (page: T) => readonly string[] = () => []
): PageSearchResult<T> => {
  const total = pages.length;
  if (!query?.trim()) {
    return { shown: pages.map((page) => ({ page })), hidden: 0, total };
  }
  const matches = searchMatcher(query);
  const shown: PageMatch<T>[] = [];
  for (const page of pages) {
    const { name, description } = text(page);
    if (matches(name, description)) {
      shown.push({ page });
      continue;
    }
    const word = words(page).find((candidate) => matches(candidate));
    if (word !== undefined) {
      shown.push({ page, foundIn: excerpt(query, word) });
    }
  }
  return { shown, hidden: total - shown.length, total };
};

export interface Segment {
  text: string;
  hit: boolean;
}

const plainRanges = (query: string, text: string): [number, number][] => {
  const needle = query.trim().toLowerCase();
  const haystack = text.toLowerCase();
  // Lower-casing changed the length (a rare letter), so positions would not
  // line up with the text: highlight nothing rather than the wrong letters.
  if (!needle || haystack.length !== text.length) {
    return [];
  }
  const ranges: [number, number][] = [];
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      break;
    }
    ranges.push([at, at + needle.length]);
    from = at + needle.length;
  }
  return ranges;
};

/** A text split into the parts a search matches and the parts it does not. */
export const highlightSegments = (
  query: string | undefined,
  text: string
): Segment[] => {
  if (!query?.trim() || !text) {
    return text ? [{ text, hit: false }] : [];
  }
  const ranges = regexRanges(query, text) ?? plainRanges(query, text);
  const segments: Segment[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at) {
      continue;
    }
    if (start > at) {
      segments.push({ text: text.slice(at, start), hit: false });
    }
    segments.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) {
    segments.push({ text: text.slice(at), hit: false });
  }
  return segments;
};

/**
 * A long text shortened around its first match, so the match stays visible
 * in one line. Short texts are returned whole.
 */
export const excerpt = (
  query: string | undefined,
  text: string,
  max = 80
): string => {
  if (text.length <= max) {
    return text;
  }
  let offset = 0;
  let first: number | undefined;
  for (const segment of highlightSegments(query, text)) {
    if (segment.hit) {
      first = offset;
      break;
    }
    offset += segment.text.length;
  }
  const start = Math.max(
    0,
    Math.min((first ?? 0) - Math.floor(max / 3), text.length - max)
  );
  const end = Math.min(text.length, start + max);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${
    end < text.length ? "…" : ""
  }`;
};

/** The text with its matches wrapped in `<mark>`. */
export const renderHighlighted = (
  query: string | undefined,
  text: string
): TemplateResult =>
  html`${highlightSegments(query, text).map((segment) =>
    segment.hit ? html`<mark>${segment.text}</mark>` : segment.text
  )}`;

let pageStrings: Promise<FlatStrings> | undefined;

/**
 * The interface text of the settings pages, loaded once and only when a
 * search needs it. Resolves to an empty set when it cannot be loaded, so the
 * search still works by name and description.
 */
export const loadPageStrings = (): Promise<FlatStrings> => {
  if (!pageStrings) {
    pageStrings = import("../../translations/en.json")
      .then((module) => {
        const source = ((module as { default?: unknown }).default ??
          module) as { ui?: { panel?: { config?: unknown } } };
        return flattenStrings(source.ui?.panel?.config, "ui.panel.config");
      })
      .catch(() => {
        pageStrings = undefined;
        return {};
      });
  }
  return pageStrings;
};
