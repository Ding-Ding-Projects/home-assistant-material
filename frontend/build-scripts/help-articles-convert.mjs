/**
 * Pure conversion helpers for `sync-help-articles.mjs`.
 *
 * Source pages are Jekyll Markdown from the public Home Assistant
 * documentation (Creative Commons Attribution-NonCommercial-ShareAlike 4.0).
 * They are converted into plain, sanitized Markdown:
 *
 * - front matter becomes metadata (the title is kept; without one, the
 *   caller's fallback or the first heading is used, never the path);
 * - Liquid tags are removed or reduced to plain text, without leaving a gap
 *   where a tag stood:
 *   `{% my ... %}` becomes its title text, `{% icon %}` becomes its name and
 *   `{% include %}` is dropped, `{% term %}` (quoted or bare word) becomes
 *   its word, `{% details %}` becomes a bold
 *   line, notes, tips, warnings and similar blocks become block quotes,
 *   `{% configuration %}` blocks become fenced code, `{% raw %}` tags are
 *   removed, and any other tag is removed;
 * - raw HTML is removed (scripts, styles, iframes and their content go
 *   entirely; other tags keep their text); angle brackets around something
 *   that is not an HTML element (`<domain>`) stay as visible text;
 * - table rows are evened out to their header's cell count, and a link to
 *   a section that does not exist becomes plain text;
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
      // A run of the same character later on the line means inline code,
      // not a fence.
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

/**
 * Removes every match of `pattern` (a regular expression without groups).
 * An inline match takes one of the spaces around it with it, so no doubled
 * space is left where it stood; a match on its own line leaves nothing.
 */
const removeKeepingGap = (text, pattern) =>
  text.replace(
    new RegExp(
      `( *)(?:${pattern.source})(?: *(?:${pattern.source}))*( *)`,
      `${pattern.flags.replace("g", "")}g`
    ),
    (all, before, after, offset, whole) => {
      if (before && after) {
        return " ";
      }
      const next = whole[offset + all.length];
      const previous = whole[offset - 1];
      if (before) {
        return next === undefined || /[\n.,;:)!?]/.test(next) ? "" : " ";
      }
      if (after) {
        return previous === undefined || previous === "\n" ? "" : " ";
      }
      return "";
    }
  );

export const convertLiquid = (source) => {
  const { text, blocks } = protectFences(source);
  return restoreFences(convertLiquidProse(text), blocks);
};

const convertLiquidProse = (text) => {
  // Extra spaces next to a tag are one space once the tag is gone.
  let out = text
    .replace(/(?<=\S) {2,}(?=[*_]*\{%)/g, " ")
    .replace(/(?<=%\}[*_]*) {2,}(?=\S)/g, " ");
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
  // A glossary term: quoted (`{% term "config entry" %}`) or a bare word
  // (`{% term automation %}`), optionally with its own `text="..."`.
  out = out.replace(
    /\{%-?\s*term\s+(?:(["'])(.*?)\1|([^\s%"'][^\s%"']*))([^%]*)%\}( {2,})?/g,
    (_all, _q, quoted, bare, rest, spaces) =>
      `${/\btext\s*=\s*(["'])(.*?)\1/.exec(rest)?.[2] ?? quoted ?? bare}${spaces ? " " : ""}`
  );
  out = out.replace(/\{%-?\s*(?:raw|endraw)\s*-?%\}/g, "");
  // Any other tag is removed, without leaving a gap where it stood.
  out = removeKeepingGap(out, /\{%-?[\s\S]*?-?%\}/);
  return out;
};

const REMOVE_WITH_CONTENT =
  /<(script|style|iframe|object|embed|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi;

/** Real HTML elements; anything else in angle brackets is a placeholder. */
const HTML_TAGS = [
  "a",
  "abbr",
  "b",
  "big",
  "blockquote",
  "br",
  "caption",
  "center",
  "cite",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "kbd",
  "li",
  "lite-youtube",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "tt",
  "u",
  "ul",
  "video",
  "picture",
  "source",
  "center",
  "dir",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "area",
  "map",
  "frame",
  "frameset",
  "applet",
  "code",
  "select",
  "option",
  "optgroup",
  "label",
  "textarea",
  "iconify-icon",
  "ha-icon",
  "tabs",
  "tab",
  "var",
];
const HTML_TAG = new RegExp(
  `</?(?:${HTML_TAGS.join("|")})(?=[\\s/>])[^>]*>`,
  "gi"
);

/**
 * Tags may span lines, so this runs on a whole run of prose lines. Real tags
 * are removed (their text stays); a placeholder such as `<domain>` is kept
 * as visible text, escaped so the renderer does not take it for a tag.
 */
const stripHtmlInProse = (text) =>
  text
    .split(/(`[^`\n]*`)/)
    .map((part, index) =>
      index % 2
        ? part
        : removeKeepingGap(
            removeKeepingGap(part, /<img\b[^>]*>/i),
            HTML_TAG
          ).replace(/\\?<(\/?[a-zA-Z][^<>\n]*?)\\?>/g, (all, inner) =>
            /^(?:https?|mailto|ftp):/i.test(inner) ||
            /^[^\s@]+@[^\s@]+$/.test(inner)
              ? all
              : `&lt;${inner}&gt;`
          )
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

const isTableRow = (line) => /^\s*\|/.test(line);

const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** The cells of a table row, split at pipes that are not escaped. */
const tableCells = (row) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/);

/** The runs of table rows outside code, as `{ start, end }` line ranges. */
const tableRuns = (lines, flags) => {
  const runs = [];
  let start = -1;
  const close = (end) => {
    if (
      start !== -1 &&
      end - start >= 2 &&
      TABLE_DELIMITER.test(lines[start + 1])
    ) {
      runs.push({ start, end });
    }
    start = -1;
  };
  lines.forEach((line, index) => {
    if (!flags[index] && isTableRow(line)) {
      if (start === -1) {
        start = index;
      }
    } else {
      close(index);
    }
  });
  close(lines.length);
  return runs;
};

/**
 * Makes every row of a table have as many cells as its header: a short row
 * gets empty cells, a long row keeps its extra text in the last cell.
 */
export const normalizeTables = (markdown) => {
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  for (const { start, end } of tableRuns(lines, flags)) {
    const width = tableCells(lines[start]).length;
    for (let i = start + 2; i < end; i++) {
      const cells = tableCells(lines[i]);
      if (cells.length === width) {
        continue;
      }
      const fixed =
        cells.length < width
          ? [...cells, ...Array(width - cells.length).fill(" ")]
          : [...cells.slice(0, width - 1), cells.slice(width - 1).join("\\|")];
      lines[i] = `|${fixed.join("|")}|`;
    }
  }
  return lines.join("\n");
};

/** The heading text a reader derives an id from (levels 2 to 6). */
const headingIds = (markdown) => {
  const ids = new Set();
  const used = new Map();
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  lines.forEach((line, index) => {
    const match = !flags[index] && /^#{2,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const base = match[1]
        .replace(/[*_`]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .trim()
        .replace(/\s+/g, "-");
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      ids.add(count ? `${base}-${count}` : base);
    }
  });
  return ids;
};

