import type { LocalizeFunc } from "../common/translations/localize";
import { timeCacheEntityPromiseFunc } from "../common/util/time-cache-entity-promise-func";
import type { HomeAssistant } from "../types";
import type { UploadProgressOptions } from "../util/upload-with-progress";
import { postFormWithProgress } from "../util/upload-with-progress";
import type { MediaPlayerItem, SearchMediaResult } from "./media-player";

export interface ResolvedMediaSource {
  url: string;
  mime_type: string;
}

export const resolveMediaSource = (
  hass: Pick<HomeAssistant, "callWS">,
  media_content_id: string
) =>
  hass.callWS<ResolvedMediaSource>({
    type: "media_source/resolve_media",
    media_content_id,
  });

// Resolved URLs are signed and valid for 24 hours (CONTENT_AUTH_EXPIRY_TIME in
// core). Resolving again returns a different signature, which would defeat the
// browser cache, so reuse the resolved URL for just under its validity.
export const RESOLVE_CACHE_TIME = 23 * 60 * 60 * 1000; // 23 hours

export const resolveMediaSourceWithCache = (
  hass: Pick<HomeAssistant, "callWS" | "hassUrl">,
  media_content_id: string
): Promise<ResolvedMediaSource> =>
  timeCacheEntityPromiseFunc(
    "_resolvedMediaSource",
    RESOLVE_CACHE_TIME,
    resolveMediaSource,
    hass,
    media_content_id
  );

export const browseLocalMediaPlayer = (
  callWS: HomeAssistant["callWS"],
  mediaContentId?: string
): Promise<MediaPlayerItem> =>
  callWS<MediaPlayerItem>({
    type: "media_source/browse_media",
    media_content_id: mediaContentId,
  });

export const searchMedia = (
  callWS: HomeAssistant["callWS"],
  mediaContentId: string | undefined,
  searchQuery: string,
  mediaFilterClasses?: string[]
): Promise<SearchMediaResult> =>
  callWS<SearchMediaResult>({
    type: "media_source/search_media",
    media_content_id: mediaContentId,
    search_query: searchQuery,
    media_filter_classes: mediaFilterClasses,
  });

export const MANUAL_MEDIA_SOURCE_PREFIX = "__MANUAL_ENTRY__";

export const isManualMediaSourceContentId = (mediaContentId: string) =>
  mediaContentId.startsWith(MANUAL_MEDIA_SOURCE_PREFIX);

export const isMediaSourceContentId = (mediaId: string) =>
  mediaId.startsWith("media-source://");

export const isLocalMediaSourceContentId = (mediaId: string) =>
  mediaId.startsWith("media-source://media_source");

export const isImageUploadMediaSourceContentId = (mediaId: string) =>
  mediaId.startsWith("media-source://image_upload");

export const getImageEntityIdFromMediaSourceContentId = (
  mediaId: string
): string | undefined =>
  mediaId.startsWith("media-source://image/image.")
    ? mediaId.slice("media-source://image/".length)
    : undefined;

export const uploadLocalMedia = async (
  fetchWithAuth: HomeAssistant["fetchWithAuth"],
  localize: LocalizeFunc,
  media_content_id: string,
  file: File,
  signal?: AbortSignal
) => {
  const fd = new FormData();
  fd.append("media_content_id", media_content_id);
  fd.append("file", file);
  const resp = await fetchWithAuth("/api/media_source/local_source/upload", {
    method: "POST",
    body: fd,
    signal,
  });
  if (resp.status === 413) {
    throw new Error(
      localize("ui.common.upload_file_too_large", {
        name: file.name,
      })
    );
  } else if (resp.status !== 200) {
    throw new Error(localize("ui.common.unknown_error"));
  }
  return resp.json();
};

