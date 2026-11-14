import { describe, expect, it } from "vitest";
import type { MediaPlayerItem } from "../../../src/data/media-player";
import {
  addRecentMedia,
  createMediaShortcut,
  emptyMediaShortcuts,
  mediaShortcutKey,
  mediaShortcutStorageKey,
  parseMediaShortcuts,
  saveMediaShortcuts,
  MEDIA_SHORTCUT_MAX_LENGTH,
  shortcutWithinRoot,
  toggleFavoriteMedia,
} from "../../../src/common/media-browser/shortcuts";

const item: MediaPlayerItem = {
  title: "Station",
  media_content_id: "media-source://radio/1",
  media_content_type: "audio/mpeg",
  media_class: "music",
  can_play: true,
  can_expand: false,
  can_search: false,
  thumbnail: "https://example.com/art?token=secret",
};
const path = [
  {},
  { media_content_id: "media-source://radio", media_content_type: "app" },
];
const entry = createMediaShortcut(item, path)!;

describe("media shortcuts", () => {
  it("stores only stable IDs, names, player and navigation, not signed artwork or capabilities", () => {
    expect(entry).toEqual({
      title: "Station",
      item: {
        media_content_id: item.media_content_id,
        media_content_type: "audio/mpeg",
      },
      parent: path,
      player: "browser",
    });
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(JSON.stringify(entry)).not.toContain("can_play");
  });
  it("does not store signed URLs, manual media or generated speech", () => {
    for (const id of [
      "https://example.com/file",
      "provider:track?token=x",
      "media-source://tts/cloud",
      "__MANUAL_ENTRY__",
    ]) {
      expect(
        createMediaShortcut({ ...item, media_content_id: id }, path)
      ).toBeUndefined();
      expect(
        createMediaShortcut(item, [{ media_content_id: id }])
      ).toBeUndefined();
    }
  });
  it("rejects network and credential URLs in items and parent navigation", () => {
    for (const id of [
      "rtsp://user:password@camera/live",
      "RTSPS:camera/live",
      "rtmp://camera/live",
      "ftp://user:password@server/audio",
      "smb://server/share",
      "custom://user:password@server/item",
      "//user:password@camera/live",
      "media-source://user:password@camera/live",
      "media-source://user%40camera/live",
      "media-source://camera/rtsp://user%3Apassword%40camera/live",
      "rtsp%3A%2F%2Fcamera/live",
      "data:audio/mpeg;base64,secret",
      "blob:https://instance/id",
      " rtsp://camera/live",
    ]) {
      expect(
        createMediaShortcut({ ...item, media_content_id: id }, path)
      ).toBeUndefined();
      expect(
        createMediaShortcut(item, [{ media_content_id: id }])
      ).toBeUndefined();
      expect(
        parseMediaShortcuts(
          JSON.stringify({
            version: 1,
            favorites: [{ ...entry, item: { media_content_id: id } }],
            recents: [],
          })
        )
      ).toEqual(emptyMediaShortcuts());
    }
    expect(
      createMediaShortcut(
        { ...item, media_content_id: "spotify:track:123" },
        path
      )
    ).toBeDefined();
  });
  it("refuses oversized writes without replacing existing saved shortcuts", () => {
    let stored = JSON.stringify({
      version: 1,
      favorites: [entry],
      recents: [],
    });
    const original = stored;
    const storage = {
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const oversized = {
      favorites: [],
      recents: Array.from({ length: 20 }, (_, index) => ({
        ...entry,
        item: { media_content_id: `item:${index}` },
        parent: Array.from({ length: 32 }, () => ({
          media_content_id: "a".repeat(2048),
        })),
      })),
    };
    expect(JSON.stringify({ version: 1, ...oversized }).length).toBeGreaterThan(
      MEDIA_SHORTCUT_MAX_LENGTH
    );
    expect(saveMediaShortcuts(storage, "test", oversized)).toBe(false);
    expect(stored).toBe(original);
    expect(parseMediaShortcuts(stored).favorites).toEqual([entry]);
    const next = { favorites: [entry], recents: [entry] };
    expect(saveMediaShortcuts(storage, "test", next)).toBe(true);
    expect(parseMediaShortcuts(stored)).toEqual(next);
  });
  it("handles blocked or exhausted storage without throwing", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(saveMediaShortcuts(storage, "test", emptyMediaShortcuts())).toBe(
      false
    );
  });
  it("keeps providers and account storage separate", () => {
    expect(mediaShortcutKey(entry)).not.toBe(
      mediaShortcutKey({ ...entry, player: "media_player.kitchen" })
    );
    expect(mediaShortcutStorageKey("instance-a", "user")).not.toBe(
      mediaShortcutStorageKey("instance-b", "user")
    );
    expect(mediaShortcutStorageKey("instance-a", "user-a")).not.toBe(
      mediaShortcutStorageKey("instance-a", "user-b")
    );
  });
  it("promotes a repeated selection, deduplicates it, and caps recents", () => {
    let data = emptyMediaShortcuts();
    for (let index = 0; index < 30; index++) {
      data = addRecentMedia(data, {
        ...entry,
        item: { media_content_id: `item:${index}` },
      });
    }
    expect(data.recents).toHaveLength(20);
    const older = data.recents[10];
    data = addRecentMedia(data, older);
    expect(data.recents[0]).toEqual(older);
    expect(data.recents).toHaveLength(20);
  });
  it("toggles favorites without changing recent selections", () => {
    const initial = addRecentMedia(emptyMediaShortcuts(), entry);
    const starred = toggleFavoriteMedia(initial, entry);
    expect(starred.favorites).toEqual([entry]);
    expect(toggleFavoriteMedia(starred, entry)).toEqual(initial);
  });
  it("bounds favorites and strips untrusted stored properties", () => {
    const favorites = Array.from({ length: 60 }, (_, index) => ({
      ...entry,
      item: { media_content_id: `item:${index}`, signed_url: "secret" },
    }));
    const loaded = parseMediaShortcuts(
      JSON.stringify({ version: 1, favorites, recents: [] })
    );
    expect(loaded.favorites).toHaveLength(50);
    expect(JSON.stringify(loaded)).not.toContain("secret");
  });
  it("ignores malformed or incompatible storage", () => {
    for (const raw of [
      null,
      "{",
      "null",
      '{"version":2}',
      '{"version":1,"favorites":[null,{},1],"recents":"bad"}',
    ]) {
      expect(parseMediaShortcuts(raw)).toEqual(emptyMediaShortcuts());
    }
  });
  it("keeps restricted pickers inside their root and matching player", () => {
    expect(shortcutWithinRoot(entry, undefined, [{}])).toBe(true);
    expect(shortcutWithinRoot(entry, "browser", path)).toBe(true);
    expect(shortcutWithinRoot(entry, "media_player.kitchen", path)).toBe(false);
    expect(
      shortcutWithinRoot(entry, undefined, [
        {},
        { media_content_id: "media-source://image_upload" },
      ])
    ).toBe(false);
    expect(
      shortcutWithinRoot(entry, undefined, [
        ...path,
        { media_content_id: "child" },
      ])
    ).toBe(false);
  });
});
