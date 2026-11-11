import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessibilitySettings } from "../../../src/common/accessibility/accessibility-tools";
import {
  DEFAULT_READING_OPTIONS,
  getReadingOptions,
  subscribeReadingOptions,
} from "../../../src/common/appearance/reading-options";
import { startInstanceSync } from "../../../src/common/instance-sync/start-instance-sync";
import {
  forgetClaimedOwner,
  SYNC_OWNER_KEY,
} from "../../../src/common/instance-sync/sync-owner";

// Reading options and accessibility tools are cached in this browser and
// belong to the account that made them. Until the signed-in account is known
// they must not be applied, and they must be applied when it is confirmed.

const makeConn = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  subscribeMessage: vi.fn(async () => () => undefined),
  sendMessagePromise: vi.fn(async () => undefined),
});

describe("reading options and accessibility tools on a shared browser", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    forgetClaimedOwner();
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-a");
    window.localStorage.setItem(
      "instanceSync.appearance",
      JSON.stringify({ updated: 5 })
    );
    window.localStorage.setItem(
      "readingOptions",
      JSON.stringify({ wideSpacing: true })
    );
    window.localStorage.setItem(
      "accessibilityTools",
      JSON.stringify({ reduceMotion: true })
    );
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it("applies defaults until the owner is confirmed, then the stored values", () => {
    expect(getReadingOptions()).toEqual(DEFAULT_READING_OPTIONS);
    expect(getAccessibilitySettings().reduceMotion).toBe(false);

    const seen: boolean[] = [];
    const unsubscribe = subscribeReadingOptions((options) =>
      seen.push(options.wideSpacing)
    );

    stop = startInstanceSync(makeConn() as never, "user-a");

    expect(getReadingOptions().wideSpacing).toBe(true);
    expect(getAccessibilitySettings().reduceMotion).toBe(true);
    // The page was told, so it applies them without a reload.
    expect(seen).toContain(true);
    unsubscribe();
  });
});
