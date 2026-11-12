import type { LitElement } from "lit";
import type { HomeAssistant } from "../../types";
import type { TabStoreController } from "./tab-store-controller";

/** One page that can be a tab in the strip. */
export interface PageTab {
  urlPath: string;
  title: string;
  icon?: string;
  iconPath?: string;
}

/** A string from the page tabs block, in the chosen language mode. */
export type TabTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** The element that owns the tab modules and whose shadow root they render into. */
export interface TabsHost extends LitElement {
  hass: HomeAssistant;
  /** Gives the page panel the strip controls, for the ARIA links between them. */
  panelProvider?: () => HTMLElement | null;
}

declare global {
  interface HASSDomEvents {
    /** Right click, menu key, Shift+F10 or long press on a tab. */
    "tab-context-menu": {
      tabId: string;
      anchor: HTMLElement;
      shift: boolean;
      surface: string;
    };
    /** The same gestures on a group header. */
    "tab-group-context-menu": {
      groupId: string;
      anchor: HTMLElement;
      shift: boolean;
      surface: string;
    };
    /** A context gesture on empty strip space. */
    "strip-context-menu": { anchor: HTMLElement; surface: string };
  }
}

/** What every tab module is given by the shell. */
export interface TabModuleContext {
  host: TabsHost;
  t: TabTranslate;
  store: TabStoreController;
}
