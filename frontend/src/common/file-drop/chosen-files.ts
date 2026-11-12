import type { ConvertPlan } from "./drop-convert";
import type { DropZone, SkippedFile } from "./drop-routing";
import { routeDrop } from "./drop-routing";
import { withMediaType } from "./media-file-type";

export interface ChosenFileItem {
  /** The file, with a media type filled in from its name when it had none. */
  file: File;
  /** Set when the picture must be converted before it is stored. */
  conversion?: ConvertPlan & { action: "convert" };
}

export interface ChosenFilesPlan {
  /** Files that go to the server, in the order they were chosen. */
  items: ChosenFileItem[];
  /** Files that are not sent, each with the reason. */
  skipped: SkippedFile[];
}

/**
 * Decides what happens to files chosen with a system file picker. The picker
 * offers every file, so what is not a picture, video or audio file is turned
 * away here, before anything is sent, with the same rules and reasons as a
 * drop. Pictures the target cannot take as they are are marked for conversion.
 */
export const planChosenFiles = (
  chosen: readonly File[],
  zone: DropZone
): ChosenFilesPlan => {
  const files = chosen.map(withMediaType);
  const decision = routeDrop(
    files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    { claimed: false, isAdmin: true, zone }
  );
  if (decision.action === "upload") {
    return {
      items: decision.accepted.map((index) => ({
        file: files[index],
        conversion: decision.conversions?.[index],
      })),
      skipped: decision.skipped,
    };
  }
  // No file is a picture, video or audio file: none of them is sent.
  return {
    items: [],
    skipped:
      decision.action === "legacy"
        ? files.map((file) => ({ name: file.name, reason: "not_media" }))
        : [],
  };
};
