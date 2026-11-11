import { describe, expect, it } from "vitest";
import {
  articleSlug,
  checkConverted,
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
    expect(body).toContain("Open **Settings** (x icon) now.");
    expect(body).toContain("> **Tip:**\n> Be careful");
    expect(body).not.toContain("{%");
  });
});

describe("convertArticle, dropped words and structure", () => {
  it("keeps the word of a bare or quoted glossary term", () => {
    const { body } = convertArticle(
      'An {% term automation %} runs. Each {% term "config entry" %} is one. Many {% term entity text="entities" %} exist.\n'
    );
    expect(body).toBe(
      "An automation runs. Each config entry is one. Many entities exist."
    );
  });

  it("leaves no gap where an inline tag stood", () => {
    const { body } = convertArticle(
      "See {% include a.md %} here, and {% include b.md %}.\nEnd {% include c.md %}\n"
    );
    expect(body).not.toMatch(/\S {2,}\S/);
    expect(body).toBe("See here, and.\nEnd");
  });

  it("fails the check on a doubled space and an empty bold run", () => {
    expect(checkConverted("An  runs here.")).toEqual([
      "line 1: doubled space (a dropped word?)",
    ]);
    expect(checkConverted("- **** - QR code")).toContain(
      "line 1: empty bold run"
    );
    expect(checkConverted("```\na  b\n```\n| a  b | c |\n| - | - |")).toEqual(
      []
    );
  });

  it("does not blame a double space that the source itself has", () => {
    expect(checkConverted("It said:     done", "It said:     done")).toEqual(
      []
    );
    expect(checkConverted("An  runs", "An {% term automation %} runs")).toEqual(
      ["line 1: doubled space (a dropped word?)"]
    );
  });

  it("keeps placeholders as text and removes real tags", () => {
    const { body } = convertArticle(
      'Open <domain> or <thermostat-ip>.<br/>Next <b>bold</b> and <lite-youtube videoid="x"></lite-youtube>.\n'
    );
    expect(body).toBe(
      "Open &lt;domain&gt; or &lt;thermostat-ip&gt;.Next bold and."
    );
    expect(checkConverted(body)).toEqual([]);
  });

  it("evens out ragged table rows", () => {
    const { body } = convertArticle(
      "| a | b | c |\n| - | - | - |\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |\n"
    );
    expect(body).toBe(
      "| a | b | c |\n| - | - | - |\n| 1 | 2 | |\n| 1 | 2 | 3 \\| 4 |"
    );
    expect(checkConverted(body)).toEqual([]);
  });

  it("turns a link to a missing section into text", () => {
    const { body } = convertArticle(
      "## Real one\n\nSee [here](#real-one), [gone](#nope) and `[x](#nope)`.\n"
    );
    expect(body).toContain("See [here](#real-one), gone and `[x](#nope)`.");
  });

  it("takes the title from the front matter, a fallback or the first heading", () => {
    expect(convertArticle("---\ntitle: T\n---\n# H\ntext").title).toBe("T");
    expect(convertArticle("# **Heading** one\ntext").title).toBe("Heading one");
    expect(convertArticle("## Events\ntext", undefined, "Abode").title).toBe(
      "Abode"
    );
  });

  it("does not treat inline triple backticks as a fence", () => {
    const { body } = convertArticle(
      "```inline``` then {% term device %} words\n"
    );
    expect(body).toBe("```inline``` then device words");
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
