import { describe, expect, it } from "vitest";
import type { Capabilities } from "../../../src/common/converter/capabilities";
import {
  convertTargets,
  sourceOf,
} from "../../../src/common/media-manage/convert-item";
import {
  extensionChanged,
  isValidImageName,
  nameTaken,
  uniqueName,
} from "../../../src/common/media-manage/names";

const CAPS: Capabilities = {
  compression: true,
  gzip: true,
  audioDecode: true,
  webm: true,
  mp4: true,
  video: true,
  canvas: true,
  xml: true,
};

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

describe("names", () => {
  it("tells a changed extension, ignoring letter case", () => {
    expect(extensionChanged("a.PNG", "b.png")).toBe(false);
    expect(extensionChanged("a.png", "a.jpg")).toBe(true);
    expect(extensionChanged("a", "a.png")).toBe(true);
  });

  it("finds a taken name in any letter case, except the item itself", () => {
    expect(nameTaken("A.png", ["a.png", "b.png"])).toBe(true);
    expect(nameTaken("a.PNG", ["a.png"], "a.png")).toBe(false);
  });

  it("keeps names in a zip apart", () => {
    const used = new Set<string>();
    expect(uniqueName("a.png", used)).toBe("a.png");
    expect(uniqueName("a.png", used)).toBe("a (2).png");
    expect(uniqueName("a.png", used)).toBe("a (3).png");
  });

  it("checks image names", () => {
    expect(isValidImageName("holiday.png")).toBe(true);
    expect(isValidImageName("")).toBe(false);
    expect(isValidImageName("a/b.png")).toBe(false);
    expect(isValidImageName(" a.png")).toBe(false);
    expect(isValidImageName("a\u0000.png")).toBe(false);
  });
});

describe("what an item can be converted to", () => {
  it("offers only the picture types the image store keeps", () => {
    const source = sourceOf(PNG)!;
    expect(convertTargets(source, "image", CAPS)).toEqual(["jpeg"]);
  });

  it("offers more for the media library, never the type it already is", () => {
    const source = sourceOf(PNG)!;
    expect(convertTargets(source, "media", CAPS)).toEqual(["jpeg", "webp"]);
  });

  it("offers nothing for a file that is not a picture, sound or video", () => {
    expect(sourceOf(new TextEncoder().encode("hello"))).toBeUndefined();
  });

  it("leaves out a format this browser cannot write", () => {
    const source = sourceOf(PNG)!;
    expect(convertTargets(source, "media", { ...CAPS, canvas: false })).toEqual(
      []
    );
  });
});
