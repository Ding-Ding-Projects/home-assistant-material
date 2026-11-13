import type { MediaPlayerItemId } from "../../components/media-player/ha-media-player-browse";
import type { MediaPlayerItem } from "../../data/media-player";
import { isManualMediaSourceContentId } from "../../data/media_source";
import { isTTSMediaSource } from "../../data/tts";
import { mediaNavigationKey } from "./navigation";

export interface MediaShortcut {
  title: string;
  item: MediaPlayerItemId;
  parent: MediaPlayerItemId[];
  player: string;
}
export interface MediaShortcuts {
  favorites: MediaShortcut[];
  recents: MediaShortcut[];
}
export const emptyMediaShortcuts = (): MediaShortcuts => ({
  favorites: [],
  recents: [],
});
export const mediaShortcutKey = (entry: MediaShortcut): string =>
  JSON.stringify([entry.player, mediaNavigationKey(entry.item)]);
export const mediaShortcutStorageKey = (
  instance: string,
  user: string
): string =>
  `media-shortcuts:${encodeURIComponent(instance)}:${encodeURIComponent(user)}`;

/** Same serialized character bound for reading and writing browser storage. */
export const MEDIA_SHORTCUT_MAX_LENGTH = 512 * 1024;

// Provider IDs may be opaque (spotify:track:...), but network/credential URLs
// must never enter history. Only Home Assistant's media-source URL is allowed.
const safeId = (id: unknown): id is string => {
  if (typeof id !== "string" || id.length > 2048) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    return false;
  }
  if (
    decoded !== decoded.trim() ||
    /[?#@\\]/.test(decoded) ||
    [...decoded].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) ||
    decoded.startsWith("//") ||
    /^(?:https?|rtsps?|rtmps?|ftps?|sftp|smb|nfs|tcp|udp|wss?|file|data|blob|javascript):/i.test(
      decoded
    ) ||
    isTTSMediaSource(decoded) ||
    isManualMediaSourceContentId(decoded)
  ) {
    return false;
  }
  if (decoded.includes("://")) {
    return /^media-source:\/\/[a-zA-Z0-9_-]+(?:\/|$)/.test(decoded);
  }
  return true;
};
const cleanId = (value: unknown): MediaPlayerItemId | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.media_content_id !== undefined && !safeId(item.media_content_id)) {
    return undefined;
  }
  if (
    item.media_content_type !== undefined &&
    (typeof item.media_content_type !== "string" ||
      item.media_content_type.length > 128)
  ) {
    return undefined;
  }
  return {
    media_content_id: item.media_content_id as string | undefined,
    media_content_type: item.media_content_type as string | undefined,
  };
};
const cleanShortcut = (value: unknown): MediaShortcut | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.title !== "string" ||
    entry.title.length > 256 ||
    typeof entry.player !== "string" ||
    entry.player.length > 256 ||
    !Array.isArray(entry.parent) ||
    !entry.parent.length ||
    entry.parent.length > 32
  ) {
    return undefined;
  }
  const item = cleanId(entry.item);
  const parent = entry.parent.map(cleanId);
  if (!item?.media_content_id || parent.some((id) => !id)) return undefined;
  return {
    title: entry.title,
    player: entry.player,
    item,
    parent: parent as MediaPlayerItemId[],
  };
};
export const createMediaShortcut = (
  item: MediaPlayerItem,
  parent: MediaPlayerItemId[],
  player?: string
): MediaShortcut | undefined =>
  cleanShortcut({
    title: item.title,
    item,
    parent,
    player: player || "browser",
  });

export const parseMediaShortcuts = (raw: string | null): MediaShortcuts => {
  try {
    if (raw && raw.length > MEDIA_SHORTCUT_MAX_LENGTH) {
      return emptyMediaShortcuts();
    }
    const value = JSON.parse(raw || "null");
    if (value?.version !== 1) return emptyMediaShortcuts();
    const cleanList = (list: unknown, limit: number): MediaShortcut[] => {
      if (!Array.isArray(list)) return [];
      const result = new Map<string, MediaShortcut>();
      for (const candidate of list.slice(0, limit)) {
        const entry = cleanShortcut(candidate);
        if (entry) result.set(mediaShortcutKey(entry), entry);
      }
      return [...result.values()];
    };
    return {
      favorites: cleanList(value.favorites, 50),
      recents: cleanList(value.recents, 20),
    };
  } catch {
    return emptyMediaShortcuts();
  }
};
/** A failed/oversized write never replaces the previous saved shortcuts. */
export const saveMediaShortcuts = (
  storage: Pick<Storage, "setItem">,
  key: string,
  data: MediaShortcuts
): boolean => {
  try {
    const serialized = JSON.stringify({ version: 1, ...data });
    if (serialized.length > MEDIA_SHORTCUT_MAX_LENGTH) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
};

export const addRecentMedia = (
  data: MediaShortcuts,
  entry: MediaShortcut
): MediaShortcuts => ({
  ...data,
  recents: [
    entry,
    ...data.recents.filter(
      (old) => mediaShortcutKey(old) !== mediaShortcutKey(entry)
    ),
  ].slice(0, 20),
});
export const toggleFavoriteMedia = (
  data: MediaShortcuts,
  entry: MediaShortcut
): MediaShortcuts => {
  const exists = data.favorites.some(
    (old) => mediaShortcutKey(old) === mediaShortcutKey(entry)
  );
  return {
    ...data,
    favorites: exists
      ? data.favorites.filter(
          (old) => mediaShortcutKey(old) !== mediaShortcutKey(entry)
        )
      : [entry, ...data.favorites].slice(0, 50),
  };
};
export const shortcutWithinRoot = (
  entry: MediaShortcut,
  player: string | undefined,
  root: MediaPlayerItemId[]
): boolean =>
  entry.player === (player || "browser") &&
  root.length <= entry.parent.length &&
  root.every(
    (item, index) =>
      mediaNavigationKey(item) === mediaNavigationKey(entry.parent[index])
  );
