import { describe, expect, it } from "vitest";
import {
  dashboardOverflowTools,
  dashboardPageTools,
  dashboardPageToolsMode,
  dashboardToolButtons,
  usesSharedPageTools,
} from "../../../src/panels/lovelace/dashboard-page-tools";

describe("dashboardPageToolsMode", () => {
  it("edit mode wins over a lock", () => {
    expect(dashboardPageToolsMode(true, true)).toBe("edit");
    expect(dashboardPageToolsMode(true, false)).toBe("edit");
  });

  it("locks only in view mode", () => {
    expect(dashboardPageToolsMode(false, true)).toBe("locked");
    expect(dashboardPageToolsMode(false, false)).toBe("view");
  });
});

describe("dashboardPageTools", () => {
  it("shows every tool in view mode", () => {
    expect(dashboardPageTools("view")).toEqual([
      "find",
      "appearance",
      "readAloud",
      "history",
      "export",
      "lock",
      "help",
    ]);
  });

  it("hides lock and read aloud in edit mode", () => {
    const tools = dashboardPageTools("edit");
    expect(tools).not.toContain("lock");
    expect(tools).not.toContain("readAloud");
    expect(tools).toContain("history");
    expect(tools).toContain("export");
  });

  it("shows only Unlock on a locked dashboard", () => {
    expect(dashboardPageTools("locked")).toEqual(["lock"]);
  });
});

describe("usesSharedPageTools", () => {
  it("uses the shared cluster only when every tool shows", () => {
    expect(usesSharedPageTools("view")).toBe(true);
    expect(usesSharedPageTools("edit")).toBe(false);
    expect(usesSharedPageTools("locked")).toBe(false);
  });
});

describe("dashboardToolButtons", () => {
  it("collapses to one overflow button on a phone", () => {
    const buttons = dashboardToolButtons("edit", true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].panelTool).toBe("tools");
  });

  it("draws one button per tool in edit mode", () => {
    expect(dashboardToolButtons("edit", false).map((b) => b.tool)).toEqual([
      "appearance",
      "history",
      "export",
      "help",
    ]);
  });

  it("draws only the unlock button when locked, even on a phone", () => {
    const buttons = dashboardToolButtons("locked", true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].panelTool).toBe("lock");
  });

  it("draws only the unlock button when locked", () => {
    const buttons = dashboardToolButtons("locked", false);
    expect(buttons.map((b) => b.tool)).toEqual(["lock"]);
    expect(buttons[0].panelTool).toBe("lock");
  });
});

describe("dashboardOverflowTools", () => {
  it("lists every tool in view mode", () => {
    expect(dashboardOverflowTools("view")).toEqual(dashboardPageTools("view"));
  });

  it("lists in edit mode on a phone the same four tools as the wide header", () => {
    const tools = dashboardOverflowTools("edit");
    expect(tools).toEqual(["appearance", "history", "export", "help"]);
    expect(tools).toEqual(
      dashboardToolButtons("edit", false).map((button) => button.tool)
    );
    for (const hidden of ["find", "readAloud", "lock"] as const) {
      expect(tools).not.toContain(hidden);
    }
  });

  it("lists only Unlock on a locked dashboard", () => {
    expect(dashboardOverflowTools("locked")).toEqual(["lock"]);
  });
});
