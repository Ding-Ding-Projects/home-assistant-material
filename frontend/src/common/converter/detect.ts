/* eslint-disable no-bitwise -- reads binary headers */
import { looksLikeTar } from "./tar";
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
  | "docx"
  | "tar"
  | "gzip"
  | "audio"
  | "video"
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

/** Whether the ASCII text is among the bytes from the given place on. */
const includesAscii = (bytes: Uint8Array, needle: string, from: number) => {
  const first = needle.charCodeAt(0);
  for (let at = Math.max(0, from); at + needle.length <= bytes.length; at++) {
    if (bytes[at] === first) {
      let same = true;
      for (let i = 1; i < needle.length; i++) {
        if (bytes[at + i] !== needle.charCodeAt(i)) {
          same = false;
          break;
        }
      }
      if (same) {
        return true;
      }
    }
  }
  return false;
};

const looksLikeMp3 = (bytes: Uint8Array) =>
  bytes.length > 4 &&
  bytes[0] === 0xff &&
  (bytes[1] & 0xe0) === 0xe0 &&
  ((bytes[1] >> 1) & 3) !== 0 &&
  ((bytes[1] >> 3) & 3) !== 1 &&
  bytes[2] >> 4 !== 15;

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
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") {
    return "audio";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "AVI ") {
    return "video";
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
    // Any other brand is an MP4 family file: audio only for the audio brands.
    return brand === "M4A " || brand === "M4B " ? "audio" : "video";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "video";
  }
  if (
    ascii(bytes, 0, 4) === "OggS" ||
    ascii(bytes, 0, 4) === "fLaC" ||
    // ID3 tags carry a version of 2 to 4 and a zero revision; a text that
    // merely starts with "ID3" does not.
    (ascii(bytes, 0, 3) === "ID3" &&
      bytes[3] >= 2 &&
      bytes[3] <= 4 &&
      bytes[4] === 0) ||
    looksLikeMp3(bytes)
  ) {
    return "audio";
  }
  if (startsWith(bytes, [0x1f, 0x8b, 0x08])) {
    return "gzip";
  }
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return "pdf";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A Word document is a ZIP with a main document part.
    return includesAscii(bytes, "word/document.xml", bytes.length - 262144)
      ? "docx"
      : "zip";
  }
  if (looksLikeTar(bytes)) {
    return "tar";
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
