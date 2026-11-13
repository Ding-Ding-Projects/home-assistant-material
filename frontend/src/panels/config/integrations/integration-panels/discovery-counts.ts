import memoizeOne from "memoize-one";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import type { CollapsibleStatistic } from "../../../../components/layout/collapsible-statistics-logic";
import { subscribeDHCPDiscovery } from "../../../../data/dhcp";
import { subscribeSSDPDiscovery } from "../../../../data/ssdp";
import { subscribeZeroconfDiscovery } from "../../../../data/zeroconf";
import type { PageNavigation } from "../../../../layouts/hass-tabs-subpage";
import type { HomeAssistant } from "../../../../types";
import { configSections } from "../../config-sections";

export type DiscoveryBrowser = "zeroconf" | "ssdp" | "dhcp";

/** The order the browsers are offered in, on the Discovery page and in its switch. */
const DISCOVERY_TAB_PATHS = [
  "/config/zeroconf",
  "/config/ssdp",
  "/config/dhcp",
] as const;

/**
 * The three discovery browsers as the tabs of one Discovery page. Each browser
 * keeps its own address; every one of them shows this row, so switching
 * between them is a segmented switch on one page. A browser whose integration
 * is not loaded is left out by the layout.
 */
export const discoveryTabs = memoizeOne((): PageNavigation[] =>
  DISCOVERY_TAB_PATHS.map((path) =>
    configSections.network_discovery.find((tab) => tab.path === path)
  ).filter((tab): tab is PageNavigation => !!tab)
);

export type DiscoveryCounts = Partial<Record<DiscoveryBrowser, number>>;

const BROWSERS: DiscoveryBrowser[] = ["zeroconf", "ssdp", "dhcp"];

/**
 * Follows the other discovery browsers that are loaded, so each browser page
 * can show how many entries all of them hold right now. The page's own list is
 * counted by the page itself.
 */
export const subscribeOtherDiscoveryCounts = (
  hass: HomeAssistant,
  own: DiscoveryBrowser,
  onCount: (browser: DiscoveryBrowser, count: number) => void
): UnsubscribeFunc[] =>
  BROWSERS.filter(
    (browser) => browser !== own && isComponentLoaded(hass.config, browser)
  ).map((browser) => {
    switch (browser) {
      case "zeroconf":
        return subscribeZeroconfDiscovery(hass.connection, (data) =>
          onCount(browser, data.length)
        );
      case "ssdp":
        return subscribeSSDPDiscovery(hass.connection, (data) =>
          onCount(browser, data.length)
        );
      default:
        return subscribeDHCPDiscovery(hass.connection, (data) =>
          onCount(browser, data.length)
        );
    }
  });

/** One number per discovery browser that has reported a count. */
export const discoveryStatistics = (
  localize: LocalizeFunc,
  counts: DiscoveryCounts
): CollapsibleStatistic[] =>
  BROWSERS.filter((browser) => counts[browser] !== undefined).map(
    (browser) => ({
      id: browser,
      label: localize(`ui.panel.config.network.discovery.${browser}_short`),
      value: counts[browser]!,
    })
  );
