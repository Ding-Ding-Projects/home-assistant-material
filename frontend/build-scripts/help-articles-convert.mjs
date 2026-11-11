/**
 * Pure conversion helpers for `sync-help-articles.mjs`.
 *
 * Source pages are Jekyll Markdown from the public Home Assistant
 * documentation (Creative Commons Attribution-NonCommercial-ShareAlike 4.0).
 * They are converted into plain, sanitized Markdown:
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
 * - images stored in the documentation repository itself (PNG, JPEG, WebP)
 *   that the sync script chose to bundle are kept as local images; every
 *   other image is replaced by a note that the image is not included.
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

/**
 * For each line, whether it is inside a fenced code block (fence lines
 * included). A fence closes only with the same character and at least as
 * many of them.
 */
export const fenceFlags = (lines) => {
  const flags = [];
  let open;
  for (const line of lines) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!open) {
      if (match) {
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

const TOKEN = (n) => `@@help-fence-${n}@@`;

/** Replaces each fenced block by one placeholder line. */
const protectFences = (text) => {
  const lines = text.split("\n");
  const flags = fenceFlags(lines);
  const blocks = [];
  const out = [];
  let current;
  lines.forEach((line, i) => {
    if (flags[i]) {
      if (!current) {
        current = [];
        blocks.push(current);
        out.push(TOKEN(blocks.length - 1));
      }
      current.push(line);
      if (!flags[i + 1]) {
        current = undefined;
      }
    } else {
      out.push(line);
    }
  });
  return { text: out.join("\n"), blocks };
};

const restoreFences = (text, blocks) => {
  const clean = (block) =>
    block
      .map((l) => l.replace(/\{%-?\s*(?:raw|endraw)\s*-?%\}/g, ""))
      .join("\n");
  return text
    .replace(/^((?:>[ \t]?)+)\s*@@help-fence-(\d+)@@$/gm, (_all, prefix, n) =>
      blocks[n]
        .map((l) =>
          `${prefix.trimEnd()} ${l.replace(/\{%-?\s*(?:raw|endraw)\s*-?%\}/g, "")}`.trimEnd()
        )
        .join("\n")
    )
    .replace(/^[ \t]*@@help-fence-(\d+)@@$/gm, (_all, n) => clean(blocks[n]))
    .replace(/@@help-fence-(\d+)@@/g, (_all, n) => clean(blocks[n]));
};

export const convertLiquid = (source) => {
  const { text, blocks } = protectFences(source);
  return restoreFences(convertLiquidProse(text), blocks);
};

const convertLiquidProse = (text) => {
  let out = text;
  out = out.replace(
    /\{%-?\s*icon\s+(["'])(?:[a-z]+:)?([^"']*)\1[^%]*%\}([A-Za-z0-9]?)/g,
    (_all, _q, name, next) =>
      `${name ? `(${name.replace(/[-_]/g, " ")} icon)` : ""}${next ? ` ${next}` : ""}`
  );
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

/** Tags may span lines, so this runs on a whole run of prose lines. */
const stripHtmlInProse = (text) =>
  text
    .split(/(`[^`\n]*`)/)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(/<img\b[^>]*>/gi, "")
            .replace(/<\/?(?!https?:)[a-zA-Z][^>]*>/g, "")
    )
    .join("");

/** A Markdown image: alt text, address, optional title. */
const imagePattern = () =>
  /!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^)]*["'])?\s*\)/g;

const imageNote = (alt) => `*(image not included${alt ? `: ${alt}` : ""})*`;

/**
 * Removes raw HTML and images; code blocks are left alone. An image is kept
 * only when `localImage(source)` returns the address of a bundled copy.
 */
export const sanitizeMarkdown = (markdown, localImage) => {
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) {
      return;
    }
    const noImages = run
      .join("\n")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(REMOVE_WITH_CONTENT, "")
      .replace(imagePattern(), (_all, alt, src) => {
        const local = localImage?.(src);
        return local
          ? `![${alt.replace(/[[\]]/g, "")}](${local})`
          : imageNote(alt);
      })
      .replace(
        /!\[([^\]]*)\]\((?!\/static\/help\/images\/)[^)]*\)/g,
        (_all, alt) => imageNote(alt)
      )
      .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (_all, alt) => imageNote(alt));
    out.push(stripHtmlInProse(noImages));
    run = [];
  };
  lines.forEach((line, index) => {
    if (flags[index]) {
      flush();
      out.push(line);
    } else {
      run.push(line);
    }
  });
  flush();
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Checks converted Markdown for what the converter promises to remove:
 * raw HTML tags, Liquid tags, and images that are not bundled copies.
 * Returns the problems found (empty when the body is clean).
 */
export const checkConverted = (body) => {
  const problems = [];
  const lines = body.split("\n");
  const flags = fenceFlags(lines);
  lines.forEach((line, index) => {
    if (flags[index]) {
      return;
    }
    const prose = line.replace(/`[^`]*`/g, "");
    if (/<\/?(?!https?:)[a-zA-Z]/.test(prose)) {
      problems.push(`line ${index + 1}: raw HTML tag`);
    }
    if (/\{%/.test(prose)) {
      problems.push(`line ${index + 1}: Liquid tag`);
    }
    if (/!\[[^\]]*\]\((?!\/static\/help\/images\/)/.test(prose)) {
      problems.push(`line ${index + 1}: image that is not a bundled copy`);
    }
    if (/!\[[^\]]*\]\[/.test(prose)) {
      problems.push(`line ${index + 1}: reference style image`);
    }
  });
  return problems;
};

export const convertArticle = (source, localImage) => {
  const { meta, body } = splitFrontMatter(source);
  return {
    title: meta.title || "",
    description: meta.description || "",
    body: sanitizeMarkdown(convertLiquid(body), localImage),
  };
};

/**
 * The repository path of an image that lives in the documentation
 * repository (`/images/...`) and has a type that cannot carry script, or
 * undefined for every other image. SVG is never accepted.
 */
export const repositoryImagePath = (source) => {
  const clean = source.split("#")[0].split("?")[0];
  if (!/^\/images\/\S+\.(png|jpe?g|webp)$/i.test(clean)) {
    return undefined;
  }
  if (clean.includes("..")) {
    return undefined;
  }
  return `source${clean}`;
};

/** The file name an image is stored under in `public/static/help/images`. */
export const imageFileName = (repositoryPath) =>
  repositoryPath
    .replace(/^source\/images\//, "")
    .replace(/\//g, "__")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_");

/** The image sources named by the converted Markdown, outside code. */
export const imageSources = (markdown) => {
  const found = [];
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  lines.forEach((line, index) => {
    if (flags[index]) {
      return;
    }
    const pattern = imagePattern();
    let match;
    while ((match = pattern.exec(line))) {
      found.push(match[2]);
    }
  });
  return found;
};

/** True when the bytes are a PNG, JPEG or WebP image (never SVG or text). */
export const hasRasterMagic = (bytes) => {
  const b = Buffer.from(bytes);
  const png =
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp =
    b.length > 12 &&
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP";
  return png || jpeg || webp;
};

/**
 * Parses the Netlify style `source/_redirects` file of the documentation
 * repository into internal rules. Redirects to other sites and entries
 * that carry a hash on the left are skipped; `/*` rules are returned
 * separately.
 */
export const parseRedirects = (text) => {
  const exact = new Map();
  const splat = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [from, to] = line.split(/\s+/);
    if (!from || !to || !to.startsWith("/") || from.includes("#")) {
      continue;
    }
    if (from.endsWith("/*")) {
      splat.push({ prefix: from.slice(0, -2), to });
    } else {
      exact.set(from.replace(/\/+$/, "") || "/", to);
    }
  }
  return { exact, splat };
};

/**
 * Follows redirects (at most six hops) until `isFinal(path)` is true or a
 * path with no rule is reached. The hash of the last rule is kept.
 */
export const followRedirects = (
  articlePath,
  redirects,
  isFinal = () => false
) => {
  let current = articlePath;
  for (let i = 0; i < 6; i++) {
    const [base] = current.split("#");
    if (isFinal(base.replace(/\/+$/, ""))) {
      return current;
    }
    const key = base.replace(/\/+$/, "");
    let next = redirects.exact.get(key);
    if (!next) {
      const rule = redirects.splat.find(
        (r) => key === r.prefix || key.startsWith(`${r.prefix}/`)
      );
      if (rule) {
        next = rule.to.replace(
          /:splat$/,
          key.slice(rule.prefix.length).replace(/^\//, "")
        );
      }
    }
    if (!next) {
      return current;
    }
    current = next;
  }
  return current;
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

/** An integration page path: `/integrations/<domain>` with nothing after. */
export const integrationDomain = (path) =>
  /^\/integrations\/([a-z0-9_]+)$/.exec(path)?.[1];
