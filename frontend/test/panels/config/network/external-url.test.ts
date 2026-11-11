import { describe, expect, it } from "vitest";
import {
  buildUrlSavePayload,
  initialExternalUrl,
  isExternalUrlFromCloud,
} from "../../../../src/panels/config/network/external-url";

const hosted = "https://abc.example-hosted.test";

describe("external address form", () => {
  it("leaves the field empty when the address comes from the hosted service", () => {
    const urls = { external: hosted, cloud: hosted };
    expect(isExternalUrlFromCloud(urls, null)).toBe(true);
    expect(initialExternalUrl(urls, null)).toBe("");
  });

  it("shows a configured external address even if it equals the hosted one", () => {
    const urls = { external: hosted, cloud: hosted };
    expect(initialExternalUrl(urls, hosted)).toBe(hosted);
  });

  it("shows an ordinary external address and an absent one", () => {
    expect(
      initialExternalUrl(
        { external: "https://me.test", cloud: null },
        "https://me.test"
      )
    ).toBe("https://me.test");
    expect(initialExternalUrl({ external: null, cloud: null }, null)).toBe("");
    expect(initialExternalUrl(undefined, null)).toBe("");
  });

  it("saves nothing for an empty external field that was never configured", () => {
    const payload = buildUrlSavePayload({
      externalUrl: "",
      internalUrl: "",
      customExternal: true,
      customInternal: false,
      externalConfigured: false,
    });
    expect("external_url" in payload).toBe(false);
    expect(payload.internal_url).toBeNull();
  });

  it("saves what the person typed, and clears one they removed", () => {
    expect(
      buildUrlSavePayload({
        externalUrl: "https://me.test",
        internalUrl: "",
        customExternal: true,
        customInternal: false,
        externalConfigured: false,
      }).external_url
    ).toBe("https://me.test");
    expect(
      buildUrlSavePayload({
        externalUrl: "",
        internalUrl: "",
        customExternal: true,
        customInternal: false,
        externalConfigured: true,
      }).external_url
    ).toBeNull();
  });
});
