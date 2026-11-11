import { describe, expect, it } from "vitest";
import {
  articleSlug,
  convertArticle,
  extractDocumentationPaths,
  sanitizeMarkdown,
  sourceCandidates,
} from "../../build-scripts/help-articles-convert.mjs";

describe("convertArticle", () => {
  it("reads the title and reduces Liquid tags to text", () => {
    const { title, body } = convertArticle(
      [
        "---",
        'title: "Modes"',
        "---",
        'Open {% my automations title="**Settings**" %} {% icon "mdi:x" %}now.',
        "{% include a.md %}{% tip %}\nBe careful\n{% endtip %}",
      ].join("\n")
    );
    expect(title).toBe("Modes");
    expect(body).toContain("Open **Settings** now.");
    expect(body).toContain("> **Tip:**\n> Be careful");
    expect(body).not.toContain("{%");
  });
});

describe("sanitizeMarkdown", () => {
  it("removes scripts, iframes, raw html and images but keeps code", () => {
    const out = sanitizeMarkdown(
      [
        "<script>alert(1)</script>Hello <b>bold</b>",
        '<iframe src="https://x"></iframe>',
        '<img src="https://x/a.png"> ![diagram](https://x/a.png)',
        "```",
        "<b>kept</b>",
        "```",
        "Use `<id>` and <https://example.com>.",
      ].join("\n")
    );
    expect(out).not.toMatch(/script|iframe|<img|<b>bold/);
    expect(out).toContain("Hello bold");
    expect(out).toContain("(image not included: diagram)");
    expect(out).toContain("<b>kept</b>");
    expect(out).toContain("`<id>`");
    expect(out).toContain("<https://example.com>");
  });
});

describe("sourceCandidates", () => {
  it("lists the likely source files for an article path", () => {
    const list = sourceCandidates("/docs/automation/modes");
    expect(list[0]).toBe("source/_docs/automation/modes.markdown");
    expect(sourceCandidates("/integrations/matter")).toContain(
      "source/_integrations/matter.markdown"
    );
  });

  it("maps paths to file names", () => {
    expect(articleSlug("/faq/unique_id")).toBe("faq__unique_id");
  });
});

describe("extractDocumentationPaths", () => {
  it("finds literal paths and skips dynamic ones", () => {
    const code = `
      documentationUrl(hass, "/docs/a/");
      documentationUrl(
        this.hass,
        "/faq/b"
      );
      documentationUrl(hass, \`/integrations/\${domain}\`);
      const X = "https://www.home-assistant.io/blog/post";
    `;
    expect(extractDocumentationPaths(code).sort()).toEqual([
      "/docs/a",
      "/faq/b",
    ]);
  });
});
