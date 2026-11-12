import {
  mdiBug,
  mdiCalendarClock,
  mdiChartBar,
  mdiCodeBraces,
  mdiCodeJson,
  mdiConsole,
  mdiFileCode,
  mdiFileSwap,
  mdiFormatListBulletedSquare,
  mdiGestureTap,
  mdiHistory,
  mdiMicrophone,
  mdiPalette,
} from "@mdi/js";
import { filterNavigationPages } from "../common/config/filter_navigation_pages";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import type { LocalizeKeys } from "../common/translations/localize";
import { configSections } from "../panels/config/config-sections";
import type { HomeAssistant } from "../types";

/**
 * The settings pages and tools pages of the New tab catalog. The wide catalog
 * (`ha-page-tabs`) and the Pages sheet of the phone bar (`ha-phone-bar`) list
 * the same entries, so they are worked out here once.
 */

export interface CatalogSettingsEntry {
  path: string;
  title: string;
  iconPath?: string;
}

/**
 * The tools pages, in the order the tools panel lists its own tabs. Each entry
 * is a real route under /config/tools and uses the title that panel shows.
 */
interface CatalogToolDefinition {
  panel: string;
  translationKey: string;
  iconPath: string;
  /** Only listed when this component is loaded, as the tools panel does. */
  component?: string;
}

const CATALOG_TOOLS: CatalogToolDefinition[] = [
  {
    panel: "yaml",
    translationKey: "ui.panel.config.tools.tabs.yaml.title",
    iconPath: mdiFileCode,
  },
  {
    panel: "state",
    translationKey: "ui.panel.config.tools.tabs.states.title",
    iconPath: mdiFormatListBulletedSquare,
  },
  {
    panel: "action",
    translationKey: "ui.panel.config.tools.tabs.actions.title",
    iconPath: mdiGestureTap,
  },
  {
    panel: "action-history",
    translationKey: "ui.panel.config.tools.tabs.action_history.title",
    iconPath: mdiHistory,
    component: "logbook",
  },
  {
    panel: "template",
    translationKey: "ui.panel.config.tools.tabs.templates.title",
    iconPath: mdiCodeBraces,
  },
  {
    panel: "event",
    translationKey: "ui.panel.config.tools.tabs.events.title",
    iconPath: mdiCalendarClock,
  },
  {
    panel: "debug-console",
    translationKey: "ui.panel.config.tools.tabs.debug_console.title",
    iconPath: mdiConsole,
    component: "debug_console",
  },
  {
    panel: "statistics",
    translationKey: "ui.panel.config.tools.tabs.statistics.title",
    iconPath: mdiChartBar,
  },
  {
    panel: "assist",
    translationKey: "ui.panel.config.tools.tabs.assist.tab",
    iconPath: mdiMicrophone,
  },
  {
    panel: "base64",
    translationKey: "ui.panel.config.tools.tabs.base64.title",
    iconPath: mdiCodeJson,
  },
  {
    panel: "colour",
    translationKey: "ui.panel.config.tools.tabs.colour.title",
    iconPath: mdiPalette,
  },
  {
    panel: "converter",
    translationKey: "ui.panel.config.tools.tabs.converter.title",
    iconPath: mdiFileSwap,
  },
  {
    panel: "debug",
    translationKey: "ui.panel.config.tools.tabs.debug.title",
    iconPath: mdiBug,
  },
];

/**
 * The settings and tools titles live in the settings translations, which are
 * only loaded once a settings page has been opened. Load them when a catalog
 * opens, so the rows have their titles wherever the catalog is opened from.
 */
export const loadCatalogTranslations = async (
  hass: HomeAssistant
): Promise<void> => {
  try {
    await hass.loadFragmentTranslation("config");
  } catch (_err) {
    // The rows without a title are left out below.
  }
};

/** Settings pages from the settings overview, shown to this person only. */
export const computeSettingsEntries = (
  hass: HomeAssistant
): CatalogSettingsEntry[] => {
  const pages = filterNavigationPages(hass, [
    ...configSections.dashboard,
    ...configSections.dashboard_2,
    ...configSections.dashboard_3,
  ]);
  const seen = new Set<string>();
  const entries: CatalogSettingsEntry[] = [];
  for (const page of pages) {
    if (!page.translationKey || page.path.startsWith("#")) {
      continue;
    }
    const title = hass.localize(
      `ui.panel.config.dashboard.${page.translationKey}.main` as LocalizeKeys
    );
    if (!title || seen.has(page.path)) {
      continue;
    }
    seen.add(page.path);
    entries.push({ path: page.path, title, iconPath: page.iconPath });
  }
  return entries;
};

/** Tools pages from the tools panel, shown to this person only. */
export const computeToolEntries = (
  hass: HomeAssistant
): CatalogSettingsEntry[] => {
  if (!hass.user?.is_admin) {
    return [];
  }
  return CATALOG_TOOLS.filter(
    (tool) => !tool.component || isComponentLoaded(hass.config, tool.component)
  )
    .map((tool) => ({
      path: `/config/tools/${tool.panel}`,
      title: hass.localize(tool.translationKey as LocalizeKeys),
      iconPath: tool.iconPath,
    }))
    .filter((entry) => !!entry.title);
};
