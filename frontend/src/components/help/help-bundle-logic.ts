/**
 * Pure helpers for the Help page: how the bundled articles are grouped, how
 * long each takes to read, and which articles link to which. Everything is
 * computed from the bundled files; nothing is loaded from outside.
 */
import type { HelpRedirects } from "./help-article-path";
import { parseHelpAddress, resolveHelpPath } from "./help-article-path";

export interface HelpIndexEntry {
  path: string;
  title: string;
}

/** The sections of the documentation, in the order the page lists them. */
export const HELP_SECTION_KEYS = [
  "docs",
  "dashboards",
  "faq",
  "getting-started",
  "voice_control",
  "more-info",
  "common-tasks",
  "help",
  "tag",
] as const;

export interface HelpGroup {
  /** One of the section keys, or `other`. */
  key: string;
  articles: HelpIndexEntry[];
}

/** Groups articles by the first segment of their path, in listing order. */
export const groupHelpArticles = (articles: HelpIndexEntry[]): HelpGroup[] => {
  const groups = new Map<string, HelpIndexEntry[]>();
  for (const article of articles) {
    const segment = article.path.split("/")[1] ?? "";
    const key = (HELP_SECTION_KEYS as readonly string[]).includes(segment)
      ? segment
      : "other";
    groups.set(key, [...(groups.get(key) ?? []), article]);
  }
  return [...HELP_SECTION_KEYS, "other"]
    .filter((key) => groups.has(key))
    .map((key) => ({ key, articles: groups.get(key)! }));
};

const WORDS_PER_MINUTE = 200;

/** Whole minutes to read a text at an ordinary pace, at least one. */
export const readingMinutes = (text: string): number => {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
};

const LINK_TARGET = /\]\(\s*<?([^)\s>]+)/g;
const REFERENCE_TARGET = /^ {0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm;

/**
 * The bundled article paths a text links to, without repeats, in the order
 * they first appear. Redirects are followed; a link back to the article
 * itself is left out.
 */
export const linkedArticlePaths = (
  body: string,
  ownPath: string,
  redirects: HelpRedirects | undefined,
  isBundled: (path: string) => boolean
): string[] => {
  const found: string[] = [];
  const add = (target: string) => {
    const ref = parseHelpAddress(target);
    if (!ref || ref.path === "/") {
      return;
    }
    const { path } = resolveHelpPath(ref.path, "", redirects);
    if (path !== ownPath && isBundled(path) && !found.includes(path)) {
      found.push(path);
    }
  };
  for (const match of body.matchAll(LINK_TARGET)) {
    add(match[1]);
  }
  for (const match of body.matchAll(REFERENCE_TARGET)) {
    add(match[1]);
  }
  return found;
};

/** For each article path, the paths of the articles that link to it. */
export const buildBacklinks = (
  articles: { path: string; body: string }[],
  redirects: HelpRedirects | undefined,
  isBundled: (path: string) => boolean
): Map<string, string[]> => {
  const result = new Map<string, string[]>();
  for (const article of articles) {
    for (const target of linkedArticlePaths(
      article.body,
      article.path,
      redirects,
      isBundled
    )) {
      result.set(target, [...(result.get(target) ?? []), article.path]);
    }
  }
  return result;
};

/** The bundled page that explains an integration, when the build has one. */
export const helpPathForIntegration = (
  domain: string,
  integrationDomains: ReadonlySet<string>
): string | undefined =>
  integrationDomains.has(domain) ? `/integrations/${domain}` : undefined;
