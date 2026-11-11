import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHelpAddress } from "../../../../src/components/help/help-article-path";
import {
  GENERAL_SETTING_DEFAULTS,
  GENERAL_SETTING_HELP,
  GENERAL_SETTING_IDS,
  generalHelpKey,
} from "../../../../src/panels/config/core/general-setting-help";

const file = (path: string) => resolve(process.cwd(), path);

const read = (path: string) => JSON.parse(readFileSync(file(path), "utf8"));

const lookup = (tree: any, key: string): unknown =>
  key.split(".").reduce((node, part) => node?.[part], tree);

const en = read("src/translations/en.json");
const yue = read("src/translations/yue-own.json");

describe("general setting help", () => {
  it("has an entry for every setting the page shows", () => {
    const source = readFileSync(
      file("src/panels/config/core/ha-config-section-general.ts"),
      "utf8"
    );
    const shown = [...source.matchAll(/this\._tools\(\s*"(\w+)"/g)].map(
      (match) => match[1]
    );
    expect(new Set(shown)).toEqual(new Set(GENERAL_SETTING_IDS));
    for (const id of GENERAL_SETTING_IDS) {
      expect(GENERAL_SETTING_HELP[id]).toBeDefined();
    }
  });

  it("has non-empty English and Cantonese text for every entry", () => {
    for (const id of GENERAL_SETTING_IDS) {
      for (const part of GENERAL_SETTING_HELP[id].textKeys) {
        const key = generalHelpKey(id, part);
        for (const tree of [en, yue]) {
          const text = lookup(tree, key);
          expect(typeof text, key).toBe("string");
          expect((text as string).trim().length, key).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only links to bundled help articles", () => {
    for (const id of GENERAL_SETTING_IDS) {
      const path = GENERAL_SETTING_HELP[id].helpPath;
      expect(path.startsWith("/"), id).toBe(true);
      expect(parseHelpAddress(path), id).toBeDefined();
    }
  });

  it("gives every resettable setting a default", () => {
    for (const id of GENERAL_SETTING_IDS) {
      if (GENERAL_SETTING_HELP[id].resettable) {
        expect(id in GENERAL_SETTING_DEFAULTS, id).toBe(true);
      }
    }
  });
});
