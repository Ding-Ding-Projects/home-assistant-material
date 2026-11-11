/**
 * Pure helpers for the offline help articles: turning an address into the
 * article path, the file name an article is stored under, and which
 * addresses are documentation articles (and so open in the reader) rather
 * than blog posts, release notes or other sites.
 */

/** Where the bundled articles are served from, loaded on demand. */
export const HELP_ARTICLES_BASE = "/static/help";

/** The documentation website and its preview hosts. */
const DOCS_HOST = /^(?:(?:www|rc|next)\.)?home-assistant\.io$/i;

/**
 * Hosts whose pages are community, developer, companion app or newsletter
 * pages. They are not bundled and must never open a tab.
 */
const BLOCKED_HOST =
  /^(?:community|contributors|companion|newsletter|forum)\.home-assistant\.io$|^newsletter\.openhomefoundation\.org$/i;

/**
 * Sections of the website that have nothing the reader could show: chat,
 * social, shop and newsletter pages. Their addresses open nothing.
 */
const NOT_SHOWN_SECTIONS = ["socials", "join-chat", "shop", "newsletter"];

export interface HelpArticleRef {
  /** Normalized path, for example `/docs/automation/modes`. */
  path: string;
  /** The part after `#`, without the hash, or empty. */
  hash: string;
}

/** Redirects of the bundle: an old path and the path (maybe `#hash`) now. */
export type HelpRedirects = Record<string, string>;

const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

const decodeSafely = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
};

/**
 * Normalizes an address or a bare path to the article path and hash.
 * Returns undefined when the address is for another site, or when the path
 * could not be a bundled article (odd characters, `..` segments).
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
  rest = decodeSafely(rest)
    .replace(/\.html?$/i, "")
    .replace(/\/+$/, "");
  const segments = rest.split("/").slice(1);
  if (segments.some((s) => s === "." || s === ".." || !SAFE_SEGMENT.test(s))) {
    return rest === "" ? { path: "/", hash: decodeSafely(hash) } : undefined;
  }
  return { path: rest || "/", hash: decodeSafely(hash) };
};

/**
 * Whether an address belongs to the reader. The whole documentation host
 * does: an article, but also the home page, blog posts, release notes, the
 * changelog and files. What is not bundled is shown as "not included in this
 * build", so such an address never opens the website.
 */
export const isHelpArticleAddress = (value: string): boolean => {
  const ref = parseHelpAddress(value);
  if (!ref) {
    return false;
  }
  const first = ref.path.split("/")[1]?.toLowerCase() ?? "";
  return !NOT_SHOWN_SECTIONS.includes(first);
};

/**
 * Whether an address is an outside help or community page that is never
 * shown and must never open: the community forum, developer documentation,
 * the companion app site, the newsletter, the My Home Assistant FAQ, chat,
 * social and shop pages, and any documentation host address the reader
 * cannot take (odd characters).
 */
