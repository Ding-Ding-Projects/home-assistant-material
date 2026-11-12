import { sniffContents } from "../converter/detect";
import type { ImageOptions, ImageResult } from "../converter/image-convert";

/**
 * What a dropped picture needs before it can be stored, and the conversion
 * itself. The planning is a pure function of the file's reported type and
 * size. The conversion runs the product's own local converter (a canvas in
 * this browser): nothing is uploaded for it and the original file on the
 * person's disk is never touched.
 *
 * - Image store: JPEG, PNG and GIF are kept; WebP, BMP and AVIF become PNG; a
 *   JPEG or PNG above the limit is re-encoded smaller. Any other picture type
 *   (SVG, TIFF, HEIC) has no converter here and is skipped with a reason.
 * - Media library: files are kept as they are within the limit. A picture
 *   above it is re-encoded smaller. Audio and video above it have no
 *   converter and are skipped.
 * - An animated GIF is never flattened: it is kept or skipped.
 */

export type PictureKind = "png" | "jpeg" | "gif" | "webp" | "bmp" | "avif";

/** Largest picture file that is read into memory to be converted. */
export const MAX_CONVERT_INPUT_BYTES = 256 * 1024 * 1024;

const KIND_OF_TYPE: Record<string, PictureKind> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/avif": "avif",
};

export const pictureKindOfType = (type: string): PictureKind | undefined =>
  KIND_OF_TYPE[type.toLowerCase()];

export const KIND_LABEL: Record<PictureKind, string> = {
  png: "PNG",
  jpeg: "JPEG",
  gif: "GIF",
  webp: "WebP",
  bmp: "BMP",
  avif: "AVIF",
};

export type ConvertWhy = "type" | "size";

export type ConvertPlan =
  | { action: "keep" }
  | { action: "convert"; from: PictureKind; limit: number; why: ConvertWhy }
  | { action: "skip"; reason: "too_large" | "cannot_convert" | "image_type" };

export interface PlanInput {
  type: string;
  size: number;
}

/** What to do with one file headed for `zone`, given that zone's `limit`. */
export const planPicture = (
  file: PlanInput,
  zone: "media" | "image",
  limit: number
): ConvertPlan => {
  const kind = pictureKindOfType(file.type);
  const isImage = file.type.toLowerCase().startsWith("image/");
  const readable = file.size <= MAX_CONVERT_INPUT_BYTES;

  if (zone === "image") {
    if (!isImage) {
      return { action: "skip", reason: "image_type" };
    }
    if (!kind) {
      return { action: "skip", reason: "cannot_convert" };
    }
    if (kind === "jpeg" || kind === "png" || kind === "gif") {
      if (file.size <= limit) {
        return { action: "keep" };
      }
      if (kind === "gif" || !readable) {
        return { action: "skip", reason: "too_large" };
      }
      return { action: "convert", from: kind, limit, why: "size" };
    }
    if (!readable) {
      return { action: "skip", reason: "too_large" };
    }
    return { action: "convert", from: kind, limit, why: "type" };
  }

  if (file.size <= limit) {
    return { action: "keep" };
  }
  if (kind && kind !== "gif" && readable) {
    return { action: "convert", from: kind, limit, why: "size" };
  }
  return { action: "skip", reason: "too_large" };
};

export interface ConvertStep {
  format: "png" | "jpeg";
  /** 1 to 100, for JPEG. */
  quality: number;
  /** 1 keeps the pixel size. */
  scale: number;
}

const SCALES = [0.75, 0.5, 0.35, 0.25, 0.15];

/**
 * The encodings tried in order until the picture fits. Quality drops first,
 * then the picture is made smaller. A PNG that is only too large stays a PNG
 * and shrinks, so transparency is kept.
 */
export const buildSteps = (
  from: PictureKind,
  why: ConvertWhy
): ConvertStep[] => {
  const jpegSteps: ConvertStep[] = [
    { format: "jpeg", quality: 85, scale: 1 },
    { format: "jpeg", quality: 70, scale: 1 },
    { format: "jpeg", quality: 55, scale: 1 },
    ...SCALES.map((scale) => ({ format: "jpeg" as const, quality: 75, scale })),
  ];
  if (why === "type") {
    return [{ format: "png", quality: 100, scale: 1 }, ...jpegSteps];
  }
  if (from === "png") {
    return SCALES.map((scale) => ({
      format: "png" as const,
      quality: 100,
      scale,
    }));
  }
  return jpegSteps;
};

/** The file name with the extension of the new format. */
export const renamedWithExtension = (
  name: string,
  format: "png" | "jpeg"
): string => {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${format === "png" ? "png" : "jpg"}`;
};

/** What changed, for the result message. */
export interface ConversionChange {
  /** The name the file had when it was dropped. */
  originalName: string;
  from: string;
  to: string;
  resizedFrom?: string;
  resizedTo?: string;
  /** JPEG quality used, when quality was reduced. */
  quality?: number;
  /** Transparent pixels were drawn on white. */
  flattened: boolean;
}

export type PictureConverter = (
  bytes: Uint8Array,
  sourceKind: string,
  options: ImageOptions
) => Promise<ImageResult>;

export type ConvertOutcome =
  | { ok: true; file: File; change: ConversionChange }
  | { ok: false; code: string };

/**
 * Converts one picture with the converter's own adapter, trying the steps in
 * order until the result is at most `plan.limit` bytes.
 */
export const convertPicture = async (
  file: File,
  plan: Extract<ConvertPlan, { action: "convert" }>,
  convert: PictureConverter,
  signal?: AbortSignal
): Promise<ConvertOutcome> => {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (_err) {
    return { ok: false, code: "unreadable" };
  }
  const sniffed = sniffContents(bytes);
  const sourceKind: string = pictureKindOfType(`image/${sniffed}`)
    ? sniffed
    : plan.from;

  for (const step of buildSteps(plan.from, plan.why)) {
    if (signal?.aborted) {
      return { ok: false, code: "aborted" };
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await convert(bytes, sourceKind, {
      format: step.format,
      quality: step.quality,
      resize:
        step.scale === 1
          ? { mode: "keep" }
          : { mode: "scale", factor: step.scale },
    });
    if (!result.ok) {
      return { ok: false, code: result.error.code };
    }
    if (result.blob.size > plan.limit) {
      continue;
    }
    const resized =
      result.width !== result.sourceWidth ||
      result.height !== result.sourceHeight;
    return {
      ok: true,
      file: new File(
        [result.blob],
        renamedWithExtension(file.name, step.format),
        {
          type: result.blob.type,
        }
      ),
      change: {
        originalName: file.name,
        from: KIND_LABEL[plan.from],
        to: step.format === "png" ? "PNG" : "JPEG",
        resizedFrom: resized
          ? `${result.sourceWidth}×${result.sourceHeight}`
          : undefined,
        resizedTo: resized ? `${result.width}×${result.height}` : undefined,
        quality:
          step.format === "jpeg" && step.quality < 100 && plan.why === "size"
            ? step.quality
            : undefined,
        flattened: result.flattened,
      },
    };
  }
  return { ok: false, code: "still_too_large" };
};
