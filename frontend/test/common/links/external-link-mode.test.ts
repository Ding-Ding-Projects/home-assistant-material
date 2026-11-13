import { describe, expect, it } from "vitest";
import {
  decideLinkAction,
  normalizeExternalLinkMode,
  outsideAddress,
  type LinkInfo,
} from "../../../src/common/links/external-link-mode";

// The choice for outside links must never touch links to this instance, other
// schemes or downloads, and must always fall back to a known choice.

const link = (overrides: Partial<LinkInfo>): LinkInfo => ({
  href: "https://example.org/page",
  origin: "http://homeassistant.local:8123",
  target: "",
  download: false,
  rel: null,
  ...overrides,
});

describe("external link choice", () => {
  it("falls back to a new tab for anything unknown", () => {
    expect(normalizeExternalLinkMode(undefined)).toBe("new_tab");
    expect(normalizeExternalLinkMode("elsewhere")).toBe("new_tab");
    expect(normalizeExternalLinkMode("ask")).toBe("ask");
  });

  it("only treats web addresses on another origin as outside", () => {
    expect(outsideAddress(link({}))).toBe("https://example.org/page");
    expect(
      outsideAddress(link({ href: "http://homeassistant.local:8123/config" }))
    ).toBeUndefined();
    expect(
      outsideAddress(link({ href: "http://homeassistant.local:9999/" }))
    ).toBe("http://homeassistant.local:9999/");
    expect(outsideAddress(link({ href: "mailto:a@b.c" }))).toBeUndefined();
    expect(
      outsideAddress(link({ href: "data:text/plain,hello" }))
    ).toBeUndefined();
    expect(outsideAddress(link({ download: true }))).toBeUndefined();
  });

  it("leaves a link alone when it already behaves as chosen", () => {
    expect(decideLinkAction("new_tab", link({ target: "_blank" }))).toEqual({
      type: "default",
    });
    expect(decideLinkAction("same_tab", link({}))).toEqual({
      type: "default",
    });
  });

  it("opens a link where the person chose", () => {
    expect(decideLinkAction("new_tab", link({}))).toEqual({
      type: "open",
      target: "_blank",
      url: "https://example.org/page",
    });
    expect(decideLinkAction("same_tab", link({ target: "_blank" }))).toEqual({
      type: "open",
      target: "_self",
      url: "https://example.org/page",
    });
    expect(decideLinkAction("ask", link({ target: "_blank" }))).toEqual({
      type: "ask",
      url: "https://example.org/page",
    });
  });

  it("never intercepts links inside the instance", () => {
    expect(
      decideLinkAction(
        "ask",
        link({ href: "http://homeassistant.local:8123/lovelace/0" })
      )
    ).toEqual({ type: "default" });
  });
});
