import { beforeEach, describe, expect, it } from "vitest";
import {
  dramaClass,
  type ConfirmationDrama,
} from "../../../src/common/confirm/two-key-drama";
import {
  getPersonalPreferences,
  getStoredPreferences,
  normalizePersonalPreferences,
  PERSONAL_PREFERENCES_STORAGE_KEY,
  resetPersonalPreferences,
  updatePersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";
import { setSharedDefaults } from "../../../src/common/preferences/shared-preference-defaults";

// Protects the "Confirmation drama" choice: it must be written to browser
// storage, read back after a reload, and reach the dialog as the still class
// when it is Off. A drop anywhere in that chain left the dialog dramatic.
describe("confirmation drama is stored and read back", () => {
  beforeEach(() => {
    setSharedDefaults({});
    resetPersonalPreferences();
  });

  it.each(["off", "calm", "standard", "dramatic"] as ConfirmationDrama[])(
    "keeps %s through normalise",
    (value) => {
      expect(
        normalizePersonalPreferences({ confirmationDrama: value })
          .confirmationDrama
      ).toBe(value);
    }
  );

  it("writes the choice to storage next to the language mode", () => {
    updatePersonalPreferences({ languageMode: "bilingual" });
    updatePersonalPreferences({ confirmationDrama: "off" });
    const raw = JSON.parse(
      window.localStorage.getItem(PERSONAL_PREFERENCES_STORAGE_KEY) ?? "{}"
    );
    expect(raw.confirmationDrama).toBe("off");
    expect(raw.languageMode).toBe("bilingual");
  });

  it("reads Off back after a reload and maps it to the still class", () => {
    updatePersonalPreferences({ confirmationDrama: "off" });
    expect(getStoredPreferences().confirmationDrama).toBe("off");
    expect(getPersonalPreferences().confirmationDrama).toBe("off");
    expect(dramaClass(getPersonalPreferences().confirmationDrama, false)).toBe(
      "still"
    );
  });
});
