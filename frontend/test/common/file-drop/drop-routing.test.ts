import { describe, expect, it } from "vitest";
import {
  classifyType,
  describeDrag,
  IMAGE_MAX_BYTES,
  MEDIA_MAX_BYTES,
  routeDrop,
} from "../../../src/common/file-drop/drop-routing";
import type {
  DropContext,
  DroppedFileInfo,
} from "../../../src/common/file-drop/drop-routing";

// Protects the rule that decides what a dropped file does: a wording or
// dashboard file keeps its old path, media goes to an administrator's upload,
// a page that took the drop is never overridden, and nothing the server would
// refuse is sent.

const file = (name: string, type: string, size = 1000): DroppedFileInfo => ({
  name,
  type,
  size,
});

const admin: DropContext = { claimed: false, isAdmin: true, zone: "media" };

describe("what counts as media", () => {
  it("goes by the reported type, never by the name", () => {
    expect(classifyType("image/png")).toBe("image");
    expect(classifyType("VIDEO/MP4")).toBe("video");
    expect(classifyType("audio/mpeg")).toBe("audio");
    expect(classifyType("application/json")).toBe("other");
    expect(classifyType("")).toBe("other");
    // A name that looks like a picture is nothing without the type.
    expect(routeDrop([file("holiday.png", "")], admin)).toEqual({
      action: "legacy",
    });
  });
});

describe("a drop that is not media", () => {
  it("keeps the dashboard and wording path for a JSON file", () => {
    expect(routeDrop([file("words.json", "application/json")], admin)).toEqual({
      action: "legacy",
    });
  });

  it("keeps the older path for a dashboard file, on any page", () => {
    // The router has no page in its input: a dashboard file is routed the same
    // on the Dashboards page and everywhere else.
    expect(
      routeDrop([file("home.dashboard.json", "application/json")], admin)
    ).toEqual({ action: "legacy" });
    expect(routeDrop([file("home.yaml", "")], admin)).toEqual({
      action: "legacy",
    });
  });

  it("keeps the older path for several non-media files", () => {
    expect(
      routeDrop(
        [file("a.json", "application/json"), file("b.txt", "text/plain")],
        admin
      )
    ).toEqual({ action: "legacy" });
  });

  it("sends the old path to everyone, not only administrators", () => {
    expect(
      routeDrop([file("w.json", "application/json")], {
        ...admin,
        isAdmin: false,
      })
    ).toEqual({ action: "legacy" });
  });
});

describe("a drop with nothing to do", () => {
  it("ignores a drag with no files", () => {
    expect(routeDrop([], admin)).toEqual({ action: "ignore" });
  });

  it("leaves a drop to the page that took it", () => {
    expect(
      routeDrop([file("a.png", "image/png")], { ...admin, claimed: true })
    ).toEqual({ action: "ignore" });
    expect(
      routeDrop([file("w.json", "application/json")], {
        ...admin,
        claimed: true,
      })
    ).toEqual({ action: "ignore" });
  });
});

describe("a media drop by an administrator", () => {
  it("uploads pictures, video and audio to the media library", () => {
    const decision = routeDrop(
      [
        file("a.png", "image/png"),
        file("b.mp4", "video/mp4"),
        file("c.mp3", "audio/mpeg"),
      ],
      admin
    );
    expect(decision).toEqual({
      action: "upload",
      target: "media",
      accepted: [0, 1, 2],
      skipped: [],
    });
  });

  it("skips a mixed drop's other files with a reason", () => {
    const decision = routeDrop(
      [file("a.png", "image/png"), file("notes.txt", "text/plain")],
      admin
    );
    expect(decision).toEqual({
      action: "upload",
      target: "media",
      accepted: [0],
      skipped: [{ name: "notes.txt", reason: "not_media" }],
    });
  });

  it("skips a file larger than the media limit", () => {
    const decision = routeDrop(
      [
        file("big.mp4", "video/mp4", MEDIA_MAX_BYTES + 1),
        file("edge.mp4", "video/mp4", MEDIA_MAX_BYTES),
      ],
      admin
    );
    expect(decision).toMatchObject({
      accepted: [1],
      skipped: [
        { name: "big.mp4", reason: "too_large", limit: MEDIA_MAX_BYTES },
      ],
    });
  });

  it("skips a second file with a name already in the drop", () => {
    const decision = routeDrop(
      [file("a.png", "image/png"), file("a.png", "image/png")],
      admin
    );
    expect(decision).toMatchObject({
      accepted: [0],
      skipped: [{ name: "a.png", reason: "duplicate" }],
    });
  });

  it("accepts nothing when every file is refused", () => {
    expect(
      routeDrop([file("big.png", "image/png", MEDIA_MAX_BYTES + 5)], admin)
    ).toMatchObject({ action: "upload", accepted: [] });
  });
});

