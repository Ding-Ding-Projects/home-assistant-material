import { describe, expect, it } from "vitest";
import {
  canJumpTo,
  canSaveDraft,
  DRAFT_MAX_AGE_MS,
  DRAFT_VERSION,
  draftKey,
  isDraftFresh,
  leafFields,
  loadDraft,
  saveDraft,
} from "../../../../src/panels/config/guided-setup/guided-setup-logic";
import type {
  DraftStorage,
  StepContext,
} from "../../../../src/panels/config/guided-setup/guided-setup-logic";

const memory = (): DraftStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

const leaves = leafFields([
  { name: "name", required: true, selector: { text: {} } },
  { name: "api_key", selector: { text: { type: "password" } } },
] as any[]);

const KEY = draftKey("demo", null);
const NOW = 1_800_000_000_000;

const store = (storage: DraftStorage, now = NOW) =>
  saveDraft(
    storage,
    KEY,
    {
      step: "options",
      entityDomain: null,
      data: { name: "Kitchen", api_key: "s3cret-value" },
    },
    leaves,
    now
  );

describe("guided setup save and resume", () => {
  it("round trips a draft with its step and values", () => {
    const storage = memory();
    expect(store(storage)).toBe(true);
    const draft = loadDraft(storage, KEY, NOW + 1000);
    expect(draft?.version).toBe(DRAFT_VERSION);
    expect(draft?.step).toBe("options");
    expect(draft?.data).toEqual({ name: "Kitchen" });
    expect(draft?.savedAt).toBe(NOW);
  });

  it("never stores a secret and lists it to be asked again", () => {
    const storage = memory();
    store(storage);
    expect(storage.map.get(KEY)).not.toContain("s3cret-value");
    expect(loadDraft(storage, KEY, NOW)?.clearedSecrets).toEqual(["api_key"]);
  });

  it("ignores a draft of another version", () => {
    const storage = memory();
    store(storage);
    const stored = JSON.parse(storage.map.get(KEY)!);
    storage.map.set(KEY, JSON.stringify({ ...stored, version: 2 }));
    expect(loadDraft(storage, KEY, NOW)).toBeUndefined();
  });

  it("drops a draft older than 14 days and removes it", () => {
    const storage = memory();
    store(storage);
    const edge = NOW + DRAFT_MAX_AGE_MS;
    expect(loadDraft(storage, KEY, edge)).toBeDefined();
    expect(loadDraft(storage, KEY, edge + 1)).toBeUndefined();
    expect(storage.map.has(KEY)).toBe(false);
    expect(isDraftFresh({ savedAt: NOW }, NOW + DRAFT_MAX_AGE_MS + 1)).toBe(
      false
    );
  });

  it("ignores a draft dated far in the future or without a date", () => {
    const storage = memory();
    store(storage, NOW + DRAFT_MAX_AGE_MS);
    expect(loadDraft(storage, KEY, NOW)).toBeUndefined();
    storage.map.set(
      KEY,
      JSON.stringify({
        version: DRAFT_VERSION,
        step: "options",
        data: {},
        clearedSecrets: [],
      })
    );
    expect(loadDraft(storage, KEY, NOW)).toBeUndefined();
  });

  it("copes with storage that is missing or throws", () => {
    expect(loadDraft(undefined, KEY, NOW)).toBeUndefined();
    const broken: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadDraft(broken, KEY, NOW)).toBeUndefined();
    expect(store(broken)).toBe(false);
  });

  it("offers Save and close only for a drawn form with content", () => {
    expect(canSaveDraft("options", true, true)).toBe(true);
    expect(canSaveDraft("review", true, true)).toBe(true);
    expect(canSaveDraft("options", false, true)).toBe(false);
    expect(canSaveDraft("options", true, false)).toBe(false);
    expect(canSaveDraft("about", true, true)).toBe(false);
    expect(canSaveDraft("done", true, true)).toBe(false);
  });
});

describe("guided setup jumping to a step", () => {
  const base: StepContext = {
    current: "options",
    furthest: "review",
    errorCount: 0,
    saved: false,
    optionsValid: true,
  };

  it("allows reached steps and not the current or later ones", () => {
    expect(canJumpTo("about", base)).toBe(true);
    expect(canJumpTo("review", base)).toBe(true);
    expect(canJumpTo("options", base)).toBe(false);
    expect(canJumpTo("done", base)).toBe(false);
    expect(canJumpTo("review", { ...base, furthest: "options" })).toBe(false);
  });

  it("blocks steps after the options while the options are invalid", () => {
    const invalid = { ...base, optionsValid: false };
    expect(canJumpTo("review", invalid)).toBe(false);
    expect(canJumpTo("about", invalid)).toBe(true);
  });

  it("keeps the earlier behaviour when validity is unknown", () => {
    const { optionsValid: _unused, ...unknown } = base;
    expect(canJumpTo("review", unknown)).toBe(true);
  });

  it("locks every step but the last once the setup is saved", () => {
    const saved = { ...base, current: "done" as const, saved: true };
    expect(canJumpTo("about", saved)).toBe(false);
    expect(canJumpTo("review", saved)).toBe(false);
  });
});
