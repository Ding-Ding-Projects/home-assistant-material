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
};

/** A name safe to save under, without a folder and without odd characters. */
export const safeFileName = (name: string): string => {
  const cleaned = (name.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 120) || "converted";
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
