import { describe, expect, it } from "vitest";
import {
  mediaBrowserPathForFolder,
  mediaBrowserPathForImages,
  mediaLocationFromPath,
} from "../../../src/common/file-drop/media-target";

// Protects where a media drop lands (the folder open in the Media browser, or
// the library) and the address the "Show in Media" button opens.

const enc = (type: string, id: string) => encodeURIComponent(`${type},${id}`);

describe("where the person is", () => {
  it("is the library on any page but the Media browser", () => {
    expect(mediaLocationFromPath("/lovelace/0")).toEqual({
      inImageStore: false,
      player: "browser",
    });
    expect(mediaLocationFromPath("/media-browser/browser")).toEqual({
      inImageStore: false,
      player: "browser",
    });
  });

  it("is the folder open in the Media browser", () => {
    const path = `/media-browser/browser/${enc("app", "media-source://media_source")}/${enc("directory", "media-source://media_source/local")}/${enc("directory", "media-source://media_source/local/Music/Live")}`;
    expect(mediaLocationFromPath(path)).toEqual({
      folderId: "media-source://media_source/local/Music/Live",
      folderName: "Live",
      inImageStore: false,
      player: "browser",
    });
  });

  it("treats a media directory as the library, not a named folder", () => {
    const path = `/media-browser/media_player.kitchen/${enc("app", "media-source://media_source")}/${enc("", "media-source://media_source/local/.")}`;
    expect(mediaLocationFromPath(path)).toEqual({
      folderId: "media-source://media_source/local",
      folderName: undefined,
      inImageStore: false,
      player: "media_player.kitchen",
    });
  });

  it("does not count the list of media directories as a folder", () => {
    const path = `/media-browser/browser/${enc("app", "media-source://media_source")}`;
    expect(mediaLocationFromPath(path).folderId).toBeUndefined();
  });

  it("knows the image store", () => {
    const path = `/media-browser/browser/${enc("app", "media-source://image_upload")}`;
    expect(mediaLocationFromPath(path)).toEqual({
      inImageStore: true,
      player: "browser",
    });
  });

  it("survives an address that cannot be decoded", () => {
    expect(mediaLocationFromPath("/media-browser/browser/%E0%A4%A")).toEqual({
      inImageStore: false,
      player: "browser",
    });
  });
});

describe("the addresses the buttons open", () => {
  it("opens a folder one level at a time", () => {
    expect(
      mediaBrowserPathForFolder(
        "browser",
        "media-source://media_source/local/Music/"
      )
    ).toBe(
      `/media-browser/browser/${enc("app", "media-source://media_source")}/${enc("directory", "media-source://media_source/local")}/${enc("directory", "media-source://media_source/local/Music")}`
    );
  });

  it("opens the image store", () => {
    expect(mediaBrowserPathForImages("browser")).toBe(
      `/media-browser/browser/${enc("app", "media-source://image_upload")}`
    );
  });

  it("opens an image folder one level at a time", () => {
    expect(mediaBrowserPathForImages("browser", "Holiday/2026")).toBe(
      `/media-browser/browser/${enc("app", "media-source://image_upload")}/${enc("directory", "media-source://image_upload/folder/Holiday")}/${enc("directory", "media-source://image_upload/folder/Holiday/2026")}`
    );
  });

  it("round-trips an image folder", () => {
    expect(
      mediaLocationFromPath(
        mediaBrowserPathForImages("browser", "Holiday/2026")
      )
    ).toEqual({
      inImageStore: true,
      player: "browser",
      imageFolder: "Holiday/2026",
      imageFolderName: "2026",
    });
    expect(mediaLocationFromPath(mediaBrowserPathForImages("browser"))).toEqual(
      { inImageStore: true, player: "browser" }
    );
  });

  it("round-trips: the address of a folder reads back as that folder", () => {
    const id = "media-source://media_source/local/Photos/2026";
    expect(
      mediaLocationFromPath(mediaBrowserPathForFolder("browser", id))
    ).toMatchObject({ folderId: id, folderName: "2026" });
  });
});
