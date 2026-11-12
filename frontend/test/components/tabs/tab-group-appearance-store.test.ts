import { describe, expect, it } from "vitest";
import {
  cleanGroupAppearanceValue,
  groupAppearanceFor,
  groupChipStyle,
  normalizeGroupAppearanceStore,
  resetAllGroups,
  resetGroup,
  resetGroupProperty,
  setGroupAppearance,
} from "../../../src/components/tabs/tab-group-appearance-store";

// The group look is stored on the instance and synced, so stored data is
// untrusted. These protect the rule that nothing that could break out of a
// style declaration is ever kept, and that resets work per property, per group
// and for all groups without touching the others.

describe("group appearance values", () => {
  it("keeps only safe colours", () => {
    expect(cleanGroupAppearanceValue("color", "#ABC")).toBe("#abc");
    expect(
      cleanGroupAppearanceValue("background", "var(--primary-color)")
    ).toBe("var(--primary-color)");
    expect(cleanGroupAppearanceValue("color", "red; position: fixed")).toBe(
      undefined
    );
    expect(cleanGroupAppearanceValue("color", "url(http://x)")).toBe(undefined);
    expect(cleanGroupAppearanceValue("borderColor", "var(--a);x")).toBe(
      undefined
    );
  });

  it("keeps numbers inside their range and words from their list", () => {
    expect(cleanGroupAppearanceValue("radius", "12")).toBe("12");
    expect(cleanGroupAppearanceValue("radius", 12)).toBe("12");
    expect(cleanGroupAppearanceValue("radius", "49")).toBe(undefined);
    expect(cleanGroupAppearanceValue("borderWidth", "-1")).toBe(undefined);
    expect(cleanGroupAppearanceValue("spacing", "4px")).toBe(undefined);
    expect(cleanGroupAppearanceValue("shape", "pill")).toBe("pill");
    expect(cleanGroupAppearanceValue("shape", "triangle")).toBe(undefined);
    expect(cleanGroupAppearanceValue("fontWeight", "bold")).toBe("bold");
    expect(cleanGroupAppearanceValue("expandedLook", "dot")).toBe(undefined);
  });

  it("accepts an emoji or a mdi name as the icon and nothing else", () => {
    expect(cleanGroupAppearanceValue("icon", "🏠")).toBe("🏠");
    expect(cleanGroupAppearanceValue("icon", "mdi:folder-outline")).toBe(
      "mdi:folder-outline"
    );
    expect(cleanGroupAppearanceValue("icon", "<img src=x>")).toBe(undefined);
    expect(cleanGroupAppearanceValue("icon", "mdi:folder;")).toBe(undefined);
    expect(cleanGroupAppearanceValue("icon", "abc")).toBe(undefined);
  });

  it("refuses values that are too long or not text", () => {
    expect(cleanGroupAppearanceValue("icon", "🏠".repeat(30))).toBe(undefined);
    expect(cleanGroupAppearanceValue("color", { a: 1 })).toBe(undefined);
    expect(cleanGroupAppearanceValue("color", "")).toBe(undefined);
  });
});

describe("the stored shape", () => {
  it("drops unknown fields, unsafe keys and bad values", () => {
    // Parsed, so that "__proto__" is a real own key as it is in stored data.
    const store = normalizeGroupAppearanceStore(
      JSON.parse(
        JSON.stringify({
          main: {
            g1: { color: "#fff", radius: "99", extra: "x", shape: "pill" },
            g2: "text",
          },
          "": { g1: { color: "#fff" } },
        }).replace(
          '"g2"',
          '"__proto__":{"color":"#000"},"constructor":{"color":"#000"},"g2"'
        )
      )
    );
    expect(store).toEqual({ main: { g1: { color: "#fff", shape: "pill" } } });
    expect(Object.keys(store.main)).toEqual(["g1"]);
  });

  it("keeps each strip apart", () => {
    let store = setGroupAppearance({}, "main", "g1", "shape", "pill");
    store = setGroupAppearance(store, "side", "g1", "shape", "square");
    expect(groupAppearanceFor(store, "main", "g1").shape).toBe("pill");
    expect(groupAppearanceFor(store, "side", "g1").shape).toBe("square");
  });
});

describe("resetting", () => {
  const base = () => {
    let store = setGroupAppearance({}, "main", "g1", "shape", "pill");
    store = setGroupAppearance(store, "main", "g1", "color", "#fff");
    store = setGroupAppearance(store, "main", "g2", "shape", "square");
    return setGroupAppearance(store, "side", "g1", "shape", "square");
  };

  it("an unusable value changes nothing", () => {
    const store = base();
    expect(setGroupAppearance(store, "main", "g1", "radius", "999")).toBe(
      store
    );
    expect(
      setGroupAppearance(store, "main", "__proto__", "shape", "pill")
    ).toBe(store);
  });

  it("resets one property and leaves the rest", () => {
    const store = resetGroupProperty(base(), "main", "g1", "shape");
    expect(groupAppearanceFor(store, "main", "g1")).toEqual({ color: "#fff" });
    expect(groupAppearanceFor(store, "main", "g2").shape).toBe("square");
  });

  it("resets a group, and a group with no change is dropped from storage", () => {
    const store = resetGroup(base(), "main", "g1");
    expect(store.main.g1).toBeUndefined();
    expect(store.main.g2).toBeDefined();
    expect(resetGroup(store, "main", "g2").main).toBeUndefined();
  });

  it("resets every group of one strip, or of all strips", () => {
    expect(resetAllGroups(base(), "main").main).toBeUndefined();
    expect(resetAllGroups(base(), "main").side).toBeDefined();
    expect(resetAllGroups(base())).toEqual({});
  });
});

describe("the chip style", () => {
  it("lists only what was changed", () => {
    expect(groupChipStyle({})).toEqual({});
    expect(
      groupChipStyle({
        fontWeight: "bold",
        shape: "pill",
        borderColor: "#123",
        borderWidth: "2",
      })
    ).toEqual({
      "font-weight": "700",
      "border-radius": "999px",
      "border-style": "solid",
      "border-color": "#123",
      "border-width": "2px",
    });
  });

  it("lets an explicit radius win over the shape", () => {
    expect(
      groupChipStyle({ shape: "pill", radius: "4" })["border-radius"]
    ).toBe("4px");
  });
});
