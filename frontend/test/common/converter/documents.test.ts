import { describe, expect, it } from "vitest";
import {
  buildDocx,
  docxToMarkdown,
  docxToPlain,
  looksLikeDocx,
  readDocx,
} from "../../../src/common/converter/docx";
import { readJpeg } from "../../../src/common/converter/jpeg-info";
import type { Metrics } from "../../../src/common/converter/layout";
import { layoutBlocks } from "../../../src/common/converter/layout";
import {
  inlinePlain,
  parseInline,
  parseMarkdown,
  parsePlain,
} from "../../../src/common/converter/markdown-blocks";
import { buildImagePdf, buildTextPdf } from "../../../src/common/converter/pdf";
import {
  drawableWithStandardFonts,
  standardMetrics,
  winAnsiByte,
} from "../../../src/common/converter/pdf-fonts";
import { sniffContents } from "../../../src/common/converter/detect";
import { readZip, writeZip } from "../../../src/common/converter/zip";

const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("markdown reading", () => {
  it("reads bold, italic, code and links inside a line", () => {
    expect(parseInline("a **b** *c* `d` [e](http://x.test)")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", code: true },
      { text: " " },
      { text: "e (http://x.test)" },
    ]);
  });

  it("nests bold and italic without looping", () => {
    const out = parseInline("**bold *and italic* too**");
    expect(inlinePlain(out)).toBe("bold and italic too");
    expect(out.some((part) => part.bold && part.italic)).toBe(true);
  });

  it("reads headings, lists, quotes, code, rules and tables", () => {
    const blocks = parseMarkdown(
      [
        "# One",
        "",
        "text that",
        "continues",
        "",
        "- a",
        "  - b",
        "3. c",
        "> q",
        "```",
        "x  y",
        "```",
        "---",
        "| a | b |",
        "| - | - |",
      ].join("\n")
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "item",
      "item",
      "item",
      "quote",
      "code",
      "rule",
      "code",
    ]);
    expect(blocks[1]).toMatchObject({
      inlines: [{ text: "text that continues" }],
    });
    expect(blocks[3]).toMatchObject({ depth: 1, ordered: false });
    expect(blocks[4]).toMatchObject({ ordered: true, number: 3 });
    expect(blocks[6]).toMatchObject({ lines: ["x  y"] });
  });

  it("keeps every line of plain text, blank ones too", () => {
    expect(parsePlain("a\n\nb")).toEqual([
      { type: "line", text: "a" },
      { type: "line", text: "" },
      { type: "line", text: "b" },
    ]);
  });
});

describe("standard PDF fonts", () => {
  it("knows which characters it can draw", () => {
    expect(drawableWithStandardFonts("Hello, café — “quoted” €5\n\t")).toBe(
      true
    );
    expect(drawableWithStandardFonts("你好")).toBe(false);
    expect(drawableWithStandardFonts("emoji 😀")).toBe(false);
    expect(winAnsiByte("é")).toBe(0xe9);
    expect(winAnsiByte("—")).toBe(0x97);
    expect(winAnsiByte("你")).toBeUndefined();
  });

  it("measures Helvetica text", () => {
    // "Hello": H 722, e 556, l 222, l 222, o 556 thousandths of the size.
    expect(standardMetrics.width("Hello", "regular", 10)).toBeCloseTo(22.78, 2);
    expect(standardMetrics.width("iiii", "mono", 10)).toBeCloseTo(24, 5);
  });
});

