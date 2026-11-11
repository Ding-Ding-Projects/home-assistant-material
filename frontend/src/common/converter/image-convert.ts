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

const canvasBlob = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number | undefined
): Promise<Blob | null> => {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
};

export const convertImage = async (
  bytes: Uint8Array,
  sourceKind: string,
  options: ImageOptions
): Promise<ImageResult> => {
  const header = readImageSize(bytes, sourceKind);
  if (header && header.width * header.height > MAX_PIXELS) {
    return {
      ok: false,
      error: {
        code: "image_too_large",
        detail: `${header.width} x ${header.height}`,
      },
    };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(
      new Blob([bytes as BlobPart], {
        type: MIME_OF_KIND[sourceKind] ?? "application/octet-stream",
      }),
      { imageOrientation: "from-image" }
    );
  } catch (_err) {
    return { ok: false, error: { code: "image_decode_failed" } };
  }
  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (sourceWidth * sourceHeight > MAX_PIXELS) {
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
    if (width > MAX_SIDE || height > MAX_SIDE) {
      return { ok: false, error: { code: "image_too_large" } };
    }
    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) {
      return { ok: false, error: { code: "image_canvas_failed" } };
    }
    const flattened =
      options.format === "jpeg" &&
      sourceKind !== "jpeg" &&
      sourceKind !== "bmp";
    if (options.format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const mime = IMAGE_MIME[options.format];
    const blob = await canvasBlob(
      canvas,
      mime,
      options.format === "png" ? undefined : options.quality / 100
    );
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
      flattened,
    };
  } catch (_err) {
    return { ok: false, error: { code: "image_canvas_failed" } };
  } finally {
    bitmap.close();
  }
};
