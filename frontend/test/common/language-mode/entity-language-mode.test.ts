import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HassEntity } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import { computeAttributeNameDisplay } from "../../../src/common/entity/compute_attribute_display";
import { computeStateDisplay } from "../../../src/common/entity/compute_state_display";
import { formatDateWeekdayShort } from "../../../src/common/datetime/format_date";
import {
  createEntityModeLocalize,
  entityModeLocalize,
  entityYueKey,
} from "../../../src/common/language-mode/entity-language-mode";
import { yueString } from "../../../src/common/language-mode/language-mode";
import yueSource from "../../../src/translations/yue-own.json";
import { formatWeekdayShortForMode } from "../../../src/common/language-mode/mode-format";
import type { LanguageMode } from "../../../src/common/preferences/personal-preferences";
import type { LocalizeFunc } from "../../../src/common/translations/localize";
import { demoConfig } from "../../../src/fake_data/demo_config";
import {
  NumberFormat,
  TimeFormat,
  FirstWeekday,
  DateFormat,
  TimeZone,
} from "../../../src/data/translation";
import type { FrontendLocaleData } from "../../../src/data/translation";

const CORE = resolve(__dirname, "../../../../core/homeassistant/components");

// The domains the Cantonese entity words must cover, with every device class
// the backend gives them. `scene` and `button` are listed in the allow list
// below because the backend has no state words for them.
const DOMAINS = [
  "binary_sensor",
  "light",
  "switch",
  "cover",
  "lock",
  "fan",
  "climate",
  "humidifier",
  "water_heater",
  "media_player",
  "alarm_control_panel",
  "vacuum",
  "lawn_mower",
  "valve",
  "person",
  "device_tracker",
  "sun",
  "timer",
  "automation",
  "script",
  "scene",
  "input_boolean",
  "update",
  "weather",
  "siren",
  "remote",
  "button",
];

/** Domains with no state words or attribute names in the backend. */
const NO_BACKEND_WORDS: Record<string, string> = {
  scene: "its state is the time it was last activated, shown as a date",
  button: "its state is the time it was last pressed, shown as a date",
};

/**
 * Words left the same in Cantonese on purpose: technical abbreviations that
 * Hong Kong readers know in Latin letters.
 */
const SAME_AS_ENGLISH = new Set([
  "GPS",
  "HS",
  "ID",
  "RGB",
  "RGBW",
  "RGBWW",
  "XY",
]);

const hasCoreStrings = existsSync(CORE);

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

const walk = (tree: any, path: string[]) =>
  path.reduce((node, key) => (node == null ? node : node[key]), tree);

/** The backend words by their lookup key, with references followed. */
const loadBackendWords = (): Record<string, string> => {
  const root = readJson(resolve(CORE, "../strings.json"));
  const cache: Record<string, any> = {};
  const component = (name: string) => {
    if (!cache[name]) {
      cache[name] = readJson(resolve(CORE, name, "strings.json"));
    }
    return cache[name];
  };
  const follow = (text: string): string => {
    const ref = /^\[%key:(.+)%\]$/.exec(text);
    if (!ref) {
      return text;
    }
    const parts = ref[1].split("::");
    const target =
      parts[0] === "common"
        ? walk(root, parts)
        : walk(component(parts[1]), parts.slice(2));
    expect(target, text).toBeTypeOf("string");
    return follow(target);
  };
  const words: Record<string, string> = {};
  for (const domain of DOMAINS) {
    const file = resolve(CORE, domain, "strings.json");
    if (!existsSync(file)) {
      continue;
    }
    const strings = component(domain);
    const base = `component.${domain}.entity_component`;
    for (const [deviceClass, entry] of Object.entries<any>(
      strings.entity_component ?? {}
    )) {
      for (const [state, text] of Object.entries<string>(entry.state ?? {})) {
        words[`${base}.${deviceClass}.state.${state}`] = follow(text);
      }
      for (const [name, attribute] of Object.entries<any>(
        entry.state_attributes ?? {}
      )) {
        if (attribute.name) {
          words[`${base}.${deviceClass}.state_attributes.${name}.name`] =
            follow(attribute.name);
        }
        for (const [value, text] of Object.entries<string>(
          attribute.state ?? {}
        )) {
          words[
            `${base}.${deviceClass}.state_attributes.${name}.state.${value}`
          ] = follow(text);
        }
      }
    }
  }
  return words;
};

