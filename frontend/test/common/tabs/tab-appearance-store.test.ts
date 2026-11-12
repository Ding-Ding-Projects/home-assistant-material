import { describe, expect, it } from "vitest";
import {
  appearanceFor,
  cleanAppearanceValue,
  customisedTabs,
  normalizeTabAppearanceStore,
  resetAllTabs,
  resetTab,
  resetTabProperty,
  setTabAppearance,
} from "../../../src/common/tabs/tab-appearance-store";

// Per-tab looks reset per property, per tab and globally, and stored text is
// never allowed to carry style or markup.

describe("tab appearance store", () => {
  const store = setTabAppearance(
    setTabAppearance(
      setTabAppearance({}, "main", "light", "color", "#ff0000"),
      "main",
      "light",
      "fontWeight",
      "700"
    ),
    "main",
    "climate",
    "background",
    "rgb(1, 2, 3)"
  );

  it("sets properties by tab id", () => {
    expect(appearanceFor(store, "main", "light")).toEqual({
      color: "#ff0000",
      fontWeight: "700",
    });
    expect(appearanceFor(store, "other", "light")).toEqual({});
  });

  it("refuses values that could break out of a style", () => {
    expect(cleanAppearanceValue("red; background:url(x)")).toBeUndefined();
    expect(cleanAppearanceValue("<b>")).toBeUndefined();
    expect(cleanAppearanceValue("x".repeat(201))).toBeUndefined();
    expect(setTabAppearance(store, "main", "light", "color", "a{b}")).toBe(
      store
    );
    expect(setTabAppearance(store, "main", "light", "nope" as any, "red")).toBe(
      store
    );
    expect(setTabAppearance(store, "main", "__proto__", "color", "red")).toBe(
      store
    );
  });

  it("resets one property, one tab and everything", () => {
    expect(
      appearanceFor(
        resetTabProperty(store, "main", "light", "color"),
        "main",
        "light"
      )
    ).toEqual({ fontWeight: "700" });
    const noLight = resetTab(store, "main", "light");
    expect(customisedTabs(noLight, "main")).toEqual(["climate"]);
    expect(
      customisedTabs(
        resetTabProperty(
          resetTabProperty(store, "main", "light", "color"),
          "main",
          "light",
          "fontWeight"
        ),
        "main"
      )
    ).toEqual(["climate"]);
    expect(resetAllTabs(store, "main")).toEqual({});
    expect(resetAllTabs(store)).toEqual({});
  });

  it("resetting a strip leaves other strips alone", () => {
    const two = setTabAppearance(store, "settings", "a", "color", "red");
    expect(Object.keys(resetAllTabs(two, "main"))).toEqual(["settings"]);
  });

  it("validates stored data and drops unknown fields", () => {
    const hostile = JSON.parse(
      '{"main":{"a":{"color":"red","evil":"x","background":"red;}"},"__proto__":{"color":"red"},"b":{}},"__proto__":{"x":{"color":"red"}}}'
    );
    expect(normalizeTabAppearanceStore(hostile)).toEqual({
      main: { a: { color: "red" } },
    });
  });
});
