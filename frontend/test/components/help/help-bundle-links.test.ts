import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fenceFlags,
  helpIntegrationDomain,
  resolveHelpPath,
  rewriteArticleLinks,
} from "../../../src/components/help/help-article-path";

const HELP_DIR = path.resolve(__dirname, "../../../public/static/help");

const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(HELP_DIR, file), "utf8"));

const index = readJson("index.json") as {
  articles: { path: string }[];
  redirects: Record<string, string>;
};
const integrationIndex = readJson("integrations/index.json") as {
  integrations: { domain: string }[];
};

const bundledPaths = new Set<string>([
  "/integrations",
  ...index.articles.map((a) => a.path),
  ...integrationIndex.integrations.map((i) => `/integrations/${i.domain}`),
]);

const isBundled = (p: string): boolean => {
  const { path: resolved } = resolveHelpPath(p, "", index.redirects);
  return (
    bundledPaths.has(resolved) ||
    (helpIntegrationDomain(resolved) !== undefined &&
      bundledPaths.has(resolved))
  );
};

const NOTE = "not included in this build";

const stripInlineCode = (line: string): string =>
  line.replace(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, "");

/** Everything a renderer could turn into a live link to an outside place. */
const liveOutsideLinks = (markdown: string): string[] => {
  const found: string[] = [];
  const lines = markdown.split("\n");
  const flags = fenceFlags(lines);
  lines.forEach((raw, i) => {
    if (flags[i]) {
      return;
    }
    const line = stripInlineCode(raw);
    for (const m of line.matchAll(/\]\(\s*<?([^)\s>]*)/g)) {
      const target = m[1];
      const bundledSite = /^https:\/\/www\.home-assistant\.io(\/[^#?]*)/.exec(
        target
      );
      const ok =
        target.startsWith("#") ||
        target.startsWith("/static/help/images/") ||
        (bundledSite && isBundled(bundledSite[1]));
      if (!ok) {
        found.push(`${i + 1}: ](${target}`);
      }
    }
    for (const m of line.matchAll(
      /<a\b|<https?:|href\s*=|(?<![\w/])(?:https?:\/\/|www\.)[^\s]*/gi
    )) {
      // The generated links to bundled articles are the only addresses
      // allowed to remain, and they are matched above.
      if (
        !/^https:\/\/www\.home-assistant\.io\//.test(m[0]) ||
        !line.includes(`](${m[0]}`)
      ) {
        found.push(`${i + 1}: ${m[0]}`);
      }
    }
  });
  return found;
};

describe("rewriting over the real offline bundle", () => {
  it("leaves no live link to an outside place in any page", () => {
    const files = [
      ...fs
        .readdirSync(path.join(HELP_DIR, "articles"))
        .map((f) => `articles/${f}`),
      ...fs
        .readdirSync(path.join(HELP_DIR, "integrations"))
        .filter((f) => f !== "index.json")
        .map((f) => `integrations/${f}`),
    ].filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(1000);
    const offenders: string[] = [];
    for (const file of files) {
      const { body } = readJson(file) as { body: string };
      const out = rewriteArticleLinks(body, isBundled, NOTE);
      for (const hit of liveOutsideLinks(out)) {
        offenders.push(`${file} ${hit}`);
      }
    }
    expect(offenders.slice(0, 20)).toEqual([]);
    expect(offenders.length).toBe(0);
  });
});

describe("link forms that used to stay live", () => {
  const rewrite = (text: string) =>
    rewriteArticleLinks(text, () => false, NOTE);

  it("handles code inside link text", () => {
    expect(rewrite("[`ecowitt2mqtt`](https://github.com/x/y)")).toBe(
      "`ecowitt2mqtt`"
    );
    expect(rewrite("[the `x` thing](https://evil.example/a) end")).toBe(
      "the `x` thing end"
    );
  });

  it("handles an image inside a link", () => {
    expect(
      rewrite("[![alt](https://e.example/i.png)](https://e.example)")
    ).toBe("alt");
    expect(
      rewrite("[![alt](/static/help/images/a.png)](https://e.example)")
    ).toBe("![alt](/static/help/images/a.png)");
  });

  it("handles single quoted titles, angle targets and parenthesised titles", () => {
    expect(rewrite("[a](https://e.example/x 'title')")).toBe("a");
    expect(rewrite("[a](<https://e.example/x y>)")).toBe("a");
    expect(rewrite("[a](https://e.example/x (title))")).toBe("a");
  });

  it("neutralises raw anchors and parenthesised bare addresses", () => {
    expect(rewrite('<a href="https://e.example">go</a>')).toBe("go");
    expect(liveOutsideLinks(rewrite("see (https://e.example/x) now"))).toEqual(
      []
    );
    expect(liveOutsideLinks(rewrite("visit www.example.com now"))).toEqual([]);
  });

  it("does not treat a one line triple backtick as a fence", () => {
    const text = "```inline``` then [a](https://e.example/x)\nnext";
    expect(rewrite(text)).toBe("```inline``` then a\nnext");
  });

  it("closes an unterminated fence at the end of the page only", () => {
    const text = "[a](https://e.example/x)\n```yaml\n[b](https://e.example/y)";
    expect(rewrite(text)).toBe("a\n```yaml\n[b](https://e.example/y)");
  });

  it("leaves code blocks and inline code untouched", () => {
    const text =
      '```\n[a](https://e.example/x) <a href="y">\n```\n`[b](https://e.example/z)` and `<a href="q">`';
    expect(rewrite(text)).toBe(text);
  });
});
