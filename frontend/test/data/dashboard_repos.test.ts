import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_ID,
  dashboardHistoryUrl,
} from "../../src/data/dashboard_repos";

describe("dashboardHistoryUrl", () => {
  it("names the default dashboard by its reserved id", () => {
    expect(dashboardHistoryUrl(null)).toBe(
      `/config/dashboard_history?dashboard=${DEFAULT_DASHBOARD_ID}`
    );
  });

  it("names a dashboard and a view", () => {
    expect(dashboardHistoryUrl("lights-home", "view-1a2b")).toBe(
      "/config/dashboard_history?dashboard=lights-home&view=view-1a2b"
    );
  });

  it("escapes what a key could carry into the address", () => {
    expect(dashboardHistoryUrl("a b", "x&y")).toBe(
      "/config/dashboard_history?dashboard=a+b&view=x%26y"
    );
  });
});