export const uploadLocalMediaWithProgress = async (
  hass: Pick<HomeAssistant, "auth">,
  localize: LocalizeFunc,
  media_content_id: string,
  file: File,
  options: UploadProgressOptions = {}
) => {
  const fd = new FormData();
  fd.append("media_content_id", media_content_id);
  fd.append("file", file);
  const resp = await postFormWithProgress(
    hass,
    "/api/media_source/local_source/upload",
    fd,
    options
  );
  if (resp.status === 413) {
    throw new Error(
      localize("ui.common.upload_file_too_large", { name: file.name })
    );
  } else if (resp.status !== 200) {
    throw new Error(localize("ui.common.unknown_error"));
  }
  return JSON.parse(resp.body);
};

export const removeLocalMedia = async (
  callWS: HomeAssistant["callWS"],
  media_content_id: string
) =>
  callWS({
    type: "media_source/local_source/remove",
    media_content_id,
  });

export type MediaFolderErrorCode =
  | "not_found"
  | "exists"
  | "invalid_name"
  | "not_empty"
  | "not_allowed"
  | "changed";

export interface MediaFolderCounts {
  files: number;
  folders: number;
}

export const createLocalMediaFolder = (
  callWS: HomeAssistant["callWS"],
  parent_media_content_id: string,
  name: string
) =>
  callWS<{ media_content_id: string }>({
    type: "media_source/local_source/create_folder",
    parent_media_content_id,
    name,
  });

export const renameLocalMedia = (
  callWS: HomeAssistant["callWS"],
  media_content_id: string,
  new_name: string
) =>
  callWS<{ media_content_id: string }>({
    type: "media_source/local_source/rename",
    media_content_id,
    new_name,
  });

export const moveLocalMedia = (
  callWS: HomeAssistant["callWS"],
  media_content_id: string,
  destination_media_content_id: string
) =>
  callWS<{ media_content_id: string }>({
    type: "media_source/local_source/move",
    media_content_id,
    destination_media_content_id,
  });

export const getLocalMediaFolderCounts = (
  callWS: HomeAssistant["callWS"],
  media_content_id: string
) =>
  callWS<MediaFolderCounts>({
    type: "media_source/local_source/folder_info",
    media_content_id,
  });

export const removeLocalMediaFolder = (
  callWS: HomeAssistant["callWS"],
  media_content_id: string,
  recursive: boolean,
  expected?: MediaFolderCounts
) =>
  callWS<MediaFolderCounts>({
    type: "media_source/local_source/remove_folder",
    media_content_id,
    recursive,
    ...(expected
      ? {
          expected_files: expected.files,
          expected_folders: expected.folders,
        }
      : {}),
  });

/** The media content ID of a folder without the trailing "/." the root carries. */
export const normalizeMediaFolderId = (mediaId: string): string =>
  mediaId.replace(/\/\.?$/, "");

/** True for the list of media directories, where nothing can be created or uploaded. */
export const isMediaSourceRoot = (mediaId: string): boolean =>
  /^media-source:\/\/media_source\/?$/.test(mediaId);

export interface MediaBreadcrumb {
  id: string;
  name: string;
}

/**
 * The folders from the one the dialog opened on down to the open one.
 * `rootName` names the first entry.
 */
export const getMediaBreadcrumbs = (
  rootId: string,
  currentId: string,
  rootName: string
): MediaBreadcrumb[] => {
  const root = normalizeMediaFolderId(rootId);
  const current = normalizeMediaFolderId(currentId);
  const crumbs: MediaBreadcrumb[] = [{ id: rootId, name: rootName }];
  if (current === root || !current.startsWith(`${root}/`)) {
    return crumbs;
  }
  let id = root;
  for (const segment of current.slice(root.length + 1).split("/")) {
    id = `${id}/${segment}`;
    crumbs.push({ id, name: segment });
  }
  return crumbs;
};

/** Checks a new file or folder name the way the server does. */
export const isValidMediaName = (name: string): boolean =>
  name.length > 0 &&
  new TextEncoder().encode(name).length <= 255 &&
  name === name.trim() &&
  !name.startsWith(".") &&
  !name.includes("~") &&
  !name.includes("..") &&
  !/[/\\]/.test(name) &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(name);

export const isStreamingMedia = (url: string): boolean =>
  url.includes("/api/image_proxy_stream") ||
  url.includes("/api/camera_proxy_stream");
