import type { TextTransform } from "./encodings";

/**
 * Everything the converter can write, in the groups the page shows. Whether a
 * format works on this device is decided at run time (see capabilities.ts),
 * because audio encoders, video playback and compression differ by browser.
 */

export type DataTarget = "json" | "yaml" | "csv" | "tsv" | "markdown";
export type ImageTarget = "png" | "jpeg" | "webp";
export type ArchiveTarget = "zip" | "tar" | "tar-gz" | "gzip" | "extract";
export type AudioTarget = "wav" | "audio-webm" | "audio-mp4";
export type DocumentTarget = "pdf" | "docx" | "doc-text" | "doc-markdown";
export type VideoTarget = "video-png" | "video-jpeg" | "video-info";
export type TargetId =
  | DataTarget
  | ImageTarget
  | TextTransform
  | ArchiveTarget
  | AudioTarget
  | DocumentTarget
  | VideoTarget;

export type CategoryId =
  "images" | "documents" | "data" | "audio" | "video" | "archives" | "text";

export interface Category {
  id: CategoryId;
  targets: TargetId[];
}

export const CATEGORIES: Category[] = [
  { id: "images", targets: ["png", "jpeg", "webp"] },
  { id: "documents", targets: ["pdf", "docx", "doc-text", "doc-markdown"] },
  { id: "data", targets: ["json", "yaml", "csv", "tsv", "markdown"] },
  { id: "audio", targets: ["wav", "audio-webm", "audio-mp4"] },
  { id: "video", targets: ["video-png", "video-jpeg", "video-info"] },
  { id: "archives", targets: ["zip", "tar", "tar-gz", "gzip", "extract"] },
  {
    id: "text",
    targets: [
      "base64",
      "base64-decode",
      "hex",
      "hex-decode",
      "url-encode",
      "url-decode",
      "lf",
      "crlf",
      "cr",
      "upper",
      "lower",
      "title",
      "camel",
      "snake",
      "kebab",
    ],
  },
];

export const DATA_TARGETS: TargetId[] = [
  "json",
  "yaml",
  "csv",
  "tsv",
  "markdown",
];
export const IMAGE_TARGETS: TargetId[] = ["png", "jpeg", "webp"];

/** What the input is, as far as this page is concerned. */
export type InputKind =
  | "image"
  | "text"
  | "binary"
  | "archive"
  | "docx"
  | "audio"
  | "video"
  /** Several files that are not all pictures. */
  | "set"
  | "image-set";

const TEXT_TARGETS = CATEGORIES.find((c) => c.id === "text")!.targets;

/** Writing an archive from one file. */
const PACK: TargetId[] = ["zip", "tar", "tar-gz", "gzip"];

/** Targets that make sense for an input, in the order they are offered. */
export const targetsFor = (kind: InputKind): TargetId[] => {
  switch (kind) {
    case "image":
      return [...IMAGE_TARGETS, "base64", "hex", "pdf", ...PACK];
    case "binary":
      return ["base64", "hex", ...PACK];
    case "archive":
      return ["extract", "zip", "tar", "tar-gz", "gzip", "base64", "hex"];
    case "docx":
      return [
        "doc-text",
        "doc-markdown",
        "extract",
        "zip",
        "tar",
        "tar-gz",
        "gzip",
        "base64",
        "hex",
      ];
    case "audio":
      return ["wav", "audio-webm", "audio-mp4", "base64", "hex", ...PACK];
    case "video":
      return [
        "video-png",
        "video-jpeg",
        "video-info",
        "base64",
        "hex",
        ...PACK,
      ];
    case "set":
      return ["zip", "tar", "tar-gz"];
    case "image-set":
      return ["pdf", "zip", "tar", "tar-gz"];
    default:
      return [...DATA_TARGETS, ...TEXT_TARGETS, "pdf", "docx", ...PACK];
  }
};

export const isDataTarget = (target: TargetId): target is DataTarget =>
  DATA_TARGETS.includes(target);

export const isImageTarget = (target: TargetId): target is ImageTarget =>
  IMAGE_TARGETS.includes(target);

export const categoryOf = (target: TargetId): CategoryId =>
  CATEGORIES.find((category) => category.targets.includes(target))!.id;

/** All formats that can be written, for the search and the counts. */
export const ALL_TARGETS: TargetId[] = CATEGORIES.flatMap(
  (category) => category.targets
);

export const isArchiveTarget = (target: TargetId): target is ArchiveTarget =>
  ["zip", "tar", "tar-gz", "gzip", "extract"].includes(target);

export const isAudioTarget = (target: TargetId): target is AudioTarget =>
  ["wav", "audio-webm", "audio-mp4"].includes(target);

export const isVideoTarget = (target: TargetId): target is VideoTarget =>
  ["video-png", "video-jpeg", "video-info"].includes(target);

export const isDocumentTarget = (target: TargetId): target is DocumentTarget =>
  ["pdf", "docx", "doc-text", "doc-markdown"].includes(target);
