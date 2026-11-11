import { audioDecoderAvailable, recorderType } from "./audio";
import type { CategoryId, TargetId } from "./formats";
import { compressionAvailable } from "./streams";

/**
 * What this device can really do. Several formats depend on the browser:
 * whether it can compress, which sounds it can write, whether it can play a
 * video. The page lists a format only when it can be written here, and its
 * category chips say Ready, Limited or Unavailable, with the reason.
 */

export interface Capabilities {
  /** Deflate for ZIP and PDF, and gzip. */
  compression: boolean;
  gzip: boolean;
  audioDecode: boolean;
  webm: boolean;
  mp4: boolean;
  video: boolean;
  canvas: boolean;
  xml: boolean;
}

export const detectCapabilities = (): Capabilities => ({
  compression: compressionAvailable("deflate-raw"),
  gzip: compressionAvailable("gzip"),
  audioDecode: audioDecoderAvailable(),
  webm: recorderType("webm") !== undefined,
  mp4: recorderType("mp4") !== undefined,
  video:
    typeof document !== "undefined" &&
    typeof document.createElement("video").canPlayType === "function",
  canvas:
    typeof document !== "undefined" && typeof createImageBitmap === "function",
  xml: typeof DOMParser !== "undefined",
});

export type StatusState = "ready" | "limited" | "unavailable";

export interface CategoryStatus {
  state: StatusState;
  /** Key of the sentence that says why, when there is one. */
  reason?: string;
}

/** Whether a format can be written on this device. */
export const targetAvailable = (
  target: TargetId,
  caps: Capabilities
): boolean => {
  switch (target) {
    case "wav":
      return caps.audioDecode;
    case "audio-webm":
      return caps.audioDecode && caps.webm;
    case "audio-mp4":
      return caps.audioDecode && caps.mp4;
    case "video-png":
    case "video-jpeg":
    case "video-info":
      return caps.video;
    case "tar-gz":
    case "gzip":
      return caps.compression;
    case "doc-text":
    case "doc-markdown":
      return caps.xml;
    case "png":
    case "jpeg":
    case "webp":
      return caps.canvas;
    default:
      return true;
  }
};

export const categoryStatus = (
  id: CategoryId,
  caps: Capabilities
): CategoryStatus => {
  switch (id) {
    case "audio":
      if (!caps.audioDecode) {
        return { state: "unavailable", reason: "audio_no_decoder" };
      }
      return caps.webm || caps.mp4
        ? { state: "ready", reason: "audio_depends" }
        : { state: "limited", reason: "audio_wav_only" };
    case "video":
      return caps.video
        ? { state: "limited", reason: "video_frames_only" }
        : { state: "unavailable", reason: "video_no_player" };
    case "archives":
      return caps.compression
        ? { state: "ready" }
        : { state: "limited", reason: "archives_no_compression" };
    case "documents":
      return caps.xml
        ? { state: "ready", reason: "documents_partial" }
        : { state: "limited", reason: "documents_no_xml" };
    default:
      return { state: "ready" };
  }
};

/** What each category does not do, as keys of sentences with the reasons. */
export const NOT_OFFERED: Partial<Record<CategoryId, string[]>> = {
  documents: ["pdf_read", "html_to_pdf", "doc_legacy", "odt_rtf"],
  audio: ["audio_encoders_vary", "audio_no_mp3"],
  video: ["video_no_encoder"],
  archives: ["archive_formats"],
};
