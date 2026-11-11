import { afterEach, describe, expect, it, vi } from "vitest";
import * as storageModule from "../../../src/common/decorators/storage";
import {
  safeGetStored,
  safeSetStored,
} from "../../../src/common/preferences/safe-storage";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  getPersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";

// Protects start-up: blocked or corrupt browser storage must give the
// defaults, never an exception that stops the app.
describe("storage that fails", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const failing = () =>
    vi.spyOn(storageModule, "getStorage").mockImplementation(() => {
      throw new Error("storage is blocked");
    });

  it("reads as undefined and reports a failed write", () => {
    failing();
    expect(safeGetStored("key")).toBeUndefined();
    expect(safeSetStored("key", 1)).toBe(false);
  });

  it("gives the default preferences", () => {
    failing();
    expect(getPersonalPreferences()).toEqual(DEFAULT_PERSONAL_PREFERENCES);
  });
});
