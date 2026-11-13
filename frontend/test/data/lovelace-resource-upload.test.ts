import { describe, expect, it, vi } from "vitest";
import {
  RESOURCE_UPLOAD_MAX_BYTES,
  resourceUploadConsentValues,
  uploadResource,
  validateResourceUpload,
} from "../../src/data/lovelace/resource";
import type { HomeAssistant } from "../../src/types";

const client = () => ({
  localize: (key: string) => key,
  fetchWithAuth: vi.fn(),
});

describe("dashboard resource upload", () => {
  it.each(["component.js", "component.mjs", "theme.css", "THEME.CSS"])(
    "accepts %s",
    (name) => {
      expect(validateResourceUpload({ name, size: 1 })).toBeUndefined();
    }
  );
  it.each([
    [{ name: "component.js.exe", size: 1 }, "upload_extension"],
    [{ name: "component.js", size: 0 }, "upload_empty"],
    [
      { name: "theme.css", size: RESOURCE_UPLOAD_MAX_BYTES + 1 },
      "upload_too_large",
    ],
  ] as const)("rejects invalid files before POST", async (file, error) => {
    const hass = client();
    expect(validateResourceUpload(file)).toBe(error);
    await expect(
      uploadResource(hass as unknown as HomeAssistant, file as File)
    ).rejects.toThrow(error);
    expect(hass.fetchWithAuth).not.toHaveBeenCalled();
  });
  it("accepts exactly 5 MiB", () => {
    expect(
      validateResourceUpload({
        name: "component.js",
        size: RESOURCE_UPLOAD_MAX_BYTES,
      })
    ).toBeUndefined();
  });
  it("posts the raw File with an encoded filename and returns the stored resource", async () => {
    const hass = client();
    const file = new File(["export {};"], "card & chart.mjs");
    const resource = {
      id: "saved",
      type: "module",
      url: "/api/lovelace/resources/upload/uuid.mjs",
      uploaded: true,
      filename: file.name,
    };
    hass.fetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => resource,
    });
    expect(await uploadResource(hass as unknown as HomeAssistant, file)).toBe(
      resource
    );
    expect(hass.fetchWithAuth).toHaveBeenCalledWith(
      "/api/lovelace/resources/upload?filename=card%20%26%20chart.mjs",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      }
    );
    expect(resourceUploadConsentValues(file).res_type).toBe("module");
  });
  it("reports unsuccessful responses instead of returning a resource", async () => {
    const hass = client();
    hass.fetchWithAuth.mockResolvedValue({ ok: false, status: 413 });
    await expect(
      uploadResource(
        hass as unknown as HomeAssistant,
        new File(["a"], "card.js")
      )
    ).rejects.toThrow("upload_failed");
  });
});
