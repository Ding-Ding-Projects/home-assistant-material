import { afterEach, describe, expect, it } from "vitest";
import en from "../../../src/translations/en.json";
import {
  composeForMode,
  fillPlaceholders,
  flattenStrings,
  hasCantoneseBlock,
  joinForMode,
  modeText,
  setYueStringsForTest,
  stripFullStops,
  textParts,
  withLanguageMode,
  yueKeys,
  yueString,
} from "../../../src/common/language-mode/language-mode";
import yueSource from "../../../src/translations/yue-own.json";

const localize = (key: string, values?: Record<string, string | number>) =>
  key === "ui.phone.home"
    ? "Home"
    : key === "ui.phone.pin"
      ? "PIN"
      : key === "ui.phone.page_position"
        ? `Page ${values?.current} of ${values?.total}`
        : "";

const original = flattenStrings(yueSource);

afterEach(() => setYueStringsForTest(original));

describe("joinForMode", () => {
  const parts = { english: "Home", cantonese: "主頁" };

  it("shows one language for English and Cantonese", () => {
    expect(joinForMode(parts, "english")).toBe("Home");
    expect(joinForMode(parts, "cantonese")).toBe("主頁");
  });

  it("puts English first in both mode", () => {
    expect(joinForMode(parts, "bilingual")).toBe("Home · 主頁");
    expect(joinForMode(parts, "bilingual", "\n")).toBe("Home\n主頁");
  });

  it("falls back to English when there is no Cantonese text", () => {
    const english = { english: "Home" };
    expect(joinForMode(english, "cantonese")).toBe("Home");
    expect(joinForMode(english, "bilingual")).toBe("Home");
  });

  it("shows identical text once in both mode", () => {
    expect(joinForMode({ english: "PIN", cantonese: "PIN" }, "bilingual")).toBe(
      "PIN"
    );
  });
});

// A sentence that holds another string must carry each language on its own:
// the English sentence gets the English value and the Cantonese sentence the
// Cantonese value, never the pair of them.
describe("composeForMode", () => {
  const say = (key: string, values?: Record<string, string | number>) =>
    key === "t.stage_of"
      ? `Stage ${values?.number}: ${values?.stage}.`
      : key === "t.stage.images"
        ? "Building images"
        : "";

  const build = (
    part: (k: string, v?: Record<string, string | number>) => string
  ) => part("t.stage_of", { number: 2, stage: part("t.stage.images") });

  it("builds each language from its own values and joins them", () => {
    setYueStringsForTest({
      "t.stage_of": "第 {number} 階段：{stage}。",
      "t.stage.images": "建置映像",
    });
    expect(composeForMode(say, build, "english")).toBe(
      "Stage 2: Building images."
    );
    expect(composeForMode(say, build, "cantonese")).toBe(
      "第 2 階段：建置映像。"
    );
    expect(composeForMode(say, build, "bilingual")).toBe(
      "Stage 2: Building images. · 第 2 階段：建置映像。"
    );
  });

  it("gives a string without Cantonese in English inside the Cantonese sentence", () => {
    setYueStringsForTest({ "t.stage_of": "第 {number} 階段：{stage}。" });
    expect(composeForMode(say, build, "cantonese")).toBe(
      "第 2 階段：Building images。"
    );
  });
});

describe("closing full stops", () => {
  it("shows text that differs only by full stops once", () => {
    expect(joinForMode({ english: "5.", cantonese: "5。" }, "bilingual")).toBe(
      "5."
    );
  });

  it("strips closing full stops and keeps inner dots", () => {
    expect(stripFullStops("Automatic.")).toBe("Automatic");
    expect(stripFullStops("預設。")).toBe("預設");
    expect(stripFullStops("1.5x.")).toBe("1.5x");
  });
});

describe("modeText", () => {
  it("fills placeholders in the Cantonese text", () => {
    setYueStringsForTest({
      "ui.phone.page_position": "第 {current} 頁，共 {total} 頁",
    });
    const values = { current: 2, total: 5 };
    expect(
      modeText(localize, "ui.phone.page_position", values, "cantonese")
    ).toBe("第 2 頁，共 5 頁");
    expect(
      modeText(localize, "ui.phone.page_position", values, "bilingual")
    ).toBe("Page 2 of 5 · 第 2 頁，共 5 頁");
  });

  it("leaves a key with no Cantonese text in English in every mode", () => {
    setYueStringsForTest({});
    expect(modeText(localize, "ui.phone.home", undefined, "cantonese")).toBe(
      "Home"
    );
    expect(textParts(localize, "ui.phone.home").cantonese).toBeUndefined();
  });

  it("wraps a localize function", () => {
    setYueStringsForTest({ "ui.phone.home": "主頁" });
    expect(withLanguageMode(localize)("ui.phone.home")).toBe("Home");
  });
});

