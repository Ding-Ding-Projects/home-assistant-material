import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_ID,
  dashboardHistoryUrl,
  isValidDashboardRemote,
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

describe("isValidDashboardRemote", () => {
  it.each([
    "https://example.com/team/home.git",
    "ssh://example.com:2222/team/home.git",
    "git@example.com:team/home.git",
    "  https://example.com/team/home.git  ",
  ])("accepts %s", (address) => {
    expect(isValidDashboardRemote(address)).toBe(true);
  });

  it.each([
    "",
    "ssh://user:pw@host/x.git",
    "ssh://git@host/x.git",
    "https://user:pw@host/x.git",
    "https://user@host/x.git",
    "https://host/x.git?token=abc",
    "https://host/x.git#frag",
    "https://host/x.git\nssh://evil/x.git",
    "https://host/x y.git",
    "git@host:x@y.git",
    "bob@host:x.git",
    "/srv/repository.git",
    "-oProxyCommand=x",
    "ext::sh -c x",
    "file:///srv/x.git",
    "http://host/x.git",
    "https://-host/x.git",
    `https://host/${"a".repeat(600)}`,
  ])("refuses %j", (address) => {
    expect(isValidDashboardRemote(address)).toBe(false);
  });
});
