import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import { readDestinations } from "../../../src/common/tabs/tab-destination-list";
import { makeHass, resetTabStorage, stubMatchMedia } from "./tab-test-helpers";

// An administrator account: the settings panel exists, so its pages can be tabs.
const hassWithConfig = () => {
  const hass = makeHass();
  hass.panels = {
    ...hass.panels,
    config: {
      url_path: "config",
      title: null,
      icon: null,
      component_name: "config",
      config: null,
      config_panel_domain: undefined,
    },
  } as unknown as typeof hass.panels;
  return hass;
};

// What the catalog offers right now. A test changes it to hide a destination.
const offered = {
  settings: [
    { path: "/config/automation", title: "Automations", iconPath: "m-auto" },
    { path: "/config/system/updates", title: "Updates", iconPath: "m-upd" },
  ],
  tools: [
    {
      path: "/config/tools/converter",
      title: "File converter",
      iconPath: "m-conv",
    },
    { path: "/config/tools/yaml", title: "YAML", iconPath: "m-yaml" },
  ],
};

vi.mock("../../../src/components/page-catalog-entries", () => ({
  computeSettingsEntries: () => offered.settings,
  computeToolEntries: () => offered.tools,
  loadCatalogTranslations: async () => undefined,
}));

const {
  chooseDestination,
  computeDestinationTabs,
  computeStripTabs,
  currentTabId,
  destinationCandidates,
  isDestinationReachable,
} = await import("../../../src/components/tabs/destination-tabs");

const original = {
  settings: [...offered.settings],
  tools: [...offered.tools],
};

const goTo = (path: string) => window.history.pushState({}, "", path);

// Settings pages and tools are tabs only when the person chooses them: they
// are saved, they come back after a reload, a second choice focuses the tab it
// already has, a page the person may not see is hidden and not deleted, and
// the most specific open tab is the selected one.

describe("settings pages and tools as tabs", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetTabStorage();
    offered.settings = [...original.settings];
    offered.tools = [...original.tools];
    goTo("/");
  });

  afterEach(() => {
    resetTabStorage();
    goTo("/");
  });

  it("opens no destination on its own", () => {
    const hass = hassWithConfig();
    expect(computeStripTabs(hass).map((tab) => tab.urlPath)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("opens a chosen settings page as its own tab with title and icon", () => {
    const hass = hassWithConfig();
    const choice = chooseDestination("settings", "/config/automation");
    expect(choice).toEqual({
      route: "/config/automation",
      opened: true,
      full: false,
    });
    const tabs = computeStripTabs(hass);
    expect(tabs.map((tab) => tab.urlPath)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "settings:config/automation",
    ]);
    expect(tabs[4]).toMatchObject({ title: "Automations", iconPath: "m-auto" });
  });

  it("opens a settings sub-page and a tool, in the order chosen", () => {
    const hass = hassWithConfig();
    chooseDestination("tool", "/config/tools/converter");
    chooseDestination("settings", "/config/system/updates");
    expect(computeDestinationTabs(hass).map((tab) => tab.urlPath)).toEqual([
      "tool:config/tools/converter",
      "settings:config/system/updates",
    ]);
  });

  it("focuses the tab that is already open and never adds a second", () => {
    chooseDestination("settings", "/config/automation");
    const again = chooseDestination("settings", "/config/automation");
    expect(again).toEqual({
      route: "/config/automation",
      opened: false,
      full: false,
    });
    expect(readDestinations("main")).toEqual(["settings:config/automation"]);
  });

  it("opens a closed destination again without adding it twice", () => {
    chooseDestination("tool", "/config/tools/yaml");
    getStorage().setValue("pageTabsClosed", ["tool:config/tools/yaml", "x"]);
    const choice = chooseDestination("tool", "/config/tools/yaml");
    expect(choice.opened).toBe(true);
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["x"]);
    expect(readDestinations("main")).toEqual(["tool:config/tools/yaml"]);
  });

  it("keeps the saved tabs after a reload", () => {
    chooseDestination("settings", "/config/automation");
    chooseDestination("tool", "/config/tools/converter");
    // A new page load reads only what was saved.
    const stored = JSON.parse(
      window.localStorage.getItem("pageTabsDestinations")!
    );
    expect(stored).toEqual({
      main: ["settings:config/automation", "tool:config/tools/converter"],
    });
    expect(computeDestinationTabs(hassWithConfig())).toHaveLength(2);
  });

  it("hides a destination the person may not see, without deleting it", () => {
    chooseDestination("settings", "/config/automation");
    chooseDestination("tool", "/config/tools/yaml");
    // An administrator page seen by another account, or an unloaded component.
    offered.tools = [];
    // The visibility checks change with the account or the loaded components,
    // which arrive as a new hass.
    expect(
      computeDestinationTabs(hassWithConfig()).map((tab) => tab.urlPath)
    ).toEqual(["settings:config/automation"]);
    expect(readDestinations("main")).toEqual([
      "settings:config/automation",
      "tool:config/tools/yaml",
    ]);
    offered.tools = [...original.tools];
    expect(computeDestinationTabs(hassWithConfig())).toHaveLength(2);
  });

  it("offers a settings page and a tool that share an address only once", () => {
    offered.tools = [
      { path: "/config/automation", title: "Same address", iconPath: "x" },
    ];
    const candidates = destinationCandidates(hassWithConfig());
    expect(
      candidates.filter((entry) => entry.path === "/config/automation")
    ).toHaveLength(1);
  });

  it("hides the pages of a panel this person does not have", () => {
    chooseDestination("settings", "/config/automation");
    // A non-administrator account has no settings panel, so a tab would lead nowhere.
    const hass = makeHass();
    expect(destinationCandidates(hass)).toEqual([]);
    expect(computeDestinationTabs(hass)).toEqual([]);
    expect(isDestinationReachable(hass, "/config/automation")).toBe(false);
    expect(isDestinationReachable(hassWithConfig(), "/config/automation")).toBe(
      true
    );
  });

  it("selects the page tab when no destination tab claims the address", () => {
    const hass = { ...hassWithConfig(), panelUrl: "d" };
    goTo("/d");
    expect(currentTabId(hass)).toBe("d");
  });

  it("selects a destination tab while its address, or one below it, is shown", () => {
    const hass = { ...hassWithConfig(), panelUrl: "config" };
    chooseDestination("settings", "/config/automation");
    goTo("/config/automation");
    expect(currentTabId(hass)).toBe("settings:config/automation");
    goTo("/config/automation/edit/9");
    expect(currentTabId(hass)).toBe("settings:config/automation");
    // Another settings page: the Settings tab is selected again.
    goTo("/config/devices");
    expect(currentTabId(hass)).toBe("config");
  });

  it("does not select a closed destination tab", () => {
    const hass = { ...hassWithConfig(), panelUrl: "config" };
    chooseDestination("tool", "/config/tools/yaml");
    getStorage().setValue("pageTabsClosed", ["tool:config/tools/yaml"]);
    goTo("/config/tools/yaml");
    expect(currentTabId(hass)).toBe("config");
  });
});
