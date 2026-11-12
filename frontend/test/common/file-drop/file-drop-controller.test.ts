import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.fn();
const reportSkipped = vi.fn();
const importWordingFile = vi.fn(async () => ({ ok: true, count: 1 }) as const);
const reportWordingImport = vi.fn();
const handleDroppedDashboardFile = vi.fn(async () => false);
const showToast = vi.fn();

vi.mock("../../../src/common/file-drop/drop-upload-queue", () => ({
  MEDIA_LIBRARY_CHANGED_EVENT: "media-library-changed",
  DropUploadQueue: class {
    public enqueue = enqueue;

    public reportSkipped = reportSkipped;
  },
}));
vi.mock("../../../src/common/vocabulary/wording-import", () => ({
  importWordingFile: (...args: unknown[]) => importWordingFile(...(args as [])),
  looksLikeWordingFile: (file: File) => file.name.endsWith(".json"),
  reportWordingImport: (...args: unknown[]) => reportWordingImport(...args),
}));
vi.mock(
  "../../../src/panels/lovelace/import-export/dashboard-file-import",
  () => ({
    handleDroppedDashboardFile: (...args: unknown[]) =>
      handleDroppedDashboardFile(...(args as [])),
  })
);
vi.mock("../../../src/util/toast", () => ({
  showToast: (...args: unknown[]) => showToast(...args),
}));
vi.mock("../../../src/common/navigate", () => ({ navigate: vi.fn() }));

const dropModule =
  await import("../../../src/common/file-drop/file-drop-controller");

// Protects the single drop router on the window: a media file is queued, the
// older wording and dashboard path still runs for the files it ran for, and a
// page that already took the drop is left alone.

const localize = (key: string) => key;

const file = (name: string, type: string) => new File(["x"], name, { type });

const dragEvent = (
  type: string,
  files: File[],
  options: { prevent?: boolean; itemTypes?: string[] } = {}
): Event => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const types = files.length ? ["Files"] : ["text/plain"];
  Object.defineProperty(ev, "dataTransfer", {
    value: {
      types,
      files,
      items: (options.itemTypes ?? files.map((f) => f.type)).map((t) => ({
        kind: "file",
        type: t,
      })),
    },
  });
  Object.defineProperty(ev, "clientX", { value: 10 });
  Object.defineProperty(ev, "clientY", { value: 10 });
  if (options.prevent) {
    ev.preventDefault();
  }
  return ev;
};

let controller: InstanceType<typeof dropModule.FileDropController>;
let element: HTMLElement;
let isAdmin = true;

beforeEach(() => {
  isAdmin = true;
  element = document.createElement("div");
  document.body.append(element);
  controller = new dropModule.FileDropController(() => ({
    hass: { user: { is_admin: isAdmin }, localize } as any,
    element,
  }));
  controller.connect();
});

afterEach(() => {
  controller.disconnect();
  element.remove();
  vi.clearAllMocks();
});

const drop = async (files: File[], options = {}) => {
  const ev = dragEvent("drop", files, options);
  window.dispatchEvent(ev);
  // The drop handler is async.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  return ev;
};

describe("dragging", () => {
  it("accepts a file drag and shows the media overlay for a picture", () => {
    const ev = dragEvent("dragover", [file("a.png", "image/png")]);
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.querySelector("ha-drop-upload-overlay")).not.toBeNull();
    expect(document.querySelector("ha-file-drop-indicator")).toBeNull();
  });

  it("ignores a drag that carries no files", () => {
    const ev = dragEvent("dragover", []);
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector("ha-drop-upload-overlay")).toBeNull();
    expect(document.querySelector("ha-file-drop-indicator")).toBeNull();
  });

  it("keeps the older indicator for a JSON file", () => {
    window.dispatchEvent(
      dragEvent("dragover", [file("w.json", "application/json")])
    );
    expect(document.querySelector("ha-drop-upload-overlay")).toBeNull();
    expect(document.querySelector("ha-file-drop-indicator")).not.toBeNull();
  });

  it("shows no overlay over a page that took the drag", () => {
    window.dispatchEvent(
      dragEvent("dragover", [file("a.png", "image/png")], { prevent: true })
    );
    expect(document.querySelector("ha-drop-upload-overlay")).toBeNull();
  });

  it("takes the overlay down at once when a page stops the event", async () => {
    const page = document.createElement("div");
    element.append(page);
    page.addEventListener("dragover", (ev) => ev.stopPropagation());
    window.dispatchEvent(dragEvent("dragover", [file("a.png", "image/png")]));
    expect(document.querySelector("ha-drop-upload-overlay")).not.toBeNull();
    // A second event goes to a page that stops it before the window.
    const ev = dragEvent("dragover", [file("a.png", "image/png")]);
    page.dispatchEvent(ev);
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(document.querySelector("ha-drop-upload-overlay")).toBeNull();
  });

  it("removes the overlay on Escape", () => {
    window.dispatchEvent(dragEvent("dragover", [file("a.png", "image/png")]));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector("ha-drop-upload-overlay")).toBeNull();
  });

  it("shows nothing new to someone who may not add media", () => {
    isAdmin = false;
    window.dispatchEvent(dragEvent("dragover", [file("a.png", "image/png")]));
    expect(document.querySelector("ha-drop-upload-overlay")).toBeNull();
  });
});