describe("entityYueKey", () => {
  it("maps the backend keys onto the Cantonese keys", () => {
    expect(entityYueKey("component.light.entity_component._.state.on")).toBe(
      "yue_entity.light._.state.on"
    );
    expect(
      entityYueKey(
        "component.climate.entity_component._.state_attributes.fan_mode.state.auto"
      )
    ).toBe("yue_entity.climate._.state_attributes.fan_mode.state.auto");
    expect(entityYueKey("state.default.unavailable")).toBe(
      "yue_entity.default.unavailable"
    );
    expect(entityYueKey("ui.components.attributes.names.icon")).toBe(
      "yue_entity.attribute_names.icon"
    );
  });

  it("leaves every other key alone", () => {
    expect(
      entityYueKey("component.hue.entity.light.group.state.on")
    ).toBeUndefined();
    expect(
      entityYueKey("component.sensor.entity.sensor.x.unit_of_measurement")
    ).toBeUndefined();
    expect(entityYueKey("ui.common.save")).toBeUndefined();
  });
});

describe.skipIf(!hasCoreStrings)("Cantonese entity words", () => {
  const words = hasCoreStrings ? loadBackendWords() : {};

  it("reads a useful number of backend words", () => {
    expect(Object.keys(words).length).toBeGreaterThan(400);
  });

  it("covers every state word and attribute name of the listed domains", () => {
    const missing = Object.keys(words).filter(
      (key) => yueString(entityYueKey(key)!) === undefined
    );
    expect(missing).toEqual([]);
  });

  it("lists every domain either as covered or as deliberately without words", () => {
    const covered = new Set(Object.keys(words).map((key) => key.split(".")[1]));
    const uncovered = DOMAINS.filter((domain) => !covered.has(domain));
    expect(uncovered.sort()).toEqual(Object.keys(NO_BACKEND_WORDS).sort());
    // The reason for each one is written down above; keep it that way.
    Object.values(NO_BACKEND_WORDS).forEach((reason) =>
      expect(reason.length).toBeGreaterThan(10)
    );
  });

  it("has Cantonese text, not English, unless it is a listed abbreviation", () => {
    const wrong = Object.entries(words)
      .map(([key, english]) => ({
        key,
        english,
        yue: yueString(entityYueKey(key)!)!,
      }))
      .filter(
        ({ english, yue }) =>
          !/[一-鿿]/.test(yue) &&
          !(SAME_AS_ENGLISH.has(english) && english === yue)
      );
    expect(wrong).toEqual([]);
  });

  it("has no Cantonese word without a backend word behind it", () => {
    const keys = new Set(Object.keys(words));
    const own = (key: string) => key.startsWith("yue_entity.");
    const yue = yueSource.yue_entity;
    const flat: string[] = [];
    const collect = (node: any, prefix: string) =>
      Object.entries(node).forEach(([name, value]) =>
        typeof value === "string"
          ? flat.push(`${prefix}.${name}`)
          : collect(value, `${prefix}.${name}`)
      );
    collect(yue, "yue_entity");
    const stale = flat.filter(
      (key) =>
        own(key) &&
        !key.startsWith("yue_entity.default.") &&
        !key.startsWith("yue_entity.attribute_names.") &&
        ![...keys].some((english) => entityYueKey(english) === key)
    );
    expect(stale).toEqual([]);
  });
});

const baseLocalize: Record<string, string> = {
  "component.light.entity_component._.state.on": "On",
  "component.light.entity_component._.state.off": "Off",
  "component.binary_sensor.entity_component.door.state.on": "Open",
  "component.binary_sensor.entity_component._.state.on": "On",
  "component.climate.entity_component._.state_attributes.fan_mode.name":
    "Fan mode",
  "component.climate.entity_component._.state_attributes.fan_mode.state.auto":
    "Auto",
  "component.sensor.entity.sensor.x.unit_of_measurement": "kWh",
  "state.default.unavailable": "Unavailable",
  "component.light.entity_component._.state.unknown_word": "Mystery",
};
const localize = ((key: string) => baseLocalize[key] ?? "") as LocalizeFunc;

const withMode = (mode: LanguageMode) =>
  createEntityModeLocalize(localize, () => mode);

