/* eslint-disable no-bitwise -- builds binary headers by hand */
import { describe, expect, it } from "vitest";
import { safeArchivePath } from "../../../src/common/converter/archive-types";
import { openArchive } from "../../../src/common/converter/archive";
import type { DocBlock } from "../../../src/common/converter/docx";
import {
  MAX_DOCUMENT_BYTES,
  docxToMarkdown,
  readDocx,
} from "../../../src/common/converter/docx";
import { readJpeg } from "../../../src/common/converter/jpeg-info";
import {
  parseInline,
  parseMarkdown,
} from "../../../src/common/converter/markdown-blocks";
import { safeFileName } from "../../../src/common/converter/output-name";
import { standardMetrics } from "../../../src/common/converter/pdf-fonts";
import { readTar } from "../../../src/common/converter/tar";
import { readZip, writeZip } from "../../../src/common/converter/zip";

const enc = (text: string) => new TextEncoder().encode(text);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

// ---- tar -------------------------------------------------------------

const BLOCK = 512;

const tarHeader = (name: string, size: number, type: string): Uint8Array => {
  const header = new Uint8Array(BLOCK);
  header.set(enc(name).subarray(0, 100), 0);
  header.set(enc("0000644\0"), 100);
  header.set(enc(`${size.toString(8).padStart(11, "0")}\0`), 124);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  header.set(enc("ustar\0"), 257);
  header.set(enc("00"), 263);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) {
    sum += header[i];
  }
  header.set(enc(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
  return header;
};

const padBlock = (data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(Math.ceil(data.length / BLOCK) * BLOCK);
  out.set(data);
  return out;
};

const paxRecord = (key: string, value: string): Uint8Array => {
  const body = `${key}=${value}\n`;
  let length = body.length + 2;
  while (String(length).length + 1 + body.length !== length) {
    length = String(length).length + 1 + body.length;
  }
  return enc(`${length} ${body}`);
};

describe("tar with hostile headers", () => {
  it("refuses a negative pax size instead of reading the same header for ever", () => {
    const record = paxRecord("size", "-512");
    const tar = concat(
      tarHeader("PaxHeader", record.length, "x"),
      padBlock(record),
      tarHeader("junk", 0, "K"),
      new Uint8Array(1024)
    );
    const started = Date.now();
    const result = readTar(tar);
    // Generous: the old code never returned, and a loaded test run is slow.
    expect(Date.now() - started).toBeLessThan(15000);
    expect(result.ok).toBe(false);
  });

  it("refuses a fractional or non-numeric pax size", () => {
    for (const size of ["1.5", "abc", "1e3", ""]) {
      const record = paxRecord("size", size);
      const tar = concat(
        tarHeader("PaxHeader", record.length, "x"),
        padBlock(record),
        tarHeader("a.txt", 0, "0"),
        new Uint8Array(1024)
      );
      expect(readTar(tar).ok).toBe(false);
    }
  });

  it("does not carry a pax record over a long-name header", () => {
    const record = paxRecord("path", "from-pax.txt");
    const longName = enc("long-name.txt\0");
    const data = enc("hi");
    const tar = concat(
      tarHeader("PaxHeader", record.length, "x"),
      padBlock(record),
      tarHeader("././@LongLink", longName.length, "L"),
      padBlock(longName),
      tarHeader("short", data.length, "0"),
      padBlock(data),
      new Uint8Array(1024)
    );
    const result = readTar(tar);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The pax record belonged to the long-name header, not to the file.
      expect(result.entries.map((entry) => entry.path)).toEqual([
        "long-name.txt",
      ]);
    }
  });
});

// ---- zip -------------------------------------------------------------

describe("zip end record", () => {
  it("ignores an end record forged inside the archive comment", async () => {
    const real = await writeZip([
      { path: "a.txt", data: enc("aaa"), dir: false, modified: 0 },
    ]);
    const forged = new Uint8Array(22);
    new DataView(forged.buffer).setUint32(0, 0x06054b50, true);
    const withComment = new Uint8Array(real.length + forged.length);
    withComment.set(real);
    withComment.set(forged, real.length);
    // Point the real end record's comment length at the forged bytes.
    new DataView(withComment.buffer).setUint16(real.length - 2, 22, true);
    const result = await readZip(withComment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries.map((entry) => entry.path)).toEqual(["a.txt"]);
    }
  });
});

