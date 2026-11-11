import { afterEach, describe, expect, it } from "vitest";
import {
  activeVocabularyCount,
  applyPersonalVocabulary,
  buildVocabularyReplacer,
  clearPersonalVocabulary,
  loadPersonalVocabulary,
  parsePersonalVocabulary,
  restorePersonalVocabulary,
  VOCABULARY_LIMITS,
  VOCABULARY_STORAGE_KEY,
} from "../../../src/common/vocabulary/personal-vocabulary";

// A wording file comes from outside and rewrites what the interface says, so
// these protect its promises: a file is checked in full, a bad file changes
// nothing, addresses and identifiers stay literal, and clearing restores the
// shipped wording. The fixtures are neutral placeholders.

const bytes = (value: unknown) =>
  new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value)
  );

const BOM = String.fromCharCode(0xfeff);

const good = {
  schemaVersion: 1,
  entries: { light: "lamp", "living room": "den" },
};

afterEach(() => {
  clearPersonalVocabulary();
});

describe("parsePersonalVocabulary", () => {
  it("accepts the documented shape", () => {
    const result = parsePersonalVocabulary(bytes(good));
    expect(result).toMatchObject({ ok: true, count: 2 });
  });

  it("accepts a byte order mark and an empty map", () => {
    expect(
      parsePersonalVocabulary(
        bytes(`${BOM}${JSON.stringify({ schemaVersion: 1, entries: {} })}`)
      )
    ).toMatchObject({ ok: true, count: 0 });
  });

  const rejected: [string, Uint8Array, string][] = [
    ["malformed JSON", bytes("{ nope"), "malformed"],
    ["a list at the root", bytes([1]), "malformed"],
    [
      "bytes that are not UTF-8",
      new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
      "not_utf8",
    ],
    ["an unknown root field", bytes({ ...good, extra: 1 }), "unknown_field"],
    ["a missing version", bytes({ entries: {} }), "unsupported_version"],
    [
      "another version",
      bytes({ schemaVersion: 2, entries: {} }),
      "unsupported_version",
    ],
    [
      "entries that are a list",
      bytes({ schemaVersion: 1, entries: [] }),
      "bad_entries",
    ],
    [
      "a value that is not text",
      bytes({ schemaVersion: 1, entries: { a: 1 } }),
      "bad_value",
    ],
    [
      "a nested value",
      bytes({ schemaVersion: 1, entries: { a: { b: "c" } } }),
      "bad_value",
    ],
    [
      "an empty key",
      bytes({ schemaVersion: 1, entries: { " ": "x" } }),
      "bad_key",
    ],
    [
      "a key that is too long",
      bytes({
        schemaVersion: 1,
        entries: { ["k".repeat(VOCABULARY_LIMITS.key + 1)]: "x" },
      }),
      "bad_key",
    ],
    [
      "a value that is too long",
      bytes({
        schemaVersion: 1,
        entries: { a: "v".repeat(VOCABULARY_LIMITS.value + 1) },
      }),
      "bad_value",
    ],
    [
      "a control character",
      bytes({ schemaVersion: 1, entries: { a: "x\ny" } }),
      "control_character",
    ],
    [
      "an unsafe key",
      bytes('{"schemaVersion":1,"entries":{"__proto__":"x"}}'),
      "unsafe_key",
    ],
    [
      "a constructor key",
      bytes('{"schemaVersion":1,"entries":{"constructor":"x"}}'),
      "unsafe_key",
    ],
    [
      "a duplicate key",
      bytes('{"schemaVersion":1,"entries":{"a":"x","a":"y"}}'),
      "duplicate_key",
    ],
    [
      "a duplicate root field",
      bytes('{"schemaVersion":1,"schemaVersion":1,"entries":{}}'),
      "duplicate_key",
    ],
    [
      "nesting that is too deep",
      bytes(
        `{"schemaVersion":1,"entries":{"a":${"[".repeat(9)}${"]".repeat(9)}}}`
      ),
      "too_deep",
    ],
    [
      "a file that is too large",
      bytes({
        schemaVersion: 1,
        entries: { a: "x" },
        pad: "p".repeat(VOCABULARY_LIMITS.bytes),
      }),
      "too_large",
    ],
  ];

  it.each(rejected)("rejects %s", (_name, input, error) => {
    expect(parsePersonalVocabulary(input)).toEqual({ ok: false, error });
  });

  it("does not mistake an escaped quote or a key-like value for a duplicate", () => {
    expect(
      parsePersonalVocabulary(
        bytes('{"schemaVersion":1,"entries":{"a\\"b":"a","b":"a\\"b"}}')
      )
    ).toMatchObject({ ok: true, count: 2 });
  });
});

