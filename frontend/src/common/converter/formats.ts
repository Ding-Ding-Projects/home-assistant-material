import type { TextTransform } from "./encodings";

/**
 * Everything the converter can write, in the groups the page shows. The
 * groups that need software this build does not carry are listed too, as
 * unavailable, so they are not silently missing.
 */

export type DataTarget = "json" | "yaml" | "csv" | "tsv" | "markdown";
export type ImageTarget = "png" | "jpeg" | "webp";
export type TargetId = DataTarget | ImageTarget | TextTransform;

export type CategoryId =
  "images" | "documents" | "data" | "audio" | "video" | "archives" | "text";

export interface Category {
  id: CategoryId;
  targets: TargetId[];
}

export const CATEGORIES: Category[] = [
  { id: "images", targets: ["png", "jpeg", "webp"] },
  { id: "documents", targets: [] },
  { id: "data", targets: ["json", "yaml", "csv", "tsv", "markdown"] },
  { id: "audio", targets: [] },
  { id: "video", targets: [] },
  { id: "archives", targets: [] },
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
export type InputKind = "image" | "text" | "binary";

const TEXT_TARGETS = CATEGORIES.find((c) => c.id === "text")!.targets;

/** Targets that make sense for an input, in the order they are offered. */
export const targetsFor = (kind: InputKind): TargetId[] => {
  switch (kind) {
    case "image":
      return [...IMAGE_TARGETS, "base64", "hex"];
    case "binary":
      return ["base64", "hex"];
    default:
      return [...DATA_TARGETS, ...TEXT_TARGETS];
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
