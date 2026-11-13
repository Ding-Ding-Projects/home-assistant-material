import { describe, expect, it } from "vitest";
import {
  buildShortcutList,
  formatKeySpec,
  parseKeySpec,
} from "../../../src/common/codemirror/shortcut-list";

describe("parseKeySpec", () => {
  it("splits modifiers from the key", () => {
    expect(parseKeySpec("Shift-Mod-k")).toEqual(["Shift", "Mod", "k"]);
    expect(parseKeySpec("F3")).toEqual(["F3"]);
  });

  it("keeps a dash or a bracket as the key", () => {
    expect(parseKeySpec("Mod--")).toEqual(["Mod", "-"]);
    expect(parseKeySpec("Mod-[")).toEqual(["Mod", "["]);
    expect(parseKeySpec("Mod-Alt-\\")).toEqual(["Mod", "Alt", "\\"]);
  });
});

describe("formatKeySpec", () => {
  it("writes Mod as Ctrl outside macOS", () => {
    expect(formatKeySpec("Mod-f", "win")).toEqual(["Ctrl", "F"]);
    expect(formatKeySpec("Alt-ArrowUp", "linux")).toEqual(["Alt", "↑"]);
  });

  it("uses symbols on macOS", () => {
    expect(formatKeySpec("Mod-Shift-l", "mac")).toEqual(["⌘", "⇧", "L"]);
  });
});

describe("buildShortcutList", () => {
  it("lists only labelled bindings and counts the rest", () => {
    const { entries, unlabelled } = buildShortcutList(
      [{ key: "Mod-f" }, { key: "Mod-Home" }, { key: "Mod-z" }],
      "win"
    );
    expect(entries.map((e) => e.label)).toEqual(["find", "undo"]);
    expect(unlabelled).toBe(1);
  });

  it("merges two keys that do the same thing and removes repeats", () => {
    const { entries } = buildShortcutList(
      [{ key: "Mod-g" }, { key: "F3" }, { key: "F3" }],
      "win"
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].combos).toEqual([["Ctrl", "G"], ["F3"]]);
  });

  it("uses the platform specific key when there is one", () => {
    const { entries } = buildShortcutList(
      [{ key: "Alt-A", mac: "Ctrl-A" }],
      "mac"
    );
    expect(entries[0].combos).toEqual([["⌃", "A"]]);
  });

  it("drops a binding that is not in the keymap", () => {
    const { entries } = buildShortcutList([{ key: "Mod-z" }], "win");
    expect(entries.some((e) => e.label === "find")).toBe(false);
  });
});
