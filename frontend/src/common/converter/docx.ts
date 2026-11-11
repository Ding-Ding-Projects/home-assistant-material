import type { ArchiveEntry } from "./archive-types";
import type { Block, Inline } from "./markdown-blocks";
import { inlinePlain } from "./markdown-blocks";
import type { ConvertError } from "./types";
import { failure } from "./types";
import { readZip, writeZip } from "./zip";

/**
 * Word documents (.docx) in both directions, without a Word library. A .docx
 * is a ZIP of XML files; reading takes the text, headings, lists and tables
 * out of the main document part, and writing builds the smallest package
 * Word, LibreOffice and Google Docs open. Pictures, comments, tracked
 * changes, headers, footnotes and page layout are not carried over.
 */

export type DocBlock = Block | { type: "table"; rows: string[][] };

/** The largest main document part that is read. */
export const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Characters that XML 1.0 cannot hold are dropped, so Word never refuses the
// file.
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

const escapeXml = (text: string): string =>
  text
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const run = (
  inline: Inline,
  force: { bold?: boolean; italic?: boolean } = {}
): string => {
  const props =
    (inline.bold || force.bold ? "<w:b/>" : "") +
    (inline.italic || force.italic ? "<w:i/>" : "") +
    (inline.code
      ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
      : "");
  const parts = inline.text.replace(/\r\n?/g, "\n").split(/(\t|\n)/);
  let body = "";
  for (const part of parts) {
    if (part === "\t") {
      body += "<w:tab/>";
    } else if (part === "\n") {
      body += "<w:br/>";
    } else if (part) {
      body += `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`;
    }
  }
  return body
    ? `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${body}</w:r>`
    : "";
};

const paragraph = (
  inlines: readonly Inline[],
  props = "",
  force: { bold?: boolean; italic?: boolean } = {}
): string =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inlines.map((inline) => run(inline, force)).join("")}</w:p>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3, 4, 5, 6]
  .map(
    (level) =>
      `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${240 - level * 20}" w:after="80"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[0, 40, 34, 30, 26, 24, 22][level]}"/></w:rPr></w:style>`
  )
  .join("\n")}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
</w:styles>`;

const levelXml = (n: number, format: string, text: string): string =>
  `<w:lvl w:ilvl="${n}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + n * 360}" w:hanging="360"/></w:pPr></w:lvl>`;

const numbering = (orderedGroups: number): string => {
  const levels = (format: string, marks: string[]) =>
    marks.map((mark, n) => levelXml(n, format, mark)).join("");
  let nums = `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
  for (let i = 0; i < orderedGroups; i++) {
    nums += `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels("bullet", ["•", "◦", "▪", "•", "◦"])}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels("decimal", ["%1.", "%2.", "%3.", "%4.", "%5."])}</w:abstractNum>
${nums}
</w:numbering>`;
};

/** A .docx package holding the blocks. */
export const buildDocx = async (
  blocks: readonly Block[],
  paper: "a4" | "letter"
): Promise<Uint8Array> => {
  let body = "";
  let orderedGroups = 0;
  let previousOrdered = false;
  for (const block of blocks) {
    const ordered = block.type === "item" && block.ordered;
    if (ordered && !previousOrdered) {
      orderedGroups++;
    }
    previousOrdered = ordered;
    switch (block.type) {
      case "heading":
        body += paragraph(
          block.inlines,
          `<w:pStyle w:val="Heading${Math.min(6, Math.max(1, block.level))}"/>`
        );
        break;
      case "paragraph":
        body += paragraph(block.inlines);
        break;
      case "quote":
        body += paragraph(block.inlines, '<w:pStyle w:val="Quote"/>');
        break;
      case "item":
        body += paragraph(
          block.inlines,
          `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(4, block.depth)}"/><w:numId w:val="${block.ordered ? orderedGroups + 1 : 1}"/></w:numPr>`
        );
        break;
      case "code":
        for (const line of block.lines) {
          body += paragraph([{ text: line }], '<w:pStyle w:val="Code"/>');
        }
        break;
      case "line":
        body += paragraph([{ text: block.text }]);
        break;
      case "rule":
        body +=
          '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr></w:pPr></w:p>';
        break;
    }
  }
  if (!body) {
    body = "<w:p/>";
  }
  const [pageWidth, pageHeight] =
    paper === "a4" ? [11906, 16838] : [12240, 15840];
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ],
    [
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
    ],
    [
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ],
    ["word/styles.xml", STYLES],
    ["word/numbering.xml", numbering(orderedGroups)],
  ];
  const encoder = new TextEncoder();
  const entries: ArchiveEntry[] = files.map(([path, text]) => ({
    path,
    data: encoder.encode(text),
    dir: false,
    modified: 0,
  }));
  return writeZip(entries);
};

