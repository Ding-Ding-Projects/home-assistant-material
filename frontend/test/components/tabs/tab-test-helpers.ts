import { getStorage } from "../../../src/common/decorators/storage";
import type { HomeAssistant } from "../../../src/types";

/** Storage keys the tab group elements read and write. */
export const TAB_KEYS = [
  "pageTabsGroups",
  "pageTabsDestinations",
  "pageTabsPinned",
  "pageTabsOrder",
  "pageTabsClosed",
  "pageTabsSeen",
  "pageTabsDock",
  "pageTabsGroupAppearance",
  "elementLocks",
];

export const resetTabStorage = () =>
  TAB_KEYS.forEach((key) => getStorage().setValue(key, undefined));

/** A page query matcher the panels need: the test browser has none. */
export const stubMatchMedia = (matches = false) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (media: string) => ({
      matches,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
};

const panel = (url_path: string, title: string) => ({
  url_path,
  title,
  icon: "mdi:circle",
  component_name: "custom",
  config: {},
  show_in_sidebar: true,
});

/** The smallest hass the tab group elements need: four pages, English text. */
export const makeHass = (): HomeAssistant =>
  ({
    panels: {
      a: panel("a", "Alpha"),
      b: panel("b", "Bravo"),
      c: panel("c", "Charlie"),
      d: panel("d", "Delta"),
    },
    panelUrl: "d",
    language: "en",
    translationMetadata: { translations: {} },
    user: { is_admin: false },
    localize: (key: string) => (key.startsWith("panel.") ? "" : key),
  }) as unknown as HomeAssistant;

/** Lets pending updates and promise callbacks run. */
export const settle = async (
  ...elements: { updateComplete: Promise<unknown> }[]
) => {
  await Promise.all(elements.map((element) => element.updateComplete));
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.all(elements.map((element) => element.updateComplete));
};
