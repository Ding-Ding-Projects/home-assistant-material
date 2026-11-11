import type { Block, Inline } from "./markdown-blocks";

/**
 * Lays text out on pages: where each run of text goes, wrapped to the page
 * width and broken across pages. It knows nothing about PDF or canvases;
 * the width of text comes from the caller, so the same layout serves the
 * standard PDF fonts and, for characters those fonts cannot draw, a canvas.
 */

export type FontKey = "regular" | "bold" | "italic" | "mono";

export interface Metrics {
  width: (text: string, font: FontKey, size: number) => number;
}

export interface PageSpec {
  width: number;
  height: number;
  margin: number;
}

export const PAPER = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

export type LayoutOp =
  | {
      kind: "text";
      x: number;
      /** Baseline, measured down from the top of the page. */
      y: number;
      font: FontKey;
      size: number;
      text: string;
    }
  | { kind: "rule"; x1: number; x2: number; y: number };

export interface LaidOutPage {
  width: number;
  height: number;
  ops: LayoutOp[];
}

/** Most pages one document may have. */
export const MAX_PAGES = 500;

const CJK = /[⺀-鿿豈-﫿぀-ヿ가-힯＀-￯]/;

interface Token {
  text: string;
  font: FontKey;
  space: boolean;
}

const fontOf = (inline: Inline, bold: boolean, italic: boolean): FontKey => {
  if (inline.code) {
    return "mono";
  }
  if (inline.bold || bold) {
    return "bold";
  }
  return inline.italic || italic ? "italic" : "regular";
};

const tokens = (
  inlines: readonly Inline[],
  bold: boolean,
  italic: boolean
): Token[] => {
  const out: Token[] = [];
  for (const inline of inlines) {
    const font = fontOf(inline, bold, italic);
    for (const part of inline.text.replace(/\t/g, "    ").split(/(\s+)/)) {
      if (!part) {
        continue;
      }
      if (/^\s+$/.test(part)) {
        out.push({ text: " ", font, space: true });
        continue;
      }
      // Text with no spaces, such as Chinese, may break between characters.
      let word = "";
      for (const character of part) {
        if (CJK.test(character)) {
          if (word) {
            out.push({ text: word, font, space: false });
            word = "";
          }
          out.push({ text: character, font, space: false });
        } else {
          word += character;
        }
      }
      if (word) {
        out.push({ text: word, font, space: false });
      }
    }
  }
  return out;
};