describe("dropping", () => {
  it("queues a picture for upload and never imports it as wording", async () => {
    const ev = await drop([file("a.png", "image/png")]);
    expect(ev.defaultPrevented).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({ target: "media" });
    expect(importWordingFile).not.toHaveBeenCalled();
    expect(handleDroppedDashboardFile).not.toHaveBeenCalled();
  });

  it("still sends a single JSON file through the dashboard then wording import", async () => {
    await drop([file("w.json", "application/json")]);
    expect(handleDroppedDashboardFile).toHaveBeenCalledTimes(1);
    expect(importWordingFile).toHaveBeenCalledTimes(1);
    expect(reportWordingImport).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("leaves a dashboard file to the dashboard import", async () => {
    handleDroppedDashboardFile.mockResolvedValueOnce(true);
    await drop([file("home.json", "application/json")]);
    expect(importWordingFile).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does nothing for a drop a page already took", async () => {
    await drop([file("a.png", "image/png")], { prevent: true });
    expect(enqueue).not.toHaveBeenCalled();
    expect(importWordingFile).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("does not touch a drop of text", async () => {
    const ev = await drop([]);
    expect(ev.defaultPrevented).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("gives someone who may not add media one calm message, no upload", async () => {
    isAdmin = false;
    await drop([file("a.png", "image/png")]);
    expect(enqueue).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][1].message).toBe(
      "ui.drop_upload.admin_only"
    );
  });

  it("lists every file as skipped when none can be sent", async () => {
    await drop([file("big.png", "image/png"), file("notes.txt", "text/plain")]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].files.map((f: File) => f.name)).toEqual([
      "big.png",
    ]);
    expect(enqueue.mock.calls[0][0].skipped).toEqual([
      { name: "notes.txt", reason: "not_media" },
    ]);
  });

  it("reports the skipped files when nothing at all is sent", async () => {
    const big = file("big.mp4", "video/mp4");
    Object.defineProperty(big, "size", { value: 3 * 1024 * 1024 * 1024 });
    await drop([big]);
    expect(enqueue).not.toHaveBeenCalled();
    expect(reportSkipped).toHaveBeenCalledTimes(1);
    expect(reportSkipped.mock.calls[0][0]).toMatchObject([
      { name: "big.mp4", reason: "too_large" },
    ]);
  });
});

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const pasteEvent = (files: File[], target: HTMLElement) => {
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: { files } });
  target.dispatchEvent(ev);
  return ev;
};

describe("choosing files with the picker", () => {
  const chooseThroughPicker = (files: File[]) => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", { value: files });
        this.dispatchEvent(new Event("change"));
      });
    return click;
  };

  it("sends chosen video straight to the media library through the queue", async () => {
    const click = chooseThroughPicker([file("clip.mp4", "video/mp4")]);
    const { pickFilesToAdd } =
      await import("../../../src/common/file-drop/add-media");
    await pickFilesToAdd();
    click.mockRestore();
    expect(document.querySelector("ha-add-media-sheet")).toBeNull();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({ target: "media" });
  });

  it("asks where pictures go and honours the choice", async () => {
    const click = chooseThroughPicker([file("a.webp", "image/webp")]);
    const { pickFilesToAdd } =
      await import("../../../src/common/file-drop/add-media");
    const picked = pickFilesToAdd();
    await tick();
    const sheet = document.querySelector("ha-add-media-sheet")!;
    expect(sheet).not.toBeNull();
    expect((sheet as any).zones.map((zone: any) => zone.id)).toEqual([
      "media",
      "image",
    ]);
    sheet.dispatchEvent(
      new CustomEvent("add-media-zone-chosen", { detail: { zone: "image" } })
    );
    await picked;
    click.mockRestore();
    expect(document.querySelector("ha-add-media-sheet")).toBeNull();
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      target: "image",
      conversions: { 0: { action: "convert", from: "webp" } },
    });
  });

  it("adds nothing when the sheet is closed without a choice", async () => {
    const click = chooseThroughPicker([file("a.png", "image/png")]);
    const { pickFilesToAdd } =
      await import("../../../src/common/file-drop/add-media");
    const picked = pickFilesToAdd();
    await tick();
    document
      .querySelector("ha-add-media-sheet")!
      .dispatchEvent(new CustomEvent("add-media-sheet-closed"));
    await picked;
    click.mockRestore();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("adds nothing when the picker is cancelled", async () => {
    const click = chooseThroughPicker([]);
    const { pickFilesToAdd } =
      await import("../../../src/common/file-drop/add-media");
    await pickFilesToAdd();
    click.mockRestore();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("tells a person who may not add media instead of uploading", async () => {
    isAdmin = false;
    const click = chooseThroughPicker([file("clip.mp4", "video/mp4")]);
    const { pickFilesToAdd } =
      await import("../../../src/common/file-drop/add-media");
    await pickFilesToAdd();
    click.mockRestore();
    expect(enqueue).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe("pasting files", () => {
  it("adds a pasted video through the same queue", async () => {
    const ev = pasteEvent([file("clip.mp4", "video/mp4")], document.body);
    await tick();
    expect(ev.defaultPrevented).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("leaves a paste inside a text field alone", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    const ev = pasteEvent([file("a.png", "image/png")], input);
    await tick();
    input.remove();
    expect(ev.defaultPrevented).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(document.querySelector("ha-add-media-sheet")).toBeNull();
  });

  it("leaves a paste a page already handled alone", async () => {
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: { files: [file("a.mp4", "video/mp4")] },
    });
    window.addEventListener("paste", (e) => e.preventDefault(), {
      capture: true,
      once: true,
    });
    document.body.dispatchEvent(ev);
    await tick();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does nothing for someone who may not add media", async () => {
    isAdmin = false;
    pasteEvent([file("clip.mp4", "video/mp4")], document.body);
    await tick();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
