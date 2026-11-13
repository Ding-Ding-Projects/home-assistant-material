import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import type { CollapsibleStatistic } from "../../../../components/layout/collapsible-statistics-logic";
import { subscribeDHCPDiscovery } from "../../../../data/dhcp";
import { subscribeSSDPDiscovery } from "../../../../data/ssdp";
import { subscribeZeroconfDiscovery } from "../../../../data/zeroconf";
import type { HomeAssistant } from "../../../../types";

export type DiscoveryBrowser = "zeroconf" | "ssdp" | "dhcp";

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
