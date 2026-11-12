import { describe, expect, it, vi } from "vitest";
import {
  buildSteps,
  convertPicture,
  MAX_CONVERT_INPUT_BYTES,
  planPicture,
  renamedWithExtension,
} from "../../../src/common/file-drop/drop-convert";
import type { PictureConverter } from "../../../src/common/file-drop/drop-convert";
import { formatBytes } from "../../../src/common/file-drop/format-bytes";

// Protects the rules that decide what a dropped picture needs before it is
// stored: which types convert, which are skipped, that an animated GIF is never
// flattened, and that the shrinking steps end with the picture inside the limit
// or with an honest failure instead of a file the server would refuse.

const MB = 1024 * 1024;
const IMAGE_LIMIT = 50 * MB;
const MEDIA_LIMIT = 2 * 1024 * MB;

describe("planning a picture for the image store", () => {
  const plan = (type: string, size = 1000) =>
    planPicture({ type, size }, "image", IMAGE_LIMIT);

  it("keeps JPEG, PNG and GIF within the limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/gif"]) {
      expect(plan(type)).toEqual({ action: "keep" });
    }
  });

  it("converts WebP, BMP and AVIF", () => {
    for (const [type, from] of [
      ["image/webp", "webp"],
      ["image/bmp", "bmp"],
      ["image/avif", "avif"],
    ]) {
      expect(plan(type)).toEqual({
        action: "convert",
        from,
        limit: IMAGE_LIMIT,
        why: "type",
      });
    }
  });

  it("re-encodes a JPEG or PNG above the limit", () => {
    expect(plan("image/jpeg", IMAGE_LIMIT + 1)).toMatchObject({
      action: "convert",
      from: "jpeg",
      why: "size",
    });
    expect(plan("image/png", IMAGE_LIMIT + 1)).toMatchObject({
      action: "convert",
      from: "png",
      why: "size",
    });
  });

  it("never flattens a GIF that is too large", () => {
    expect(plan("image/gif", IMAGE_LIMIT + 1)).toEqual({
      action: "skip",
      reason: "too_large",
    });
  });

  it("skips picture types no adapter here can read", () => {
    for (const type of ["image/svg+xml", "image/tiff", "image/heic"]) {
      expect(plan(type)).toEqual({ action: "skip", reason: "cannot_convert" });
    }
  });

  it("refuses to read a picture file that is far too large to decode", () => {
    expect(plan("image/webp", MAX_CONVERT_INPUT_BYTES + 1)).toEqual({
      action: "skip",
      reason: "too_large",
    });
  });

  it("skips video and audio", () => {
    expect(plan("video/mp4")).toEqual({ action: "skip", reason: "image_type" });
  });
});

describe("planning a file for the media library", () => {
  const plan = (type: string, size: number) =>
    planPicture({ type, size }, "media", MEDIA_LIMIT);

  it("stores any file within the limit as it is", () => {
    expect(plan("image/webp", 10 * MB)).toEqual({ action: "keep" });
    expect(plan("video/mp4", MEDIA_LIMIT)).toEqual({ action: "keep" });
  });

  it("re-encodes a picture above the limit but skips video and a GIF", () => {
    expect(
      planPicture({ type: "image/jpeg", size: 150 * MB }, "media", 100 * MB)
    ).toMatchObject({ action: "convert", from: "jpeg", why: "size" });
    expect(plan("image/jpeg", MEDIA_LIMIT + 1)).toEqual({
      action: "skip",
      reason: "too_large",
    });
    expect(plan("video/mp4", MEDIA_LIMIT + 1)).toEqual({
      action: "skip",
      reason: "too_large",
    });
    expect(plan("image/gif", MEDIA_LIMIT + 1)).toEqual({
      action: "skip",
      reason: "too_large",
    });
  });
});

