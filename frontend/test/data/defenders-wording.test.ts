import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import enSource from "../../src/translations/en.json";
import yueSource from "../../src/translations/yue-own.json";
import type {
  DefenderLogEntry,
  DefenderSibling,
} from "../../src/data/defenders";
import {
  bandErrorKey,
  defenderLogLine,
  siblingRow,
} from "../../src/data/defenders";

/** The codes the backend arbiter can put on a handover line. */
const CODES = [
  "heat_off_first",
  "ac_stops_falling",
  "heat_off_still_hot",
  "inside_band",
  "floor_reached",
  "too_hot",
  "paused",
  "resumed",
];

const SAFETY = ["floor_reached", "too_hot"];

const LANGUAGES = { en: enSource, yue: yueSource } as const;

const block = (language: keyof typeof LANGUAGES): any =>
  (LANGUAGES[language] as any).ui.panel.config.defenders;

const line = (
  language: keyof typeof LANGUAGES,
  voice: "voice" | "plain",
  code: string
): string => block(language).log[voice][code];

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);

const entry = (
  code: string,
  extra: Partial<DefenderLogEntry["values"]> = {}
): DefenderLogEntry => ({
  time: "2026-07-14T14:00:00+00:00",
  kind: "handover",
  guard: "ac",
  message: "",
  values: { code, values: { room: 24.04, low: 22, high: 24 }, ...extra },
});

describe("the codes the backend sends", () => {
  it("are exactly the codes the arbiter can emit", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../core/homeassistant/components/ac_defender/arbiter.py"
      ),
      "utf8"
    );
    const found = new Set<string>();
    for (const match of source.matchAll(/\n\s+room,\n\s+(.+?),?\n\s+\)/g)) {
      for (const quoted of match[1].matchAll(/"([a-z_]+)"/g)) {
        found.add(quoted[1]);
      }
    }
    expect([...found].sort()).toEqual([...CODES].sort());
  });
});

describe.each(["en", "yue"] as const)("log wording in %s", (language) => {
  it.each(CODES)("has a voice line and a plain line for %s", (code) => {
    expect(line(language, "voice", code)).toBeTruthy();
    expect(line(language, "plain", code)).toBeTruthy();
  });

  it.each(CODES)("uses only known placeholders in %s", (code) => {
    for (const voice of ["voice", "plain"] as const) {
      const names = [...line(language, voice, code).matchAll(/\{(\w+)\}/g)].map(
        (m) => m[1]
      );
      expect(names.every((n) => ["room", "low", "high"].includes(n))).toBe(
        true
      );
    }
  });

  it.each(CODES)("states the real room temperature in %s", (code) => {
    const text = fill(line(language, "plain", code), {
      room: "24.0",
      low: "22.0",
      high: "24.0",
    });
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it("keeps the plain lines free of the sibling voices", () => {
    const voices = language === "en" ? /brother|\bsis\b/i : /阿哥|阿妹/;
    for (const code of CODES) {
      expect(line(language, "plain", code)).not.toMatch(voices);
    }
  });

  it("uses the sibling voices in the ordinary handover lines", () => {
    const voices = language === "en" ? /brother|\bsis\b/i : /阿哥|阿妹/;
    for (const code of [
      "heat_off_first",
      "ac_stops_falling",
      "heat_off_still_hot",
    ]) {
      expect(line(language, "voice", code)).toMatch(voices);
    }
  });

  it("words the safety lines the same in both voices", () => {
    for (const code of SAFETY) {
      expect(line(language, "voice", code)).toBe(line(language, "plain", code));
    }
  });
});

describe("the English voice lines carry the real numbers", () => {
  it("fills the room temperature, low and high of a handover", () => {
    const resolved = defenderLogLine(entry("ac_stops_falling"), false);
    expect(resolved?.key).toBe(
      "ui.panel.config.defenders.log.voice.ac_stops_falling"
    );
    const text = fill(
      line("en", "voice", "ac_stops_falling"),
      resolved!.values
    );
    expect(text).toBe(
      "AC to Heat: sis, the room is falling toward 22.0° at 24.0°. I am stopping. Your floor."
    );
  });

  it("gives the heat-to-AC line the way the owner worded it", () => {
    const resolved = defenderLogLine(entry("heat_off_still_hot"), false);
    expect(
      fill(line("en", "voice", "heat_off_still_hot"), resolved!.values)
    ).toBe("Heat to AC: brother, heating is off and it is still 24.0°. Yours.");
  });

  it("resolves every code in the plain log option", () => {
    for (const code of CODES) {
      expect(defenderLogLine(entry(code), true)?.key).toBe(
        `ui.panel.config.defenders.log.plain.${code}`
      );
    }
  });
});

describe("band validation messages", () => {
  it.each([
    ["band_crossed", "band.crossed"],
    ["band_too_narrow", "band.too_narrow"],
    ["band_under_floor", "band.under_floor"],
    ["Error: band_too_narrow", "band.too_narrow"],
  ])("maps %s to %s", (message, key) => {
    expect(bandErrorKey(message)).toBe(key);
  });

  it("leaves other errors alone", () => {
    expect(bandErrorKey("The floor cannot be lower than 10.0")).toBeUndefined();
    expect(bandErrorKey(undefined)).toBeUndefined();
  });

  it.each(["en", "yue"] as const)("has every message in %s", (language) => {
    for (const code of ["crossed", "too_narrow", "under_floor"]) {
      expect(block(language).band[code]).toBeTruthy();
    }
  });
});

describe("the sibling row", () => {
  const sibling = (extra: Partial<DefenderSibling>): DefenderSibling => ({
    role: "ac",
    entry_id: "abc",
    domain: "ac_defender",
    state: "defending",
    reason: "",
    paused: false,
    my_temperature: 24,
    floor: null,
    heat_mode: "off",
    ...extra,
  });

  it("shows the brother with his temperature", () => {
    expect(siblingRow(sibling({}))).toEqual({
      nameKey: "sibling.ac",
      stateKey: "state.defending",
      paused: false,
      temperature: 24,
    });
  });

  it("shows the sister's cap when she is allowed to heat", () => {
    const row = siblingRow(
      sibling({ role: "heat", heat_mode: "cap", my_temperature: 22 })
    );
    expect(row.nameKey).toBe("sibling.heat");
    expect(row.temperature).toBe(22);
  });

  it("shows no temperature while the sister keeps the heating off", () => {
    expect(
      siblingRow(sibling({ role: "heat", heat_mode: "off" })).temperature
    ).toBeUndefined();
  });

  it("carries the paused flag and the state word", () => {
    const row = siblingRow(sibling({ paused: true, state: "heating_allowed" }));
    expect(row.paused).toBe(true);
    expect(row.stateKey).toBe("state.heating_allowed");
  });

  it.each(["en", "yue"] as const)("has every state word in %s", (language) => {
    for (const state of [
      "defending",
      "waiting",
      "paused",
      "standing_down",
      "emergency",
      "stopped",
      "heating_allowed",
    ]) {
      expect(block(language).state[state]).toBeTruthy();
    }
  });
});