describe("createEntityModeLocalize", () => {
  it("returns exactly the original text in English", () => {
    const english = withMode("english");
    Object.keys(baseLocalize).forEach((key) =>
      expect(english(key as any)).toBe(baseLocalize[key])
    );
    expect(english("missing.key" as any)).toBe("");
  });

  it("returns the Cantonese word in Cantonese mode", () => {
    const yue = withMode("cantonese");
    expect(yue("component.light.entity_component._.state.on" as any)).toBe(
      "開"
    );
    expect(
      yue("component.binary_sensor.entity_component.door.state.on" as any)
    ).toBe("打開");
    expect(yue("state.default.unavailable" as any)).toBe("用唔到");
  });

  it("gives English first and the Cantonese word beside it in both mode", () => {
    const both = withMode("bilingual");
    expect(both("component.light.entity_component._.state.off" as any)).toBe(
      "Off · 關"
    );
    expect(
      both(
        "component.climate.entity_component._.state_attributes.fan_mode.name" as any
      )
    ).toBe("Fan mode · 風扇模式");
  });

  it("keeps a word the table does not have in English in every mode", () => {
    const key = "component.light.entity_component._.state.unknown_word" as any;
    expect(withMode("cantonese")(key)).toBe("Mystery");
    expect(withMode("bilingual")(key)).toBe("Mystery");
  });

  it("does not change units or integration texts", () => {
    const key = "component.sensor.entity.sensor.x.unit_of_measurement" as any;
    expect(withMode("cantonese")(key)).toBe("kWh");
    expect(withMode("bilingual")(key)).toBe("kWh");
  });

  it("keeps a missing English word missing so the next lookup is tried", () => {
    // The Cantonese table has this word, the backend bundle does not.
    expect(
      withMode("cantonese")("component.fan.entity_component._.state.on" as any)
    ).toBe("");
  });

  it("follows the mode on every call", () => {
    let mode: LanguageMode = "english";
    const live = createEntityModeLocalize(localize, () => mode);
    const key = "component.light.entity_component._.state.on" as any;
    expect(live(key)).toBe("On");
    mode = "cantonese";
    expect(live(key)).toBe("開");
    mode = "bilingual";
    expect(live(key)).toBe("On · 開");
    mode = "english";
    expect(live(key)).toBe("On");
  });

  it("is never wrapped twice", () => {
    const once = entityModeLocalize(localize);
    expect(entityModeLocalize(once)).toBe(once);
    expect(entityModeLocalize(localize)).toBe(once);
    const made = createEntityModeLocalize(localize, () => "bilingual");
    expect(entityModeLocalize(made)).toBe(made);
  });
});

const locale: FrontendLocaleData = {
  language: "en",
  number_format: NumberFormat.language,
  time_format: TimeFormat.language,
  date_format: DateFormat.language,
  first_weekday: FirstWeekday.language,
  time_zone: TimeZone.local,
};

const stateObject = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {}
) =>
  ({
    entity_id,
    state,
    attributes,
    last_changed: "",
    last_updated: "",
    context: { id: "", user_id: null, parent_id: null },
  }) as HassEntity;

describe("state display through the mode", () => {
  const localizeAll = (() => {
    const words = hasCoreStrings ? loadBackendWords() : {};
    return ((key: string) => words[key] ?? "") as LocalizeFunc;
  })();

  it.skipIf(!hasCoreStrings)("shows state words in each mode", () => {
    const door = stateObject("binary_sensor.front", "on", {
      device_class: "door",
    });
    const show = (mode: LanguageMode) =>
      computeStateDisplay(
        createEntityModeLocalize(localizeAll, () => mode),
        door,
        locale,
        demoConfig,
        {}
      );
    expect(show("english")).toBe("Open");
    expect(show("cantonese")).toBe("打開");
    expect(show("bilingual")).toBe("Open · 打開");
  });

  it.skipIf(!hasCoreStrings)(
    "leaves numbers and units as they are in every mode",
    () => {
      const temperature = stateObject("sensor.room", "21.5", {
        unit_of_measurement: "°C",
        device_class: "temperature",
      });
      const show = (mode: LanguageMode) =>
        computeStateDisplay(
          createEntityModeLocalize(localizeAll, () => mode),
          temperature,
          locale,
          demoConfig,
          {}
        );
      expect(show("cantonese")).toBe(show("english"));
      expect(show("bilingual")).toBe(show("english"));
    }
  );

  it.skipIf(!hasCoreStrings)("shows attribute names in each mode", () => {
    const heater = stateObject("climate.hall", "heat", {});
    const name = (mode: LanguageMode) =>
      computeAttributeNameDisplay(
        createEntityModeLocalize(localizeAll, () => mode),
        heater,
        {},
        "fan_mode"
      );
    expect(name("english")).toBe("Fan mode");
    expect(name("cantonese")).toBe("風扇模式");
    expect(name("bilingual")).toBe("Fan mode · 風扇模式");
  });
});

