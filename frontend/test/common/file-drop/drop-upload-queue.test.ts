import { afterEach, describe, expect, it, vi } from "vitest";
import { activityStore } from "../../../src/common/activity/activity-store";
import {
  DropUploadQueue,
  MEDIA_LIBRARY_CHANGED_EVENT,
} from "../../../src/common/file-drop/drop-upload-queue";
import type {
  DropUploadDeps,
  DropUploadJob,
  UploadApi,
} from "../../../src/common/file-drop/drop-upload-queue";
import type { PictureConverter } from "../../../src/common/file-drop/drop-convert";
import type { ShowToastParams } from "../../../src/managers/notification-manager";

// Protects the upload queue: drops upload one after another, a name that is
// already in the folder is never overwritten, one failed file does not stop the
// rest, Cancel stops the work, and the person is told exactly what happened.

const localize = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as any;

const makeFile = (name: string, type = "image/png") =>
  new File(["x"], name, { type });

interface Harness {
  queue: DropUploadQueue;
  toasts: ShowToastParams[];
  navigated: string[];
  uploads: { kind: string; name: string; target?: string }[];
  api: UploadApi;
}

const harness = (options: {
  existing?: string[];
  single?: boolean;
  fail?: Record<string, string>;
  delay?: () => Promise<void>;
  convert?: PictureConverter;
}): Harness => {
  const toasts: ShowToastParams[] = [];
  const navigated: string[] = [];
  const uploads: Harness["uploads"] = [];
  const api: UploadApi = {
    browse: vi.fn(async (_callWS: any, id?: string) =>
      id === "media-source://media_source"
        ? {
            title: "Media",
            media_class: "app",
            media_content_type: "",
            media_content_id: options.single
              ? "media-source://media_source/local/."
              : id,
            can_play: false,
            can_expand: true,
            children_media_class: "directory",
            thumbnail: null,
            children: [
              {
                title: "My media",
                media_class: "directory",
                media_content_type: "",
                media_content_id: "media-source://media_source/local/.",
                can_play: false,
                can_expand: true,
                children_media_class: null,
                thumbnail: null,
              },
            ],
          }
        : {
            title: "folder",
            media_class: "directory",
            media_content_type: "",
            media_content_id: id!,
            can_play: false,
            can_expand: true,
            children_media_class: null,
            thumbnail: null,
            children: (options.existing ?? []).map((title) => ({
              title,
              media_class: "image",
              media_content_type: "image/png",
              media_content_id: `${id}/${title}`,
              can_play: true,
              can_expand: false,
              children_media_class: null,
              thumbnail: null,
            })),
          }
    ) as any,
    media: vi.fn(async (_fetch: any, _l: any, target: string, file: File) => {
      await options.delay?.();
      if (options.fail?.[file.name]) {
        throw new Error(options.fail[file.name]);
      }
      uploads.push({ kind: "media", name: file.name, target });
      return { media_content_id: `${target}/${file.name}` };
    }) as any,
    convert: (options.convert ?? vi.fn()) as any,
    image: vi.fn(async (_fetch: any, _l: any, file: File) => {
      await options.delay?.();
      if (options.fail?.[file.name]) {
        throw new Error(options.fail[file.name]);
      }
      uploads.push({ kind: "image", name: file.name });
      return {} as any;
    }) as any,
  };
  const deps: DropUploadDeps = {
    hass: { callWS: vi.fn(), fetchWithAuth: vi.fn() } as any,
    localize,
    toast: (params) => toasts.push(params),
    navigate: (path) => navigated.push(path),
  };
  return {
    queue: new DropUploadQueue(() => deps, api),
    toasts,
    navigated,
    uploads,
    api,
  };
};

const job = (
  files: File[],
  extra: Partial<DropUploadJob> = {}
): DropUploadJob => ({
  target: "media",
  files,
  skipped: [],
  location: { inImageStore: false, player: "browser" },
  ...extra,
});