/** A link to a section that does not exist becomes its plain text. */
export const removeDeadAnchors = (markdown) => {
  const ids = headingIds(markdown);
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  const unlink = (run) => {
    // Code spans are set aside so that link text holding code is seen; a
    // link's text may wrap onto the next line.
    const spans = [];
    return run
      .replace(/[\uE000\uE001]/g, "")
      .replace(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (code) => {
        spans.push(code);
        return `\uE000${spans.length - 1}\uE001`;
      })
      .replace(
        /(?<!!)\[((?:(?!\n[ \t]*\n)[^\]])*)\]\(#([^)\s]*)\)/g,
        (all, text, fragment) => {
          let id = fragment;
          try {
            id = decodeURIComponent(fragment);
          } catch (_err) {
            // keep the raw fragment
          }
          return ids.has(id) ? all : text;
        }
      )
      .replace(/\uE000(\d+)\uE001/g, (_all, n) => spans[n]);
  };
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length) {
      out.push(unlink(run.join("\n")));
      run = [];
    }
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
  return out.join("\n");
};

/** The first heading of a page, as plain text, or an empty string. */
export const firstHeading = (markdown) => {
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  for (let i = 0; i < lines.length; i++) {
    const match = !flags[i] && /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (match) {
      return match[1]
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]/g, "")
        .trim();
    }
  }
  return "";
};

/**
 * Whether the source text itself has a run of spaces in front of this word
 * (a code span is written as U+0000). Such a gap was in the source and is
 * not a dropped word.
 */
const sourceHasGap = (source, right) => {
  if (!source) {
    return false;
  }
  const part = (text) =>
    text
      .split("\u0000")
      .map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("`[^`\\n]*`");
  // The left neighbour may have changed in conversion (a link became its
  // text), so the word after the gap is what has to match.
  return new RegExp(`(?<=\\S) {2,}${part(right)}`).test(source);
};

/**
 * Checks converted Markdown for what the converter promises: no raw HTML
 * tags, no Liquid tags, no images that are not bundled copies, no gap where
 * a word was dropped, no empty bold run and no table row with a different
 * number of cells than its header. A run of spaces that the source text
 * itself has (given as `source`) is not a dropped word. Returns the
 * problems found (empty when the body is clean).
 */
export const checkConverted = (body, source = "") => {
  const problems = [];
  const lines = body.split("\n");
  const flags = fenceFlags(lines);
  lines.forEach((line, index) => {
    if (flags[index]) {
      return;
    }
    const prose = line.replace(/`[^`]*`/g, "C");
    if (/<\/?(?!https?:|mailto:|[^\s@>]+@)[a-zA-Z]/.test(prose)) {
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
    if (!isTableRow(line)) {
      const codeless = line
        .replace(/`[^`]*`/g, "\u0000")
        .replace(/^[\s>]*(?:[-*+]|\d+[.)])?\s*/, "");
      for (const gap of codeless.matchAll(/(\S{1,6}) {2,}(\S{1,6})/g)) {
        if (!sourceHasGap(source, gap[2])) {
          problems.push(`line ${index + 1}: doubled space (a dropped word?)`);
          break;
        }
      }
    }
    if (/(?:^|[^*\w])\*\*\s*\*\*(?![*\w])/.test(prose)) {
      problems.push(`line ${index + 1}: empty bold run`);
    }
  });
  for (const { start, end } of tableRuns(lines, flags)) {
    const width = tableCells(lines[start]).length;
    for (let i = start + 1; i < end; i++) {
      if (tableCells(lines[i]).length !== width) {
        problems.push(`line ${i + 1}: table row with a different cell count`);
      }
    }
  }
  return problems;
};

/**
 * Converts one source page. The title is the front matter `title`, else
 * the given fallback (an integration's name), else the first heading; it is
 * never the page's path.
 */
export const convertArticle = (source, localImage, fallbackTitle = "") => {
  const { meta, body } = splitFrontMatter(source);
  const converted = removeDeadAnchors(
    normalizeTables(sanitizeMarkdown(convertLiquid(body), localImage))
  );
  return {
    title: meta.title || fallbackTitle || firstHeading(converted),
    description: meta.description || "",
    body: converted,
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
