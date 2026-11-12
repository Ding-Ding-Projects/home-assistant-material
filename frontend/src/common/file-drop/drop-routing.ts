/**
 * Decides what happens to files dropped on the app window. Everything here is
 * a pure function of the dropped files and a few facts about the page, so the
 * whole rule can be tested without a browser.
 *
 * The rule, in order:
 *
 * 1. A page or component that already took the event (it called
 *    `preventDefault` on it, or stopped it from reaching the window) owns the
 *    drop. The router does nothing.
 * 2. A drop without any picture, video or audio file keeps the older path: a
 *    dashboard file is imported as a dashboard and any other file goes to the
 *    personal wording import. This is `legacy`.
 * 3. A drop with at least one picture, video or audio file is a media drop.
 *    Only administrators may add media. Anyone else gets one calm message.
 * 4. In a media drop each file is checked against the limits the server
 *    enforces. A file that would be refused is listed as skipped with the
 *    reason and nothing is sent for it. The server stays the authority.
 *
 * A file is never judged by its name alone: the type the browser reports
 * decides whether it is a picture, video or audio file.
 */
import type { ConvertPlan } from "./drop-convert";
import { planPicture } from "./drop-convert";

/** The largest file the media library accepts (2 GiB, as the server). */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** The largest file the image store accepts (50 MiB, as the server). */
export const IMAGE_MAX_BYTES = 50 * 1024 * 1024;

/** The only types the image store accepts. */
export const IMAGE_STORE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
];

export type DropFileKind = "image" | "video" | "audio" | "other";

export type DropZone = "media" | "image";

/** What is known about one file: all that a drop gives before it is read. */
export interface DroppedFileInfo {
  name: string;
  type: string;
  size: number;
}

export type SkipReason =
  | "not_media"
  | "too_large"
  | "image_type"
  | "duplicate"
  | "exists"
  | "cannot_convert"
  | "convert_failed";

export interface SkippedFile {
  name: string;
  reason: SkipReason;
  /** The limit in bytes, for `too_large`. */
  limit?: number;
  /** Why a conversion failed, as a short code, for `convert_failed`. */
  detail?: string;
}

/** The kind of a file from the type the browser reports. */
export const classifyType = (type: string): DropFileKind => {
  const lower = type.toLowerCase();
  if (lower.startsWith("image/")) {
    return "image";
  }
  if (lower.startsWith("video/")) {
    return "video";
  }
  if (lower.startsWith("audio/")) {
    return "audio";
  }
  return "other";
};

/** True when the image store accepts a file of this type. */
export const isImageStoreType = (type: string): boolean =>
  IMAGE_STORE_TYPES.includes(type.toLowerCase());

const planNonPicture = (
  file: DroppedFileInfo,
  zone: DropZone,
  limit: number
): ConvertPlan => {
  if (zone === "image") {
    return { action: "skip", reason: "image_type" };
  }
  return file.size > limit
    ? { action: "skip", reason: "too_large" }
    : { action: "keep" };
};

/** What a drag in progress carries. File names and sizes are not readable yet. */
export interface DragDescription {
  /** `media`: show the media overlay. `legacy`: show the older indicator. */
  mode: "media" | "legacy";
  /** How many dragged files are pictures, video or audio. */
  mediaCount: number;
  /** How many files are dragged in all (0 when the browser does not say). */
  total: number;
  /**
   * True when every dragged file is a picture the image store accepts, so
   * "Images" can be offered as a second place to drop.
   */
  offerImageStore: boolean;
}

/**
 * Describes a drag from the types of its items. While a drag is in progress a
 * browser tells the type of each item but not its name or size.
 */
export const describeDrag = (
  itemTypes: readonly string[],
  isAdmin: boolean
): DragDescription => {
  const kinds = itemTypes.map(classifyType);
  const mediaCount = kinds.filter((kind) => kind !== "other").length;
  const total = itemTypes.length;
  // Only an administrator is offered media. Everyone else sees no change.
  if (!isAdmin || mediaCount === 0) {
    return { mode: "legacy", mediaCount, total, offerImageStore: false };
  }
  return {
    mode: "media",
    mediaCount,
    total,
    offerImageStore: itemTypes.every((type) => classifyType(type) === "image"),
  };
};

export type DropDecision =
  /** Nothing to do: no files, or a page took the drop. */
  | { action: "ignore" }
  /** Dashboard import, then wording import, exactly as before. */
  | { action: "legacy" }
  /** A person who may not add media dropped media. */
  | { action: "admin_only"; count: number }
  /** Upload `accepted` to `target`; `skipped` were not sent. */
  | {
      action: "upload";
      target: DropZone;
      accepted: number[];
      skipped: SkippedFile[];
      /**
       * Files that must be converted before they are stored, by position in
       * `files`. Absent when every accepted file is stored as it is.
       */
      conversions?: Record<number, ConvertPlan & { action: "convert" }>;
    };

export interface DropContext {
  /** A page or component already handled the event. */
  claimed: boolean;
  isAdmin: boolean;
  /** Where the person dropped: the media library or the image store. */
  zone: DropZone;
}

/**
 * Decides one drop. `accepted` holds the positions in `files` that are
 * uploaded, so the caller can map them back to the real `File` objects.
 */
export const routeDrop = (
  files: readonly DroppedFileInfo[],
  context: DropContext
): DropDecision => {
  if (context.claimed || files.length === 0) {
    return { action: "ignore" };
  }
  const hasMedia = files.some((file) => classifyType(file.type) !== "other");
  if (!hasMedia) {
    return { action: "legacy" };
  }
  if (!context.isAdmin) {
    return { action: "admin_only", count: files.length };
  }

  const limit = context.zone === "image" ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES;
  const accepted: number[] = [];
  const skipped: SkippedFile[] = [];
  const names = new Set<string>();

  const conversions: Record<number, ConvertPlan & { action: "convert" }> = {};

  files.forEach((file, index) => {
    const kind = classifyType(file.type);
    if (kind === "other") {
      skipped.push({ name: file.name, reason: "not_media" });
      return;
    }
    const plan =
      kind === "image"
        ? planPicture(file, context.zone, limit)
        : planNonPicture(file, context.zone, limit);
    if (plan.action === "skip") {
      skipped.push({
        name: file.name,
        reason: plan.reason,
        ...(plan.reason === "too_large" ? { limit } : {}),
      });
      return;
    }
    // Two dropped files with one name would overwrite each other in a folder.
    if (context.zone === "media") {
      if (names.has(file.name)) {
        skipped.push({ name: file.name, reason: "duplicate" });
        return;
      }
      names.add(file.name);
    }
    if (plan.action === "convert") {
      conversions[index] = plan;
    }
    accepted.push(index);
  });

  return {
    action: "upload",
    target: context.zone,
    accepted,
    skipped,
    ...(Object.keys(conversions).length > 0 ? { conversions } : {}),
  };
};
