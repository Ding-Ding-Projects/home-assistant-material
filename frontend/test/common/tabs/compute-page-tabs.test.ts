import { describe, expect, it } from "vitest";
import { computePageTabs } from "../../../src/components/tabs/compute-page-tabs";
import type { HomeAssistant, PanelInfo } from "../../../src/types";

const panel = (url_path: string, title: string, component_name: string) =>
  ({
    url_path,
    title,
    component_name,
    icon: "mdi:home",
    config: null,
    default_visible: true,
  }) as unknown as PanelInfo;

const localize = ((key: string) => key) as HomeAssistant["localize"];

const list: PanelInfo[] = [
  panel("map", "Map", "map"),
  panel("media-browser", "Media", "media-browser"),
  panel("lovelace", "Overview", "lovelace"),
  panel("history", "History", "history"),
  panel("energy", "Energy", "energy"),
  panel("activity", "Activity", "logbook"),
  panel("dash", "Garden", "lovelace"),
];

const urlPaths = (panels: PanelInfo[]) =>
  computePageTabs(
    Object.fromEntries(
      panels.map((item) => [item.url_path, item])
    ) as HomeAssistant["panels"],
    "lovelace",
    false,
    localize
  ).map((tab) => tab.urlPath);

describe("computePageTabs order", () => {
  it("is the same whatever order the server lists the panels in", () => {
    const forward = urlPaths(list);
    const backward = urlPaths([...list].reverse());
    expect(backward).toEqual(forward);
    expect(forward.slice(0, 4)).toEqual(["lovelace", "dash", "energy", "map"]);
  });
});
