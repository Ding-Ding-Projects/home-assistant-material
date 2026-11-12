import {
  isImageUploadMediaSourceContentId,
  isLocalMediaSourceContentId,
  isMediaSourceRoot,
  normalizeMediaFolderId,
} from "../../data/media_source";
import { BROWSER_PLAYER } from "../../data/media-player";

/** The media list that holds every media directory. */
export const MEDIA_SOURCE_ROOT = "media-source://media_source";

/** The media list that holds uploaded images. */
export const IMAGE_SOURCE_ROOT = "media-source://image_upload";

/** The media directory a default Home Assistant has. */
export const DEFAULT_MEDIA_DIRECTORY = "media-source://media_source/local";

/** Where a media drop lands, taken from the page on screen. */
export interface MediaLocation {
  /** The local folder open in the Media browser, when one is. */
  folderId?: string;
  /** The name of that folder, for messages. Absent for a media directory. */
  folderName?: string;
  /** True when the person is looking at the image store. */
  inImageStore: boolean;
  /** The player the Media browser is using, kept when going back there. */
  player: string;
}

const lastItemOfPath = (pathname: string) => {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "media-browser" || parts.length < 3) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(parts[parts.length - 1]);
  } catch (_err) {
    return undefined;
  }
  // The id may itself contain commas, so only the first one separates.
  const comma = decoded.indexOf(",");
  return {
    player: parts[1],
    id: comma >= 0 ? decoded.substring(comma + 1) : decoded,
  };
};

/** Reads where in the Media browser the person is, from the address. */
export const mediaLocationFromPath = (pathname: string): MediaLocation => {
  const parts = pathname.split("/").filter(Boolean);
  const player =
    parts[0] === "media-browser" && parts[1] ? parts[1] : BROWSER_PLAYER;
  const last = lastItemOfPath(pathname);
  if (!last) {
    return { inImageStore: false, player };
  }
  if (isImageUploadMediaSourceContentId(last.id)) {
    return { inImageStore: true, player };
  }
  if (!isLocalMediaSourceContentId(last.id) || isMediaSourceRoot(last.id)) {
    return { inImageStore: false, player };
  }
  const folderId = normalizeMediaFolderId(last.id);
  const afterSource = folderId.substring(MEDIA_SOURCE_ROOT.length + 1);
  const segments = afterSource.split("/").filter(Boolean);
  // One segment is a media directory itself: the library, not a named folder.
  return {
    folderId,
    folderName: segments.length > 1 ? segments[segments.length - 1] : undefined,
    inImageStore: false,
    player,
  };
};

const level = (type: string, id: string) =>
  `/${encodeURIComponent(`${type},${id}`)}`;

/** The Media browser address of a local folder, one level for each folder. */
export const mediaBrowserPathForFolder = (
  player: string,
  folderId: string
): string => {
  const folder = normalizeMediaFolderId(folderId);
  let path = `/media-browser/${player}${level("app", MEDIA_SOURCE_ROOT)}`;
  if (!folder.startsWith(`${MEDIA_SOURCE_ROOT}/`)) {
    return path;
  }
  let id = MEDIA_SOURCE_ROOT;
  for (const segment of folder
    .substring(MEDIA_SOURCE_ROOT.length + 1)
    .split("/")) {
    id = `${id}/${segment}`;
    path += level("directory", id);
  }
  return path;
};

/** The Media browser address of the image store. */
export const mediaBrowserPathForImages = (player: string): string =>
  `/media-browser/${player}${level("app", IMAGE_SOURCE_ROOT)}`;
