import { getIdFromUrl } from "../../data/image_upload";
import type { MediaPlayerItem } from "../../data/media-player";
import {
  isImageUploadMediaSourceContentId,
  resolveMediaSource,
} from "../../data/media_source";
import type { HomeAssistant } from "../../types";
import type { DownloadFile } from "./download";

export type ItemFileApi = Pick<HomeAssistant, "callWS" | "fetchWithAuth">;

/** Raised when a file cannot be read from the server. */
export class ItemFileError extends Error {
  public constructor(public code: "not_found" | "too_large" | "failed") {
    super(code);
  }
}

/**
 * Reads the original file of a media item: the file of the media library as it
 * is stored, or the original of an image, never a thumbnail. `limit` stops the
 * read early when the server says the file is larger.
 */
export const fetchItemFile = async (
  api: ItemFileApi,
  item: MediaPlayerItem,
  limit?: number
): Promise<DownloadFile> => {
  let path: string;
  if (isImageUploadMediaSourceContentId(item.media_content_id)) {
    const id = getIdFromUrl(item.media_content_id);
    if (!id) {
      throw new ItemFileError("not_found");
    }
    path = `/api/image/serve/${id}/original`;
  } else {
    path = (await resolveMediaSource(api, item.media_content_id)).url;
  }
  const response = await api.fetchWithAuth(path);
  if (response.status === 404) {
    throw new ItemFileError("not_found");
  }
  if (!response.ok) {
    throw new ItemFileError("failed");
  }
  const length = Number(response.headers.get("content-length"));
  if (limit !== undefined && length > limit) {
    throw new ItemFileError("too_large");
  }
  const blob = await response.blob();
  return { name: item.title, blob };
};
