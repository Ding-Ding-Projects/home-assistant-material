/**
 * A small reader for the parts of Markdown that matter when a note becomes
 * a PDF or a Word document: headings, paragraphs, lists, quotes, code,
 * rules, and bold, italic and code inside a line. Tables are kept as
 * monospaced text. Everything else is shown as the text it is.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type Block =
  | { type: "heading"; level: number; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | {
      type: "item";
      ordered: boolean;
      number: number;
      depth: number;
      inlines: Inline[];
    }
  | { type: "quote"; inlines: Inline[] }
  | { type: "code"; lines: string[] }
  | { type: "line"; text: string }
  | { type: "rule" };

const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|(\*\*|__)(?=\S)([\s\S]*?\S)\3|(\*|_)(?=\S)([\s\S]*?\S)\5|!?\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g;

/** Bold, italic, code and links inside one run of text. */
export const parseInline = (source: string): Inline[] => {
  const out: Inline[] = [];
  const push = (text: string, style: Omit<Inline, "text"> = {}) => {
    if (text) {
      out.push({ text, ...style });
    }
  };
  let last = 0;
  // matchAll works on a copy of the pattern, so the nested calls below do not
  // disturb this loop.
  for (const m of source.matchAll(INLINE)) {
    push(source.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) {
      push(m[2].trim() === "" ? m[2] : m[2].replace(/^ | $/g, ""), {
        code: true,
      });
    } else if (m[3]) {
      for (const inner of parseInline(m[4])) {
        push(inner.text, { ...inner, bold: true });
      }
    } else if (m[5]) {
      for (const inner of parseInline(m[6])) {
        push(inner.text, { ...inner, italic: true });
      }
    } else {
      const label = m[7];
      const target = m[8];
      push(
        label && target && label !== target
          ? `${label} (${target})`
          : label || target
      );
    }
  }
  push(source.slice(last));
  return out;
};

/** The text with its styling taken away. */
export const inlinePlain = (inlines: readonly Inline[]): string =>
  inlines.map((inline) => inline.text).join("");

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE = /^\s*\|.*\|\s*$/;

export const parseMarkdown = (text: string): Block[] => {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({
        type: "paragraph",
        inlines: parseInline(paragraph.join(" ")),
      });
      paragraph = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) {
        code.push(lines[i]);
      }
      blocks.push({ type: "code", lines: code });
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        inlines: parseInline(heading[2]),
      });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    if (TABLE.test(line)) {
      flush();
      const last = blocks[blocks.length - 1];
      if (
        last?.type === "code" &&
        TABLE.test(last.lines[last.lines.length - 1] ?? "")
      ) {
        last.lines.push(line);
      } else {
        blocks.push({ type: "code", lines: [line] });
      }
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]);
      blocks.push({
        type: "item",
        ordered,
        number: ordered ? parseInt(item[2], 10) : 0,
        depth: Math.min(4, Math.floor(item[1].replace(/\t/g, "  ").length / 2)),
        inlines: parseInline(item[3]),
      });
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      blocks.push({ type: "quote", inlines: parseInline(quote[1]) });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
};

/** Plain text: every line stays a line. */
export const parsePlain = (text: string): Block[] =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => ({ type: "line" as const, text: line }));