describe("buildVocabularyReplacer", () => {
  const replace = buildVocabularyReplacer({
    light: "lamp",
    lights: "lamps",
    "living room": "den",
    Area: "Zone",
  });

  it("replaces whole words, longest key first", () => {
    expect(replace("Turn on the lights in the living room")).toBe(
      "Turn on the lamps in the den"
    );
    expect(replace("light")).toBe("lamp");
  });

  it("keeps case and leaves parts of longer words alone", () => {
    expect(replace("Light and lightning, highlight")).toBe(
      "Lamp and lightning, highlight"
    );
    expect(replace("Area: garden area")).toBe("Zone: garden area");
  });

  it("matches a capital first letter for a key spelled in small letters", () => {
    expect(replace("Lights on, Living room")).toBe("Lamps on, Den");
    expect(replace("LIGHT")).toBe("LIGHT");
    const own = buildVocabularyReplacer({
      push: "nudge",
      Push: "Shove",
      repo: "#store",
    });
    expect(own("Push, push")).toBe("Shove, nudge");
    expect(own("Repo")).toBe("#store");
  });

  it("works next to punctuation", () => {
    expect(replace("(light), light. light!")).toBe("(lamp), lamp. lamp!");
  });

  it("leaves addresses, paths and identifiers literal", () => {
    expect(replace("light.kitchen")).toBe("light.kitchen");
    expect(replace("sensor.light_level")).toBe("sensor.light_level");
    expect(replace("https://example.test/light/on")).toBe(
      "https://example.test/light/on"
    );
    expect(replace("/config/light")).toBe("/config/light");
    expect(replace("light://x")).toBe("light://x");
    expect(replace("me@light")).toBe("me@light");
  });

  it("does not treat a key as a pattern", () => {
    const literal = buildVocabularyReplacer({ "a.b": "c", "x+": "plus" });
    expect(literal("a.b and axb, x+ and xx")).toBe("c and axb, plus and xx");
  });
});

describe("loading and clearing", () => {
  it("applies a good file, keeps it across a restart and clears it", () => {
    expect(applyPersonalVocabulary("light")).toBe("light");
    expect(loadPersonalVocabulary(bytes(good))).toMatchObject({ ok: true });
    expect(activeVocabularyCount()).toBe(2);
    expect(applyPersonalVocabulary("light")).toBe("lamp");

    restorePersonalVocabulary();
    expect(applyPersonalVocabulary("living room light")).toBe("den lamp");

    clearPersonalVocabulary();
    expect(activeVocabularyCount()).toBe(0);
    expect(applyPersonalVocabulary("light")).toBe("light");
    expect(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)).toBeNull();
  });

  // Text with links arrives as a list of parts. Rewriting it as a string once
  // replaced a Settings tip with an error message.
  it("leaves text that is not a string as it is", () => {
    loadPersonalVocabulary(bytes(good));
    const parts = ["light", { link: true }];
    expect(applyPersonalVocabulary(parts as unknown as string)).toBe(parts);
  });

  it("changes nothing when a file fails", () => {
    loadPersonalVocabulary(bytes(good));
    const before = window.localStorage.getItem(VOCABULARY_STORAGE_KEY);
    expect(
      loadPersonalVocabulary(bytes({ schemaVersion: 1, entries: { light: 3 } }))
    ).toEqual({ ok: false, error: "bad_value" });
    expect(applyPersonalVocabulary("light")).toBe("lamp");
    expect(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)).toBe(before);
  });

  it("keeps only the entries, nothing about the file", () => {
    loadPersonalVocabulary(bytes(good));
    expect(
      Object.keys(
        JSON.parse(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)!)
      ).sort()
    ).toEqual(["entries", "schemaVersion"]);
  });

  it("falls back to the shipped wording when the cached copy is damaged", () => {
    window.localStorage.setItem(VOCABULARY_STORAGE_KEY, '{"schemaVersion":1,');
    restorePersonalVocabulary();
    expect(activeVocabularyCount()).toBe(0);
    expect(applyPersonalVocabulary("light")).toBe("light");
    expect(window.localStorage.getItem(VOCABULARY_STORAGE_KEY)).toBeNull();
  });
});