describe("the shrinking steps", () => {
  it("lowers JPEG quality before making the picture smaller", () => {
    const steps = buildSteps("jpeg", "size");
    expect(steps[0]).toMatchObject({ format: "jpeg", scale: 1 });
    const qualities = steps.filter((s) => s.scale === 1).map((s) => s.quality);
    expect(qualities).toEqual([...qualities].sort((a, b) => b - a));
    expect(steps[steps.length - 1].scale).toBeLessThan(0.5);
  });

  it("keeps a large PNG a PNG, so transparency stays", () => {
    expect(buildSteps("png", "size").every((s) => s.format === "png")).toBe(
      true
    );
  });

  it("tries PNG first for a converted type, then JPEG", () => {
    const steps = buildSteps("webp", "type");
    expect(steps[0]).toMatchObject({ format: "png", scale: 1 });
    expect(steps.some((s) => s.format === "jpeg")).toBe(true);
  });
});

describe("naming and sizes", () => {
  it("keeps the base name and changes the extension", () => {
    expect(renamedWithExtension("holiday.webp", "png")).toBe("holiday.png");
    expect(renamedWithExtension("a.b.c.bmp", "jpeg")).toBe("a.b.c.jpg");
    expect(renamedWithExtension("noext", "png")).toBe("noext.png");
  });

  it("shows gigabytes from 1 GB up", () => {
    expect(formatBytes(2 * 1024 * MB)).toBe("2 GB");
    expect(formatBytes(1.5 * 1024 * MB)).toBe("1.5 GB");
    expect(formatBytes(50 * MB)).toBe("50 MB");
    expect(formatBytes(1023 * MB)).toBe("1023 MB");
  });
});

const result = (bytes: number, width = 100, height = 80) => ({
  ok: true as const,
  blob: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
  width,
  height,
  sourceWidth: 100,
  sourceHeight: 80,
  flattened: false,
});

describe("converting a picture", () => {
  const source = new File(["x"], "photo.jpg", { type: "image/jpeg" });
  const plan = (limit: number) =>
    ({ action: "convert", from: "jpeg", limit, why: "size" }) as const;

  it("stops at the first step that fits and says the quality used", async () => {
    const convert = vi
      .fn<PictureConverter>()
      .mockResolvedValueOnce(result(5000))
      .mockResolvedValueOnce(result(900));
    const outcome = await convertPicture(source, plan(1000), convert);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.file.name).toBe("photo.jpg");
      expect(outcome.change).toMatchObject({
        from: "JPEG",
        to: "JPEG",
        quality: 70,
        flattened: false,
      });
      expect(outcome.change.resizedFrom).toBeUndefined();
    }
    expect(convert).toHaveBeenCalledTimes(2);
  });

  it("states the new pixel size when the picture was made smaller", async () => {
    const convert = vi.fn<PictureConverter>(async (_b, _k, options) =>
      options.resize.mode === "scale" ? result(10, 50, 40) : result(5000)
    );
    const outcome = await convertPicture(source, plan(1000), convert);
    expect(outcome.ok && outcome.change.resizedFrom).toBe("100×80");
    expect(outcome.ok && outcome.change.resizedTo).toBe("50×40");
  });

  it("reports the converter's own failure code", async () => {
    const convert = vi.fn<PictureConverter>(async () => ({
      ok: false,
      error: { code: "image_too_large" },
    }));
    expect(await convertPicture(source, plan(1000), convert)).toEqual({
      ok: false,
      code: "image_too_large",
    });
  });

  it("fails honestly when no step reaches the limit", async () => {
    const convert = vi.fn<PictureConverter>(async () => result(5000));
    expect(await convertPicture(source, plan(1000), convert)).toEqual({
      ok: false,
      code: "still_too_large",
    });
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const convert = vi.fn<PictureConverter>();
    expect(
      await convertPicture(source, plan(1000), convert, controller.signal)
    ).toEqual({ ok: false, code: "aborted" });
    expect(convert).not.toHaveBeenCalled();
  });
});
