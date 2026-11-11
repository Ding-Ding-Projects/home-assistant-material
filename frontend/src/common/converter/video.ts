import { canvasBlob } from "./image-convert";
import { MAX_SIDE } from "./image-size";
import type { ConvertError } from "./types";
import { failure } from "./types";

/**
 * What can be done with a video without an encoder: read its length and
 * size, and save one picture from it. The browser plays the video, so only
 * what this browser can play is accepted. Nothing is sent anywhere.
 */

const TIMEOUT_MS = 15000;

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

interface Loaded {
  video: HTMLVideoElement;
  dispose: () => void;
}

const waitFor = (video: HTMLVideoElement, event: string): Promise<boolean> =>
  new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
      resolve(ok);
    };
    const onEvent = () => done(true);
    const onError = () => done(false);
    const timer = window.setTimeout(() => done(false), TIMEOUT_MS);
    video.addEventListener(event, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

const load = async (
  bytes: Uint8Array,
  mime: string
): Promise<
  { ok: true; loaded: Loaded } | { ok: false; error: ConvertError }
> => {
  if (typeof document === "undefined") {
    return failure("video_unsupported_here");
  }
  const video = document.createElement("video");
  if (!video.canPlayType(mime)) {
    return failure("video_unsupported_here", { detail: mime });
  }
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: mime })
  );
  const dispose = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  };
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  const ready = waitFor(video, "loadeddata");
  video.src = url;
  if (!(await ready) || !video.videoWidth || !Number.isFinite(video.duration)) {
    dispose();
    return failure("video_unsupported_here", { detail: mime });
  }
  return { ok: true, loaded: { video, dispose } };
};

export const readVideoInfo = async (
  bytes: Uint8Array,
  mime: string
): Promise<
  { ok: true; info: VideoInfo } | { ok: false; error: ConvertError }
> => {
  const result = await load(bytes, mime);
  if (!result.ok) {
    return result;
  }
  const { video, dispose } = result.loaded;
  const info = {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
  };
  dispose();
  return { ok: true, info };
};

/** One picture, taken `fraction` (0 to 1) of the way through the video. */
export const extractVideoFrame = async (
  bytes: Uint8Array,
  mime: string,
  fraction: number,
  format: "png" | "jpeg",
  quality: number
): Promise<
  | { ok: true; blob: Blob; width: number; height: number; at: number }
  | { ok: false; error: ConvertError }
> => {
  const result = await load(bytes, mime);
  if (!result.ok) {
    return result;
  }
  const { video, dispose } = result.loaded;
  try {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width > MAX_SIDE || height > MAX_SIDE) {
      return failure("image_too_large", { detail: `${width} x ${height}` });
    }
    const at = Math.max(
      0,
      Math.min(
        video.duration * Math.min(1, Math.max(0, fraction)),
        video.duration - 0.05
      )
    );
    if (at > 0) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = at;
      if (!(await seeked)) {
        return failure("video_seek_failed");
      }
    }
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    const context = canvas.getContext("2d");
    if (!context) {
      return failure("image_canvas_failed");
    }
    context.drawImage(video, 0, 0, width, height);
    const type = format === "png" ? "image/png" : "image/jpeg";
    const blob = await canvasBlob(
      canvas,
      type,
      format === "png" ? undefined : quality / 100
    );
    if (!blob || blob.type !== type) {
      return failure("image_encode_unsupported");
    }
    return { ok: true, blob, width, height, at };
  } catch (_err) {
    // A video from another source would taint the canvas; this one is local.
    return failure("image_canvas_failed");
  } finally {
    dispose();
  }
};

/** The MIME type to hand the browser for the video, judged from its bytes. */
export const videoMime = (bytes: Uint8Array): string => {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(4, 8) === "ftyp") {
    return ascii(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf) {
    const head = ascii(0, Math.min(64, bytes.length));
    return head.includes("webm") ? "video/webm" : "video/x-matroska";
  }
  if (ascii(0, 4) === "RIFF") {
    return "video/x-msvideo";
  }
  return "video/mp4";
};
