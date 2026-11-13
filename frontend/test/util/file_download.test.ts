import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("fileDownload", () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let createdElement: HTMLAnchorElement;
  let fileDownload: (href: string, filename?: string) => void;

  async function loadFileDownload() {
    vi.resetModules();
    const mod = await import("../../src/util/file_download");
    fileDownload = mod.fileDownload;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    createdElement = document.createElement("a");
    vi.spyOn(document, "createElement").mockReturnValue(createdElement);
    appendChildSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => node);
    removeChildSpy = vi
      .spyOn(document.body, "removeChild")
      .mockImplementation((node) => node);
    clickSpy = vi
      .spyOn(createdElement, "click")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sets href, download, and triggers a click", async () => {
    await loadFileDownload();
    fileDownload("https://example.com/file.json", "file.json");

    expect(createdElement.href).toBe("https://example.com/file.json");
    expect(createdElement.download).toBe("file.json");
    expect(appendChildSpy).toHaveBeenCalledWith(createdElement);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(removeChildSpy).toHaveBeenCalledWith(createdElement);
  });

  it("does not revoke non-blob URLs", async () => {
    await loadFileDownload();
    fileDownload("https://example.com/file.json", "file.json");
    vi.runAllTimers();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("resolves relative URLs against the configured Home Assistant URL", async () => {
    vi.stubGlobal("__HASS_URL__", "http://homeassistant.local:8123");
    await loadFileDownload();
    fileDownload("/api/hassio/core/logs/follow");

    expect(createdElement.href).toBe(
      "http://homeassistant.local:8123/api/hassio/core/logs/follow"
    );
  });

  it("keeps the blob available while the browser opens the download", async () => {
    await loadFileDownload();
    fileDownload("blob:http://localhost/abc-123", "file.json");
    vi.advanceTimersByTime(9_999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/abc-123"
    );
  });
});