describe("a drop on the image store", () => {
  const image: DropContext = { ...admin, zone: "image" };

  it("keeps JPEG, PNG and GIF and re-encodes one above its smaller limit", () => {
    const decision = routeDrop(
      [
        file("a.jpg", "image/jpeg"),
        file("b.png", "image/png"),
        file("c.gif", "image/gif"),
        file("big.png", "image/png", IMAGE_MAX_BYTES + 1),
      ],
      image
    );
    expect(decision).toEqual({
      action: "upload",
      target: "image",
      accepted: [0, 1, 2, 3],
      skipped: [],
      conversions: {
        3: {
          action: "convert",
          from: "png",
          limit: IMAGE_MAX_BYTES,
          why: "size",
        },
      },
    });
  });

  it("converts WebP and skips a picture type nothing here can read", () => {
    const decision = routeDrop(
      [file("a.webp", "image/webp"), file("b.svg", "image/svg+xml")],
      image
    );
    expect(decision).toMatchObject({
      accepted: [0],
      skipped: [{ name: "b.svg", reason: "cannot_convert" }],
      conversions: { 0: { action: "convert", from: "webp", why: "type" } },
    });
  });

  it("never flattens an animated GIF that is too large", () => {
    expect(
      routeDrop([file("a.gif", "image/gif", IMAGE_MAX_BYTES + 1)], image)
    ).toMatchObject({
      accepted: [],
      skipped: [{ name: "a.gif", reason: "too_large", limit: IMAGE_MAX_BYTES }],
    });
  });

  it("skips a video dropped on the image zone", () => {
    expect(routeDrop([file("v.mp4", "video/mp4")], image)).toMatchObject({
      accepted: [],
      skipped: [{ reason: "image_type" }],
    });
  });
});

describe("a media drop by someone who may not add media", () => {
  it("gets one message and nothing is uploaded", () => {
    expect(
      routeDrop([file("a.png", "image/png"), file("b.png", "image/png")], {
        ...admin,
        isAdmin: false,
      })
    ).toEqual({ action: "admin_only", count: 2 });
  });
});

describe("describing a drag in progress", () => {
  it("offers the media overlay for media types", () => {
    expect(describeDrag(["video/mp4", "text/plain"], true)).toEqual({
      mode: "media",
      mediaCount: 1,
      total: 2,
      offerImageStore: false,
    });
  });

  it("offers the image store only when every file is a picture", () => {
    expect(describeDrag(["image/png", "image/gif"], true)).toMatchObject({
      mode: "media",
      offerImageStore: true,
    });
    expect(describeDrag(["image/png", "image/webp"], true)).toMatchObject({
      offerImageStore: true,
    });
    expect(describeDrag(["image/png", "video/mp4"], true)).toMatchObject({
      offerImageStore: false,
    });
  });

  it("keeps the older indicator for a JSON file or an unknown type", () => {
    expect(describeDrag(["application/json"], true).mode).toBe("legacy");
    expect(describeDrag([""], true).mode).toBe("legacy");
    expect(describeDrag([], true).mode).toBe("legacy");
  });

  it("shows nothing new to someone who may not add media", () => {
    expect(describeDrag(["image/png"], false)).toMatchObject({
      mode: "legacy",
      offerImageStore: false,
    });
  });
});
