import type { PropertyValues } from "lit";
import { mainWindow } from "../common/dom/get_main_window";
import { tabTitleSuffix } from "../common/identity/identity";
import { getConfigSubpageTitle, getPanelTitleFromUrlPath } from "../data/panel";
import { configSections } from "../panels/config/config-sections";
import type { Constructor, HomeAssistant } from "../types";
import type { HassBaseEl } from "./hass-base-mixin";

const setPageTitle = (title: string | undefined) => {
  const name = tabTitleSuffix();
  document.title = title ? `${title} – ${name}` : name;
};

const getRoutePath = (): string =>
  // In demo mode, use hash; otherwise use pathname
  __DEMO__ ? window.location.hash.substring(1) : window.location.pathname;

export const panelTitleMixin = <T extends Constructor<HassBaseEl>>(
  superClass: T
) =>
  class extends superClass {
    private _previousPath?: string;

    public connectedCallback(): void {
      super.connectedCallback();
      // The title also follows the page inside a panel, which changes the
      // address without changing hass
      mainWindow.addEventListener("location-changed", this._locationChanged);
      mainWindow.addEventListener("popstate", this._locationChanged);
    }

    public disconnectedCallback(): void {
      super.disconnectedCallback();
      mainWindow.removeEventListener("location-changed", this._locationChanged);
      mainWindow.removeEventListener("popstate", this._locationChanged);
    }

    private _locationChanged = (): void => {
      if (this.hass && this._previousPath !== getRoutePath()) {
        this._refreshTitle(undefined);
      }
    };

    protected updated(changedProps: PropertyValues<this>): void {
      super.updated(changedProps);
      if (!changedProps.has("hass") || !this.hass) {
        return;
      }
      this._refreshTitle(changedProps.get("hass") as HomeAssistant | undefined);
    }

    private _refreshTitle(oldHass: HomeAssistant | undefined): void {
      const hass = this.hass;
      if (!hass) {
        return;
      }
      const currentPath = getRoutePath();

      // Update title when panel, localize, or route path changes
      if (
        !oldHass ||
        oldHass.panels !== hass.panels ||
        oldHass.panelUrl !== hass.panelUrl ||
        oldHass.localize !== hass.localize ||
        this._previousPath !== currentPath
      ) {
        this._previousPath = currentPath;

        let title: string | undefined;

        // Try to get specific subpage title for config panel
        if (hass.panelUrl === "config") {
          title = getConfigSubpageTitle(hass, currentPath, configSections);
        }

        // Fall back to panel title
        if (!title) {
          title = getPanelTitleFromUrlPath(hass, hass.panelUrl);
        }

        setPageTitle(title);
      }
    }
  };
