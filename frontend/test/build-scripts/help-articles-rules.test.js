import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  checkConverted,
  convertArticle,
  followRedirects,
  hasRasterMagic,
  parseRedirects,
  repositoryImagePath,
} from "../../build-scripts/help-articles-convert.mjs";

describe("conversion rules", () => {
  it("keeps Liquid inside code blocks and drops only raw tags there", () => {
    const { body } = convertArticle(
      "---\ntitle: t\n---\nText\n\n```jinja\n{% raw %}{% if a %}x{% endif %}{% endraw %}\n```\n"
    );
    expect(body).toContain("{% if a %}x{% endif %}");
    expect(body).not.toContain("raw");
  });

  it("names an icon instead of leaving a hole", () => {
    const { body } = convertArticle(
      '---\ntitle: t\n---\nThen shows {% icon "mdi:menu-down" %}. Done.'
    );
    expect(body).toContain("Then shows (menu down icon). Done.");
  });

  it("removes tags that span lines and reference style images", () => {
    const { body } = convertArticle(
      '---\ntitle: t\n---\nA <img\n  src="x.png"> ![alt][r] B\n\n[r]: /images/a.png\n'
    );
    expect(body).not.toMatch(/<img|!\[/);
    expect(checkConverted(body)).toEqual([]);
  });

  it("is not thrown off by a tilde fence", () => {
    const { body } = convertArticle(
      "---\ntitle: t\n---\n~~~\n<b>kept</b>\n~~~\nand <b>gone</b>\n"
    );
    expect(body).toContain("<b>kept</b>");
    expect(body).toContain("and gone");
  });

  it("reports what the converter promised to remove", () => {
    expect(
      checkConverted("a <div> b {% x %} ![i](https://x/i.png)")
    ).toHaveLength(3);
    expect(checkConverted("![i](/static/help/images/i.png) `<b>`")).toEqual([]);
  });

  it("keeps a bundled raster image and refuses SVG", () => {
    expect(
      convertArticle("---\ntitle: t\n---\n![a](/images/a.png)", (src) =>
        src === "/images/a.png" ? "/static/help/images/a.png" : undefined
      ).body
    ).toBe("![a](/static/help/images/a.png)");
    expect(repositoryImagePath("/images/a.svg")).toBe(undefined);
    expect(repositoryImagePath("/images/a.png?x=1")).toBe(
      "source/images/a.png"
    );
    expect(hasRasterMagic(Buffer.from("<svg></svg>"))).toBe(false);
  });
});

describe("redirects", () => {
  const redirects = parseRedirects(
    [
      "/docs/scripts /docs/automation/building-blocks/ 301",
      "/lovelace/* /dashboards/:splat",
      "/a /b",
      "/b /c#part",
      "/x https://example.com",
    ].join("\n")
  );

  it("follows rules, splats and chains, and skips other sites", () => {
    expect(followRedirects("/docs/scripts", redirects)).toBe(
      "/docs/automation/building-blocks/"
    );
    expect(followRedirects("/lovelace/views", redirects)).toBe(
      "/dashboards/views"
    );
    expect(followRedirects("/lovelace", redirects)).toBe("/dashboards/");
    expect(followRedirects("/a", redirects)).toBe("/c#part");
    expect(followRedirects("/x", redirects)).toBe("/x");
  });
});
