import { describe, expect, it } from "vitest";
import { filterNavigationPages } from "../../../../src/common/config/filter_navigation_pages";
import { configSections } from "../../../../src/panels/config/config-sections";
import {
  FEATURED_PATHS,
  splitPages,
  tileCount,
} from "../../../../src/panels/config/dashboard/settings-layout";
import { sectionCounts } from "../../../../src/panels/config/dashboard/section-summaries";

// Protects the rebuilt settings front: every page the old front offered must
// still be reachable, either as a large tile or as a compact row, and a tile
// shows a number only when that number is really known.

const hass = {
  config: { components: ["zone", "lovelace", "backup", "marketplace"] },
  user: { is_admin: true },
  entities: {},
  auth: { external: { config: { hasSettingsScreen: true } } },
} as any;

const allPages = [
  ...configSections.dashboard,
  ...configSections.dashboard_external_settings,
  ...configSections.dashboard_2,
  ...configSections.dashboard_3,
  ...configSections.backup,
];

describe("settings front layout", () => {
  it("renders every visible page as a tile or a row, exactly once", () => {
    const visible = filterNavigationPages(hass, allPages, {
      hasBluetoothConfigEntries: true,
    });
    const { tiles, rows } = splitPages(visible);
    const rendered = [...tiles, ...rows].map((page) => page.path);
    const expected = [...new Set(visible.map((page) => page.path))];
    expect(rendered.slice().sort()).toEqual(expected.slice().sort());
    expect(new Set(rendered).size).toBe(rendered.length);
    expect(visible.length).toBeGreaterThan(10);
  });

  it("puts the featured places on tiles, in a fixed order", () => {
    const visible = filterNavigationPages(hass, allPages);
    const { tiles, rows } = splitPages(visible);
    expect(tiles.map((page) => page.path)).toEqual([...FEATURED_PATHS]);
    expect(rows.some((page) => tiles.includes(page))).toBe(false);
  });

  it("shows a count only when it is known", () => {
    const counts = sectionCounts({
      devices: { a: {}, b: {} },
      states: { "automation.x": {} },
      areas: { hall: {} },
      floors: {},
      panels: {},
      config: {},
    } as any);
    expect(tileCount("/config/integrations", counts)).toBe(2);
    expect(tileCount("/config/automation", counts)).toBe(1);
    expect(tileCount("/config/areas", counts)).toBe(1);
    expect(tileCount("/config/backup", counts)).toBeUndefined();
    expect(tileCount("/config/areas", undefined)).toBeUndefined();
  });
});
