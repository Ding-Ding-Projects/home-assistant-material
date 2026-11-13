import { MIME_OF_KIND } from "./detect";
import type { ResizeSpec } from "./image-size";
import { fitSize, MAX_PIXELS, MAX_SIDE, readImageSize } from "./image-size";
import type { ConvertError } from "./types";

/**
 * Pictures between PNG, JPEG and WebP, drawn on a canvas in this browser.
 * Drawing keeps only the pixels, so location, camera details and the colour
 * profile are not in the copy. Nothing is uploaded.
 */

export type ImageFormat = "png" | "jpeg" | "webp";

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export interface ImageOptions {
  format: ImageFormat;
  /** 1 to 100; used by JPEG and WebP. */
  quality: number;
  resize: ResizeSpec;
}

export type ImageResult =
  | {
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      sourceWidth: number;
      sourceHeight: number;
      /** Transparent pixels were drawn on white. */
      flattened: boolean;
    }
  | { ok: false; error: ConvertError };

/** Bounds browser callbacks that can otherwise stay pending indefinitely. */
export const IMAGE_OPERATION_TIMEOUT_MS = 15_000;
const waitForImage = <T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  disposeLate?: (value: T) => void
): Promise<T> =>
  new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: unknown, value?: T) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      finish(new DOMException("Image operation cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(new DOMException("Image operation timed out", "TimeoutError")),
      IMAGE_OPERATION_TIMEOUT_MS
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    promise.then(
      (value) => {
        if (finished) disposeLate?.(value);
        else finish(undefined, value);
      },
      (error) => finish(error)
    );
  });

export const canvasBlob = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number | undefined,
  signal?: AbortSignal
): Promise<Blob | null> => {
  if (signal?.aborted) {
    throw new DOMException("Image operation cancelled", "AbortError");
  }
  const result =
    "convertToBlob" in canvas
      ? canvas.convertToBlob({ type, quality })
      : new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, type, quality);
        });
  return waitForImage(result, signal);
};

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}
const decodeImage = async (
  blob: Blob,
  signal?: AbortSignal
): Promise<DecodedImage> => {
  if (signal?.aborted) {
    throw new DOMException("Image operation cancelled", "AbortError");
  }
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await waitForImage(
        createImageBitmap(blob, { imageOrientation: "from-image" }),
        signal,
        (late) => late.close()
      );
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      if (signal?.aborted || (error as Error).name === "AbortError") {
        throw error;
      }
      // Some WebKit versions expose the bitmap API but cannot decode this image.
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await waitForImage(
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decode failed"));
        image.src = url;
      }),
      signal
    );
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {
        image.onload = null;
        image.onerror = null;
        image.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
};

export const convertImage = async (
  bytes: Uint8Array,
  sourceKind: string,
  options: ImageOptions,
  signal?: AbortSignal
): Promise<ImageResult> => {
  if (signal?.aborted) return { ok: false, error: { code: "aborted" } };
  const header = readImageSize(bytes, sourceKind);
  if (!header && sourceKind === "avif") {
    return { ok: false, error: { code: "image_size_unknown" } };
  }
  if (header && header.width * header.height > MAX_PIXELS) {
    return {
      ok: false,
      error: {
        code: "image_too_large",
        detail: `${header.width} x ${header.height}`,
      },
    };
  }
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(
      new Blob([bytes as BlobPart], {
        type: MIME_OF_KIND[sourceKind] ?? "application/octet-stream",
      }),
      signal
    );
  } catch (error) {
    return {
      ok: false,
      error: {
        code:
          signal?.aborted || (error as Error).name === "AbortError"
            ? "aborted"
            : (error as Error).name === "TimeoutError"
              ? "image_timeout"
              : "image_decode_failed",
      },
    };
  }
  try {
    const sourceWidth = decoded.width;
    const sourceHeight = decoded.height;
    if (
      !sourceWidth ||
      !sourceHeight ||
      sourceWidth * sourceHeight > MAX_PIXELS
    ) {
      return {
        ok: false,
        error: {
          code: "image_too_large",
          detail: `${sourceWidth} x ${sourceHeight}`,
        },
      };
    }
    const { width, height } = fitSize(
      sourceWidth,
      sourceHeight,
      options.resize
    );
    if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
      return { ok: false, error: { code: "image_too_large" } };
    }
    const mime = IMAGE_MIME[options.format];
    const encode = async (offscreen: boolean): Promise<Blob | null> => {
      if (signal?.aborted) {
        throw new DOMException("Image operation cancelled", "AbortError");
      }
      const canvas: HTMLCanvasElement | OffscreenCanvas = offscreen
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
      try {
        const context = canvas.getContext("2d") as
          CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
        if (!context) throw new Error("Canvas context unavailable");
        if (options.format === "jpeg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
        }
        context.imageSmoothingQuality = "high";
        context.drawImage(decoded.image, 0, 0, width, height);
        return await canvasBlob(
          canvas,
          mime,
          options.format === "png" ? undefined : options.quality / 100,
          signal
        );
      } finally {
        // Release backing storage, especially important on memory-limited browsers.
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    let blob: Blob | null;
    if (typeof OffscreenCanvas !== "undefined") {
      try {
        blob = await encode(true);
        if (!blob || blob.type !== mime) blob = await encode(false);
      } catch (error) {
        if (signal?.aborted || (error as Error).name === "AbortError") {
          throw error;
        }
        blob = await encode(false);
      }
    } else blob = await encode(false);
    if (signal?.aborted) return { ok: false, error: { code: "aborted" } };
    if (!blob || blob.type !== mime) {
      return { ok: false, error: { code: "image_encode_unsupported" } };
    }
    return {
      ok: true,
      blob,
      width,
      height,
      sourceWidth,
      sourceHeight,
      flattened:
        options.format === "jpeg" &&
        sourceKind !== "jpeg" &&
        sourceKind !== "bmp",
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code:
          signal?.aborted || (error as Error).name === "AbortError"
            ? "aborted"
            : (error as Error).name === "TimeoutError"
              ? "image_timeout"
              : "image_canvas_failed",
      },
    };
  } finally {
    decoded.close();
  }
};
