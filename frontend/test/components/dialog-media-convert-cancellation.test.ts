import { afterEach, describe, expect, it, vi } from "vitest";
import { convertItem } from "../../src/common/media-manage/convert-item";
import { createImage } from "../../src/data/image_upload";
import "../../src/components/media-player/dialog-media-convert";

vi.mock("../../src/common/media-manage/convert-item", () => ({
  convertItem: vi.fn(),
  convertTargets: vi.fn(),
  sourceOf: vi.fn(),
}));
vi.mock("../../src/data/image_upload", () => ({
  createImage: vi.fn(),
  getIdFromUrl: vi.fn(),
}));
vi.mock("../../src/data/media_source", () => ({
  uploadLocalMedia: vi.fn(),
  isImageUploadMediaSourceContentId: vi.fn(),
  resolveMediaSource: vi.fn(),
}));

const success = () => ({
  ok: true as const,
  file: new File(["converted"], "original.png", { type: "image/png" }),
  notes: [],
});
const setup = () => {
  const dialog = document.createElement("dialog-media-convert");
  const state = dialog as unknown as Record<string, unknown>;
  const onStored = vi.fn();
  Object.defineProperty(dialog, "_localize", {
    get: () => (key: string) => key,
  });
  Object.assign(state, {
    _params: {
      item: { title: "original.jpg" },
      store: "image",
      destination: "",
      existingNames: [],
      onStored,
    },
    _bytes: new Uint8Array([1]),
    _source: { kind: "image", sniffed: "jpeg" },
    _target: "png",
    _open: true,
    _baseLocalize: (key: string) => key,
    _api: { fetchWithAuth: vi.fn() },
  });
  const convert = () => (state._convert as () => Promise<void>).call(dialog);
  const cancel = () => (state._cancel as () => void)();
  return { state, convert, cancel, onStored };
};
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("conversion cancellation boundaries", () => {
  it("never starts upload when a cancelled conversion resolves later", async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    vi.mocked(convertItem).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { state, convert, cancel, onStored } = setup();
    const pending = convert();
    await Promise.resolve();
    cancel();
    await pending;
    finish(success());
    await Promise.resolve();
    expect(createImage).not.toHaveBeenCalled();
    expect(onStored).not.toHaveBeenCalled();
    expect(state._working).toBe(false);
  });
  it("aborts upload and shows an honest server-outcome warning", async () => {
    vi.mocked(convertItem).mockResolvedValue(success());
    let entered!: () => void;
    const uploading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(createImage).mockImplementation(() => {
      entered();
      return new Promise(() => {
        /* Pending server response. */
      });
    });
    const { state, convert, cancel, onStored } = setup();
    const pending = convert();
    await uploading;
    expect(state._phase).toBe("uploading");
    cancel();
    await pending;
    expect(vi.mocked(createImage).mock.calls[0][3]?.aborted).toBe(true);
    expect(state._problem).toContain("convert_upload_cancelled");
    expect(state._open).toBe(true);
    expect(state._working).toBe(false);
    expect(onStored).not.toHaveBeenCalled();
  });
  it("settles a stalled conversion without uploading after sixty seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(convertItem).mockImplementation(
      () =>
        new Promise(() => {
          /* Stalled native decoder. */
        })
    );
    const { state, convert } = setup();
    const pending = convert();
    await vi.advanceTimersByTimeAsync(60_000);
    await pending;
    expect(state._problem).toContain("convert_timeout");
    expect(state._working).toBe(false);
    expect(createImage).not.toHaveBeenCalled();
  });
});
