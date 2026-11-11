import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOT_OFFERED } from "../../../src/common/converter/capabilities";
import { CATEGORIES } from "../../../src/common/converter/formats";

const root = join(__dirname, "../../..");
const strings = (
  JSON.parse(
    readFileSync(join(root, "src/translations/en.json"), "utf8")
  ) as any
).ui.panel.config.tools.tabs.converter as Record<string, string>;

const sources = readdirSync(join(root, "src/common/converter"))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => ({
    file,
    text: readFileSync(join(root, "src/common/converter", file), "utf8"),
  }));

/** Every code a conversion can fail with or remark on, found in the sources. */
const codes = (pattern: RegExp): Set<string> => {
  const found = new Set<string>();
  for (const { text } of sources) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return found;
};

describe("converter text", () => {
  it("has a message for every error code", () => {
    const errors = new Set([
      ...codes(/failure\(\s*"([a-z0-9_]+)"/g),
      ...codes(/error: \{ code: "([a-z0-9_]+)"/g),
    ]);
    // Remarks are not errors.
    const notes = codes(/notes\.push\(\{ code: "([a-z0-9_]+)"/g);
    const missing = [...errors].filter(
      (code) => !notes.has(code) && !(`error_${code}` in strings)
    );
    expect(missing).toEqual([]);
  });

  it("has a message for every remark", () => {
    const notes = new Set([
      ...codes(/notes\.push\(\{ code: "([a-z0-9_]+)"/g),
      ...codes(/notes: \[\{ code: "([a-z0-9_]+)"/g),
      ...codes(/notes = \[\{ code: "([a-z0-9_]+)"/g),
      ...codes(/\{ code: "(links_skipped)"/g),
    ]);
    expect(notes.size).toBeGreaterThan(5);
    const missing = [...notes].filter((code) => !(`note_${code}` in strings));
    expect(missing).toEqual([]);
  });

  it("names and describes every format", () => {
    for (const category of CATEGORIES) {
      expect(`category_${category.id}` in strings).toBe(true);
      for (const target of category.targets) {
        const key = target.replace(/-/g, "_");
        expect(`format_${key}_name` in strings, key).toBe(true);
        expect(`format_${key}_desc` in strings, key).toBe(true);
      }
    }
  });

  it("explains everything a category does not offer", () => {
    for (const keys of Object.values(NOT_OFFERED)) {
      for (const key of keys ?? []) {
        expect(`not_offered_${key}` in strings, key).toBe(true);
      }
    }
  });

  it("explains every status and its reasons", () => {
    for (const key of [
      "status_ready",
      "status_limited",
      "status_unavailable",
      "status_reason_audio_no_decoder",
      "status_reason_audio_depends",
      "status_reason_audio_wav_only",
      "status_reason_video_frames_only",
      "status_reason_video_no_player",
      "status_reason_archives_no_compression",
      "status_reason_documents_partial",
      "status_reason_documents_no_xml",
    ]) {
      expect(key in strings, key).toBe(true);
    }
  });
});
