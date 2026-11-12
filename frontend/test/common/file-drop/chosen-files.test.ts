import { describe, expect, it } from "vitest";
import { planChosenFiles } from "../../../src/common/file-drop/chosen-files";

// Protects the picker rule: every file can be chosen, what is not a picture,
// video or audio file is refused before anything is sent, and the related
// files of the same choice still go.

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("planChosenFiles", () => {
  it("sends an Ogg file with no type, typed from its name", () => {
    const plan = planChosenFiles([file("song.ogg")], "media");
    expect(plan.skipped).toEqual([]);
    expect(plan.items.map((item) => item.file.type)).toEqual(["audio/ogg"]);
  });

  it("refuses a file that is not media and names it", () => {
    const plan = planChosenFiles(
      [file("notes.pdf", "application/pdf")],
      "media"
    );
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([{ name: "notes.pdf", reason: "not_media" }]);
  });

  it("refuses unrelated files when none is media", () => {
    const plan = planChosenFiles([file("a.txt"), file("b.zip")], "media");
    expect(plan.items).toEqual([]);
    expect(plan.skipped.map((s) => s.name)).toEqual(["a.txt", "b.zip"]);
  });

  it("sends the related files of a mixed choice and refuses the rest", () => {
    const plan = planChosenFiles(
      [file("a.txt"), file("song.ogg"), file("photo.png", "image/png")],
      "media"
    );
    expect(plan.items.map((item) => item.file.name)).toEqual([
      "song.ogg",
      "photo.png",
    ]);
    expect(plan.skipped).toEqual([{ name: "a.txt", reason: "not_media" }]);
  });

  it("refuses a video for the image store", () => {
    const plan = planChosenFiles([file("clip.mp4", "video/mp4")], "image");
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([{ name: "clip.mp4", reason: "image_type" }]);
  });

  it("marks a picture type the image store does not take for conversion", () => {
    const plan = planChosenFiles([file("photo.webp", "image/webp")], "image");
    expect(plan.skipped).toEqual([]);
    expect(plan.items[0].conversion).toMatchObject({
      action: "convert",
      from: "webp",
      why: "type",
    });
  });

  it("keeps a picture the image store takes as it is", () => {
    const plan = planChosenFiles([file("photo.jpg", "image/jpeg")], "image");
    expect(plan.items[0].conversion).toBeUndefined();
  });
});