describe("weekday names", () => {
  const date = new Date("2026-11-16T12:00:00Z");

  it("gives exactly the usual name in English", () => {
    expect(formatWeekdayShortForMode(date, locale, demoConfig, "english")).toBe(
      formatDateWeekdayShort(date, locale, demoConfig)
    );
  });

  it("gives the Hong Kong Cantonese name in Cantonese and both modes", () => {
    const yue = new Intl.DateTimeFormat("zh-HK", {
      weekday: "short",
      timeZone: "UTC",
    }).format(date);
    expect(
      formatWeekdayShortForMode(date, locale, demoConfig, "cantonese")
    ).toBe(yue);
    expect(
      formatWeekdayShortForMode(date, locale, demoConfig, "bilingual")
    ).toBe(`Mon · ${yue}`);
  });
});

describe.skipIf(!hasCoreStrings)("speed", () => {
  // 200 entities of mixed domains, each with a state the table knows.
  const words = hasCoreStrings ? loadBackendWords() : {};
  const localizeAll = ((key: string) => words[key] ?? "") as LocalizeFunc;
  const samples = Object.keys(words)
    .filter((key) => /\.state\.[^.]+$/.test(key) && !key.includes("attributes"))
    .map((key) => {
      const [, domain, , deviceClass, , state] = key.split(".");
      return stateObject(
        `${domain}.sample`,
        state,
        deviceClass === "_" ? {} : { device_class: deviceClass }
      );
    });
  const mixed = Array.from(
    { length: 200 },
    (_, index) => samples[(index * 7) % samples.length]
  );

  // The expected English text, worked out with the same lookup order and the
  // original translation function, with no mode involved at all.
  const expectedEnglish = (stateObj: HassEntity) => {
    const [domain] = stateObj.entity_id.split(".");
    const deviceClass = stateObj.attributes.device_class as string | undefined;
    return (
      (deviceClass &&
        localizeAll(
          `component.${domain}.entity_component.${deviceClass}.state.${stateObj.state}` as any
        )) ||
      localizeAll(
        `component.${domain}.entity_component._.state.${stateObj.state}` as any
      ) ||
      stateObj.state
    );
  };

  it("has the same English text as the unwrapped lookup for 200 entities", () => {
    const english = createEntityModeLocalize(localizeAll, () => "english");
    mixed.forEach((stateObj) =>
      expect(
        computeStateDisplay(english, stateObj, locale, demoConfig, {}),
        `${stateObj.entity_id} ${stateObj.state}`
      ).toBe(expectedEnglish(stateObj))
    );
  });

  const run = (mode: LanguageMode, count: number) => {
    const wrapped = createEntityModeLocalize(localizeAll, () => mode);
    const started = performance.now();
    for (let index = 0; index < count; index++) {
      computeStateDisplay(
        wrapped,
        mixed[index % mixed.length],
        locale,
        demoConfig,
        {}
      );
    }
    return performance.now() - started;
  };

  it("formats 5,000 states in Cantonese and both modes at a small multiple of English", () => {
    run("english", 1000);
    run("cantonese", 1000);
    run("bilingual", 1000);
    // The best of a few runs, so one slow moment does not decide the result.
    const best = (mode: LanguageMode) =>
      Math.min(run(mode, 5000), run(mode, 5000), run(mode, 5000));
    const english = best("english");
    const cantonese = best("cantonese");
    const bilingual = best("bilingual");
    // eslint-disable-next-line no-console
    console.info(
      `5000 states: english ${english.toFixed(1)} ms, cantonese ${cantonese.toFixed(
        1
      )} ms, both ${bilingual.toFixed(1)} ms`
    );
    // Each result is one map lookup after the first time, so the other modes
    // stay close to English. The limit is deliberately loose: it catches an
    // accidental storage read or a rebuilt table per call, not noise.
    expect(cantonese).toBeLessThan(english * 4 + 20);
    expect(bilingual).toBeLessThan(english * 4 + 20);
  });
});
