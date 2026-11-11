/* eslint-disable no-await-in-loop -- pages are written in order */
import type { FontKey, LaidOutPage, PageSpec } from "./layout";
import { layoutBlocks, PAPER } from "./layout";
import type { Block } from "./markdown-blocks";
import { standardMetrics, winAnsiByte } from "./pdf-fonts";
import { compress, compressionAvailable } from "./streams";

/**
 * A PDF writer for two honest jobs: text set in the standard fonts that
 * every PDF reader carries, and pictures one to a page. It writes PDF 1.4
 * with a plain cross-reference table. It cannot draw a character the
 * standard fonts do not have; the caller sends those through a canvas and
 * hands the pages in as pictures.
 */

export type Paper = keyof typeof PAPER;

export interface PdfImage {
  width: number;
  height: number;
  /** A JPEG goes in unchanged; "rgb" is raw 8-bit RGB, three bytes a pixel. */
  kind: "jpeg" | "rgb";
  components: 1 | 3;
  data: Uint8Array;
  /** The picture is a whole page of already laid out text. */
  fullPage?: boolean;
}

const FONT_NAME: Record<FontKey, string> = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  mono: "Courier",
};
const FONT_REF: Record<FontKey, string> = {
  regular: "F1",
  bold: "F2",
  italic: "F3",
  mono: "F4",
};

const encoder = new TextEncoder();

const num = (value: number): string =>
  (Math.round(value * 100) / 100).toString();

const hexString = (text: string): string => {
  let out = "<";
  for (const character of text) {
    const byte = winAnsiByte(character) ?? 0x3f;
    out += byte.toString(16).padStart(2, "0");
  }
  return `${out}>`;
};

class PdfFile {
  private readonly parts: Uint8Array[] = [];

  private readonly offsets: number[] = [];

  private length = 0;

  public constructor() {
    this._raw("%PDF-1.4\n%âãÏÓ\n");
  }

  private _push(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  private _raw(text: string) {
    // The header comment holds bytes above 127; write them as they are.
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) % 256;
    }
    this._push(bytes);
  }

  /** The number the next object will have. */
  public get next(): number {
    return this.offsets.length + 1;
  }

  public object(dictionary: string, stream?: Uint8Array): number {
    const id = this.next;
    this.offsets.push(this.length);
    if (stream) {
      this._raw(
        `${id} 0 obj\n<< ${dictionary} /Length ${stream.length} >>\nstream\n`
      );
      this._push(stream);
      this._raw("\nendstream\nendobj\n");
    } else {
      this._raw(`${id} 0 obj\n${dictionary}\nendobj\n`);
    }
    return id;
  }

  public finish(root: number): Uint8Array {
    const xref = this.length;
    let table = `xref\n0 ${this.offsets.length + 1}\n0000000000 65535 f \n`;
    for (const offset of this.offsets) {
      table += `${offset.toString().padStart(10, "0")} 00000 n \n`;
    }
    table += `trailer\n<< /Size ${this.offsets.length + 1} /Root ${root} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    this._raw(table);
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

const maybeFlate = async (
  bytes: Uint8Array
): Promise<{ data: Uint8Array; filter: string }> => {
  if (compressionAvailable("deflate")) {
    return {
      data: await compress(bytes, "deflate"),
      filter: " /Filter /FlateDecode",
    };
  }
  return { data: bytes, filter: "" };
};

/** Pages of laid out text, written with the standard fonts. */
export const writeTextPdf = async (
  pages: readonly LaidOutPage[]
): Promise<Uint8Array> => {
  const file = new PdfFile();
  // 1 catalog, 2 page tree, 3..6 fonts; pages and their contents follow.
  const fontIds = (Object.keys(FONT_NAME) as FontKey[]).map((key, index) => ({
    key,
    id: 3 + index,
  }));
  const pageStart = 3 + fontIds.length;
  const kids = pages.map((_page, index) => `${pageStart + index * 2} 0 R`);
  file.object("<< /Type /Catalog /Pages 2 0 R >>");
  file.object(
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`
  );
  for (const { key } of fontIds) {
    file.object(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME[key]} /Encoding /WinAnsiEncoding >>`
    );
  }
  const fonts = fontIds
    .map(({ key, id }) => `/${FONT_REF[key]} ${id} 0 R`)
    .join(" ");
  for (const page of pages) {
    const id = file.next;
    file.object(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fonts} >> >> /Contents ${id + 1} 0 R >>`
    );
    let content = "";
    for (const op of page.ops) {
      if (op.kind === "text") {
        content += `BT /${FONT_REF[op.font]} ${num(op.size)} Tf ${num(op.x)} ${num(page.height - op.y)} Td ${hexString(op.text)} Tj ET\n`;
      } else {
        content += `0.6 w ${num(op.x1)} ${num(page.height - op.y)} m ${num(op.x2)} ${num(page.height - op.y)} l S\n`;
      }
    }
    const { data, filter } = await maybeFlate(encoder.encode(content));
    file.object(filter.trim(), data);
  }
  return file.finish(1);
};

/** Text, as typeset blocks, to a PDF in the standard fonts. */
export const buildTextPdf = async (
  blocks: readonly Block[],
  paper: Paper
): Promise<{ bytes: Uint8Array; pages: number; truncated: boolean }> => {
  const spec: PageSpec = { ...PAPER[paper], margin: 54 };
  const { pages, truncated } = layoutBlocks(blocks, standardMetrics, spec);
  return { bytes: await writeTextPdf(pages), pages: pages.length, truncated };
};

/** One picture to a page. */
export const buildImagePdf = async (
  images: readonly PdfImage[],
  paper: Paper
): Promise<Uint8Array> => {
  const file = new PdfFile();
  const pageStart = 3;
  // Each picture takes three objects: the page, its contents and the image.
  const kids = images.map((_image, index) => `${pageStart + index * 3} 0 R`);
  file.object("<< /Type /Catalog /Pages 2 0 R >>");
  file.object(
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${images.length} >>`
  );
  for (const image of images) {
    const portrait = image.height >= image.width;
    const sheet = PAPER[paper];
    let pageWidth: number = portrait ? sheet.width : sheet.height;
    let pageHeight: number = portrait ? sheet.height : sheet.width;
    let drawWidth: number;
    let drawHeight: number;
    if (image.fullPage) {
      pageWidth = sheet.width;
      pageHeight = sheet.height;
      drawWidth = pageWidth;
      drawHeight = pageHeight;
    } else {
      const margin = 36;
      const scale = Math.min(
        1,
        (pageWidth - margin * 2) / image.width,
        (pageHeight - margin * 2) / image.height
      );
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;
    }
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    const id = file.next;
    file.object(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] /Resources << /XObject << /Im1 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`
    );
    file.object(
      "",
      encoder.encode(
        `q ${num(drawWidth)} 0 0 ${num(drawHeight)} ${num(x)} ${num(y)} cm /Im1 Do Q`
      )
    );
    const space = image.components === 1 ? "/DeviceGray" : "/DeviceRGB";
    let data = image.data;
    let filter = " /Filter /DCTDecode";
    if (image.kind === "rgb") {
      const flated = await maybeFlate(image.data);
      data = flated.data;
      filter = flated.filter;
    }
    file.object(
      `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${space} /BitsPerComponent 8${filter}`,
      data
    );
  }
  return file.finish(1);
};
