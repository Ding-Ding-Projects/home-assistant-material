import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalizeFunc } from "../../../src/common/translations/localize";
import {
  CELEBRATION_HEADLINE_KEY,
  chooseCelebrationHeadline,
  giveWordingFeedback,
} from "../../../src/common/vocabulary/wording-feedback";
import {
  clearPersonalVocabulary,
  activeVocabularyEntry,
  loadPersonalVocabulary,
} from "../../../src/common/vocabulary/personal-vocabulary";
import { playActionCue } from "../../../src/common/sound/action-sound";
import { updatePersonalPreferences } from "../../../src/common/preferences/personal-preferences";

// Protects what a person sees and hears after a wording file: the headline
// comes from the file only when the file gives one, a refused file never
// celebrates and sounds once, a valid file celebrates and sounds once, and
// muted settings stay silent. Fixtures are neutral placeholders.

const localize = ((key: string, params?: { count?: number }) =>
  params?.count !== undefined ? `${key}:${params.count}` : key) as LocalizeFunc;

const makeDeps = (entry?: string) => ({
  playCue: vi.fn(),
  celebrate: vi.fn(),
  entryFor: vi.fn(() => entry),
  localize,
});

describe("chooseCelebrationHeadline", () => {
  it("uses the value the file gives", () => {
    expect(chooseCelebrationHeadline("Controls ready", "Neutral")).toBe(
      "Controls ready"
    );
  });
  it("falls back to the neutral text when the key is absent or blank", () => {
    expect(chooseCelebrationHeadline(undefined, "Neutral")).toBe("Neutral");
    expect(chooseCelebrationHeadline("   ", "Neutral")).toBe("Neutral");
  });
});

describe("applied file lookup", () => {
  afterEach(() => clearPersonalVocabulary());
  const load = (entries: Record<string, string>) =>
    loadPersonalVocabulary(
      new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, entries }))
    );
  it("reads the headline value from the applied entries", () => {
    load({
      [CELEBRATION_HEADLINE_KEY]: "Controls ready",
      Settings: "Controls",
    });
    expect(activeVocabularyEntry(CELEBRATION_HEADLINE_KEY)).toBe(
      "Controls ready"
    );
  });
  it("finds nothing when the file has no such key or nothing is loaded", () => {
    load({ Settings: "Controls" });
    expect(activeVocabularyEntry(CELEBRATION_HEADLINE_KEY)).toBeUndefined();
    clearPersonalVocabulary();
    expect(activeVocabularyEntry(CELEBRATION_HEADLINE_KEY)).toBeUndefined();
  });
});

describe("giveWordingFeedback", () => {
  it("celebrates once with the file's headline and one success cue", () => {
    const deps = makeDeps("Controls ready");
    giveWordingFeedback({ ok: true, count: 3 }, deps);
    expect(deps.playCue).toHaveBeenCalledTimes(1);
    expect(deps.playCue).toHaveBeenCalledWith("success");
    expect(deps.celebrate).toHaveBeenCalledTimes(1);
    expect(deps.celebrate).toHaveBeenCalledWith(
      "Controls ready",
      "ui.personal_wording.overlay_count:3 ui.personal_wording.overlay_everywhere"
    );
  });

  it("uses the neutral localized headline when the file gives none", () => {
    const deps = makeDeps(undefined);
    giveWordingFeedback({ ok: true, count: 1 }, deps);
    expect(deps.celebrate).toHaveBeenCalledWith(
      "ui.personal_wording.overlay_title",
      "ui.personal_wording.overlay_count:1 ui.personal_wording.overlay_everywhere"
    );
  });

  it("never celebrates a refused file and plays one refusal cue", () => {
    const deps = makeDeps("Controls ready");
    giveWordingFeedback({ ok: false, error: "malformed" }, deps);
    expect(deps.celebrate).not.toHaveBeenCalled();
    expect(deps.playCue).toHaveBeenCalledTimes(1);
    expect(deps.playCue).toHaveBeenCalledWith("refused");
  });

  it("still celebrates when the cue throws", () => {
    const deps = makeDeps();
    deps.playCue.mockImplementation(() => {
      throw new Error("no audio");
    });
    giveWordingFeedback({ ok: true, count: 2 }, deps);
    expect(deps.celebrate).toHaveBeenCalledTimes(1);
  });
});

describe("muted settings", () => {
  afterEach(() => {
    updatePersonalPreferences({ soundEffects: true, lowStimulation: false });
    vi.unstubAllGlobals();
  });

  const countContexts = () => {
    const created = vi.fn();
    const fakeContext = function fakeContext() {
      created();
    };
    vi.stubGlobal("AudioContext", fakeContext);
    (window as unknown as { AudioContext: unknown }).AudioContext = fakeContext;
    return created;
  };

  it("plays nothing when the sound switch is off", () => {
    updatePersonalPreferences({ soundEffects: false });
    const created = countContexts();
    expect(playActionCue("success")).toBe(false);
    expect(playActionCue("refused")).toBe(false);
    expect(created).not.toHaveBeenCalled();
  });

  it("plays nothing in low stimulation mode", () => {
    updatePersonalPreferences({ soundEffects: true, lowStimulation: true });
    const created = countContexts();
    expect(playActionCue("success")).toBe(false);
    expect(created).not.toHaveBeenCalled();
  });
});
