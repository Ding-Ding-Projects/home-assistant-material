import { describe, expect, it } from "vitest";
import {
  getMediaBreadcrumbs,
  isMediaSourceRoot,
  isValidMediaName,
  normalizeMediaFolderId,
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
});