// Reading.

const children = (parent: Element): Element[] => Array.from(parent.children);

const firstChild = (parent: Element | null, name: string): Element | null =>
  parent
    ? (children(parent).find((child) => child.localName === name) ?? null)
    : null;

const attr = (element: Element | null, name: string): string | null =>
  element?.getAttributeNS(W, name) ??
  element?.getAttribute(`w:${name}`) ??
  null;

const isOn = (element: Element | null): boolean => {
  if (!element) {
    return false;
  }
  const value = attr(element, "val");
  return value !== "0" && value !== "false" && value !== "off";
};

interface NumberingInfo {
  /** numId and level to whether the level counts (true) or is a bullet. */
  ordered: (numId: string, level: number) => boolean;
}

const readNumbering = (doc: Document | undefined): NumberingInfo => {
  const abstract = new Map<string, Map<number, boolean>>();
  const nums = new Map<string, string>();
  if (doc?.documentElement) {
    for (const node of children(doc.documentElement)) {
      if (node.localName === "abstractNum") {
        const levels = new Map<number, boolean>();
        for (const lvl of children(node)) {
          if (lvl.localName === "lvl") {
            const format = attr(firstChild(lvl, "numFmt"), "val");
            levels.set(
              Number(attr(lvl, "ilvl") ?? 0),
              format !== "bullet" && format !== "none"
            );
          }
        }
        abstract.set(attr(node, "abstractNumId") ?? "", levels);
      } else if (node.localName === "num") {
        nums.set(
          attr(node, "numId") ?? "",
          attr(firstChild(node, "abstractNumId"), "val") ?? ""
        );
      }
    }
  }
  return {
    ordered: (numId, level) =>
      abstract.get(nums.get(numId) ?? "")?.get(level) ?? false,
  };
};

const MONO = /consolas|courier|mono|menlo/i;

const collectRuns = (parent: Element, out: Inline[]) => {
  for (const node of children(parent)) {
    switch (node.localName) {
      case "r": {
        const props = firstChild(node, "rPr");
        const fonts = firstChild(props, "rFonts");
        const base: Omit<Inline, "text"> = {
          bold: isOn(firstChild(props, "b")) || undefined,
          italic: isOn(firstChild(props, "i")) || undefined,
          code: MONO.test(attr(fonts, "ascii") ?? "") || undefined,
        };
        let text = "";
        for (const part of children(node)) {
          if (part.localName === "t") {
            text += part.textContent ?? "";
          } else if (part.localName === "tab") {
            text += "\t";
          } else if (part.localName === "br" || part.localName === "cr") {
            text += "\n";
          } else if (part.localName === "noBreakHyphen") {
            text += "-";
          }
        }
        if (text) {
          const last = out[out.length - 1];
          if (
            last &&
            !!last.bold === !!base.bold &&
            !!last.italic === !!base.italic &&
            !!last.code === !!base.code
          ) {
            last.text += text;
          } else {
            out.push({ text, ...base });
          }
        }
        break;
      }
      case "del":
      case "moveFrom":
        break;
      case "hyperlink":
      case "ins":
      case "smartTag":
      case "fldSimple":
      case "sdt":
      case "sdtContent":
      case "moveTo":
        collectRuns(node, out);
        break;
    }
  }
};