export const isBlockedHelpAddress = (value: string): boolean => {
  const absolute = /^(?:https?:)?\/\/([^/?#]+)(.*)$/i.exec(value.trim());
  if (!absolute) {
    return false;
  }
  const host = absolute[1].toLowerCase();
  if (BLOCKED_HOST.test(host)) {
    return true;
  }
  if (host === "my.home-assistant.io") {
    return /^\/(?:faq|$)/i.test(absolute[2]);
  }
  return DOCS_HOST.test(host) && !isHelpArticleAddress(value);
};

/** The file name, without extension, that an article path is stored under. */
export const helpArticleSlug = (path: string): string => {
  const slug = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\//g, "__");
  return slug || "index";
};

/** `/integrations/<domain>` pages are stored one file per domain. */
export const helpIntegrationDomain = (path: string): string | undefined =>
  /^\/integrations\/([a-z0-9_]+)$/.exec(path)?.[1];

const SAFE_SLUG =
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:__[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/;

/** The address of the stored file for an article path, or undefined. */
export const helpArticleUrl = (path: string): string | undefined => {
  const domain = helpIntegrationDomain(path);
  if (domain) {
    return `${HELP_ARTICLES_BASE}/integrations/${domain}.json`;
  }
  const slug = helpArticleSlug(path);
  return SAFE_SLUG.test(slug) && !slug.includes("..")
    ? `${HELP_ARTICLES_BASE}/articles/${slug}.json`
    : undefined;
};

export const HELP_INDEX_URL = `${HELP_ARTICLES_BASE}/index.json`;
export const HELP_INTEGRATIONS_INDEX_URL = `${HELP_ARTICLES_BASE}/integrations/index.json`;
export const HELP_NOTICE_URL = `${HELP_ARTICLES_BASE}/LICENSE-NOTICE.md`;

/**
 * Applies the bundle's redirects to a path. A redirect may carry its own
 * `#hash`; otherwise the given hash is kept.
 */
export const resolveHelpPath = (
  path: string,
  hash: string,
  redirects: HelpRedirects | undefined
): HelpArticleRef => {
  let current = path;
  let currentHash = hash;
  for (let i = 0; i < 4; i++) {
    const target = redirects?.[current];
    if (!target) {
      break;
    }
    const at = target.indexOf("#");
    current =
      (at === -1 ? target : target.slice(0, at)).replace(/\/+$/, "") || "/";
    if (at !== -1) {
      currentHash = target.slice(at + 1);
    }
  }
  return { path: current, hash: currentHash };
};

export interface HelpHeading {
  level: number;
  text: string;
  id: string;
}

export const headingId = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

export interface HelpSection {
  heading?: HelpHeading;
  markdown: string;
}

/**
 * For each line, whether it is part of a fenced code block (the fence lines
 * included). A fence closes only with the same character and at least as
 * many of them, so `~~~` inside a backtick fence does not end it. A line is
 * an opening fence only when no further run of the same fence character
 * follows on it (a triple backtick pair on one line is inline code), and a
 * fence that never closes runs to the end of the page.
 */
export const fenceFlags = (lines: string[]): boolean[] => {
  const flags: boolean[] = [];
  let open: { char: string; length: number } | undefined;
  for (const line of lines) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!open) {
      if (
        match &&
        !line
          .slice(line.indexOf(match[1]) + match[1].length)
          .includes(match[1][0])
      ) {
        open = { char: match[1][0], length: match[1].length };
        flags.push(true);
      } else {
        flags.push(false);
      }
    } else {
      flags.push(true);
      if (
        match &&
        match[1][0] === open.char &&
        match[1].length >= open.length &&
        /^\s*[`~]+\s*$/.test(line)
      ) {
        open = undefined;
      }
    }
  }
  return flags;
};

/**
 * Splits an article into one section per heading of level 2 to 6, so a
 * link to any section can scroll to it (the table of contents lists levels 2
 * and 3). Headings inside code fences are left alone, and repeated headings
 * get distinct ids.
 */
export const splitSections = (markdown: string): HelpSection[] => {
  const sections: HelpSection[] = [{ markdown: "" }];
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  const used = new Map<string, number>();
  lines.forEach((line, index) => {
    const match = !flags[index] && /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const text = match[2].replace(/[*_`]/g, "");
      const base = headingId(text);
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      sections.push({
        heading: {
          level: match[1].length,
          text,
          id: count ? `${base}-${count}` : base,
        },
        markdown: `${line}\n`,
      });
    } else {
      sections[sections.length - 1].markdown += `${line}\n`;
    }
  });
  return sections.filter((s) => s.heading || s.markdown.trim());
};

const LOCAL_IMAGE = /^\/static\/help\/images\/[A-Za-z0-9._-]+$/;

const escapeColon = (text: string): string => text.replace(/:/g, "&#58;");

// Placeholders protect inline code, kept images and finished links while the
// link passes run, so a code span inside link text cannot hide a link.
const TOKEN = /\uE000(\d+)\uE001/g;

const INLINE_CODE = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;

const TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;

// An image: alt text, address (maybe in angle brackets), optional title.
const IMAGE = new RegExp(
  String.raw`!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?${TITLE}\s*\)`,
  "g"
);

// An inline link; the text may hold one level of brackets, the address is
// plain (one level of parentheses allowed) or in angle brackets.
const INLINE_LINK = new RegExp(
  String.raw`(?<!!)\[((?:(?!\n[ \t]*\n)[^\[\]]|\[[^\[\]]*\])*)\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))*)${TITLE}\s*\)`,
  "g"
);

/**
 * Raw tags never reach the renderer, whatever the converter let through (a
 * tag may span lines): media, scripts, and everything that carries an
 * address or could navigate.
 */
