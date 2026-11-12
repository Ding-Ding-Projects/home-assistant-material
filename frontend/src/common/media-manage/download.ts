import { uniqueName } from "./names";

/** Most bytes that are put into one zip of several files: 200 MB. */
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;

/** The chance that a single download comes as a zip with a surprise inside. */
export const SURPRISE_CHANCE = 0.1;

/** A file ready to be saved. */
export interface DownloadFile {
  name: string;
  blob: Blob;
}

/** Where the numbers between 0 and 1 for the surprise draw come from. */
export type RandomSource = () => number;

/**
 * A dish that may come with a download. This has the same shape as the dish
 * the dim sum feature answers with; the picture is fetched from `picture_url`.
 */
export interface SurpriseDish {
  id: string;
  name_en: string;
  name_yue: string;
  picture_url: string;
  content_type: string;
}

/** Gives one random dish, or nothing when none is available. */
export type DishProvider = () => Promise<SurpriseDish | undefined>;

/** Fetches a same-origin authenticated path. */
export type FetchPath = (path: string) => Promise<Response>;

export interface SurpriseOptions {
  random: RandomSource;
  /** True while School mode is on: then nothing is ever added. */
  schoolMode: boolean;
  provider: DishProvider;
  fetchPath: FetchPath;
}

export interface PreparedDownload extends DownloadFile {
  /** True when the file came inside a zip with a dim sum picture. */
  surprise: boolean;
  dishName?: string;
}

const PICTURE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** The text file that names the dish in both languages. */
export const dishText = (dish: SurpriseDish): string =>
  `Dish: ${dish.name_en}\r\n菜名：${dish.name_yue}\r\n`;

const loadZip = async () => (await import("jszip")).default;

/** Builds a zip of files, without compressing: pictures and video do not shrink. */
export const zipFiles = async (files: DownloadFile[]): Promise<Blob> => {
  const zipClass = await loadZip();
  const zip = new zipClass();
  const used = new Set<string>();
  for (const file of files) {
    zip.file(uniqueName(file.name, used), file.blob, { binary: true });
  }
  return zip.generateAsync({
    type: "blob",
    compression: "STORE",
    streamFiles: true,
  });
};

/**
 * Prepares one file for a single download. One draw is made for each call:
 * on a lucky draw, and never in School mode, the file comes inside a zip named
 * after it, together with a dim sum picture and a text file naming the dish.
 * The file itself is always inside, byte for byte. When no dish or picture
 * can be had, the plain file is returned.
 */
export const prepareSingleDownload = async (
  file: DownloadFile,
  options: SurpriseOptions
): Promise<PreparedDownload> => {
  const plain: PreparedDownload = { ...file, surprise: false };
  const lucky = options.random() < SURPRISE_CHANCE;
  if (!lucky || options.schoolMode) {
    return plain;
  }
  let dish: SurpriseDish | undefined;
  let picture: Blob;
  try {
    dish = await options.provider();
    if (!dish) {
      return plain;
    }
    const response = await options.fetchPath(dish.picture_url);
    if (!response.ok) {
      return plain;
    }
    picture = await response.blob();
  } catch (_err) {
    return plain;
  }
  const extension = PICTURE_EXTENSION[dish.content_type];
  if (!extension || picture.size === 0) {
    return plain;
  }
  try {
    const zip = await zipFiles([
      file,
      { name: `dim-sum.${extension}`, blob: picture },
      {
        name: "dish.txt",
        blob: new Blob([dishText(dish)], { type: "text/plain;charset=utf-8" }),
      },
    ]);
    return {
      name: `${file.name}.zip`,
      blob: zip,
      surprise: true,
      dishName: dish.name_en,
    };
  } catch (_err) {
    return plain;
  }
};

export type ZipOutcome =
  | { ok: true; file: DownloadFile; count: number }
  | { ok: false; reason: "too_large" };

/**
 * Fetches several files one after the other and puts them in one zip. It
 * stops, saying so, as soon as the files add up to more than `MAX_ZIP_BYTES`,
 * so a large selection never fills the memory of the browser.
 */
export const zipSelection = async (
  count: number,
  fetchOne: (index: number) => Promise<DownloadFile>,
  limit = MAX_ZIP_BYTES
): Promise<ZipOutcome> => {
  const files: DownloadFile[] = [];
  let total = 0;
  for (let index = 0; index < count; index++) {
    // eslint-disable-next-line no-await-in-loop
    const file = await fetchOne(index);
    total += file.blob.size;
    if (total > limit) {
      return { ok: false, reason: "too_large" };
    }
    files.push(file);
  }
  return {
    ok: true,
    file: { name: "media.zip", blob: await zipFiles(files) },
    count: files.length,
  };
};
