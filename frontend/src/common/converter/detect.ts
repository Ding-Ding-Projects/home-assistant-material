import { firstInvalidUtf8 } from "./utf8";

/** What a file is, judged from its first bytes and never from its name. */
export type SniffedKind =
  | "png"
  | "jpeg"
  | "webp"
  | "gif"
  | "bmp"
  | "avif"
  | "heic"
  | "svg"
  | "pdf"
  | "zip"
  | "text"
  | "binary";

export const IMAGE_KINDS = ["png", "jpeg", "webp", "gif", "bmp", "avif"];

export const MIME_OF_KIND: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) =>
  signature.every((value, index) => bytes[at + index] === value);

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

export const sniffContents = (bytes: Uint8Array): SniffedKind => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "webp";
  }
  if (ascii(bytes, 0, 4) === "GIF8") {
    return "gif";
  }
  if (ascii(bytes, 0, 2) === "BM" && bytes.length > 26) {
    return "bmp";
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") {
      return "avif";
    }
    if (
      ["heic", "heix", "heim", "heis", "hevc", "mif1", "msf1"].includes(brand)
    ) {
      return "heic";
    }
  }
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return "pdf";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "zip";
  }
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) {
    return "binary";
  }
  if (firstInvalidUtf8(head.subarray(0, head.length - 3)) !== -1) {
    return "binary";
  }
  const text = new TextDecoder("utf-8").decode(bytes.subarray(0, 4096));
  if (/<svg[\s>]/i.test(text)) {
    return "svg";
  }
  return "text";
};

export type DataFormat = "json" | "yaml" | "csv" | "tsv" | "markdown";

const EXTENSIONS: Record<string, DataFormat> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  csv: "csv",
  tsv: "tsv",
  tab: "tsv",
  md: "markdown",
  markdown: "markdown",
};

/** The structured format a text most likely is, or undefined. */
export const detectDataFormat = (
  name: string,
  text: string
): DataFormat | undefined => {
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  if (extension && EXTENSIONS[extension]) {
    return EXTENSIONS[extension];
  }
  const trimmed = text.trimStart();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    return "json";
  }
  const lines = trimmed.split(/\r?\n/).slice(0, 5);
  if (
    lines.length >= 2 &&
    lines[0].includes("|") &&
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[1])
  ) {
    return "markdown";
  }
  if (lines[0].includes("\t")) {
    return "tsv";
  }
  if (/^\s*[\w"'-][^:]*:(\s|$)/.test(lines[0]) || /^\s*-\s/.test(lines[0])) {
    return "yaml";
  }
  if (lines[0].includes(",") && lines.length >= 2) {
    return "csv";
  }
  return undefined;
};
