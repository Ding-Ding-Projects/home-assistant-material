import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectArchive,
  folderName,
  isInstallable,
  markerPaths,
  scanYaml,
  themeNames,
} from "../../../src/data/marketplace/archive-detect";

// The server is tested against the same cases, so both announce and install
// the same things.
const CASES_FILE = path.resolve(
  __dirname,
  "../../../../core/tests/components/marketplace/fixtures/archive_detection_cases.json"
);

interface Case {
  id: string;
  archive_name?: string;
  files: Record<string, string>;
  expect: { kind: string; source: string; installable: boolean }[];
}

const cases: Case[] = existsSync(CASES_FILE)
  ? JSON.parse(readFileSync(CASES_FILE, "utf8")).cases
  : [];

describe("detectArchive, the cases the server is tested with", () => {
  it("has the cases to run", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases.map((item) => [item.id, item] as const))("%s", (_id, item) => {
    const entries = Object.keys(item.files);
    const files = Object.fromEntries(
      markerPaths(entries).map((entry) => [entry, item.files[entry]])
    );

    const { items } = detectArchive(entries, files, item.archive_name ?? "");

    expect(
      items.map((found) => ({
        kind: found.kind,
        source: found.source,
        installable: isInstallable(found),
      }))
    ).toEqual(item.expect);
  });
});

describe("detectArchive", () => {
  it("reads the details of an integration", () => {
    const files = {
      "demo-main/custom_components/demo_x/manifest.json": JSON.stringify({
        domain: "demo_x",
        name: "Demo X",
        version: "1.2.0",
      }),
    };

    const [item] = detectArchive(Object.keys(files), files).items;

    expect([item.name, item.version, item.domain, item.rule]).toEqual([
      "Demo X",
      "1.2.0",
      "demo_x",
      "integration_manifest",
    ]);
  });

  it("does not trust a domain that names another folder", () => {
    const files = {
      "x/custom_components/y/manifest.json": JSON.stringify({
        domain: "../../evil",
      }),
    };

    const [item] = detectArchive(Object.keys(files), files).items;

    expect(item.problems).toEqual(["invalid_domain"]);
    expect(isInstallable(item)).toBe(false);
  });

  it("says what a repository of apps holds", () => {
    const files = {
      "a/repository.yaml": "name: My apps\n",
      "a/one/config.yaml": "name: One\nversion: '1'\nslug: one\n",
      "a/two/config.yaml": "name: Two\nversion: '2'\nslug: two\n",
    };

    const { items } = detectArchive(Object.keys(files), files);

    expect(items.map((item) => [item.kind, item.apps])).toEqual([
      ["app_repository", ["one", "two"]],
      ["app", []],
      ["app", []],
    ]);
  });

  describe("the history folder", () => {
    const entries = {
      "x-main/.git/HEAD": "ref: refs/heads/dev\n",
      "x-main/.git/config":
        '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://user:secret@github.com/o/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
      "x-main/custom_components/z/manifest.json": '{"domain": "z"}',
    };

    it("is read for the address and the branch, without credentials", () => {
      const names = Object.keys(entries);
      const files = Object.fromEntries(
        markerPaths(names).map((name) => [name, entries[name]])
      );

      expect(detectArchive(names, files).git).toEqual({
        folder: "x-main",
        branch: "dev",
        origin: "https://github.com/o/x.git",
      });
    });

    it("is not needed", () => {
      const files = {
        "x-main/custom_components/z/manifest.json": '{"domain": "z"}',
      };

      const detection = detectArchive(Object.keys(files), files);

      expect(detection.git).toBeUndefined();
      expect(detection.items).toHaveLength(1);
    });
  });
});

describe("markerPaths", () => {
  it("asks for the small files that tell what the archive holds, nothing else", () => {
    expect(
      markerPaths([
        "x-main/hacs.json",
        "x-main/custom_components/a/manifest.json",
        "x-main/custom_components/a/big_data.json",
        "x-main/src/huge.bin",
      ])
    ).toEqual(["x-main/hacs.json", "x-main/custom_components/a/manifest.json"]);
  });
});

describe("folderName", () => {
  it.each([
    ["lovelace-card-main", "", "lovelace-card"],
    ["card-v1.2.3", "", "card"],
    ["plain", "", "plain"],
    ["", "my-card-master.zip", "my-card"],
    ["", "", ""],
  ])("%s %s", (folder, archive, expected) => {
    expect(folderName(folder, archive)).toBe(expected);
  });
});

describe("scanYaml", () => {
  it("reads plain keys and the first level below a key", () => {
    const { top, children } = scanYaml(
      "# comment\nname: 'My app'  # trailing\nslug: hello\nblueprint:\n  name: Motion\n  domain: automation\n    deep: ignored\n"
    );

    expect(top.name).toBe("My app");
    expect(top.slug).toBe("hello");
    expect(children.blueprint).toEqual({
      name: "Motion",
      domain: "automation",
    });
  });

  it("lists the themes of a theme file", () => {
    expect(
      themeNames("Ocean:\n  primary-color: red\nForest:\n  x: y\n")
    ).toEqual(["Ocean", "Forest"]);
    expect(themeNames('{"Json": {}}')).toEqual(["Json"]);
  });
});