describe("fillPlaceholders", () => {
  it("keeps an unknown placeholder visible", () => {
    expect(fillPlaceholders("{a} 同 {b}", { a: 1 })).toBe("1 同 {b}");
  });
});

/**
 * The names a string uses. `all` is every name, `required` the ones that are
 * filled in as text. In "{count, plural, one {backup} other {backups}}" the
 * name `count` only chooses a branch, so it is in `all` only, and the branch
 * words "one", "backup" and "backups" are not names at all. Placeholders
 * inside a branch are read like any others.
 */
const analysePlaceholders = (
  text: string
): { all: Set<string>; required: Set<string> } => {
  const all = new Set<string>();
  const required = new Set<string>();
  const close = (source: string, open: number): number => {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) return i;
    }
    return source.length - 1;
  };
  const walk = (source: string) => {
    let i = 0;
    while (i < source.length) {
      if (source[i] !== "{") {
        i++;
        continue;
      }
      const end = close(source, i);
      const inner = source.slice(i + 1, end);
      const rule = /^\s*(\w+)\s*,\s*(plural|select|selectordinal)\s*,/.exec(
        inner
      );
      if (rule) {
        all.add(rule[1]);
        let rest = inner.slice(rule[0].length);
        // Each branch is a label and a braced body: "one {backup}".
        while (rest.includes("{")) {
          const open = rest.indexOf("{");
          const branchEnd = close(rest, open);
          walk(rest.slice(open + 1, branchEnd));
          rest = rest.slice(branchEnd + 1);
        }
      } else {
        const name = /^\s*(\w+)\s*(,[\s\S]*)?$/.exec(inner);
        if (name) {
          all.add(name[1]);
          if (!name[2]) required.add(name[1]);
        }
      }
      i = end + 1;
    }
  };
  walk(text ?? "");
  return { all, required };
};

