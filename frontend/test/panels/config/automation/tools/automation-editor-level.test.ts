import { describe, expect, it } from "vitest";
import {
  DEFAULT_FAST_MODE,
  levelForView,
  levelShows,
  parseEditorLevel,
  parseFastMode,
  viewForLevel,
} from "../../../../../src/panels/config/automation/tools/automation-editor-level";

describe("editor level", () => {
  it("accepts only the three levels", () => {
    expect(parseEditorLevel("simple")).toBe("simple");
    expect(parseEditorLevel("yaml")).toBe("yaml");
    expect(parseEditorLevel("expert")).toBe("advanced");
    expect(parseEditorLevel(undefined)).toBe("advanced");
  });

  it("hides the rarely used parts only in the simple level", () => {
    expect(levelShows("simple", "search")).toBe(false);
    expect(levelShows("simple", "status_bar")).toBe(false);
    expect(levelShows("advanced", "search")).toBe(true);
    expect(levelShows("yaml", "status_bar")).toBe(true);
  });

  it("maps levels to editor views and back", () => {
    expect(viewForLevel("yaml")).toBe("yaml");
    expect(viewForLevel("simple")).toBe("gui");
    expect(levelForView("yaml", "simple")).toBe("yaml");
    expect(levelForView("gui", "yaml")).toBe("advanced");
    expect(levelForView("gui", "simple")).toBe("simple");
  });

  it("repairs stored fast mode choices", () => {
    expect(parseFastMode(undefined)).toEqual(DEFAULT_FAST_MODE);
    expect(parseFastMode("x")).toEqual(DEFAULT_FAST_MODE);
    expect(
      parseFastMode({ enabled: false, foldBranches: false, threshold: 300 })
    ).toEqual({ enabled: false, foldBranches: false, threshold: 300 });
    expect(parseFastMode({ threshold: 3 }).threshold).toBe(
      DEFAULT_FAST_MODE.threshold
    );
    expect(parseFastMode({ enabled: "yes" }).enabled).toBe(true);
  });
});