const cellText = (cell: Element): string => {
  const lines: string[] = [];
  for (const node of children(cell)) {
    if (node.localName === "p") {
      const inlines: Inline[] = [];
      collectRuns(node, inlines);
      lines.push(inlinePlain(inlines));
    }
  }
  return lines.join("\n").trim();
};

const readBody = (parent: Element, numbers: NumberingInfo, out: DocBlock[]) => {
  for (const node of children(parent)) {
    if (node.localName === "sdt" || node.localName === "sdtContent") {
      readBody(node, numbers, out);
    } else if (node.localName === "tbl") {
      const rows: string[][] = [];
      for (const row of children(node)) {
        if (row.localName === "tr") {
          rows.push(
            children(row)
              .filter((cell) => cell.localName === "tc")
              .map(cellText)
          );
        }
      }
      if (rows.length) {
        out.push({ type: "table", rows });
      }
    } else if (node.localName === "p") {
      const props = firstChild(node, "pPr");
      const style = attr(firstChild(props, "pStyle"), "val") ?? "";
      const inlines: Inline[] = [];
      collectRuns(node, inlines);
      const numPr = firstChild(props, "numPr");
      const heading = /^heading\s*(\d)$/i.exec(style);
      if (heading) {
        out.push({
          type: "heading",
          level: Math.min(6, Math.max(1, Number(heading[1]))),
          inlines,
        });
      } else if (/^title$/i.test(style)) {
        out.push({ type: "heading", level: 1, inlines });
      } else if (numPr && firstChild(numPr, "numId")) {
        const numId = attr(firstChild(numPr, "numId"), "val") ?? "";
        const ilvl = Number(attr(firstChild(numPr, "ilvl"), "val") ?? 0);
        if (numId !== "0" && inlines.length) {
          out.push({
            type: "item",
            ordered: numbers.ordered(numId, ilvl),
            number: 0,
            depth: Math.min(4, ilvl),
            inlines,
          });
        }
      } else if (/^quote$/i.test(style)) {
        out.push({ type: "quote", inlines });
      } else {
        out.push({ type: "paragraph", inlines });
      }
    }
  }
};

export type DocxResult =
  { ok: true; blocks: DocBlock[] } | { ok: false; error: ConvertError };

/** Whether a ZIP is a Word document: it has the main document part. */
export const looksLikeDocx = (bytes: Uint8Array): boolean => {
  // File names are stored in plain bytes in the central directory.
  const needle = "word/document.xml";
  const text = new TextDecoder("latin1").decode(bytes);
  return text.includes(needle) && text.includes("[Content_Types].xml");
};

/** The headings, paragraphs, lists and tables of a .docx. */
export const readDocx = async (bytes: Uint8Array): Promise<DocxResult> => {
  const zip = await readZip(bytes);
  if (!zip.ok) {
    return zip;
  }
  const part = (path: string) =>
    zip.entries.find((entry) => entry.path === path)?.data;
  const main = part("word/document.xml");
  if (!main) {
    return failure("docx_not_word");
  }
  if (main.length > MAX_DOCUMENT_BYTES) {
    return failure("docx_too_large");
  }
  const parse = (data: Uint8Array): Document | undefined => {
    const doc = new DOMParser().parseFromString(
      new TextDecoder("utf-8").decode(data),
      "application/xml"
    );
    return doc.getElementsByTagName("parsererror").length ? undefined : doc;
  };
  const document = parse(main);
  const body = document ? firstChild(document.documentElement, "body") : null;
  if (!document || !body) {
    return failure("docx_not_word");
  }
  const numberingPart = part("word/numbering.xml");
  const numbers = readNumbering(
    numberingPart ? parse(numberingPart) : undefined
  );
  const blocks: DocBlock[] = [];
  readBody(body, numbers, blocks);
  return { ok: true, blocks };
};

// Writing the result as text.

