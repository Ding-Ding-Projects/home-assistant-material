import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceSync } from "../../../src/common/appearance/appearance-sync";
import { getStorage } from "../../../src/common/decorators/storage";
import { READING_STORAGE_KEY } from "../../../src/common/appearance/reading-options";

// Several tabs share one browser cache. A tab that only copied another tab's
// value must not upload it with a fresh age, or the older tab's value could
// replace a newer one on the instance. These protect: a change made here is
// pushed once, and a value that arrives from another tab is not pushed.

const options = (lineSpacing: string) => ({
  bodyFont: "theme",
  headingFont: "theme",
  codeFont: "theme",
  headingWeight: 500,
  lineSpacing,
  wideSpacing: false,
});

describe("pushing appearance changes", () => {
  let push: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    getStorage().setValue(READING_STORAGE_KEY, undefined);
    push = vi.spyOn(appearanceSync, "push").mockImplementation(() => undefined);
  });

  afterEach(() => {
    push.mockRestore();
    vi.useRealTimers();
  });

  it("pushes a change made in this tab, once", () => {
    getStorage().setValue(READING_STORAGE_KEY, options("roomy"));
    expect(push).toHaveBeenCalledTimes(1);
    // The same value again is not a change.
    getStorage().setValue(READING_STORAGE_KEY, options("roomy"));
    expect(push).toHaveBeenCalledTimes(1);
    getStorage().setValue(READING_STORAGE_KEY, options("roomiest"));
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("does not push a value another tab wrote", async () => {
    getStorage().setValue(READING_STORAGE_KEY, options("roomy"));
    push.mockClear();

    const copied = JSON.stringify(options("roomiest"));
    window.localStorage.setItem(READING_STORAGE_KEY, copied);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: READING_STORAGE_KEY,
        newValue: copied,
        oldValue: JSON.stringify(options("roomy")),
      })
    );
    await vi.advanceTimersByTimeAsync(5);
    expect(getStorage().getValue(READING_STORAGE_KEY)).toEqual(
      options("roomiest")
    );
    expect(push).not.toHaveBeenCalled();

    // A real change in this tab afterwards still goes up.
    getStorage().setValue(READING_STORAGE_KEY, options("standard"));
    expect(push).toHaveBeenCalledTimes(1);
  });
});
