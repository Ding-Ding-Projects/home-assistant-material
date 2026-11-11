import { describe, expect, it } from "vitest";
import {
  helpArticleSlug,
  isBlockedHelpAddress,
  isHelpArticleAddress,
  parseHelpAddress,
  rewriteArticleLinks,
  splitSections,
} from "../../../src/components/help/help-article-path";

describe("parseHelpAddress", () => {
  it("normalizes addresses on every documentation host", () => {
    for (const host of ["www", "rc", "next"]) {
      expect(
        parseHelpAddress(
          `https://${host}.home-assistant.io/docs/automation/modes/#the-modes`
        )
      ).toEqual({ path: "/docs/automation/modes", hash: "the-modes" });
    }
  });

  it("leaves other sites alone", () => {
    expect(parseHelpAddress("https://community.home-assistant.io/")).toBe(
      undefined
    );
    expect(parseHelpAddress("https://example.com/docs/x")).toBe(undefined);
  });

  it("accepts bare paths and drops query strings and .html", () => {
    expect(parseHelpAddress("/faq/unique_id/?a=1")).toEqual({
      path: "/faq/unique_id",
      hash: "",
    });
    expect(parseHelpAddress("/docs/x.html")?.path).toBe("/docs/x");
  });
});

describe("isHelpArticleAddress", () => {
  it("owns the whole documentation host: no page of it opens the website", () => {
    for (const url of [
      "https://www.home-assistant.io/docs/x/",
      "https://www.home-assistant.io/blog/2024/01/01/x",
      "https://www.home-assistant.io/latest-release-notes",
      "https://www.home-assistant.io/changelog/",
      "https://www.home-assistant.io/images/a.png",
      "https://www.home-assistant.io/",
      "https://next.home-assistant.io",
    ]) {
      expect(isHelpArticleAddress(url)).toBe(true);
      expect(isBlockedHelpAddress(url)).toBe(false);
    }
  });

  it("blocks what the reader has nothing to show for", () => {
    for (const url of [
      "https://www.home-assistant.io/join-chat",
      "https://www.home-assistant.io/socials/",
      "https://www.home-assistant.io/shop",
      "https://www.home-assistant.io/docs/a b/%00",
    ]) {
      expect(isHelpArticleAddress(url)).toBe(false);
      expect(isBlockedHelpAddress(url)).toBe(true);
    }
  });
});

describe("helpArticleSlug", () => {
  it("maps a path to a file name", () => {
    expect(helpArticleSlug("/docs/automation/modes")).toBe(
      "docs__automation__modes"
    );
    expect(helpArticleSlug("/")).toBe("index");
  });
});

describe("rewriteArticleLinks", () => {
  const bundled = (path: string) => path === "/docs/a";
  const note = "not included";

  it("keeps links to bundled articles", () => {
    expect(rewriteArticleLinks("[A](/docs/a/#x)", bundled, note)).toBe(
      "[A](https://www.home-assistant.io/docs/a#x)"
    );
  });

  it("turns links to missing articles into plain text with a note", () => {
    expect(rewriteArticleLinks("see [B](/docs/b)", bundled, note)).toBe(
      "see B (not included: /docs/b)"
    );
  });

  it("never keeps a link to another site or an image", () => {
    expect(
      rewriteArticleLinks(
        "[site](https://example.com/x) ![pic](https://example.com/i.png)",
        bundled,
        note
      )
    ).toBe("site pic");
  });

  it("keeps links inside the article", () => {
    expect(rewriteArticleLinks("[up](#top)", bundled, note)).toBe("[up](#top)");
  });
});

describe("splitSections", () => {
  it("splits at level 2 and 3 headings outside code", () => {
    const sections = splitSections(
      "intro\n\n## One\ntext\n```\n## not a heading\n```\n### Two\nmore"
    );
    expect(sections.map((s) => s.heading?.text)).toEqual([
      undefined,
      "One",
      "Two",
    ]);
    expect(sections[1].markdown).toContain("## not a heading");
  });
});
