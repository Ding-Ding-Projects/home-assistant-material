import { describe, expect, it } from "vitest";

import {
  MAIN_TOOL_PANELS,
  TOOLS_TABS,
  partitionTools,
  resolveToolPanel,
} from "../../../../src/panels/config/tools/tools-navigation";

// The routes the tools strip offered before it was split into pills and a menu.
const ORIGINAL_ROUTES = [
  "yaml",
  "state",
  "action",
  "action-history",
  "template",
  "event",
  "debug-console",
  "statistics",
  "assist",
  "base64",
  "colour",
  "converter",
  "drawing",
];

describe("tools navigation", () => {
  it("keeps every original route and adds none", () => {
    expect(TOOLS_TABS.map((tab) => tab.panel).sort()).toEqual(
      [...ORIGINAL_ROUTES].sort()
    );
  });

  it("puts every available tool in exactly one of pills or More", () => {
    const { main, more } = partitionTools(() => true);
    const all = [...main, ...more].map((tab) => tab.panel);
    expect(all.sort()).toEqual([...ORIGINAL_ROUTES].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it("shows the six main tools as pills in order", () => {
    const { main } = partitionTools(() => true);
    expect(main.map((tab) => tab.panel)).toEqual([...MAIN_TOOL_PANELS]);
    expect(main).toHaveLength(6);
  });

  it("leaves unavailable tools out of both groups", () => {
    const { main, more } = partitionTools((tab) => !tab.component);
    const all = [...main, ...more].map((tab) => tab.panel);
    expect(all).not.toContain("action-history");
    expect(all).not.toContain("debug-console");
    expect(all).toContain("assist");
  });

  it("treats the old service route as Actions", () => {
    expect(resolveToolPanel("service")).toBe("action");
    expect(resolveToolPanel("state")).toBe("state");
  });
});