// ---- jpeg ------------------------------------------------------------

const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...be16(payload.length + 2),
  ...payload,
];
const exifPayload = (orientation: number) => [
  0x45,
  0x78,
  0x69,
  0x66,
  0,
  0,
  0x49,
  0x49,
  0x2a,
  0,
  8,
  0,
  0,
  0,
  1,
  0,
  0x12,
  0x01,
  3,
  0,
  1,
  0,
  0,
  0,
  orientation,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
];
const xmpPayload = [...enc("http://ns.adobe.com/xap/1.0/\0<x/>")];
const frame = (precision = 8, height = 4000) =>
  segment(0xc0, [
    precision,
    ...be16(height),
    ...be16(3000),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
const jpeg = (...segments: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2]);

describe("jpeg header", () => {
  it("keeps the Exif orientation when an XMP segment follows", () => {
    const info = readJpeg(
      jpeg(segment(0xe1, exifPayload(6)), segment(0xe1, xmpPayload), frame())
    );
    expect(info?.orientation).toBe(6);
  });

  it("keeps the first Exif orientation when a second Exif segment follows", () => {
    const info = readJpeg(
      jpeg(
        segment(0xe1, exifPayload(6)),
        segment(0xe1, exifPayload(3)),
        frame()
      )
    );
    expect(info?.orientation).toBe(6);
  });

  it("refuses a frame with a precision other than 8 bits or a height of 0", () => {
    expect(readJpeg(jpeg(frame(12)))).toBeUndefined();
    expect(readJpeg(jpeg(frame(8, 0)))).toBeUndefined();
    expect(readJpeg(jpeg(frame(8, 10)))).toBeDefined();
  });
});

// ---- markdown --------------------------------------------------------

describe("markdown with hostile length", () => {
  it(
    "parses a very long run of open brackets in bounded time",
    { timeout: 30000 },
    () => {
      const started = Date.now();
      parseInline("[".repeat(300000));
      parseInline("[a".repeat(100000));
      parseInline("![](".repeat(100000));
      parseInline("**a".repeat(100000));
      parseInline("*_".repeat(150000));
      parseInline("`a".repeat(150000));
      parseInline("[a](b ".repeat(60000));
      // Generous: the old code never returned, and a loaded test run is slow.
      expect(Date.now() - started).toBeLessThan(15000);
    }
  );

  it(
    "parses a heading with a very long run of spaces in bounded time",
    { timeout: 30000 },
    () => {
      const started = Date.now();
      const blocks = parseMarkdown(`# a${" ".repeat(300000)}b`);
      // Generous: the old code never returned, and a loaded test run is slow.
      expect(Date.now() - started).toBeLessThan(15000);
      expect(blocks[0].type).toBe("heading");
    }
  );

  it("still reads a heading with closing marks", () => {
    const blocks = parseMarkdown("## Title ##");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
  });
});

// ---- docx ------------------------------------------------------------

const item = (depth: number): DocBlock => ({
  type: "item",
  ordered: false,
  number: 0,
  depth,
  inlines: [{ text: "x" }],
});

const docxWith = async (documentXml: string) =>
  writeZip([
    {
      path: "[Content_Types].xml",
      data: enc("<Types/>"),
      dir: false,
      modified: 0,
    },
    {
      path: "word/document.xml",
      data: enc(documentXml),
      dir: false,
      modified: 0,
    },
  ]);

describe("docx reading and writing", () => {
  it("refuses a document that declares a doctype or an entity", async () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY a "aaaa">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&a;</w:t></w:r></w:p></w:body></w:document>`;
    const read = await readDocx(await docxWith(xml));
    expect(read.ok).toBe(false);
  });

  it("caps the document part at about 8 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it("clamps a list level that is negative, fractional or not a number", async () => {
    const level = (value: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="${value}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>x</w:t></w:r></w:p>`;
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${["-1", "0.5", "abc", "99"].map(level).join("")}</w:body></w:document>`;
    const read = await readDocx(await docxWith(xml));
    expect(read.ok).toBe(true);
    if (read.ok) {
      for (const block of read.blocks) {
        if (block.type === "item") {
          expect(Number.isInteger(block.depth)).toBe(true);
          expect(block.depth).toBeGreaterThanOrEqual(0);
          expect(block.depth).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it("does not throw for odd list depths when writing Markdown", () => {
    for (const depth of [Number.NaN, -1, 0.5, 2, 99]) {
      expect(() => docxToMarkdown([item(depth)])).not.toThrow();
    }
  });

  it("escapes text so it cannot become live Markdown", () => {
    const out = docxToMarkdown([
      { type: "paragraph", inlines: [{ text: "# not a heading" }] },
      { type: "paragraph", inlines: [{ text: "- fake item" }] },
      { type: "paragraph", inlines: [{ text: "> fake quote" }] },
      { type: "paragraph", inlines: [{ text: "1. fake number" }] },
      {
        type: "paragraph",
        inlines: [{ text: "<script>x</script> [y](javascript:z)" }],
      },
    ]);
    const lines = out.split("\n").filter(Boolean);
    expect(lines[0].startsWith("\\#")).toBe(true);
    expect(lines[1].startsWith("\\-")).toBe(true);
    expect(lines[2].startsWith("\\>")).toBe(true);
    expect(lines[3]).toMatch(/^1\\\./);
    expect(lines[4]).not.toMatch(/(^|[^\\])</);
    expect(lines[4]).not.toMatch(/(^|[^\\])\[/);
  });
});

// ---- names -----------------------------------------------------------

describe("file names", () => {
  const OVERRIDE = "\u202e";

  it("refuses an archive path with direction overrides, zero-width or C1 characters", () => {
    for (const bad of [
      `evil${OVERRIDE}gpj.exe`,
      "a\u200bb.txt",
      "a\u2066b.txt",
      "a\ufeffb",
      "a\u0085b",
      "a\u009fb",
    ]) {
      expect(safeArchivePath(bad)).toBeUndefined();
    }
    expect(safeArchivePath("a/b.txt")).toBe("a/b.txt");
  });

  it("strips those characters from a download name", () => {
    expect(safeFileName(`evil${OVERRIDE}gpj.exe`)).toBe("evilgpj.exe");
    expect(safeFileName("a\u200bb\u0085c.txt")).toBe("abc.txt");
  });

  it("strips trailing dots and spaces", () => {
    expect(safeFileName("report. . ")).toBe("report");
  });

  it("does not leave a Windows device name", () => {
    for (const name of ["con", "NUL.txt", "aux", "com1.log", "LPT9"]) {
      const out = safeFileName(name);
      expect(out).not.toMatch(/^(con|nul|aux|prn|com[1-9]|lpt[1-9])(\.|$)/i);
    }
    expect(safeFileName("console.txt")).toBe("console.txt");
  });

  it("keeps the extension when it cuts a long name and never splits a surrogate pair", () => {
    const long = `${"😀".repeat(100)}.pdf`;
    const out = safeFileName(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
    // A lone surrogate would not survive an encode round trip.
    expect(new TextDecoder().decode(enc(out))).toBe(out);
    expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
});

// ---- pdf fonts -------------------------------------------------------

describe("pdf font widths", () => {
  it("has real widths for the em dash, ellipsis, trademark and bullet", () => {
    // Helvetica: em dash 1000, ellipsis 1000, trademark 1000, bullet 350.
    const width = (char: string) =>
      standardMetrics.width(char, "regular", 1000);
    expect(width("—")).toBe(1000);
    expect(width("…")).toBe(1000);
    expect(width("™")).toBe(1000);
    expect(width("•")).toBe(350);
    expect(width("‘")).toBe(222);
  });
});

describe("archive opening keeps names safe", () => {
  it("skips an entry whose name hides behind a direction override", async () => {
    const zip = await writeZip([
      { path: "ok.txt", data: enc("1"), dir: false, modified: 0 },
      {
        path: "evil\u202egpj.exe",
        data: enc("2"),
        dir: false,
        modified: 0,
      },
    ]);
    const result = await openArchive(zip, "x.zip");
    if (result.ok) {
      expect(result.entries.map((entry) => entry.path)).toEqual(["ok.txt"]);
    }
  });
});
