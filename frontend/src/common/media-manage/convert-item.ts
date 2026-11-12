import type { Capabilities } from "../converter/capabilities";
import { targetAvailable } from "../converter/capabilities";
import type { SniffedKind } from "../converter/detect";
import { IMAGE_KINDS, sniffContents } from "../converter/detect";
import type { InputKind, TargetId } from "../converter/formats";
import { isImageTarget, targetsFor } from "../converter/formats";
import type { ImageFormat } from "../converter/image-convert";
import { convertImage } from "../converter/image-convert";
import { outputFileName } from "../converter/output-name";
import { DEFAULT_EXTRA_OPTIONS, runExtra } from "../converter/run";
import type { ConvertError, ConvertNote } from "../converter/types";
import { MAX_BYTES } from "../converter/types";

/**
 * Converting one item of the Manage dialog with the product's own local
 * converter (the one the File converter tool uses). Everything runs in the
 * browser. Only conversions with one file as the result are offered, and for
 * the image store only the picture types it can keep.
 */

export type ConvertStore = "media" | "image";

/** The formats the media library and the image store can keep. */
const STORABLE: Record<ConvertStore, TargetId[]> = {
  media: [
    "png",
    "jpeg",
    "webp",
    "wav",
    "audio-webm",
    "audio-mp4",
    "video-png",
    "video-jpeg",
  ],
  image: ["png", "jpeg"],
};

export interface ConvertSource {
  kind: InputKind;
  sniffed: SniffedKind;
}

/** What an item is to the converter, from its contents; nothing when it has no converter. */
export const sourceOf = (bytes: Uint8Array): ConvertSource | undefined => {
  const sniffed = sniffContents(bytes);
  if (IMAGE_KINDS.includes(sniffed)) {
    return { kind: "image", sniffed };
  }
  if (sniffed === "audio" || sniffed === "video") {
    return { kind: sniffed, sniffed };
  }
  return undefined;
};

/** The formats this item can become here, in the order the converter lists them. */
export const convertTargets = (
  source: ConvertSource,
  store: ConvertStore,
  caps: Capabilities
): TargetId[] =>
  targetsFor(source.kind).filter(
    (target) =>
      STORABLE[store].includes(target) &&
      targetAvailable(target, caps) &&
      // A picture is not converted to the type it already is
      target !== source.sniffed
  );

export type ItemConversion =
  | {
      ok: true;
      file: File;
      notes: ConvertNote[];
    }
  | { ok: false; error: ConvertError };

/** Converts the bytes of one item to a format and names the result after it. */
export const convertItem = async (
  name: string,
  bytes: Uint8Array,
  source: ConvertSource,
  target: TargetId,
  signal?: AbortSignal
): Promise<ItemConversion> => {
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: { code: "too_large", detail: name } };
  }
  const outName = outputFileName(name, target, false);
  if (isImageTarget(target)) {
    const result = await convertImage(bytes, source.sniffed, {
      format: target as ImageFormat,
      quality: DEFAULT_EXTRA_OPTIONS.quality,
      resize: { mode: "keep" },
    });
    if (!result.ok) {
      return result;
    }
    const notes: ConvertNote[] = [];
    if (result.flattened) {
      notes.push({ code: "flattened" });
    }
    notes.push({ code: "metadata_removed" });
    return {
      ok: true,
      file: new File([result.blob], outName, { type: result.blob.type }),
      notes,
    };
  }
  const result = await runExtra(
    target,
    { kind: source.kind, name, bytes, sniffed: source.sniffed },
    DEFAULT_EXTRA_OPTIONS,
    signal
  );
  if (!result.ok) {
    return result;
  }
  if (result.kind !== "bytes") {
    return { ok: false, error: { code: "write_failed" } };
  }
  return {
    ok: true,
    file: new File([result.bytes as BlobPart], outName, { type: result.mime }),
    notes: result.notes,
  };
};
