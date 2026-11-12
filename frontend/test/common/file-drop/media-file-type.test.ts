import { describe, expect, it } from "vitest";
import {
  mediaTypeFromName,
  withMediaType,
} from "../../../src/common/file-drop/media-file-type";

// Protects the upload type: a phone hands over an Ogg file without a type, and
// the server refuses an upload that is not typed as a picture, video or audio.

describe("withMediaType", () => {
  it("fills in audio/ogg for an Ogg file without a type", () => {
    const result = withMediaType(new File(["x"], "song.ogg", { type: "" }));
    expect(result.type).toBe("audio/ogg");
    expect(result.name).toBe("song.ogg");
  });

  it("returns a file that already has a media type as the same object", () => {
    const file = new File(["x"], "song.ogg", { type: "audio/mpeg" });
    expect(withMediaType(file)).toBe(file);
  });

  it("leaves an unknown extension unchanged", () => {
    const file = new File(["x"], "notes.xyz", { type: "" });
    expect(withMediaType(file)).toBe(file);
  });

  it("reads an upper-case extension", () => {
    expect(withMediaType(new File(["x"], "SONG.OGG", { type: "" })).type).toBe(
      "audio/ogg"
    );
  });

  it("leaves a name without an extension unchanged", () => {
    const file = new File(["x"], "README", { type: "" });
    expect(withMediaType(file)).toBe(file);
    expect(mediaTypeFromName("README")).toBeUndefined();
  });

  it("types a general file by its media name", () => {
    const file = new File(["x"], "clip.mp4", {
      type: "application/octet-stream",
    });
    expect(withMediaType(file).type).toBe("video/mp4");
  });
});
