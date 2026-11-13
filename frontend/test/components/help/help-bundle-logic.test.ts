import { describe, expect, it } from "vitest";
import {
  buildBacklinks,
  groupHelpArticles,
  helpPathForIntegration,
  linkedArticlePaths,
  readingMinutes,
} from "../../../src/components/help/help-bundle-logic";

const bundled = new Set(["/docs/a", "/docs/b", "/faq/c", "/docs/new"]);
const isBundled = (path: string) => bundled.has(path);

describe("groupHelpArticles", () => {
  it("groups by section in listing order and puts unknown ones last", () => {
    const groups = groupHelpArticles([
      { path: "/faq/c", title: "C" },
      { path: "/zzz/x", title: "X" },
      { path: "/docs/a", title: "A" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["docs", "faq", "other"]);
  });
});

describe("readingMinutes", () => {
  it("is at least one and rounds up", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("word ".repeat(201))).toBe(2);
  });
});

describe("linkedArticlePaths", () => {
  it("finds inline and reference links, follows redirects, skips self", () => {
    const body = [
      "See [b](/docs/b) and [site](https://www.home-assistant.io/faq/c#x).",
      "Again [b](/docs/b), self [a](/docs/a), outside [o](https://example.com/docs/a).",
      "Old [old](/docs/old).",
      "",
      "[ref]: /docs/b",
    ].join("\n");
    expect(
      linkedArticlePaths(
        body,
        "/docs/a",
        { "/docs/old": "/docs/new" },
        isBundled
      )
    ).toEqual(["/docs/b", "/faq/c", "/docs/new"]);
  });
});

describe("buildBacklinks", () => {
  it("lists the articles that link to each article", () => {
    const links = buildBacklinks(
      [
        { path: "/docs/a", body: "[b](/docs/b)" },
        { path: "/faq/c", body: "[b](/docs/b) [a](/docs/a)" },
      ],
      undefined,
      isBundled
    );
    expect(links.get("/docs/b")).toEqual(["/docs/a", "/faq/c"]);
    expect(links.get("/docs/a")).toEqual(["/faq/c"]);
  });
});

describe("helpPathForIntegration", () => {
  it("returns a path only when the build has the page", () => {
    const domains = new Set(["zwave_js"]);
    expect(helpPathForIntegration("zwave_js", domains)).toBe(
      "/integrations/zwave_js"
    );
    expect(helpPathForIntegration("nope", domains)).toBeUndefined();
  });
});
