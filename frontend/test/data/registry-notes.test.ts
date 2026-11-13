import { describe, expect, it } from "vitest";
import {
  MAX_NOTE_LENGTH,
  noteMatches,
  normalizeRegistryNotes,
  splitNoteAddresses,
  withNote,
} from "../../src/data/registry-notes";

const ORIGIN = "http://homeserver.local:8123";

describe("normalizeRegistryNotes", () => {
  it("keeps valid notes and drops malformed ones", () => {
    const notes = normalizeRegistryNotes({
      devices: {
        a: { text: "Above the door", updated: 5 },
        b: { text: "   ", updated: 1 },
        c: "oops",
      },
      entities: [],
    });
    expect(notes.devices).toEqual({
      a: { text: "Above the door", updated: 5 },
    });
    expect(notes.entities).toEqual({});
  });

  it("copes with nothing stored", () => {
    expect(normalizeRegistryNotes(null)).toEqual({ devices: {}, entities: {} });
    expect(normalizeRegistryNotes("x")).toEqual({ devices: {}, entities: {} });
  });
});

describe("withNote", () => {
  const base = normalizeRegistryNotes({});

  it("adds, replaces and removes a note without touching the other kind", () => {
    const added = withNote(base, "devices", "d1", "Battery CR2450", 10);
    expect(added.devices.d1).toEqual({ text: "Battery CR2450", updated: 10 });
    const replaced = withNote(added, "devices", "d1", "Battery CR2032", 20);
    expect(replaced.devices.d1.text).toBe("Battery CR2032");
    expect(replaced.entities).toEqual({});
    const removed = withNote(replaced, "devices", "d1", "  ");
    expect(removed.devices).toEqual({});
  });

  it("limits the length", () => {
    const long = "x".repeat(MAX_NOTE_LENGTH + 50);
    expect(withNote(base, "entities", "e", long).entities.e.text).toHaveLength(
      MAX_NOTE_LENGTH
    );
  });
});

describe("noteMatches", () => {
  it("ignores case and empty queries", () => {
    expect(noteMatches("Battery changed 12 Oct", "battery")).toBe(true);
    expect(noteMatches("Battery changed", "")).toBe(false);
    expect(noteMatches(undefined, "x")).toBe(false);
  });
});

describe("splitNoteAddresses", () => {
  it("marks addresses on the instance as inside and others as outside", () => {
    const segments = splitNoteAddresses(
      `Manual: https://example.org/p1. Settings: ${ORIGIN}/config/devices and /config/areas`,
      ORIGIN
    );
    expect(segments.map((s) => s.type)).toEqual([
      "text",
      "outside",
      "text",
      "inside",
      "text",
      "inside",
    ]);
    expect(segments[1]).toEqual({
      type: "outside",
      text: "https://example.org/p1",
    });
    expect(segments[5]).toEqual({
      type: "inside",
      text: "/config/areas",
      href: "/config/areas",
    });
  });

  it("leaves slashes inside words as text", () => {
    expect(splitNoteAddresses("aqara.com/p1 and a/b", ORIGIN)).toEqual([
      { type: "text", text: "aqara.com/p1 and a/b" },
    ]);
  });

  it("does not treat a look-alike host as the instance", () => {
    const [segment] = splitNoteAddresses(
      "http://homeserver.local:8123.evil.example/x",
      ORIGIN
    );
    expect(segment.type).toBe("outside");
  });
});