const settle = async (queue: DropUploadQueue) => {
  for (let i = 0; i < 50 && queue.length > 0; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

afterEach(() => activityStore.dismissFinished());

describe("uploading a drop", () => {
  it("adds every file to the library root and offers to show it", async () => {
    const h = harness({});
    const changed = vi.fn();
    window.addEventListener(MEDIA_LIBRARY_CHANGED_EVENT, changed);
    h.queue.enqueue(job([makeFile("a.png"), makeFile("b.png")]));
    await settle(h.queue);
    window.removeEventListener(MEDIA_LIBRARY_CHANGED_EVENT, changed);

    expect(h.uploads.map((u) => u.name)).toEqual(["a.png", "b.png"]);
    // The first media directory the server lists is the root.
    expect(h.uploads[0].target).toBe("media-source://media_source/local");
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].message).toContain("ui.drop_upload.files_added");
    expect(h.toasts[0].action?.text).toBe("ui.drop_upload.show_media");
    h.toasts[0].action!.action();
    expect(h.navigated[0]).toContain("/media-browser/browser/");
    expect(h.navigated[0]).toContain(
      encodeURIComponent("directory,media-source://media_source/local")
    );
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("uses the one media directory itself, not a folder inside it", async () => {
    const h = harness({ single: true });
    h.queue.enqueue(job([makeFile("a.png")]));
    await settle(h.queue);
    expect(h.uploads[0].target).toBe("media-source://media_source/local");
  });

  it("uploads into the open folder instead of the library", async () => {
    const h = harness({});
    h.queue.enqueue(
      job([makeFile("a.png")], {
        location: {
          folderId: "media-source://media_source/local/Music",
          folderName: "Music",
          inImageStore: false,
          player: "browser",
        },
      })
    );
    await settle(h.queue);
    expect(h.uploads[0].target).toBe("media-source://media_source/local/Music");
    expect(h.toasts[0].message).toContain("ui.drop_upload.file_added_folder");
  });

  it("never overwrites a name already in the folder, and says so", async () => {
    const h = harness({ existing: ["a.png"] });
    h.queue.enqueue(job([makeFile("a.png"), makeFile("b.png")]));
    await settle(h.queue);
    expect(h.uploads.map((u) => u.name)).toEqual(["b.png"]);
    const warning = h.toasts.find((toast) => toast.severity === "warning");
    expect(warning?.message).toContain("ui.drop_upload.skip.exists");
    expect(warning?.message).toContain("a.png");
  });

  it("carries on after one file fails and names the failure", async () => {
    const h = harness({ fail: { "b.png": "Too big for the server" } });
    h.queue.enqueue(
      job([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")])
    );
    await settle(h.queue);
    expect(h.uploads.map((u) => u.name)).toEqual(["a.png", "c.png"]);
    const success = h.toasts.find((toast) => toast.action);
    expect(success?.message).toContain("ui.drop_upload.some_added");
    const warning = h.toasts.find((toast) => toast.severity === "warning");
    expect(warning?.message).toContain("Too big for the server");
    expect(warning?.message).toContain("b.png");
  });

  it("reports files skipped before the upload even when none are sent", () => {
    const h = harness({});
    h.queue.reportSkipped([{ name: "x.txt", reason: "not_media" }]);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].severity).toBe("warning");
    expect(h.api.media).not.toHaveBeenCalled();
  });

  it("sends pictures to the image store and offers Show images", async () => {
    const h = harness({});
    h.queue.enqueue(job([makeFile("a.png")], { target: "image" }));
    await settle(h.queue);
    expect(h.uploads).toEqual([{ kind: "image", name: "a.png" }]);
    expect(h.api.browse).not.toHaveBeenCalled();
    expect(h.toasts[0].action?.text).toBe("ui.drop_upload.show_images");
    h.toasts[0].action!.action();
    expect(h.navigated[0]).toBe(
      `/media-browser/browser/${encodeURIComponent("app,media-source://image_upload")}`
    );
  });
});

describe("several drops", () => {
  it("wait their turn and each gets its own tray entry", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const h = harness({
      delay: async () => {
        if (first) {
          first = false;
          await gate;
        }
      },
    });
    const before = activityStore.activities.length;
    const idOne = h.queue.enqueue(job([makeFile("a.png")]));
    const idTwo = h.queue.enqueue(job([makeFile("b.png")]));
    expect(activityStore.activities.length).toBe(before + 2);
    expect(h.queue.length).toBe(2);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // The second has not started: nothing uploaded yet, and it says it waits.
    expect(h.uploads).toEqual([]);
    expect(activityStore.get(idTwo)?.status).toBe(
      "ui.drop_upload.activity_waiting"
    );
    release();
    await settle(h.queue);
    expect(h.uploads.map((u) => u.name)).toEqual(["a.png", "b.png"]);
    expect(activityStore.get(idOne)?.state).toBe("done");
    expect(activityStore.get(idTwo)?.state).toBe("done");
  });

  it("stops a waiting drop when its Cancel is pressed, uploading nothing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const h = harness({
      delay: async () => {
        if (first) {
          first = false;
          await gate;
        }
      },
    });
    h.queue.enqueue(job([makeFile("a.png")]));
    const waiting = h.queue.enqueue(job([makeFile("b.png")]));
    await activityStore.get(waiting)!.cancel!();
    release();
    await settle(h.queue);
    expect(h.uploads.map((u) => u.name)).toEqual(["a.png"]);
    expect(activityStore.get(waiting)?.state).toBe("cancelled");
  });
});

const blobOf = (bytes: number, type: string) =>
  new Blob([new Uint8Array(bytes)], { type });

