import type { LocalizeFunc } from "../common/translations/localize";
import type { HomeAssistant } from "../types";
import type { UploadProgressOptions } from "../util/upload-with-progress";
import { postFormWithProgress } from "../util/upload-with-progress";

export interface Image {
  filesize: number;
  name: string;
  uploaded_at: string; // isoformat date
  content_type: string;
  id: string;
  /** The folder the image is in; empty for the top level. */
  folder: string;
}

export const URL_PREFIX = "/api/image/serve/";
export const MEDIA_PREFIX = "media-source://image_upload";
const FOLDER_ID_PREFIX = "folder/";

export interface ImageMutableParams {
  name: string;
}

export const getIdFromUrl = (url: string): string | undefined => {
  let id;
  if (url.startsWith(URL_PREFIX)) {
    id = url.substring(URL_PREFIX.length);
    const idx = id.indexOf("/");
    if (idx >= 0) {
      id = id.substring(0, idx);
    }
  } else if (url.startsWith(MEDIA_PREFIX)) {
    id = url.substring(MEDIA_PREFIX.length + 1);
    // A folder of the image store is not an image
    if (id.startsWith(FOLDER_ID_PREFIX)) {
      return undefined;
    }
  }
  return id;
};

/** The media content ID of a folder of the image store; empty for the top level. */
export const imageFolderMediaId = (path: string): string =>
  path ? `${MEDIA_PREFIX}/${FOLDER_ID_PREFIX}${path}` : MEDIA_PREFIX;

/**
 * The folder path a media content ID of the image store names: empty for the
 * top level, undefined for anything that is not a folder.
 */
export const imageFolderFromMediaId = (mediaId: string): string | undefined => {
  if (mediaId === MEDIA_PREFIX || mediaId === `${MEDIA_PREFIX}/`) {
    return "";
  }
  const prefix = `${MEDIA_PREFIX}/${FOLDER_ID_PREFIX}`;
  return mediaId.startsWith(prefix)
    ? mediaId.substring(prefix.length)
    : undefined;
};

export interface ImageBreadcrumb {
  /** The media content ID of the folder. */
  id: string;
  name: string;
}

/** The folders from the top of the image store down to the one at `path`. */
export const getImageBreadcrumbs = (
  path: string,
  rootName: string
): ImageBreadcrumb[] => {
  const crumbs: ImageBreadcrumb[] = [{ id: MEDIA_PREFIX, name: rootName }];
  let current = "";
  for (const segment of path ? path.split("/") : []) {
    current = current ? `${current}/${segment}` : segment;
    crumbs.push({ id: imageFolderMediaId(current), name: segment });
  }
  return crumbs;
};

export type ImageFolderErrorCode =
  | "exists"
  | "invalid_name"
  | "not_found"
  | "not_empty"
  | "not_allowed"
  | "too_deep";

export interface ImageFolder {
  path: string;
  name: string;
  parent: string;
  /** Images directly in the folder. */
  images: number;
  /** Folders directly in the folder. */
  folders: number;
}

export interface ImageFolderList {
  folders: ImageFolder[];
  root: { images: number; folders: number };
}

/** Checks a folder name the way the server does. */
export const isValidImageFolderName = (name: string): boolean =>
  name.length > 0 &&
  name.length <= 100 &&
  name !== "." &&
  name !== ".." &&
  name === name.trim() &&
  !/[/\\]/.test(name) &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(name);

export const listImageFolders = (callWS: HomeAssistant["callWS"]) =>
  callWS<ImageFolderList>({ type: "image/folder/list" });

export const createImageFolder = (
  callWS: HomeAssistant["callWS"],
  parent: string,
  name: string
) => callWS<{ path: string }>({ type: "image/folder/create", parent, name });

export const renameImageFolder = (
  callWS: HomeAssistant["callWS"],
  path: string,
  new_name: string
) => callWS<{ path: string }>({ type: "image/folder/rename", path, new_name });

export const removeImageFolder = (
  callWS: HomeAssistant["callWS"],
  path: string,
  move_to_parent: boolean
) =>
  callWS<{ moved_images: number; moved_folders: number }>({
    type: "image/folder/remove",
    path,
    move_to_parent,
  });

export const moveImages = (
  callWS: HomeAssistant["callWS"],
  image_ids: string[],
  folder: string
) => callWS<{ moved: number }>({ type: "image/move", image_ids, folder });

export const generateImageThumbnailUrl = (
  mediaId: string,
  size?: number,
  original = false
) => {
  if (!original && !size) {
    throw new Error("Size must be provided if original is false");
  }

  return original
    ? `/api/image/serve/${mediaId}/original`
    : `/api/image/serve/${mediaId}/${size}x${size}`;
};

export const fetchImages = (hass: HomeAssistant) =>
  hass.callWS<Image[]>({ type: "image/list" });

export const createImage = async (
  fetchWithAuth: HomeAssistant["fetchWithAuth"],
  localize: LocalizeFunc,
  file: File,
  signal?: AbortSignal,
  folder?: string
): Promise<Image> => {
  const fd = new FormData();
  fd.append("file", file);
  if (folder) {
    fd.append("folder", folder);
  }
  const resp = await fetchWithAuth("/api/image/upload", {
    method: "POST",
    body: fd,
    signal,
  });
  if (resp.status === 413) {
    throw new Error(
      localize("ui.common.upload_image_too_large", {
        name: file.name,
      })
    );
  } else if (resp.status !== 200) {
    throw new Error(localize("ui.common.unknown_error"));
  }
  return resp.json();
};

export const createImageWithProgress = async (
  hass: Pick<HomeAssistant, "auth">,
  localize: LocalizeFunc,
  file: File,
  options: UploadProgressOptions = {},
  folder?: string
): Promise<Image> => {
  const fd = new FormData();
  fd.append("file", file);
  if (folder) {
    fd.append("folder", folder);
  }
  const resp = await postFormWithProgress(
    hass,
    "/api/image/upload",
    fd,
    options
  );
  if (resp.status === 413) {
    throw new Error(
      localize("ui.common.upload_image_too_large", { name: file.name })
    );
  } else if (resp.status !== 200) {
    throw new Error(localize("ui.common.unknown_error"));
  }
  return JSON.parse(resp.body);
};

export const updateImage = (
  hass: HomeAssistant,
  id: string,
  updates: Partial<ImageMutableParams>
) =>
  hass.callWS<Image>({
    type: "image/update",
    image_id: id,
    ...updates,
  });

export const renameImage = (
  callWS: HomeAssistant["callWS"],
  id: string,
  name: string
) => callWS<Image>({ type: "image/update", image_id: id, name });

export const deleteImage = (callWS: HomeAssistant["callWS"], id: string) =>
  callWS({
    type: "image/delete",
    image_id: id,
  });

export const getImageData = async (
  hassUrl: HomeAssistant["hassUrl"],
  url: string
) => {
  const response = await fetch(hassUrl(url));

  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${
        response.statusText ? response.statusText : response.status
      }`
    );
  }

  return response.blob();
};
