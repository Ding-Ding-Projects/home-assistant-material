import { describe, expect, it } from "vitest";
import {
  helpArticleUrl,
  isBlockedHelpAddress,
  parseHelpAddress,
  resolveHelpPath,
  rewriteArticleLinks,
  splitSections,
} from "../../../src/components/help/help-article-path";

describe("address safety", () => {
  it("does not treat lookalike hosts as the documentation site", () => {
    expect(parseHelpAddress("https://wwwhome-assistant.io/docs/x")).toBe(
      undefined
    );
    expect(parseHelpAddress("https://home-assistant.io/docs/x")?.path).toBe(
      "/docs/x"
    );
  });

  it("rejects paths that could escape the bundle", () => {
    expect(parseHelpAddress("/docs/%2e%2e/secret")).toBe(undefined);
    expect(parseHelpAddress("/docs/../x")).toBe(undefined);
    expect(helpArticleUrl("/docs/%2e%2e/x")).toBe(undefined);
    expect(helpArticleUrl("/docs/automation/modes")).toBe(
      "/static/help/articles/docs__automation__modes.json"
    );
    expect(helpArticleUrl("/integrations/matter")).toBe(
      "/static/help/integrations/matter.json"
    );
  });

  it("blocks community, developer and companion pages", () => {
    for (const url of [
      "https://community.home-assistant.io/",
      "https://contributors.home-assistant.io/translate/",
      "https://companion.home-assistant.io/download",
      "https://my.home-assistant.io/faq.html#supported-pages",
      "https://www.home-assistant.io/join-chat",
    ]) {
      expect(isBlockedHelpAddress(url)).toBe(true);
    }
    expect(isBlockedHelpAddress("https://www.home-assistant.io/docs/x")).toBe(
      false
    );
  });
});

describe("resolveHelpPath", () => {
  it("follows redirects and keeps the redirect's own section", () => {
    const redirects = {
      "/docs/scene/editor": "/docs/scene#live-edit",
      "/docs/scripts": "/docs/automation/building-blocks",
    };
    expect(resolveHelpPath("/docs/scene/editor", "", redirects)).toEqual({
      path: "/docs/scene",
      hash: "live-edit",
    });
    expect(resolveHelpPath("/docs/scripts", "x", redirects)).toEqual({
      path: "/docs/automation/building-blocks",
      hash: "x",
    });
  });
});

describe("rewriteArticleLinks outside addresses", () => {
  const bundled = (path: string) => path === "/docs/a";
  const note = "not included";

  it("turns reference style, automatic and bare addresses into text", () => {
    const out = rewriteArticleLinks(
      [
        "Ask the [forum] or <https://example.com/x> or https://example.org/y.",
        "[docs][d] and ![pic][p]",
        "",
        "[forum]: https://community.home-assistant.io/",
        "[d]: /docs/a",
        "[p]: https://example.com/p.png",
      ].join("\n"),
      bundled,
      note
    );
    expect(out).not.toMatch(/https?:\/\/(?!www\.home-assistant\.io)/);
    expect(out).not.toContain("]:");
    expect(out).toContain("[docs](https://www.home-assistant.io/docs/a)");
  });

  it("leaves code alone and keeps only bundled images", () => {
    const out = rewriteArticleLinks(
      "`https://x.io` ![a](/static/help/images/a.png) ![b](https://x.io/b.png)\n```\nhttps://y.io [a](https://z.io)\n```",
      bundled,
      note
    );
    expect(out).toContain("`https://x.io`");
    expect(out).toContain("![a](/static/help/images/a.png)");
    expect(out).toContain("\nhttps://y.io [a](https://z.io)\n");
    expect(out).not.toContain("b.png");
  });

  it("removes raw media tags even when they span lines", () => {
    expect(
      rewriteArticleLinks('x <img\n src="https://x/a.png"> y', bundled, note)
    ).toBe("x  y");
  });

  it("accepts an address with one level of parentheses", () => {
    expect(
      rewriteArticleLinks("[w](https://example.com/a_(b))", bundled, note)
    ).toBe("w");
  });
});

describe("splitSections", () => {
  it("gives repeated headings distinct ids and splits deeper headings", () => {
    const sections = splitSections("## Same\na\n## Same\nb\n#### Deep\nc");
    expect(sections.map((s) => s.heading?.id)).toEqual([
      "same",
      "same-1",
      "deep",
    ]);
  });

  it("is not confused by a ~~~ line inside a backtick fence", () => {
    const sections = splitSections("```\n~~~\n## no\n```\n## yes");
    expect(sections.map((s) => s.heading?.text)).toEqual([undefined, "yes"]);
  });
});
