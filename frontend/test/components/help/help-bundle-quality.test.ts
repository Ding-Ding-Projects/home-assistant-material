import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fenceFlags } from "../../../src/components/help/help-article-path";

const HELP_DIR = path.resolve(__dirname, "../../../public/static/help");

interface Page {
  title: string;
  body: string;
}

const pages: [string, Page][] = [
  ...fs
    .readdirSync(path.join(HELP_DIR, "articles"))
    .map((f) => `articles/${f}`),
  ...fs
    .readdirSync(path.join(HELP_DIR, "integrations"))
    .filter((f) => f !== "index.json")
    .map((f) => `integrations/${f}`),
]
  .filter((f) => f.endsWith(".json"))
  .map((f): [string, Page] => [
    f,
    JSON.parse(fs.readFileSync(path.join(HELP_DIR, f), "utf8")),
  ]);

describe("the offline help bundle", () => {
  it("has the pages", () => {
    expect(pages.length).toBeGreaterThan(1000);
  });

  it("never uses a path as a title", () => {
    expect(
      pages.filter(([, p]) => !p.title.trim() || p.title.startsWith("/"))
    ).toEqual([]);
  });

  it("has no page without text", () => {
    expect(pages.filter(([, p]) => !p.body.trim()).map(([f]) => f)).toEqual([]);
  });

  it("lists every page in the indexes", () => {
    const index = JSON.parse(
      fs.readFileSync(path.join(HELP_DIR, "index.json"), "utf8")
    ) as { articles: { path: string }[] };
    const integrations = JSON.parse(
      fs.readFileSync(path.join(HELP_DIR, "integrations/index.json"), "utf8")
    ) as { integrations: { domain: string }[] };
    expect(index.articles.length).toBe(
      pages.filter(([f]) => f.startsWith("articles/")).length
    );
    expect(integrations.integrations.length).toBe(
      pages.filter(([f]) => f.startsWith("integrations/")).length
    );
  });

  it("keeps placeholders as text and leaves no empty bold run or ragged table", () => {
    const problems: string[] = [];
    for (const [file, { body }] of pages) {
      const lines = body.split("\n");
      const flags = fenceFlags(lines);
      lines.forEach((line, i) => {
        if (flags[i]) {
          return;
        }
        const prose = line.replace(/`[^`]*`/g, "C");
        if (/(?:^|[^*\w])\*\*\s*\*\*(?![*\w])/.test(prose)) {
          problems.push(`${file}:${i + 1} empty bold run`);
        }
        if (
          /<\/?[a-zA-Z][^>]*>/.test(
            prose.replace(/<(?:https?:|[^\s@>]+@)[^>]*>/g, "")
          )
        ) {
          problems.push(`${file}:${i + 1} raw tag`);
        }
      });
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it("links only to sections that exist", () => {
    const problems: string[] = [];
    for (const [file, { body }] of pages) {
      const ids = new Set<string>();
      const used = new Map<string, number>();
      const lines = body.split("\n");
      const flags = fenceFlags(lines);
      lines.forEach((line, i) => {
        const match = !flags[i] && /^#{2,6}\s+(.+?)\s*#*\s*$/.exec(line);
        if (match) {
          const base = match[1]
            .replace(/[*_`]/g, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .trim()
            .replace(/\s+/g, "-");
          const count = used.get(base) ?? 0;
          used.set(base, count + 1);
          ids.add(count ? `${base}-${count}` : base);
        }
      });
      lines.forEach((line, i) => {
        if (flags[i]) {
          return;
        }
        for (const m of line.matchAll(/\]\(#([^)\s]+)\)/g)) {
          if (!ids.has(decodeURIComponent(m[1]))) {
            problems.push(`${file}:${i + 1} #${m[1]}`);
          }
        }
      });
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
