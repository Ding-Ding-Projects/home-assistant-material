import { describe, expect, it } from "vitest";
import {
  clearObjectDraft,
  getObjectDraft,
  hasInvalidObjectDrafts,
  setObjectDraft,
  transferObjectDrafts,
} from "../../../src/common/object-editor/object-model";

describe("action-owned dictionary drafts", () => {
  it("retains invalid raw text across action replacement without serializing it", () => {
    const action = {
      action: "tts.speak",
      data: { options: { voice: "saved" } },
    };
    setObjectDraft(action, "options", {
      mode: "yaml",
      valid: false,
      yaml: "voice: [unfinished",
    });
    const edited = { ...action, alias: "Speech" };
    transferObjectDrafts(action, edited);
    expect(getObjectDraft(edited, "options")?.yaml).toBe("voice: [unfinished");
    expect(hasInvalidObjectDrafts({ actions: [edited] })).toBe(true);
    expect(JSON.stringify(edited)).not.toContain("unfinished");
  });
  it("does not share drafts between two actions using the same service", () => {
    const first = { action: "tts.speak" };
    const second = { ...first };
    setObjectDraft(first, "options", { mode: "visual", valid: false });
    expect(hasInvalidObjectDrafts({ actions: [second] })).toBe(false);
    expect(hasInvalidObjectDrafts({ actions: [] })).toBe(false);
    clearObjectDraft(first, "options");
    expect(hasInvalidObjectDrafts({ actions: [first] })).toBe(false);
  });
});
