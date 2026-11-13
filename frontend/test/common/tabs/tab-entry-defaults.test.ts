import { describe, expect, it } from "vitest";
import {
  cleanDefaultPage,
  normalizeSidebarDefaults,
  resolveEntryRoute,
} from "../../../src/common/tabs/tab-entry-defaults";

// A default page applies only when an entry is opened from outside it, and
// stored text from the instance can never send the person to another place.

describe("sidebar defaults", () => {
  it("shows Developer tools unless it was turned off on purpose", () => {
    expect(normalizeSidebarDefaults(undefined).showDeveloperTools).toBe(true);
    expect(
      normalizeSidebarDefaults({ showDeveloperTools: "no" }).showDeveloperTools
    ).toBe(true);
    expect(
      normalizeSidebarDefaults({ showDeveloperTools: false }).showDeveloperTools
    ).toBe(false);
  });

  it("accepts only pages under the entry", () => {
    expect(cleanDefaultPage("config", "/config/devices/dashboard")).toBe(
      "/config/devices/dashboard"
    );
    expect(cleanDefaultPage("config", "/config")).toBeUndefined();
    expect(cleanDefaultPage("config", "/lovelace/0")).toBeUndefined();
    expect(
      cleanDefaultPage("config", "//evil.example/config/x")
    ).toBeUndefined();
    expect(cleanDefaultPage("config", "/config/../profile")).toBeUndefined();
    expect(cleanDefaultPage("tools", "/config/tools/yaml")).toBe(
      "/config/tools/yaml"
    );
    expect(cleanDefaultPage("tools", "/config/devices")).toBeUndefined();
  });

  it("drops unknown entries and bad pages", () => {
    const value = normalizeSidebarDefaults({
      defaultPages: {
        config: "/config/areas/dashboard",
        history: "/history",
        tools: 5,
      },
    });
    expect(value.defaultPages).toEqual({ config: "/config/areas/dashboard" });
  });

  it("opens the default page from outside the entry, never from inside it", () => {
    const defaults = normalizeSidebarDefaults({
      defaultPages: { config: "/config/devices/dashboard" },
    });
    expect(resolveEntryRoute("config", "/lovelace/0", defaults)).toBe(
      "/config/devices/dashboard"
    );
    expect(
      resolveEntryRoute("config", "/config/automation/dashboard", defaults)
    ).toBe("/config");
    expect(resolveEntryRoute("tools", "/lovelace/0", defaults)).toBe(
      "/config/tools"
    );
  });
});
