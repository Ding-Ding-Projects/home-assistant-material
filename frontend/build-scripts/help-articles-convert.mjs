/**
 * Pure conversion helpers for `sync-help-articles.mjs`.
 *
 * Source pages are Jekyll Markdown from the public Home Assistant
 * documentation. They are converted into plain, sanitized Markdown:
 *
 * - front matter becomes metadata (the title is kept);
 * - Liquid tags are removed or reduced to plain text:
 *   `{% my ... %}` becomes its title text, `{% icon %}` and `{% include %}`
 *   are dropped, `{% term %}` becomes its word, `{% details %}` becomes a bold
 *   line, notes, tips, warnings and similar blocks become block quotes,
 *   `{% configuration %}` blocks become fenced code, `{% raw %}` tags are
 *   removed, and any other tag is removed;
 * - raw HTML is removed (scripts, styles, iframes and their content go
 *   entirely; other tags keep their text);
 * - images are replaced by a note that the image is not included.
 *
 * Links are left as they are; the reader decides at run time which ones
 * lead to a bundled article.
 */

export const splitFrontMatter = (source) => {
  const text = source.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) {
    return { meta: {}, body: text };
  }
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (pair) {
      meta[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: text.slice(match[0].length) };
};

const NOTE_LABELS = {
  tip: "Tip",
  note: "Note",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

export const convertLiquid = (text) => {
  let out = text;
  out = out.replace(
    /\{%-?\s*configuration[^%]*%\}([\s\S]*?)\{%-?\s*endconfiguration\s*-?%\}/g,
    (_all, inner) => `\`\`\`yaml\n${inner.trim()}\n\`\`\``
  );
  out = out.replace(
    /\{%-?\s*(tip|note|important|warning|caution)\s*-?%\}([\s\S]*?)\{%-?\s*end\1\s*-?%\}/g,
    (_all, kind, inner) =>
      `> **${NOTE_LABELS[kind]}:**\n${inner
        .trim()
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n")}`
  );
  out = out.replace(
    /\{%-?\s*details\s+(["'])(.*?)\1[^%]*%\}/g,
    (_all, _q, title) => `**${title}**`
  );
  out = out.replace(/\{%-?\s*enddetails\s*-?%\}/g, "");
  out = out.replace(
    /\{%-?\s*my\s+(\S+)(?:[^%]*?title=(["'])(.*?)\2)?[^%]*%\}/g,
    (_all, key, _q, title) => title ?? key
  );
  out = out.replace(
    /\{%-?\s*term\s+(["'])(.*?)\1[^%]*%\}/g,
    (_all, _q, word) => word
  );
  out = out.replace(/\{%-?\s*(?:raw|endraw)\s*-?%\}/g, "");
  out = out.replace(/\{%-?[\s\S]*?-?%\}/g, "");
  return out;
};

const REMOVE_WITH_CONTENT =
  /<(script|style|iframe|object|embed|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi;

const stripHtmlInProse = (line) =>
  line
    .split(/(`[^`]*`)/)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(/<img\b[^>]*>/gi, "")
            .replace(/<\/?(?!https?:)[a-zA-Z][^>]*>/g, "")
    )
    .join("");

/** Removes raw HTML and remote images; code blocks are left alone. */
export const sanitizeMarkdown = (markdown) => {
  const noComments = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(REMOVE_WITH_CONTENT, "");
  let fence = false;
  const lines = noComments.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return line;
    }
    if (fence) {
      return line;
    }
    const noImages = line.replace(
      /!\[([^\]]*)\]\([^)]*\)/g,
      (_all, alt) => `*(image not included${alt ? `: ${alt}` : ""})*`
    );
    return stripHtmlInProse(noImages);
  });
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const convertArticle = (source) => {
  const { meta, body } = splitFrontMatter(source);
  return {
    title: meta.title || "",
    description: meta.description || "",
    body: sanitizeMarkdown(convertLiquid(body)),
  };
};

/**
 * The candidate source files, in order, for an article path such as
 * `/docs/automation/modes` in the documentation repository.
 */
export const sourceCandidates = (articlePath) => {
  const segments = articlePath.replace(/^\/+|\/+$/g, "").split("/");
  if (!segments[0]) {
    return [];
  }
  const [first, ...rest] = segments;
  const restPath = rest.join("/");
  const roots = [
    `source/_${first}`,
    `source/_${first.replace(/-/g, "_")}`,
    `source/${first}`,
  ];
  const out = [];
  for (const root of roots) {
    for (const ext of ["markdown", "md"]) {
      if (restPath) {
        out.push(
          `${root}/${restPath}.${ext}`,
          `${root}/${restPath}/index.${ext}`
        );
      } else {
        out.push(`${root}/index.${ext}`);
      }
    }
  }
  if (!restPath) {
    out.push(`source/${first}.markdown`, `source/${first}.md`);
  }
  return [...new Set(out)];
};

/** The article paths named by literal arguments of `documentationUrl(`. */
export const extractDocumentationPaths = (code) => {
  const paths = new Set();
  const call =
    /documentationUrl(?:ForVersion)?\(\s*[^,()]+(?:\([^)]*\))?[^,()]*,\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let match;
  while ((match = call.exec(code))) {
    const value = match[2];
    if (value.startsWith("/") && !value.includes("${")) {
      paths.add(normalizePath(value));
    }
  }
  const constants =
    /_DOCUMENTATION_PATH\s*=\s*\n?\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
  while ((match = constants.exec(code))) {
    if (match[2].startsWith("/")) {
      paths.add(normalizePath(match[2]));
    }
  }
  const literal =
    /https:\/\/(?:www\.)?home-assistant\.io(\/[^\s"'`)<>]*[^\s"'`)<>.,;])/g;
  while ((match = literal.exec(code))) {
    if (!match[1].includes("${")) {
      paths.add(normalizePath(match[1]));
    }
  }
  paths.delete("/");
  return [...paths].filter(
    (p) =>
      !/^\/(blog|latest-release-notes|newsletter|images|assets|ios|android|join-chat|socials|shop|developers)\b/i.test(
        p
      )
  );
};

export const normalizePath = (value) => {
  const noHash = value.split("#")[0].split("?")[0];
  const trimmed = noHash.replace(/\.html?$/i, "").replace(/\/+$/, "");
  return trimmed || "/";
};

export const articleSlug = (path) =>
  path.replace(/^\/+|\/+$/g, "").replace(/\//g, "__") || "index";
