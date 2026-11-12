import { describe, expect, it } from "vitest";
import {
  cleanIds,
  cleanName,
  cleanSurface,
  isSafeKey,
  moveId,
  safeEntries,
  surfaceEntries,
} from "../../../src/common/tabs/tab-validate";

// Stored tab data may come from the instance and be hostile. These protect
// the one place every tab module relies on for that.

describe("tab validation", () => {
  it("refuses keys that could change a prototype", () => {
    expect(isSafeKey("__proto__")).toBe(false);
    expect(isSafeKey("constructor")).toBe(false);
    expect(isSafeKey("prototype")).toBe(false);
    expect(isSafeKey("")).toBe(false);
    expect(isSafeKey("x".repeat(201))).toBe(false);
    expect(isSafeKey("light")).toBe(true);
  });

  it("keeps only unique safe strings in a list, bounded", () => {
    expect(cleanIds(["a", "a", 1, null, "__proto__", "b"])).toEqual(["a", "b"]);
    expect(cleanIds("nope")).toEqual([]);
    expect(cleanIds(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("drops unsafe entries of an untrusted object", () => {
    const hostile = JSON.parse('{"__proto__": {"x": 1}, "ok": 2}');
    expect(safeEntries(hostile)).toEqual([["ok", 2]]);
    expect(safeEntries([1, 2])).toEqual([]);
    expect(surfaceEntries({ main: 1 })).toEqual([["main", 1]]);
  });

  it("falls back to the default surface", () => {
    expect(cleanSurface(undefined)).toBe("main");
    expect(cleanSurface("__proto__")).toBe("main");
    expect(cleanSurface("settings")).toBe("settings");
  });

  it("tidies names", () => {
    expect(cleanName("  Home \n  lights ")).toBe("Home lights");
    expect(cleanName("   ")).toBeUndefined();
    expect(cleanName(5)).toBeUndefined();
    expect(cleanName("x".repeat(100))).toHaveLength(60);
  });

  it("moves an id to a clamped position", () => {
    expect(moveId(["a", "b", "c"], "a", 5)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "c", -3)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b"], "z", 0)).toEqual(["a", "b"]);
  });
});