const STRIP_TAGS =
  /<\/?(?:img|picture|video|audio|source|iframe|object|embed|script|style|svg|a|area|link|base|form|button|input|meta|frame|frameset|applet|lite-youtube)\b[^>]*>/gi;

/**
 * Turns links in a converted article into reader links or plain text.
 * Bundled targets stay as website-shaped addresses that the reader
 * intercepts; targets that are not bundled become plain text followed by
 * the given note, and addresses of other sites (inline, reference style,
 * automatic, raw anchors and bare) become plain text, never a link that
 * could open the website or another site. Images are kept only when they
 * are bundled copies. Code blocks and inline code are left alone.
 */
export const rewriteArticleLinks = (
  markdown: string,
  isBundled: (path: string) => boolean,
  notBundledNote: string
): string => {
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);

  const definitions = new Map<string, string>();
  const kept: string[] = [];
  lines.forEach((line, index) => {
    const def =
      !flags[index] &&
      /^ {0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.exec(
        line
      );
    if (def) {
      definitions.set(def[1].toLowerCase(), def[2]);
    } else {
      kept.push(line);
    }
  });
  const keptFlags = fenceFlags(kept);

  const parts: string[] = [];
  const stash = (value: string): string => {
    parts.push(value);
    return `\uE000${parts.length - 1}\uE001`;
  };
  const restore = (text: string): string => {
    let current = text;
    for (let i = 0; i < 8 && current.includes("\uE000"); i++) {
      current = current.replace(TOKEN, (_all, n: string) => parts[Number(n)]);
    }
    return current;
  };

  const outcome = (text: string, rawTarget: string): string => {
    const target = rawTarget.replace(/^<|>$/g, "");
    const link = (href: string): string =>
      `${stash("[")}${text}${stash(`](${href})`)}`;
    if (target.startsWith("#")) {
      return link(target);
    }
    const ref = parseHelpAddress(target);
    if (ref && isBundled(ref.path)) {
      return link(
        `https://www.home-assistant.io${ref.path}${ref.hash ? `#${ref.hash}` : ""}`
      );
    }
    return ref ? `${text} (${notBundledNote}: ${ref.path})` : text;
  };

  const rewriteProse = (prose: string): string =>
    prose
      // Images: bundled copies stay, everything else is its description.
      .replace(IMAGE, (_all, alt: string, src: string) =>
        LOCAL_IMAGE.test(src) ? stash(`![${alt}](${src})`) : alt
      )
      .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (_all, alt: string) => alt)
      // Inline links.
      .replace(INLINE_LINK, (_all, text: string, target: string) =>
        outcome(text, target)
      )
      // Reference style links, `[text][ref]` and `[ref][]`.
      .replace(
        /\[([^\]]+)\]\[([^\]]*)\]/g,
        (all, text: string, ref: string) => {
          const target = definitions.get((ref || text).toLowerCase());
          return target ? outcome(text, target) : all;
        }
      )
      // Shortcut references, only when a definition exists.
      .replace(/\[([^\]]+)\](?![([:])/g, (all, text: string) => {
        const target = definitions.get(text.toLowerCase());
        return target ? outcome(text, target) : all;
      })
      // Automatic links: addresses of any scheme, and e-mail addresses.
      .replace(/<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi, (_all, target: string) => {
        const ref = parseHelpAddress(target);
        return ref && isBundled(ref.path)
          ? outcome(target, target)
          : escapeColon(target);
      })
      .replace(/<([^>\s@]+@[^>\s]+)>/g, (_all, mail: string) =>
        mail.replace(/@/g, "&#64;")
      )
      // Bare addresses would be turned into links by the renderer, in
      // prose and in parentheses alike.
      .replace(/https?:\/\/[^\s<>]*/gi, (target: string) => escapeColon(target))
      .replace(/(?<![\w./@-])www\.(?=\w)/gi, (m: string) =>
        m.replace(".", "&#46;")
      );

  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) {
      const protectedRun = run
        .join("\n")
        .replace(/[\uE000\uE001]/g, "")
        .replace(INLINE_CODE, (code) => stash(code));
      // A link may wrap onto the next line, so the passes run on the run.
      out.push(restore(rewriteProse(protectedRun.replace(STRIP_TAGS, ""))));
      run = [];
    }
  };
  kept.forEach((line, index) => {
    if (keptFlags[index]) {
      flush();
      out.push(line);
    } else {
      run.push(line);
    }
  });
  flush();
  return out.join("\n");
};