const escapeMarkdown = (text: string): string =>
  text
    .replace(/([\\`*])/g, "\\$1")
    .replace(/(^|\s)_|_(?=\s|$)/g, (match) => match.replace("_", "\\_"));

const markdownInline = (inlines: readonly Inline[]): string =>
  inlines
    .map((inline) => {
      const text = inline.text.replace(/\n/g, "  \n");
      if (inline.code) {
        return `\`${inline.text.replace(/`/g, "'")}\``;
      }
      const wrapped = escapeMarkdown(text);
      const trimmed = wrapped.trim();
      if (!trimmed) {
        return wrapped;
      }
      const lead = wrapped.slice(
        0,
        wrapped.length - wrapped.trimStart().length
      );
      const trail = wrapped.slice(wrapped.trimEnd().length);
      const mark =
        inline.bold && inline.italic
          ? "***"
          : inline.bold
            ? "**"
            : inline.italic
              ? "*"
              : "";
      return `${lead}${mark}${trimmed}${mark}${trail}`;
    })
    .join("");

const tableMarkdown = (rows: string[][]): string => {
  const width = Math.max(...rows.map((row) => row.length));
  const cell = (value: string | undefined) =>
    (value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_x, i) => cell(row[i])).join(" | ")} |`;
  return [
    line(rows[0]),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map(line),
  ].join("\n");
};

interface Counter {
  ordered: boolean;
  count: number;
}

/** The label of a list item: "-" for a bullet, or the next number at its level. */
const nextMarker = (
  counters: Counter[],
  block: { ordered: boolean; depth: number }
): string => {
  counters.length = block.depth + 1;
  const level = counters[block.depth];
  if (!level || level.ordered !== block.ordered) {
    counters[block.depth] = { ordered: block.ordered, count: 0 };
  }
  counters[block.depth].count++;
  return block.ordered ? `${counters[block.depth].count}.` : "-";
};

export const docxToMarkdown = (blocks: readonly DocBlock[]): string => {
  const parts: string[] = [];
  const counters: Counter[] = [];
  let previousItem = false;
  for (const block of blocks) {
    if (block.type !== "item") {
      counters.length = 0;
    }
    switch (block.type) {
      case "heading":
        parts.push(
          `${"#".repeat(block.level)} ${markdownInline(block.inlines).trim()}`
        );
        break;
      case "paragraph": {
        const text = markdownInline(block.inlines).trim();
        if (text) {
          parts.push(text);
        }
        break;
      }
      case "quote":
        parts.push(`> ${markdownInline(block.inlines).trim()}`);
        break;
      case "item": {
        const mark = nextMarker(counters, block);
        const text = `${"  ".repeat(block.depth)}${mark} ${markdownInline(block.inlines).trim()}`;
        if (previousItem) {
          parts[parts.length - 1] += `\n${text}`;
        } else {
          parts.push(text);
        }
        break;
      }
      case "table":
        parts.push(tableMarkdown(block.rows));
        break;
      case "code":
        parts.push(`\`\`\`\n${block.lines.join("\n")}\n\`\`\``);
        break;
      case "line":
        parts.push(block.text);
        break;
      case "rule":
        parts.push("---");
        break;
    }
    previousItem = block.type === "item";
  }
  return `${parts.join("\n\n")}\n`;
};

export const docxToPlain = (blocks: readonly DocBlock[]): string => {
  const parts: string[] = [];
  const counters: Counter[] = [];
  let previousItem = false;
  for (const block of blocks) {
    if (block.type !== "item") {
      counters.length = 0;
    }
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote": {
        const text = inlinePlain(block.inlines).trim();
        if (text) {
          parts.push(text);
        }
        break;
      }
      case "item": {
        const mark = nextMarker(counters, block);
        const text = `${"  ".repeat(block.depth)}${mark} ${inlinePlain(block.inlines).trim()}`;
        if (previousItem) {
          parts[parts.length - 1] += `\n${text}`;
        } else {
          parts.push(text);
        }
        break;
      }
      case "table":
        parts.push(
          block.rows
            .map((row) => row.map((c) => c.replace(/\n/g, " ")).join("\t"))
            .join("\n")
        );
        break;
      case "code":
        parts.push(block.lines.join("\n"));
        break;
      case "line":
        parts.push(block.text);
        break;
      case "rule":
        break;
    }
    previousItem = block.type === "item";
  }
  return `${parts.join("\n\n")}\n`;
};