describe("layout", () => {
  const fake: Metrics = {
    width: (text, _font, size) => text.length * size * 0.5,
  };
  const spec = { width: 200, height: 200, margin: 20 };

  it("wraps to the width and never writes past the margins", () => {
    const { pages } = layoutBlocks(
      parseMarkdown("word ".repeat(150)),
      fake,
      spec
    );
    for (const page of pages) {
      for (const op of page.ops) {
        if (op.kind === "text") {
          expect(
            op.x + fake.width(op.text, op.font, op.size)
          ).toBeLessThanOrEqual(spec.width - spec.margin + 0.001);
          expect(op.y).toBeLessThanOrEqual(spec.height - spec.margin + 1);
        }
      }
    }
    expect(pages.length).toBeGreaterThan(1);
  });

  it("cuts a word that is wider than the line", () => {
    const { pages } = layoutBlocks(parseMarkdown("x".repeat(200)), fake, spec);
    const lines = pages.flatMap((page) =>
      page.ops.filter((op) => op.kind === "text")
    );
    expect(lines.length).toBeGreaterThan(1);
  });

  it("breaks Chinese text between characters", () => {
    const { pages } = layoutBlocks(
      parseMarkdown("你好".repeat(40)),
      fake,
      spec
    );
    const lines = pages.flatMap((page) =>
      page.ops.filter((op) => op.kind === "text")
    );
    expect(lines.length).toBeGreaterThan(1);
  });

  it("puts the list label beside the first line of its item", () => {
    const { pages } = layoutBlocks(parseMarkdown("- one\n2. two"), fake, spec);
    const texts = pages[0].ops.flatMap((op) =>
      op.kind === "text" ? [op.text] : []
    );
    expect(texts).toContain("•");
    expect(texts).toContain("2.");
    const bullet = pages[0].ops.find(
      (op) => op.kind === "text" && op.text === "•"
    );
    const first = pages[0].ops.find(
      (op) => op.kind === "text" && op.text === "one"
    );
    expect(
      bullet &&
        first &&
        bullet.kind === "text" &&
        first.kind === "text" &&
        bullet.y === first.y
    ).toBe(true);
  });

  it("stops at the page limit instead of running on", () => {
    const { pages, truncated } = layoutBlocks(
      parsePlain("line\n".repeat(60000)),
      fake,
      { width: 200, height: 100, margin: 10 }
    );
    expect(truncated).toBe(true);
    expect(pages.length).toBe(500);
  });

  it("always gives at least one page", () => {
    expect(layoutBlocks([], fake, spec).pages).toHaveLength(1);
  });
});

