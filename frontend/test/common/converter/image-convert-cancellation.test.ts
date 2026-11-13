import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canvasBlob,
  convertImage,
  IMAGE_OPERATION_TIMEOUT_MS,
} from "../../../src/common/converter/image-convert";

const options = {
  format: "png" as const,
  quality: 90,
  resize: { mode: "keep" as const },
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded image conversion", () => {
  it("does not decode a cancelled image", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const controller = new AbortController();
    controller.abort();
    expect(
      await convertImage(new Uint8Array(), "jpeg", options, controller.signal)
    ).toEqual({ ok: false, error: { code: "aborted" } });
    expect(decode).not.toHaveBeenCalled();
  });
  it("settles a stalled canvas callback at the deadline", async () => {
    vi.useFakeTimers();
    const canvas = { toBlob: vi.fn() } as unknown as HTMLCanvasElement;
    const outcome = canvasBlob(canvas, "image/png", undefined).catch(
      (error: Error) => error.name
    );
    await vi.advanceTimersByTimeAsync(IMAGE_OPERATION_TIMEOUT_MS);
    expect(await outcome).toBe("TimeoutError");
  });
  it("cancels a pending encoder without waiting for its callback", async () => {
    const controller = new AbortController();
    const canvas = {
      convertToBlob: () =>
        new Promise(() => {
          /* Simulate a browser callback that never arrives. */
        }),
    } as unknown as OffscreenCanvas;
    const outcome = canvasBlob(
      canvas,
      "image/png",
      undefined,
      controller.signal
    ).catch((error: Error) => error.name);
    controller.abort();
    expect(await outcome).toBe("AbortError");
  });
  it("closes a bitmap that arrives after cancellation", async () => {
    let resolve!: (bitmap: ImageBitmap) => void;
    vi.stubGlobal(
      "createImageBitmap",
      () =>
        new Promise<ImageBitmap>((done) => {
          resolve = done;
        })
    );
    const controller = new AbortController();
    const pending = convertImage(
      new Uint8Array(),
      "jpeg",
      options,
      controller.signal
    );
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: { code: "aborted" } });
    const close = vi.fn();
    resolve({ width: 1, height: 1, close } as unknown as ImageBitmap);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  });
  it("falls back to a document canvas when the offscreen encoder rejects", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 12,
      height: 8,
      close,
    }));
    const context = { drawImage: vi.fn() };
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        width = 12;
        height = 8;
        getContext() {
          return context;
        }
        convertToBlob() {
          return Promise.reject(new Error("Not supported"));
        }
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as never
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["pixels"], { type: "image/png" }))
    );
    expect(await convertImage(new Uint8Array(), "jpeg", options)).toMatchObject(
      { ok: true, width: 12, height: 8 }
    );
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
  });
});
