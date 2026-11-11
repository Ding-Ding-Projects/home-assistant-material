import { describe, expect, it, vi } from "vitest";
import {
  getMediaBreadcrumbs,
  isMediaSourceRoot,
  isValidMediaName,
  normalizeMediaFolderId,
  removeLocalMediaFolder,
} from "../../src/data/media_source";

describe("media folder helpers", () => {
  it("drops the trailing marker the media directory itself carries", () => {
    expect(normalizeMediaFolderId("media-source://media_source/local/.")).toBe(
      "media-source://media_source/local"
    );
    expect(normalizeMediaFolderId("media-source://media_source/local/a")).toBe(
      "media-source://media_source/local/a"
    );
  });

  it("tells the list of media directories from a folder", () => {
    expect(isMediaSourceRoot("media-source://media_source")).toBe(true);
    expect(isMediaSourceRoot("media-source://media_source/local")).toBe(false);
  });

  it("builds the crumbs from the folder the dialog opened on", () => {
    const root = "media-source://media_source/local/.";
    expect(getMediaBreadcrumbs(root, root, "Media")).toEqual([
      { id: root, name: "Media" },
    ]);
    expect(
      getMediaBreadcrumbs(
        root,
        "media-source://media_source/local/a/b",
        "Media"
      )
    ).toEqual([
      { id: root, name: "Media" },
      { id: "media-source://media_source/local/a", name: "a" },
      { id: "media-source://media_source/local/a/b", name: "b" },
    ]);
  });

  it("does not invent crumbs for a folder outside the root", () => {
    expect(
      getMediaBreadcrumbs(
        "media-source://media_source/local/a",
        "media-source://media_source/local/b",
        "A"
      )
    ).toHaveLength(1);
  });

  it.each([
    "",
    ".",
    "..",
    ".hidden",
    "a/b",
    "a\\b",
    " x",
    "x ",
    "a\u0000b",
    "~x",
  ])("refuses the name %j", (name) => {
    expect(isValidMediaName(name)).toBe(false);
  });

  it("accepts ordinary names and refuses very long ones", () => {
    expect(isValidMediaName("Holiday 2026")).toBe(true);
    expect(isValidMediaName("x".repeat(255))).toBe(true);
    expect(isValidMediaName("x".repeat(256))).toBe(false);
  });

  it("counts the length of a name in bytes, as the server does", () => {
    expect(isValidMediaName("é".repeat(127))).toBe(true);
    expect(isValidMediaName("é".repeat(128))).toBe(false);
  });

  it("holds a folder removal to the counts the person confirmed", async () => {
    const callWS = vi.fn().mockResolvedValue({ files: 1, folders: 0 });
    await removeLocalMediaFolder(callWS as any, "media-source://x/a", true, {
      files: 1,
      folders: 0,
    });
    expect(callWS).toHaveBeenCalledWith({
      type: "media_source/local_source/remove_folder",
      media_content_id: "media-source://x/a",
      recursive: true,
      expected_files: 1,
      expected_folders: 0,
    });
    await removeLocalMediaFolder(callWS as any, "media-source://x/a", false);
    expect(callWS).toHaveBeenLastCalledWith({
      type: "media_source/local_source/remove_folder",
      media_content_id: "media-source://x/a",
      recursive: false,
    });
  });
});