describe("PDF writer", () => {
  it("writes a well-formed file whose table points at its objects", async () => {
    const { bytes, pages } = await buildTextPdf(
      parseMarkdown("# Title\n\nHello café, “world”.\n\n- one\n- two"),
      "a4"
    );
    expect(pages).toBe(1);
    const text = latin1(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const table = text.slice(startxref).split("\n");
    const count = Number(table[1].split(" ")[1]);
    for (let id = 1; id < count; id++) {
      const offset = Number(table[2 + id].slice(0, 10));
      expect(text.slice(offset, offset + `${id} 0 obj`.length)).toBe(
        `${id} 0 obj`
      );
    }
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Count 1");
  });

  it("makes more pages when the text is long", async () => {
    const { pages } = await buildTextPdf(
      parsePlain("a line of text\n".repeat(200)),
      "letter"
    );
    expect(pages).toBeGreaterThan(2);
  });

  it("puts a picture on a page, scaled down to fit and never up", async () => {
    const small = await buildImagePdf(
      [
        {
          kind: "rgb",
          components: 3,
          width: 2,
          height: 2,
          data: new Uint8Array(12),
        },
      ],
      "a4"
    );
    expect(latin1(small)).toContain("q 2 0 0 2 ");
    const big = await buildImagePdf(
      [
        {
          kind: "jpeg",
          components: 3,
          width: 4000,
          height: 2000,
          data: new Uint8Array([1, 2, 3]),
        },
      ],
      "a4"
    );
    const text = latin1(big);
    // A wide picture gets a landscape page, and its JPEG data is untouched.
    expect(text).toContain("/MediaBox [0 0 841.89 595.28]");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 4000 /Height 2000");
  });

  it("gives each picture its own page", async () => {
    const pdf = await buildImagePdf(
      [
        {
          kind: "rgb",
          components: 3,
          width: 1,
          height: 1,
          data: new Uint8Array(3),
        },
        {
          kind: "rgb",
          components: 1 as 1 | 3,
          width: 1,
          height: 1,
          data: new Uint8Array(1),
        },
      ],
      "letter"
    );
    expect(latin1(pdf)).toContain("/Count 2");
  });
});

describe("JPEG header", () => {
  it("reads size, channels and orientation", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8,
      // APP1 with an EXIF orientation of 6
      0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49,
      0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // SOF0: 8 bit, 20 high, 30 wide, 3 components
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x14, 0x00, 0x1e, 0x03, 0, 0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    expect(readJpeg(bytes)).toEqual({
      width: 30,
      height: 20,
      components: 3,
      orientation: 6,
      exif: true,
    });
    expect(readJpeg(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

describe("Word documents", () => {
  const markdown = [
    "# Heading",
    "",
    "A paragraph with **bold**, *italic* and `code`, and a & b < c.",
    "",
    "- bullet one",
    "  - nested",
    "1. first",
    "2. second",
    "",
    "> quoted",
    "",
    "plain",
    "",
    "1. again",
  ].join("\n");

  it("builds a package that is recognised as a Word document", async () => {
    const bytes = await buildDocx(parseMarkdown(markdown), "a4");
    expect(sniffContents(bytes)).toBe("docx");
    expect(looksLikeDocx(bytes)).toBe(true);
    const plainZip = await writeZip([
      { path: "a.txt", data: new Uint8Array([65]), dir: false, modified: 0 },
    ]);
    expect(sniffContents(plainZip)).toBe("zip");
  });

  it("reads back what it wrote", async () => {
    const bytes = await buildDocx(parseMarkdown(markdown), "a4");
    const read = await readDocx(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "item",
      "item",
      "item",
      "item",
      "quote",
      "paragraph",
      "item",
    ]);
    const items = read.blocks.filter((block) => block.type === "item");
    expect(
      items.map((item) => item.type === "item" && [item.ordered, item.depth])
    ).toEqual([
      [false, 0],
      [false, 1],
      [true, 0],
      [true, 0],
      [true, 0],
    ]);
    expect(docxToPlain(read.blocks)).toBe(
      [
        "Heading",
        "A paragraph with bold, italic and code, and a & b < c.",
        "- bullet one\n  - nested\n1. first\n2. second",
        "quoted",
        "plain",
        "1. again",
      ].join("\n\n") + "\n"
    );
  });

  it("writes Markdown with the styling kept and the specials escaped", async () => {
    const read = await readDocx(await buildDocx(parseMarkdown(markdown), "a4"));
    expect(read.ok).toBe(true);
    if (read.ok) {
      const out = docxToMarkdown(read.blocks);
      expect(out).toContain("# Heading");
      expect(out).toContain("**bold**");
      expect(out).toContain("*italic*");
      expect(out).toContain("`code`");
      expect(out).toContain("- bullet one\n  - nested\n1. first\n2. second");
      expect(out).toContain("> quoted");
    }
  });

  it("restarts the numbering of a second numbered list", async () => {
    const zip = await readZip(await buildDocx(parseMarkdown(markdown), "a4"));
    expect(zip.ok).toBe(true);
    if (!zip.ok) {
      return;
    }
    const numbering = new TextDecoder().decode(
      zip.entries.find((entry) => entry.path === "word/numbering.xml")!.data
    );
    // Two numbered lists: two numbering instances on top of the bullet one.
    expect(numbering.match(/<w:num w:numId=/g)).toHaveLength(3);
    expect(numbering.match(/startOverride/g)).toHaveLength(2);
  });

  it("refuses a ZIP that is not a Word document", async () => {
    const zip = await writeZip([
      { path: "a.txt", data: new Uint8Array([65]), dir: false, modified: 0 },
    ]);
    const read = await readDocx(zip);
    expect(read.ok ? "" : read.error.code).toBe("docx_not_word");
  });

  it("reads tables, and writes them to Markdown and plain text", async () => {
    const encoder = new TextEncoder();
    const document = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Before</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B | c</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:t>kept</w:t></w:r></w:p></w:body></w:document>`;
    const zip = await writeZip([
      {
        path: "[Content_Types].xml",
        data: encoder.encode("<Types/>"),
        dir: false,
        modified: 0,
      },
      {
        path: "word/document.xml",
        data: encoder.encode(document),
        dir: false,
        modified: 0,
      },
    ]);
    const read = await readDocx(zip);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(docxToMarkdown(read.blocks)).toBe(
        "Before\n\n| A | B \\| c |\n| --- | --- |\n| 1 | 2 |\n\nkept\n"
      );
      expect(docxToPlain(read.blocks)).toBe(
        "Before\n\nA\tB | c\n1\t2\n\nkept\n"
      );
    }
  });

  it("refuses damaged XML", async () => {
    const encoder = new TextEncoder();
    const zip = await writeZip([
      {
        path: "[Content_Types].xml",
        data: encoder.encode("<Types/>"),
        dir: false,
        modified: 0,
      },
      {
        path: "word/document.xml",
        data: encoder.encode("<w:document><w:body>"),
        dir: false,
        modified: 0,
      },
    ]);
    const read = await readDocx(zip);
    expect(read.ok ? "" : read.error.code).toBe("docx_not_word");
  });

  it("drops characters that XML cannot hold, so Word opens the file", async () => {
    const bytes = await buildDocx(parsePlain("a\u0001b\u000bc"), "a4");
    const read = await readDocx(bytes);
    expect(read.ok && docxToPlain(read.blocks)).toBe("abc\n");
  });
});
