import { DECEIVING_CHARACTERS } from "./archive-types";
import type { TargetId } from "./formats";

const CHANGES_NOTHING_IN_NAME: TargetId[] = [
  "lf",
  "crlf",
  "cr",
  "upper",
  "lower",
  "title",
  "camel",
  "snake",
  "kebab",
];

const EXTENSION: Partial<Record<TargetId, string>> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  json: "json",
  yaml: "yaml",
  csv: "csv",
  tsv: "tsv",
  markdown: "md",
  base64: "base64.txt",
  hex: "hex.txt",
  "url-encode": "url.txt",
  "url-decode": "txt",
  zip: "zip",
  tar: "tar",
  "tar-gz": "tar.gz",
  pdf: "pdf",
  docx: "docx",
  "doc-text": "txt",
  "doc-markdown": "md",
  wav: "wav",
  "audio-webm": "webm",
  "audio-mp4": "m4a",
  "video-png": "png",
  "video-jpeg": "jpg",
  "video-info": "txt",
};

const MAX_NAME = 120;

const DEVICE_NAME =
  /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** Cuts a name to the length, keeping the extension and whole characters. */
const shorten = (name: string): string => {
  if (name.length <= MAX_NAME) {
    return name;
  }
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
  let kept = "";
  // Walking by code point never splits a surrogate pair.
  for (const character of name.slice(0, name.length - extension.length)) {
    if (kept.length + character.length + extension.length > MAX_NAME) {
      break;
    }
    kept += character;
  }
  return kept + extension;
};

/** A name safe to save under, without a folder and without odd characters. */
export const safeFileName = (name: string): string => {
  const deceiving = new RegExp(DECEIVING_CHARACTERS.source, "g");
  let cleaned = (name.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(deceiving, "")
    .replace(/^[.\s]+/, "");
  // Windows drops a trailing dot or space, so the saved name would differ
  // from the one shown.
  cleaned = cleaned.replace(/[.\s]+$/, "");
  // A device name such as con or nul.txt cannot be saved on Windows.
  if (DEVICE_NAME.test(cleaned.split(".")[0].trim())) {
    cleaned = `_${cleaned}`;
  }
  return shorten(cleaned) || "converted";
};

/**
 * Name of the converted file: the input's name without its extension, then
 * the extension of the new format. Transforms that change only the text keep
 * the extension, and a decoded file that is not text gets `.bin`.
 */
export const outputFileName = (
  inputName: string,
  target: TargetId,
  outputIsText = true
): string => {
  const base = safeFileName(inputName || "converted");
  if (target === "gzip") {
    // A gzip keeps the whole name, so the original can be told afterwards.
    return `${base}.gz`;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const original = dot > 0 ? base.slice(dot + 1) : "";
  if (CHANGES_NOTHING_IN_NAME.includes(target)) {
    return original ? `${stem}.${original}` : `${stem}.txt`;
  }
  if (target === "base64-decode" || target === "hex-decode") {
    // The encoded file was probably named like `photo.png.base64.txt`.
    const inner = stem.replace(/\.(base64|hex|b64)$/i, "");
    if (/\.[A-Za-z0-9]{1,5}$/.test(inner)) {
      return inner;
    }
    return `${inner}.${outputIsText ? "txt" : "bin"}`;
  }
  return `${stem}.${EXTENSION[target] ?? "txt"}`;
};