const okResult = (bytes: number, type: string, flattened = false) => ({
  ok: true as const,
  blob: blobOf(bytes, type),
  width: 100,
  height: 80,
  sourceWidth: 100,
  sourceHeight: 80,
  flattened,
});

const convertPlan = (limit = 1000) =>
  ({ action: "convert", from: "webp", limit, why: "type" }) as const;

describe("converting before storing", () => {
  it("converts, stores the new name and says what changed", async () => {
    const convert = vi.fn(async () => okResult(10, "image/png"));
    const h = harness({ convert });
    h.queue.enqueue(
      job([makeFile("holiday.webp", "image/webp")], {
        target: "image",
        conversions: { 0: convertPlan() },
      })
    );
    await settle(h.queue);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(h.uploads).toEqual([{ kind: "image", name: "holiday.png" }]);
    expect(h.toasts[0].message).toContain("ui.drop_upload.converted");
    expect(h.toasts[0].message).toContain("holiday.webp");
    expect(h.toasts[0].message).toContain('"from":"WebP","to":"PNG"');
  });

  it("states a resize and reduced quality when the picture was shrunk", async () => {
    const convert = vi
      .fn()
      .mockResolvedValueOnce(okResult(5000, "image/jpeg"))
      .mockResolvedValueOnce({
        ...okResult(500, "image/jpeg"),
        width: 50,
        height: 40,
      });
    const h = harness({ convert });
    h.queue.enqueue(
      job([makeFile("big.jpg", "image/jpeg")], {
        target: "image",
        conversions: {
          0: { action: "convert", from: "jpeg", limit: 1000, why: "size" },
        },
      })
    );
    await settle(h.queue);
    expect(h.uploads).toEqual([{ kind: "image", name: "big.jpg" }]);
    const message = h.toasts[0].message as string;
    expect(message).toContain("ui.drop_upload.loss_resized");
    expect(message).toContain("ui.drop_upload.loss_quality");
  });

  it("skips a file whose conversion fails and still stores the others", async () => {
    const convert = vi.fn(async () => ({
      ok: false as const,
      error: { code: "image_too_large" },
    }));
    const h = harness({ convert });
    h.queue.enqueue(
      job([makeFile("huge.webp", "image/webp"), makeFile("b.png")], {
        target: "image",
        conversions: { 0: convertPlan() },
      })
    );
    await settle(h.queue);
    expect(h.uploads.map((u) => u.name)).toEqual(["b.png"]);
    const warning = h.toasts.find((toast) => toast.severity === "warning");
    expect(warning?.message).toContain("ui.drop_upload.skip.convert_failed");
    expect(warning?.message).toContain("image_too_large");
  });

  it("skips a picture that is still too large after every step", async () => {
    const convert = vi.fn(async () => okResult(5000, "image/jpeg"));
    const h = harness({ convert });
    h.queue.enqueue(
      job([makeFile("big.jpg", "image/jpeg")], {
        target: "image",
        conversions: {
          0: { action: "convert", from: "jpeg", limit: 1000, why: "size" },
        },
      })
    );
    await settle(h.queue);
    expect(h.uploads).toEqual([]);
    const text = JSON.stringify(h.toasts);
    expect(text).toContain("still_too_large");
  });

  it("does not overwrite a name taken by the converted file", async () => {
    const convert = vi.fn(async () => okResult(10, "image/png"));
    const h = harness({ convert, existing: ["holiday.png"] });
    h.queue.enqueue(
      job([makeFile("holiday.webp", "image/webp")], {
        conversions: { 0: convertPlan() },
      })
    );
    await settle(h.queue);
    expect(h.uploads).toEqual([]);
    const text = JSON.stringify(h.toasts);
    expect(text).toContain("ui.drop_upload.skip.exists");
    expect(text).not.toContain("ui.drop_upload.converted");
  });

  it("shows Converting in the tray before the upload", async () => {
    const seen: string[] = [];
    const unsubscribe = activityStore.subscribe(() => {
      const status = activityStore.activities[0]?.status;
      if (status && seen[seen.length - 1] !== status) {
        seen.push(status);
      }
    });
    const convert = vi.fn(async () => okResult(10, "image/png"));
    const h = harness({ convert });
    h.queue.enqueue(
      job([makeFile("a.webp", "image/webp")], {
        target: "image",
        conversions: { 0: convertPlan() },
      })
    );
    await settle(h.queue);
    unsubscribe();
    const converting = seen.findIndex((t) =>
      t.startsWith("ui.drop_upload.activity_converting")
    );
    const uploading = seen.findIndex((t) =>
      t.startsWith("ui.drop_upload.activity_uploading")
    );
    expect(converting).toBeGreaterThanOrEqual(0);
    expect(uploading).toBeGreaterThan(converting);
  });
});
