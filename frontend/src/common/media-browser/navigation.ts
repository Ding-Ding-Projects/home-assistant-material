import type { MediaPlayerItemId } from "../../components/media-player/ha-media-player-browse";

/** A title belongs to both the media ID and its type, which providers may reuse. */
export const mediaNavigationKey = (item: MediaPlayerItemId): string =>
  JSON.stringify([item.media_content_type ?? "", item.media_content_id ?? ""]);

/** Never allow breadcrumbs to escape a picker's configured source root. */
export const mediaNavigationAncestor = (
  ids: MediaPlayerItemId[],
  index: number,
  minimumLevel = 1
): MediaPlayerItemId[] =>
  Number.isInteger(index) &&
  index >= Math.max(0, minimumLevel - 1) &&
  index < ids.length - 1
    ? ids.slice(0, index + 1)
    : ids;
