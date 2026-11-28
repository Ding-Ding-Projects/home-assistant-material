import { describe, expect, it } from "vitest";
import {
  isHelpArticleAddress,
  isBlockedHelpAddress,
} from "../../src/components/help/help-article-path";
import { integrationGuideUrl } from "../../src/util/integration-guide-url";

describe("integration guide links", () => {
  it.each([
    ["hue", true],
    ["3_day_blinds", true],
    ["printer_door", true],
    ["marketplace", true],
    ["edge_tts", false],
  ] as const)("opens the guide for %s", (domain, builtIn) => {
    const href = integrationGuideUrl({ domain, is_built_in: builtIn })!;
    expect(href).toBe(
      `https://ding-ding-projects.github.io/home-assistant-integrations-documentation/integrations/${domain}/`
    );
    expect(isHelpArticleAddress(href)).toBe(false);
    expect(isBlockedHelpAddress(href)).toBe(false);
  });

  it("uses the maintainer's link for an unlisted custom integration", () => {
    const documentation = "https://example.com/setup";
    expect(
      integrationGuideUrl({
        domain: "custom",
        is_built_in: false,
        documentation,
      })
    ).toBe(documentation);
  });

  it("omits absent or unsafe destinations", () => {
    expect(integrationGuideUrl()).toBeUndefined();
    expect(
      integrationGuideUrl({ domain: "../", is_built_in: true })
    ).toBeUndefined();
    expect(
      integrationGuideUrl({
        domain: "custom",
        is_built_in: false,
        documentation: "javascript:alert(1)",
      })
    ).toBeUndefined();
  });
});
