/**
 * Pure helpers for the offline help articles: turning an address into the
 * article path, the file name an article is stored under, and which
 * addresses are documentation articles (and so open in the reader) rather
 * than blog posts, release notes or other sites.
 */

/** Where the bundled articles are served from, loaded on demand. */
export const HELP_ARTICLES_BASE = "/static/help";

const DOCS_HOST = /^(?:www|rc|next)?\.?home-assistant\.io$/i;

/** Top-level sections of the website that are not documentation articles. */
const NOT_DOCUMENTATION = [
  "blog",
  "latest-release-notes",
  "newsletter",
  "images",
  "assets",
  "feed.xml",
  "changelog",
  "join-the-team",
  "privacy",
  "terms",
  "suggest-improvement",
];

export interface HelpArticleRef {
  /** Normalized path, for example `/docs/automation/modes`. */
  path: string;
  /** The part after `#`, without the hash, or empty. */
  hash: string;
}

/**
 * Normalizes an address or a bare path to the article path and hash.
 * Returns undefined when the address is for another site.
 */
export const parseHelpAddress = (value: string): HelpArticleRef | undefined => {
  let rest = value.trim();
  const absolute = /^(?:https?:)?\/\/([^/?#]+)(.*)$/i.exec(rest);
  if (absolute) {
    if (!DOCS_HOST.test(absolute[1])) {
      return undefined;
    }
    rest = absolute[2] || "/";
  }
  if (!rest.startsWith("/")) {
    return undefined;
  }
  const hashIndex = rest.indexOf("#");
  const hash = hashIndex === -1 ? "" : rest.slice(hashIndex + 1);
  if (hashIndex !== -1) {
    rest = rest.slice(0, hashIndex);
  }
  const queryIndex = rest.indexOf("?");
  if (queryIndex !== -1) {
    rest = rest.slice(0, queryIndex);
  }
  rest = rest.replace(/\.html?$/i, "").replace(/\/+$/, "");
  return { path: rest || "/", hash };
};

/** Whether an address is a documentation article that the reader shows. */
export const isHelpArticleAddress = (value: string): boolean => {
  const ref = parseHelpAddress(value);
  if (!ref || ref.path === "/") {
    return false;
  }
  const first = ref.path.split("/")[1]?.toLowerCase();
  return !NOT_DOCUMENTATION.includes(first) && !/\.[a-z0-9]+$/i.test(ref.path);
};

/** The file name, without extension, that an article path is stored under. */
export const helpArticleSlug = (path: string): string => {
  const slug = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\//g, "__");
  return slug || "index";
};

export const helpArticleUrl = (path: string): string =>
  `${HELP_ARTICLES_BASE}/articles/${helpArticleSlug(path)}.json`;

export const HELP_INDEX_URL = `${HELP_ARTICLES_BASE}/index.json`;

export interface HelpHeading {
  level: number;
  text: string;
  id: string;
}

export const headingId = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

export interface HelpSection {
  heading?: HelpHeading;
  markdown: string;
}

/**
 * Splits an article into one section per heading of level 2 or 3, so the
 * table of contents can jump to a section. Headings inside code fences are
 * left alone.
 */
export const splitSections = (markdown: string): HelpSection[] => {
  const sections: HelpSection[] = [{ markdown: "" }];
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
    }
    const match = !fence && /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const text = match[2].replace(/[*_`]/g, "");
      sections.push({
        heading: { level: match[1].length, text, id: headingId(text) },
        markdown: `${line}\n`,
      });
    } else {
      sections[sections.length - 1].markdown += `${line}\n`;
    }
  }
  return sections.filter((s) => s.heading || s.markdown.trim());
};

/**
 * Turns links in a converted article into reader links or plain text.
 * Bundled targets stay as website-shaped addresses that the reader
 * intercepts; targets that are not bundled become plain text followed by
 * the given note, never a link that could open the website.
 */
export const rewriteArticleLinks = (
  markdown: string,
  isBundled: (path: string) => boolean,
  notBundledNote: string
): string =>
  markdown.replace(
    /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_all, bang: string, text: string, target: string) => {
      if (bang) {
        return text;
      }
      if (target.startsWith("#")) {
        return `[${text}](${target})`;
      }
      const ref = parseHelpAddress(target);
      if (ref && isBundled(ref.path)) {
        return `[${text}](https://www.home-assistant.io${ref.path}${
          ref.hash ? `#${ref.hash}` : ""
        })`;
      }
      return ref ? `${text} (${notBundledNote}: ${ref.path})` : text;
    }
  );