export const layoutBlocks = (
  blocks: readonly Block[],
  metrics: Metrics,
  spec: PageSpec
): { pages: LaidOutPage[]; truncated: boolean } => {
  const pages: LaidOutPage[] = [];
  let page: LaidOutPage | undefined;
  let y = 0;
  let truncated = false;
  const bottom = spec.height - spec.margin;
  const fullWidth = spec.width - spec.margin * 2;

  const newPage = (): boolean => {
    if (pages.length >= MAX_PAGES) {
      truncated = true;
      return false;
    }
    page = { width: spec.width, height: spec.height, ops: [] };
    pages.push(page);
    y = spec.margin;
    return true;
  };
  const room = (height: number): boolean => {
    if (!page) {
      return newPage();
    }
    if (y + height > bottom && y > spec.margin) {
      return newPage();
    }
    return true;
  };

  const line = (
    runs: { text: string; font: FontKey }[],
    x: number,
    size: number,
    lineHeight: number,
    label?: { text: string; x: number }
  ): boolean => {
    if (!room(lineHeight)) {
      return false;
    }
    if (label) {
      page!.ops.push({
        kind: "text",
        x: label.x,
        y: y + size,
        font: "regular",
        size,
        text: label.text,
      });
    }
    let at = x;
    for (const run of runs) {
      if (run.text !== "") {
        page!.ops.push({
          kind: "text",
          x: at,
          y: y + size,
          font: run.font,
          size,
          text: run.text,
        });
      }
      at += metrics.width(run.text, run.font, size);
    }
    y += lineHeight;
    return true;
  };

  /** Wraps the words to the width and writes the lines. */
  const wrapped = (
    items: Token[],
    x: number,
    width: number,
    size: number,
    lineHeight: number,
    firstLabel?: { text: string; x: number }
  ): boolean => {
    let current: { text: string; font: FontKey }[] = [];
    let used = 0;
    let label = firstLabel;
    const flush = (): boolean => {
      while (current.length && current[current.length - 1].text.trim() === "") {
        current.pop();
      }
      if (current.length) {
        const last = current[current.length - 1];
        last.text = last.text.trimEnd();
      }
      const ok = line(current, x, size, lineHeight, label);
      label = undefined;
      current = [];
      used = 0;
      return ok;
    };
    const add = (text: string, font: FontKey, w: number) => {
      const last = current[current.length - 1];
      if (last && last.font === font) {
        last.text += text;
      } else {
        current.push({ text, font });
      }
      used += w;
    };
    for (const token of items) {
      const w = metrics.width(token.text, token.font, size);
      if (token.space) {
        if (current.length) {
          add(" ", token.font, w);
        }
        continue;
      }
      if (used + w > width && current.length) {
        if (!flush()) {
          return false;
        }
      }
      if (w > width) {
        // A word wider than the line is cut where it no longer fits.
        let piece = "";
        let pieceWidth = 0;
        for (const character of token.text) {
          const cw = metrics.width(character, token.font, size);
          if (pieceWidth + cw > width && piece) {
            add(piece, token.font, pieceWidth);
            if (!flush()) {
              return false;
            }
            piece = "";
            pieceWidth = 0;
          }
          piece += character;
          pieceWidth += cw;
        }
        add(piece, token.font, pieceWidth);
      } else {
        add(token.text, token.font, w);
      }
    }
    return current.length ? flush() : true;
  };

  /** Monospaced text keeps its spaces and is cut where it no longer fits. */
  const mono = (
    text: string,
    x: number,
    width: number,
    size: number,
    lineHeight: number
  ): boolean => {
    const expanded = text.replace(/\t/g, "    ");
    if (expanded === "") {
      return line([], x, size, lineHeight);
    }
    let piece = "";
    let pieceWidth = 0;
    for (const character of expanded) {
      const cw = metrics.width(character, "mono", size);
      if (pieceWidth + cw > width && piece) {
        if (!line([{ text: piece, font: "mono" }], x, size, lineHeight)) {
          return false;
        }
        piece = "";
        pieceWidth = 0;
      }
      piece += character;
      pieceWidth += cw;
    }
    return line([{ text: piece, font: "mono" }], x, size, lineHeight);
  };

  const gap = (amount: number) => {
    // No space at the top of a page.
    if (page && y > spec.margin) {
      y += amount;
    }
  };

  const BODY = 11;
  const HEADING_SIZE = [0, 22, 18, 15, 13, 11.5, 11];
  for (const block of blocks) {
    let ok = true;
    switch (block.type) {
      case "heading": {
        const size = HEADING_SIZE[Math.min(6, Math.max(1, block.level))];
        gap(size * 0.7);
        // Keep a heading with the line that follows it.
        ok = room(size * 1.3 + BODY * 1.4);
        ok =
          ok &&
          wrapped(
            tokens(block.inlines, true, false),
            spec.margin,
            fullWidth,
            size,
            size * 1.3
          );
        y += size * 0.25;
        break;
      }
      case "paragraph":
        ok = wrapped(
          tokens(block.inlines, false, false),
          spec.margin,
          fullWidth,
          BODY,
          BODY * 1.4
        );
        y += BODY * 0.6;
        break;
      case "quote": {
        const indent = 18;
        ok = wrapped(
          tokens(block.inlines, false, true),
          spec.margin + indent,
          fullWidth - indent,
          BODY,
          BODY * 1.4
        );
        y += BODY * 0.6;
        break;
      }
      case "item": {
        const indent = 16 + block.depth * 16;
        const label = block.ordered ? `${block.number}.` : "•";
        ok = wrapped(
          tokens(block.inlines, false, false),
          spec.margin + indent + 14,
          fullWidth - indent - 14,
          BODY,
          BODY * 1.4,
          { text: label, x: spec.margin + indent }
        );
        y += BODY * 0.25;
        break;
      }
      case "code":
        for (const text of block.lines) {
          ok = mono(text, spec.margin, fullWidth, 9.5, 12.5);
          if (!ok) {
            break;
          }
        }
        y += BODY * 0.6;
        break;
      case "line":
        ok = mono(block.text, spec.margin, fullWidth, 10, 13);
        break;
      case "rule":
        ok = room(BODY);
        if (ok) {
          y += BODY * 0.4;
          page!.ops.push({
            kind: "rule",
            x1: spec.margin,
            x2: spec.width - spec.margin,
            y,
          });
          y += BODY * 0.8;
        }
        break;
    }
    if (!ok) {
      break;
    }
  }
  if (!pages.length) {
    newPage();
  }
  return { pages, truncated };
};
