/* eslint-disable no-await-in-loop -- pages are drawn in order */
import { MIME_OF_KIND } from "./detect";
import { canvasBlob } from "./image-convert";
import { fitSize, MAX_PIXELS, readImageSize } from "./image-size";
import { readJpeg } from "./jpeg-info";
import type { FontKey, Metrics } from "./layout";
import { layoutBlocks, PAPER } from "./layout";
import type { Block } from "./markdown-blocks";
import type { Paper, PdfImage } from "./pdf";
import type { ConvertError } from "./types";
import { failure } from "./types";

/**
 * The parts of making a PDF that need a canvas: text the standard PDF fonts
 * cannot draw (Chinese, for one) is drawn on pages by the browser with the
 * fonts of this device and the pages go in as pictures, and pictures that a
 * PDF cannot take as they are are decoded to plain pixels first.
 */

/** Pixels per point for pages drawn as pictures: about 144 dots per inch. */
const SCALE = 2;

/** Largest picture, in pixels, that is put in a PDF as pixels. */
const MAX_PDF_PIXELS = 16_000_000;

/** JPEG quality of a picture written again for a PDF. */
const PICTURE_QUALITY = 0.88;

const FAMILY: Record<FontKey, string> = {
  regular:
    '"Helvetica Neue", Arial, "PingFang SC", "PingFang TC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK TC", sans-serif',
  bold: '"Helvetica Neue", Arial, "PingFang SC", "PingFang TC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK TC", sans-serif',
  italic:
    '"Helvetica Neue", Arial, "PingFang SC", "PingFang TC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK TC", sans-serif',
  mono: 'Consolas, Menlo, "Courier New", "PingFang SC", "Microsoft YaHei", monospace',
};

const fontSpec = (font: FontKey, size: number): string =>
  `${font === "italic" ? "italic " : ""}${font === "bold" ? "bold " : ""}${size}px ${FAMILY[font]}`;

/** Text pages drawn on canvases, as pictures for a PDF. */
export const renderTextPagesAsImages = async (
  blocks: readonly Block[],
  paper: Paper
): Promise<
  | { ok: true; images: PdfImage[]; truncated: boolean }
  | { ok: false; error: ConvertError }
> => {
  const measure = Object.assign(document.createElement("canvas"), {
    width: 1,
    height: 1,
  }).getContext("2d");
  if (!measure) {
    return failure("image_canvas_failed");
  }
  const metrics: Metrics = {
    width: (text, font, size) => {
      measure.font = fontSpec(font, size * SCALE);
      return measure.measureText(text).width / SCALE;
    },
  };
  const { pages, truncated } = layoutBlocks(blocks, metrics, {
    ...PAPER[paper],
    margin: 54,
  });
  const images: PdfImage[] = [];
  for (const page of pages) {
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round(page.width * SCALE),
      height: Math.round(page.height * SCALE),
    });
    const context = canvas.getContext("2d");
    if (!context) {
      canvas.width = 0;
      canvas.height = 0;
      return failure("image_canvas_failed");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    context.textBaseline = "alphabetic";
    for (const op of page.ops) {
      if (op.kind === "text") {
        context.font = fontSpec(op.font, op.size * SCALE);
        context.fillText(op.text, op.x * SCALE, op.y * SCALE);
      } else {
        context.strokeStyle = "#999999";
        context.lineWidth = SCALE * 0.6;
        context.beginPath();
        context.moveTo(op.x1 * SCALE, op.y * SCALE);
        context.lineTo(op.x2 * SCALE, op.y * SCALE);
        context.stroke();
      }
    }
    const width = canvas.width;
    const height = canvas.height;
    const blob = await canvasBlob(canvas, "image/jpeg", 0.85);
    // Free the page's pixels before the next page is drawn.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.type !== "image/jpeg") {
      return failure("image_encode_unsupported");
    }
    images.push({
      kind: "jpeg",
      components: 3,
      width,
      height,
      data: new Uint8Array(await blob.arrayBuffer()),
      fullPage: true,
    });
  }
  return { ok: true, images, truncated };
};

/**
 * A picture ready to go on a PDF page. A plain JPEG without Exif goes in
 * unchanged, byte for byte; anything else is decoded and written again as a
 * JPEG, on white where it is transparent.
 */
export const prepareImageForPdf = async (
  bytes: Uint8Array,
  kind: string
): Promise<
  { ok: true; image: PdfImage } | { ok: false; error: ConvertError }
> => {
  if (kind === "jpeg") {
    const info = readJpeg(bytes);
    if (
      info &&
      (info.components === 1 || info.components === 3) &&
      info.orientation === 1 &&
      // A picture with Exif carries its location, camera and thumbnail, so it
      // is drawn again instead of being embedded as it is.
      !info.exif &&
      info.width * info.height <= MAX_PIXELS
    ) {
      return {
        ok: true,
        image: {
          kind: "jpeg",
          components: info.components,
          width: info.width,
          height: info.height,
          data: bytes,
        },
      };
    }
  }
  const header = readImageSize(bytes, kind);
  if (!header && kind === "avif") {
    return failure("image_size_unknown");
  }
  if (header && header.width * header.height > MAX_PIXELS) {
    return failure("image_too_large", {
      detail: `${header.width} x ${header.height}`,
    });
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(
      new Blob([bytes as BlobPart], {
        type: MIME_OF_KIND[kind] ?? "application/octet-stream",
      }),
      { imageOrientation: "from-image" }
    );
  } catch (_err) {
    return failure("image_decode_failed");
  }
  try {
    let { width, height } = bitmap;
    if (width * height > MAX_PIXELS) {
      return failure("image_too_large", { detail: `${width} x ${height}` });
    }
    if (width * height > MAX_PDF_PIXELS) {
      const size = fitSize(width, height, {
        mode: "scale",
        factor: Math.sqrt(MAX_PDF_PIXELS / (width * height)),
      });
      width = size.width;
      height = size.height;
    }
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    try {
      const context = canvas.getContext("2d");
      if (!context) {
        return failure("image_canvas_failed");
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      // Keep only the compressed picture: raw pixels would add up to hundreds
      // of megabytes for a handful of phone photos.
      const blob = await canvasBlob(canvas, "image/jpeg", PICTURE_QUALITY);
      if (!blob || blob.type !== "image/jpeg") {
        return failure("image_encode_unsupported");
      }
      return {
        ok: true,
        image: {
          kind: "jpeg",
          components: 3,
          width,
          height,
          data: new Uint8Array(await blob.arrayBuffer()),
        },
      };
    } finally {
      // Hand the pixel buffer back at once instead of waiting for collection.
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch (_err) {
    return failure("image_canvas_failed");
  } finally {
    bitmap.close();
  }
};
