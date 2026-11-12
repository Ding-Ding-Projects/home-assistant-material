import { beforeEach, describe, expect, it } from "vitest";
import { dimSumSwitchOutcome } from "../../../src/common/dim-sum/dim-sum-switch";
import { fetchRandomDish } from "../../../src/data/dim_sum";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  PERSONAL_PREFERENCES_STORAGE_KEY,
  getStoredPreferences,
  normalizePersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";
import type { HomeAssistant } from "../../../src/types";

// Protects the promise that the surprise cannot be turned off: the switch
// always comes back on, and no setting for it exists to be stored as off.
describe("dimSumSwitchOutcome", () => {
  it("turning it off goes back on, says so and stores nothing", () => {
    expect(dimSumSwitchOutcome(false)).toEqual({
      checked: true,
      showNote: true,
      store: false,
    });
  });

  it("leaving it on says nothing and stores nothing", () => {
    expect(dimSumSwitchOutcome(true)).toEqual({
      checked: true,
      showNote: false,
      store: false,
    });
  });
});

describe("nothing is ever stored as off", () => {
  it("has no personal setting for the surprise", () => {
    expect(
      Object.keys(DEFAULT_PERSONAL_PREFERENCES).filter((key) =>
        /dim.?sum/i.test(key)
      )
    ).toEqual([]);
  });

  it("drops a hand-written off value instead of keeping it", () => {
    const normalized = normalizePersonalPreferences({
      dimSum: false,
      dimSumSurprise: false,
    } as never);
    expect(JSON.stringify(normalized)).not.toMatch(/dim/i);
  });
});

describe("fetchRandomDish", () => {
  const dish = {
    id: "hk-dish-0001",
    name_en: "Classic Har Gow",
    name_yue: "蝦餃",
    picture_url: "/api/dim_sum/picture/hk-dish-0001?authSig=x",
    content_type: "image/png",
  };
  const hassWith = (answer: () => Promise<unknown>) =>
    ({ callWS: answer }) as unknown as HomeAssistant;

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns the dish the server sends", async () => {
    expect(await fetchRandomDish(hassWith(async () => dish))).toEqual(dish);
  });

  it("returns undefined when there is none, it fails or it is malformed", async () => {
    expect(await fetchRandomDish(hassWith(async () => null))).toBeUndefined();
    expect(
      await fetchRandomDish(
        hassWith(async () => {
          throw new Error("nope");
        })
      )
    ).toBeUndefined();
    expect(
      await fetchRandomDish(hassWith(async () => ({ id: "x" })))
    ).toBeUndefined();
  });

  it("returns undefined without asking while School mode is on", async () => {
    window.localStorage.setItem(
      PERSONAL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schoolMode: true })
    );
    expect(getStoredPreferences().schoolMode).toBe(true);
    let asked = false;
    const result = await fetchRandomDish(
      hassWith(async () => {
        asked = true;
        return dish;
      })
    );
    expect(result).toBeUndefined();
    expect(asked).toBe(false);
  });
});
