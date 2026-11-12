import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import type {
  DownloadFile,
  SurpriseDish,
} from "../../../src/common/media-manage/download";
import {
  dishText,
  prepareSingleDownload,
  SURPRISE_CHANCE,
  zipSelection,
} from "../../../src/common/media-manage/download";

// Protects the surprise zip of a single download: it is drawn once per
// download, the file is always inside it byte for byte, and it never comes in
// School mode, on a bulk download or when there is no dish picture.

const bytes = (...values: number[]) => new Uint8Array(values);

const readBlob = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

const FILE: DownloadFile = {
  name: "holiday.png",
  blob: new Blob([bytes(1, 2, 3, 250, 251, 252)], { type: "image/png" }),
};

const DISH: SurpriseDish = {
  id: "har-gow",
  name_en: "Shrimp dumpling",
  name_yue: "蝦餃",
  picture_url: "/api/dim_sum/picture/har-gow",
  content_type: "image/jpeg",
};

const PICTURE = bytes(9, 8, 7, 6);

const options = (overrides: Record<string, unknown> = {}) => ({
  random: () => 0,
  schoolMode: false,
  provider: vi.fn(async () => DISH),
  fetchPath: vi.fn(
    async () =>
      ({ ok: true, blob: async () => new Blob([PICTURE]) }) as Response
  ),
  ...overrides,
});

describe("surprise draw", () => {
  it("is a one in ten chance", () => {
    expect(SURPRISE_CHANCE).toBe(0.1);
  });

  it("makes one draw for each download", async () => {
    const random = vi.fn(() => 0.5);
    await prepareSingleDownload(FILE, options({ random }));
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("gives the plain file when the draw is not lucky", async () => {
    const opts = options({ random: () => 0.1 });
    const result = await prepareSingleDownload(FILE, opts);
    expect(result).toEqual({ ...FILE, surprise: false });
    expect(opts.provider).not.toHaveBeenCalled();
  });

  it("gives a zip with the file, a picture and the dish names on a lucky draw", async () => {
    const result = await prepareSingleDownload(
      FILE,
      options({ random: () => 0.0999 })
    );
    expect(result.surprise).toBe(true);
    expect(result.name).toBe("holiday.png.zip");
    expect(result.dishName).toBe("Shrimp dumpling");
    const zip = await JSZip.loadAsync(await readBlob(result.blob));
    expect(Object.keys(zip.files).sort()).toEqual([
      "dim-sum.jpg",
      "dish.txt",
      "holiday.png",
    ]);
    expect(await zip.file("holiday.png")!.async("uint8array")).toEqual(
      await readBlob(FILE.blob)
    );
    expect(await zip.file("dim-sum.jpg")!.async("uint8array")).toEqual(PICTURE);
    const text = await zip.file("dish.txt")!.async("string");
    expect(text).toContain("Shrimp dumpling");
    expect(text).toContain("蝦餃");
    expect(text).toBe(dishText(DISH));
  });

  it("never adds anything in School mode", async () => {
    const opts = options({ schoolMode: true });
    const result = await prepareSingleDownload(FILE, opts);
    expect(result.surprise).toBe(false);
    expect(result.blob).toBe(FILE.blob);
    expect(opts.provider).not.toHaveBeenCalled();
  });

  it("gives the plain file when no dish is available", async () => {
    const result = await prepareSingleDownload(
      FILE,
      options({ provider: async () => undefined })
    );
    expect(result).toEqual({ ...FILE, surprise: false });
  });

  it("gives the plain file when the provider fails", async () => {
    const result = await prepareSingleDownload(
      FILE,
      options({
        provider: async () => {
          throw new Error("offline");
        },
      })
    );
    expect(result.surprise).toBe(false);
  });

  it("gives the plain file when the picture cannot be fetched", async () => {
    const result = await prepareSingleDownload(
      FILE,
      options({ fetchPath: async () => new Response("no", { status: 404 }) })
    );
    expect(result.surprise).toBe(false);
  });

  it("gives the plain file for a picture type it cannot name", async () => {
    const result = await prepareSingleDownload(
      FILE,
      options({
        provider: async () => ({ ...DISH, content_type: "text/html" }),
      })
    );
    expect(result.surprise).toBe(false);
  });
});

describe("zip of a selection", () => {
  const files = [
    { name: "a.png", blob: new Blob([bytes(1)]) },
    { name: "a.png", blob: new Blob([bytes(2)]) },
    { name: "b.mp4", blob: new Blob([bytes(3, 3)]) },
  ];

  it("holds every file unchanged, with clashing names kept apart", async () => {
    const outcome = await zipSelection(3, async (index) => files[index]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.count).toBe(3);
    const zip = await JSZip.loadAsync(await readBlob(outcome.file.blob));
    expect(Object.keys(zip.files).sort()).toEqual([
      "a (2).png",
      "a.png",
      "b.mp4",
    ]);
    expect(await zip.file("a.png")!.async("uint8array")).toEqual(bytes(1));
    expect(await zip.file("a (2).png")!.async("uint8array")).toEqual(bytes(2));
  });

  it("never holds a dim sum picture", async () => {
    const outcome = await zipSelection(3, async (index) => files[index]);
    if (!outcome.ok) {
      throw new Error("zip refused");
    }
    const zip = await JSZip.loadAsync(await readBlob(outcome.file.blob));
    expect(zip.file("dish.txt")).toBeNull();
    expect(
      Object.keys(zip.files).some((name) => name.startsWith("dim-sum"))
    ).toBe(false);
  });

  it("refuses, and stops reading, above the size limit", async () => {
    const fetchOne = vi.fn(async (index: number) => files[index]);
    const outcome = await zipSelection(3, fetchOne, 1);
    expect(outcome).toEqual({ ok: false, reason: "too_large" });
    expect(fetchOne).toHaveBeenCalledTimes(3 - 1);
  });
});
