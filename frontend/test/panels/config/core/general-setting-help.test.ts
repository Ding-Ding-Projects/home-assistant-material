import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHelpAddress } from "../../../../src/components/help/help-article-path";
import { evaluatePractise } from "../../../../src/components/setting-info/practise-logic";
import {
  GENERAL_HELP_KEY,
  GENERAL_SETTING_DEFAULTS,
  GENERAL_SETTING_HELP,
  GENERAL_SETTING_IDS,
  generalExampleKeys,
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

  it("has worked examples and practise words in English and Cantonese", () => {
    let withExamples = 0;
    let withPractise = 0;
    for (const id of GENERAL_SETTING_IDS) {
      const help = GENERAL_SETTING_HELP[id];
      const keys: string[] = [];
      for (let n = 1; n <= (help.examples ?? 0); n++) {
        const pair = generalExampleKeys(id, n);
        keys.push(pair.input, pair.result);
      }
      if (help.practise?.type === "number") {
        keys.push(`${GENERAL_HELP_KEY}.${id}.practise_unit`);
      }
      if (help.practise?.type === "text") {
        keys.push(`${GENERAL_HELP_KEY}.${id}.practise_hint`);
      }
      for (const key of keys) {
        for (const tree of [en, yue]) {
          const text = lookup(tree, key);
          expect(typeof text, key).toBe("string");
          expect((text as string).trim().length, key).toBeGreaterThan(0);
        }
      }
      withExamples += help.examples ? 1 : 0;
      withPractise += help.practise ? 1 : 0;
    }
    expect(withExamples).toBeGreaterThanOrEqual(3);
    expect(withPractise).toBeGreaterThanOrEqual(3);
  });

  it("checks a practised value with the rule of the real field", () => {
    const zone = GENERAL_SETTING_HELP.time_zone.practise!;
    for (const good of [
      "Europe/Paris",
      "America/Argentina/Buenos_Aires",
      "Etc/GMT+5",
      "UTC",
    ]) {
      expect(evaluatePractise(zone, good).state, good).toBe("ok");
    }
    for (const bad of ["Paris", "europe paris", "Europe/", ""]) {
      expect(evaluatePractise(zone, bad).state, bad).toBe("invalid");
    }
    const currency = GENERAL_SETTING_HELP.currency.practise!;
    expect(evaluatePractise(currency, "EUR").state).toBe("ok");
    expect(evaluatePractise(currency, "euro").state).toBe("invalid");
    expect(evaluatePractise(currency, "EU").state).toBe("invalid");
    const elevation = GENERAL_SETTING_HELP.elevation.practise!;
    expect(evaluatePractise(elevation, "432").state).toBe("ok");
    expect(evaluatePractise(elevation, "-30").state).toBe("ok");
    expect(evaluatePractise(elevation, "abc").state).toBe("invalid");
    expect(evaluatePractise(elevation, "99999").value).toBe(9000);
  });

  it("gives every resettable setting a default", () => {
    for (const id of GENERAL_SETTING_IDS) {
      if (GENERAL_SETTING_HELP[id].resettable) {
        expect(id in GENERAL_SETTING_DEFAULTS, id).toBe(true);
      }
    }
  });
});
