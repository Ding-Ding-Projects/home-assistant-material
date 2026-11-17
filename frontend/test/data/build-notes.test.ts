import { describe, expect, it } from "vitest";
import {
  findNotes,
  notesPageUrl,
  notesPageUrlForVersion,
  parseNotes,
  summaryForMode,
  whatForMode,
} from "../../src/data/build-notes";

const file = {
  versions: [
    {
      b: 441,
      core: "2026.11.1.441",
      h: "Older headline",
      s: "Older summary.",
      hl: [],
    },
    {
      b: 457,
      core: "2026.11.1.457",
      h: "Newest headline",
      s: "English summary.",
      sy: "廣東話摘要。",
      hl: [
        { t: "First", w: "What it does.", wy: "做咩。" },
        { t: "", w: "No title, dropped." },
        "not an object",
        { t: "Second", w: "Only English." },
      ],
    },
    { b: "x", h: "Bad build number" },
    { b: 500, h: "" },
    null,
  ],
};

describe("build notes", () => {
  it("reads versions newest first and drops malformed entries", () => {
    const notes = parseNotes(file)!;
    expect(notes.map((n) => n.build)).toEqual([457, 441]);
    expect(notes[0].highlights.map((h) => h.title)).toEqual([
      "First",
      "Second",
    ]);
    expect(notes[0].highlights[1].whatYue).toBeUndefined();
  });

  it("rejects a file that is not in the expected form", () => {
    expect(parseNotes({})).toBeUndefined();
    expect(parseNotes({ versions: "no" })).toBeUndefined();
    expect(parseNotes(null)).toBeUndefined();
    expect(parseNotes({ versions: [] })).toEqual([]);
  });

  it("finds the notes of a build", () => {
    const notes = parseNotes(file)!;
    expect(findNotes(notes, 441)?.headline).toBe("Older headline");
    expect(findNotes(notes, 1)).toBeUndefined();
    expect(findNotes(notes, undefined)).toBeUndefined();
  });

  it("follows the language mode, falling back to what exists", () => {
    const [newest, older] = parseNotes(file)!;
    expect(summaryForMode(newest, "english")).toEqual(["English summary."]);
    expect(summaryForMode(newest, "cantonese")).toEqual(["廣東話摘要。"]);
    expect(summaryForMode(newest, "bilingual")).toEqual([
      "English summary.",
      "廣東話摘要。",
    ]);
    // No Cantonese text: Cantonese mode shows the English one, once.
    expect(summaryForMode(older, "cantonese")).toEqual(["Older summary."]);
    expect(summaryForMode(older, "bilingual")).toEqual(["Older summary."]);
    expect(whatForMode(newest.highlights[1], "cantonese")).toEqual([
      "Only English.",
    ]);
  });

  it("builds the address of the public page from a whole build number", () => {
    expect(notesPageUrl(457)).toBe(
      "https://ding-ding-projects.github.io/home-assistant-material-updates/releases/457/"
    );
    expect(notesPageUrl(457.9)).toBe(notesPageUrl(457));
  });

  it("finds the notes page from a system version", () => {
    // Core and the operating system number their builds differently but end
    // in the same build number, so both rows open the same page.
    expect(notesPageUrlForVersion("2026.11.1.509")).toBe(notesPageUrl(509));
    expect(notesPageUrlForVersion("18.5.481")).toBe(notesPageUrl(481));
    expect(notesPageUrlForVersion("2026.11.0.dev0")).toBeUndefined();
    expect(notesPageUrlForVersion("")).toBeUndefined();
    expect(notesPageUrlForVersion(null)).toBeUndefined();
  });
});