// Protects the second translation source: a Cantonese string that names a
// key English does not have would never show, and one that drops or renames
// a placeholder would print a raw "{name}" or lose the value.
describe("the Cantonese source", () => {
  const english = flattenStrings(en);
  // A value written as [%key:a::b::c%] points at another key. Follow it, so a
  // Cantonese string for it is compared with the text English really shows.
  const resolve = (text: string): string => {
    const ref = /^\[%key:(.+)%\]$/.exec(text);
    return ref ? resolve(english[ref[1].replace(/::/g, ".")] ?? "") : text;
  };
  const placeholders = (text: string) => [...analysePlaceholders(text).all];

  it("has strings", () => {
    expect(yueKeys().length).toBeGreaterThan(100);
  });

  it("only covers the blocks it is meant to cover", () => {
    yueKeys().forEach((key) => expect(hasCantoneseBlock(key), key).toBe(true));
  });

  // The entity words are keyed like the backend's own lookup keys, which are
  // not in en.json; entity-language-mode.test.ts checks them against the
  // backend strings instead.
  it("only names keys that English has", () => {
    yueKeys()
      .filter((key) => !key.startsWith("yue_entity."))
      .forEach((key) => expect(english[key], key).toBeTypeOf("string"));
  });

  // A name English uses only to choose a plural form ("{count, plural, ...}")
  // is optional in Cantonese, which has no plural forms. Every other name
  // must appear, and no name English lacks may appear.
  const plainPlaceholders = (text: string) => [
    ...analysePlaceholders(text).required,
  ];

  it("uses the same placeholders as English", () => {
    yueKeys().forEach((key) => {
      const source = resolve(english[key]);
      const all = new Set(placeholders(source));
      const required = new Set(plainPlaceholders(source));
      const used = new Set(placeholders(yueString(key)!));
      expect(
        [...used].filter((name) => !all.has(name)),
        `${key}: unknown`
      ).toEqual([]);
      expect(
        [...required].filter((name) => !used.has(name)),
        `${key}: missing`
      ).toEqual([]);
    });
  });

  it("reads a plural rule's branch words as text, not as placeholders", () => {
    const source =
      "{count} automatic {count, plural,\n one {backup}\n other {backups}\n}";
    const names = analysePlaceholders(source);
    expect([...names.all]).toEqual(["count"]);
    expect([...names.required]).toEqual(["count"]);
    const nested = analysePlaceholders(
      "{n, plural, one {{name} was} other {{name} were}} {size}"
    );
    expect([...nested.required].sort()).toEqual(["name", "size"]);
    expect([...nested.all].sort()).toEqual(["n", "name", "size"]);
  });

  it("uses no plural or select rules", () => {
    yueKeys().forEach((key) =>
      expect(yueString(key), key).not.toMatch(/\{\w+,/)
    );
  });

  it("has no empty strings", () => {
    yueKeys().forEach((key) =>
      expect(yueString(key)!.trim(), key).not.toBe("")
    );
  });

  // A block listed in YUE_PREFIXES promises Cantonese for the whole block. A
  // new English key added to one of them without a Cantonese string would
  // silently fall back to English in Cantonese mode.
  it("has a Cantonese string for every English key of a covered block", () => {
    // The live preview on the personal page shows both languages side by
    // side from its own per-language samples, so its keys are not translated.
    const own = "ui.panel.config.personal.preview.";
    // The default name of a new passkey is stored as the passkey's name, so
    // it stays in English whatever the mode.
    const stored = ["ui.panel.profile.passkeys.default_name"];
    const missing = Object.entries(english)
      .filter(
        ([key, text]) =>
          hasCantoneseBlock(key) &&
          !key.startsWith(own) &&
          !stored.includes(key) &&
          typeof text === "string"
      )
      .map(([key]) => key)
      .filter((key) => yueString(key) === undefined);
    expect(missing).toEqual([]);
  });

  // A hand-written list of what must have Cantonese. The check above only
  // looks inside blocks that are listed, so a block that was never listed
  // would pass it while staying English.
  it("has Cantonese for the page, card and footer strings that were gaps", () => {
    const required = [
      "ui.panel.config.personal.preview.title",
      "ui.panel.config.personal.language_mode.english",
      "ui.panel.config.personal.language_mode.bilingual",
      "ui.panel.profile.passkeys.header",
      "ui.panel.profile.passkeys.description",
      "ui.panel.profile.passkeys.empty",
      "ui.panel.profile.passkeys.add",
      "ui.panel.profile.refresh_tokens.header",
      "ui.panel.config.guided_setup.no_entries",
      "ui.panel.config.guided_setup.can_set_up",
      "ui.panel.config.guided_setup.domain_level",
      "ui.panel.config.guided_setup.show_more",
      "ui.page_tools.footer.build",
      "ui.page_tools.footer.build_no_time",
      "ui.page_tools.footer.language",
      "ui.page_tools.footer.locked",
      "ui.page_tools.footer.menu_hint",
      // The settings home page, the navigation rail, the home page and the
      // common buttons.
      "ui.panel.config.dashboard.summary",
      "ui.panel.config.dashboard.search",
      "ui.panel.config.dashboard.devices.main",
      "ui.panel.config.dashboard.devices.secondary",
      "ui.panel.config.dashboard.automations.main",
      "ui.panel.config.dashboard.marketplace.main",
      "ui.panel.config.dashboard.personal.main",
      "ui.panel.config.dashboard.identity.main",
      "ui.panel.config.dashboard.release_notes.main",
      "ui.panel.config.dashboard.help.main",
      "ui.panel.config.dashboard.support.main",
      "ui.panel.config.dashboard.system.main",
      "ui.panel.config.dashboard.tools.main",
      "ui.panel.config.dashboard.summaries.devices",
      "ui.panel.config.dashboard.updates_ready",
      "ui.panel.config.dashboard.repairs_waiting",
      "ui.sidebar.developer_tools",
      "panel.config",
      "panel.home",
      "ui.notification_drawer.title",
      "ui.panel.lovelace.cards.home_greeting.morning",
      "ui.panel.lovelace.cards.home_greeting.morning_user",
      "ui.panel.lovelace.cards.home_hero.needs_you",
      "ui.common.save",
      "ui.common.cancel",
      "ui.common.delete",
      "ui.common.close",
      "ui.common.add",
      "ui.common.edit",
      "ui.common.back",
      "ui.common.next",
      "ui.common.search",
    ];
    required.forEach((key) => {
      expect(english[key], key).toBeTypeOf("string");
      expect(yueString(key), key).toBeTypeOf("string");
      expect(hasCantoneseBlock(key), key).toBe(true);
    });
  });
});
