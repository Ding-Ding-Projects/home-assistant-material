import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import en from "../../../src/translations/en.json";

type TranslationNode = string | { [key: string]: TranslationNode };

const lookup = (path: string): string => {
  const message = path
    .split(".")
    .reduce<TranslationNode | undefined>(
      (node, part) => (typeof node === "object" ? node[part] : undefined),
      en as TranslationNode
    );
  if (typeof message !== "string") {
    throw new Error(`No string at ${path}`);
  }
  return message;
};

// The English strings as people read them, plurals included
const format = (path: string, values: Record<string, number>): string =>
  String(new IntlMessageFormat(lookup(path), "en").format(values));

const DASHBOARD = "ui.panel.config.dashboard_history";
const AUTOMATION = "ui.panel.config.automation_history";
const PICKER = "ui.components.version_picker";

// Protects the plural forms of every count on the history pages and the
// version picker: "1 versions" and "1 tabs" are what a string with a bare
// number produces, and only the real message formatter shows the difference.
describe("history page counts", () => {
  it.each([
    [`${DASHBOARD}.commit_count`, { count: 0 }, "0 versions"],
    [`${DASHBOARD}.commit_count`, { count: 1 }, "1 version"],
    [`${DASHBOARD}.commit_count`, { count: 2 }, "2 versions"],
    [
      `${DASHBOARD}.dashboard_summary`,
      { commits: 0, views: 0 },
      "0 versions, 0 tabs",
    ],
    [
      `${DASHBOARD}.dashboard_summary`,
      { commits: 1, views: 1 },
      "1 version, 1 tab",
    ],
    [
      `${DASHBOARD}.dashboard_summary`,
      { commits: 2, views: 2 },
      "2 versions, 2 tabs",
    ],
    [
      `${DASHBOARD}.overview_search`,
      { dashboards: 1, tabs: 1 },
      "Search 1 dashboard and 1 tab",
    ],
    [
      `${DASHBOARD}.overview_search`,
      { dashboards: 2, tabs: 0 },
      "Search 2 dashboards and 0 tabs",
    ],
    [
      `${DASHBOARD}.overview_matches`,
      { dashboards: 1, tabs: 2 },
      "1 dashboard and 2 tabs match",
    ],
    [`${DASHBOARD}.commit_matches`, { count: 0 }, "No version matches"],
    [`${DASHBOARD}.commit_matches`, { count: 1 }, "1 version matches"],
    [`${DASHBOARD}.commit_matches`, { count: 2 }, "2 versions match"],
    [`${AUTOMATION}.repo_commits`, { count: 1 }, "1 commit"],
    [`${AUTOMATION}.repo_commits`, { count: 2 }, "2 commits"],
    [
      `${AUTOMATION}.repo_search`,
      { count: 0 },
      "Search 0 automation repositories",
    ],
    [
      `${AUTOMATION}.repo_search`,
      { count: 1 },
      "Search 1 automation repository",
    ],
    [`${AUTOMATION}.vh_search_commits`, { count: 1 }, "Search 1 commit"],
    [`${AUTOMATION}.vh_search_commits`, { count: 2 }, "Search 2 commits"],
    [`${AUTOMATION}.search`, { count: 1 }, "Search 1 version and messages"],
    [`${AUTOMATION}.scope_all`, { count: 1 }, "All 1 automation"],
    [`${AUTOMATION}.scope_all`, { count: 3 }, "All 3 automations"],
    [
      `${AUTOMATION}.commit_selected`,
      { count: 1 },
      "Commit 1 selected automation",
    ],
    [
      `${AUTOMATION}.commit_selected`,
      { count: 2 },
      "Commit 2 selected automations",
    ],
    [
      `${AUTOMATION}.test_timeout`,
      { seconds: 1 },
      "The test did not finish within 1 second.",
    ],
    [
      `${AUTOMATION}.test_timeout`,
      { seconds: 30 },
      "The test did not finish within 30 seconds.",
    ],
    [`${AUTOMATION}.fact_limit_value`, { seconds: 1 }, "1 second"],
    [`${AUTOMATION}.fact_limit_value`, { seconds: 2 }, "2 seconds"],
    [`${PICKER}.search`, { count: 1 }, "Search 1 version"],
    [`${PICKER}.search`, { count: 2 }, "Search 2 versions"],
    [`${PICKER}.count`, { count: 0 }, "No versions"],
    [`${PICKER}.count`, { count: 1 }, "1 version, newest first"],
    [`${PICKER}.count`, { count: 2 }, "2 versions, newest first"],
    [`${PICKER}.matches`, { count: 0 }, "No version matches"],
    [`${PICKER}.matches`, { count: 1 }, "1 version matches"],
    [`${PICKER}.matches`, { count: 2 }, "2 versions match"],
    [`${PICKER}.show_more`, { count: 1 }, "Show 1 more version"],
    [`${PICKER}.show_more`, { count: 200 }, "Show 200 more versions"],
  ])("formats %s with %o as %s", (path, values, expected) => {
    expect(format(path, values)).toBe(expected);
  });

  it("words the restore and forget confirmations for one and for many", () => {
    const restore = (count: number) =>
      String(
        new IntlMessageFormat(lookup(`${DASHBOARD}.restore_text`), "en").format(
          { dashboard: "Home", count, version: "abc1234" }
        )
      );
    expect(restore(1)).toContain("including its only tab");
    expect(restore(3)).toContain("including all 3 tabs");
    const forget = (count: number) =>
      String(
        new IntlMessageFormat(
          lookup(`${DASHBOARD}.forget_confirm_text`),
          "en"
        ).format({ dashboard: "Home", count })
      );
    expect(forget(1)).toContain("The only version of Home");
    expect(forget(1)).toContain("is deleted for good");
    expect(forget(2)).toContain("All 2 versions of Home");
    expect(forget(2)).toContain("are deleted for good");
  });

  // A bare number next to a noun is the way "1 versions" gets written, so no
  // string of these pages may use a count outside a plural.
  it("has no bare count in any of these strings", () => {
    const bare =
      /\{(count|seconds|commits|views|dashboards|tabs|automations)\}/;
    const offenders: string[] = [];
    const walk = (node: TranslationNode, path: string) => {
      if (typeof node === "string") {
        if (bare.test(node)) {
          offenders.push(path);
        }
        return;
      }
      Object.entries(node).forEach(([key, child]) =>
        walk(child, `${path}.${key}`)
      );
    };
    [DASHBOARD, AUTOMATION, PICKER].forEach((path) => {
      const root = path
        .split(".")
        .reduce<TranslationNode>(
          (node, part) => (node as Record<string, TranslationNode>)[part],
          en as TranslationNode
        );
      walk(root, path);
    });
    expect(offenders).toEqual([]);
  });
});
