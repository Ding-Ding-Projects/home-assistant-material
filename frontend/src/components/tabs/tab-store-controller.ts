import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { ReactiveController } from "lit";
import { getStorage } from "../../common/decorators/storage";
import { mainWindow } from "../../common/dom/get_main_window";
import { currentPath } from "../../common/url/current-path";
import type { LockStore } from "../../common/locks/element-locks";
import { LOCKS_STORAGE_KEY, readLocks } from "../../common/locks/element-locks";
import type { TabAppearanceStore } from "../../common/tabs/tab-appearance-store";
import {
  readTabAppearance,
  TAB_APPEARANCE_STORAGE_KEY,
} from "../../common/tabs/tab-appearance-store";
import type { DockEdge } from "../../common/tabs/tab-dock";
import {
  COLLAPSE_STORAGE_KEY,
  DOCK_STORAGE_KEY,
  FLOAT_STORAGE_KEY,
  readDock,
  writeDock,
} from "../../common/tabs/tab-dock";
import { MERGE_STORAGE_KEY } from "../../common/tabs/tab-pane";
import type { StripSegment, TabGroup } from "../../common/tabs/tab-groups";
import {
  GROUPS_STORAGE_KEY,
  layoutStrip,
  readGroups,
  writeGroups,
} from "../../common/tabs/tab-groups";
import {
  DESTINATIONS_STORAGE_KEY,
  readDestinations,
} from "../../common/tabs/tab-destination-list";
import { migrateTabState } from "../../common/tabs/tab-migrate";
import {
  SEEN_TABS_STORAGE_KEY,
  readSeen,
  writeSeen,
} from "../../common/tabs/tab-seen";
import { getDefaultPanelUrlPath } from "../../data/panel";
import { computePageTabs } from "./compute-page-tabs";
import { loadCatalogTranslations } from "../page-catalog-entries";
import { computeStripTabs, currentTabId } from "./destination-tabs";
import type { GroupAppearanceStore } from "./tab-group-appearance-store";
import {
  GROUP_APPEARANCE_STORAGE_KEY,
  readGroupAppearance,
} from "./tab-group-appearance-store";
import { initialDockDecision, MAIN_SURFACE } from "./tab-strip-layout";
import type { PageTab, TabsHost } from "./tab-types";

export const CLOSED_TABS_STORAGE_KEY = "pageTabsClosed";
export const TABS_ORDER_STORAGE_KEY = "pageTabsOrder";
export const PINNED_TABS_STORAGE_KEY = "pageTabsPinned";

const LEGACY_KEYS = [
  CLOSED_TABS_STORAGE_KEY,
  TABS_ORDER_STORAGE_KEY,
  PINNED_TABS_STORAGE_KEY,
] as const;

const KEYS = [
  ...LEGACY_KEYS,
  GROUPS_STORAGE_KEY,
  DESTINATIONS_STORAGE_KEY,
  DOCK_STORAGE_KEY,
  FLOAT_STORAGE_KEY,
  COLLAPSE_STORAGE_KEY,
  MERGE_STORAGE_KEY,
  TAB_APPEARANCE_STORAGE_KEY,
  GROUP_APPEARANCE_STORAGE_KEY,
  LOCKS_STORAGE_KEY,
] as const;

/** Whether the saved tab state of an earlier version is already in this browser. */
const legacyStatePresent = (): boolean => {
  const storage = getStorage();
  return [...LEGACY_KEYS, SEEN_TABS_STORAGE_KEY].some(
    (key) => storage.getValue(key) !== undefined
  );
};

/**
 * Chooses the edge of a strip that has never been offered a tab: an
 * installation with saved tab state keeps the top edge it always had, a new
 * installation uses the default (left). Safe to call again: it acts only
 * while the strip remembers no offered tab and no edge was chosen.
 */
export const ensureInitialDock = (surface = MAIN_SURFACE): void => {
  const storage = getStorage();
  const stored = storage.getValue<Record<string, unknown>>(DOCK_STORAGE_KEY);
  const decision = initialDockDecision({
    legacyPresent: legacyStatePresent(),
    seenPresent: readSeen(surface).length > 0,
    dockChosen: Boolean(
      stored && Object.prototype.hasOwnProperty.call(stored, surface)
    ),
  });
  if (decision) {
    writeDock(surface, decision);
  }
};

/**
 * The saved state of the tab strip: which tabs are closed, the order and the
 * pinned tabs, the groups, the edge the strip is docked to, the look of each
 * tab and the tab and group locks. Each lives in this browser under its own
 * key, shared with the phone bar and with the menus and pickers of the strip,
 * which change state only through the model in `common/tabs`. The host
 * re-renders when any key changes, here or in another browser tab.
 *
 * On the first update it also keeps the memory of offered tabs (`tab-seen`),
 * so a new installation opens every tab, an update opens only the tabs never
 * offered, and a closed tab stays closed.
 */
export class TabStoreController implements ReactiveController {
  public readonly surface = MAIN_SURFACE;

  private _unsubscribe: UnsubscribeFunc[] = [];

  private _awayValues?: string[];

  private _cache = new Map<string, unknown>();

  /** The address shown when the list of tabs was last drawn. */
  private _path = currentPath();

  /** Whether the settings titles of destination tabs were asked for. */
  private _titlesRequested = false;

  constructor(private readonly _host: TabsHost) {
    const storage = getStorage();
    KEYS.forEach((key) => storage.addFromStorage(key));
    // Decided before anything is saved, so a new installation is told apart.
    ensureInitialDock(this.surface);
    _host.addController(this);
  }

  public hostConnected() {
    const storage = getStorage();
    if (this._awayValues) {
      const changed = KEYS.some(
        (key, index) => this._awayValues![index] !== this._snapshot(key)
      );
      this._awayValues = undefined;
      if (changed) {
        this._cache.clear();
        this._host.requestUpdate();
      }
    }
    if (!this._unsubscribe.length) {
      this._unsubscribe = KEYS.map((key) =>
        storage.subscribeChanges(key, () => {
          this._cache.clear();
          this._host.requestUpdate();
        })
      );
    }
    // The selected tab follows the address, also inside one page (settings
    // routes change without the panel changing).
    mainWindow.addEventListener("location-changed", this._locationChanged);
    mainWindow.addEventListener("popstate", this._locationChanged);
    this._locationChanged();
  }

  private _locationChanged = () => {
    const path = currentPath();
    if (path !== this._path) {
      this._path = path;
      this._host.requestUpdate();
    }
  };

  public hostDisconnected() {
    mainWindow.removeEventListener("location-changed", this._locationChanged);
    mainWindow.removeEventListener("popstate", this._locationChanged);
    this._unsubscribe.forEach((unsubscribe) => unsubscribe());
    this._unsubscribe = [];
    this._awayValues = KEYS.map((key) => this._snapshot(key));
  }

  public hostUpdate() {
    if (this._host.hass?.panels) {
      this._remember();
      this._loadDestinationTitles();
    }
  }

  // The titles of settings pages and tools live in the settings translations,
  // which are loaded on demand. A strip that has destination tabs asks for them
  // once, so the tabs are back after a reload without opening the catalog.
  private _loadDestinationTitles() {
    if (this._titlesRequested || !readDestinations(this.surface).length) {
      return;
    }
    this._titlesRequested = true;
    void loadCatalogTranslations(this._host.hass).then(() =>
      this._host.requestUpdate()
    );
  }

  private _snapshot(key: string): string {
    return JSON.stringify(getStorage().getValue(key));
  }

  private _read(key: string): string[] {
    return getStorage().getValue<string[]>(key) ?? [];
  }

  private _write(key: string, value: string[]) {
    getStorage().setValue(key, value);
    this._host.requestUpdate();
  }

  private _cached<T>(key: string, read: () => T): T {
    if (!this._cache.has(key)) {
      this._cache.set(key, read());
    }
    return this._cache.get(key) as T;
  }

  /** The pages of the sidebar: the tabs the strip offers on its own. */
  private _availableIds(): string[] {
    return this._pageTabs().map((tab) => tab.urlPath);
  }

  /** Remembers the tabs on offer, and saves the lists a first run needs. */
  private _remember() {
    const storage = getStorage();
    const available = this._availableIds();
    if (!available.length) {
      return;
    }
    const seen = readSeen(this.surface);
    const groups = readGroups(this.surface);
    const migrated = migrateTabState({
      stored: {
        closed: storage.getValue(CLOSED_TABS_STORAGE_KEY),
        order: storage.getValue(TABS_ORDER_STORAGE_KEY),
        pinned: storage.getValue(PINNED_TABS_STORAGE_KEY),
      },
      available,
      seen,
      groups,
    });
    if (migrated.firstRun) {
      // The edge is settled first: it needs to know the strip was never offered a tab.
      ensureInitialDock(this.surface);
    }
    if (migrated.firstRun || migrated.newlyOffered.length) {
      writeSeen(this.surface, migrated.seen);
    }
    LEGACY_KEYS.forEach((key) => {
      if (storage.getValue(key) === undefined) {
        storage.setValue(key, []);
      }
    });
    if (JSON.stringify(migrated.groups) !== JSON.stringify(groups)) {
      writeGroups(this.surface, migrated.groups);
    }
  }

  /** Tabs the person closed. A tab that was never closed is open. */
  public get closed(): string[] {
    return this._read(CLOSED_TABS_STORAGE_KEY);
  }

  public set closed(value: string[]) {
    this._write(CLOSED_TABS_STORAGE_KEY, value);
  }

  /** Every tab id in the order the person put them. */
  public get order(): string[] {
    return this._read(TABS_ORDER_STORAGE_KEY);
  }

  public set order(value: string[]) {
    this._write(TABS_ORDER_STORAGE_KEY, value);
  }

  /** Tabs that sit first and cannot be closed by accident. */
  public get pinned(): string[] {
    return this._read(PINNED_TABS_STORAGE_KEY);
  }

  public set pinned(value: string[]) {
    this._write(PINNED_TABS_STORAGE_KEY, value);
  }

  public get groups(): TabGroup[] {
    return this._cached("groups", () => readGroups(this.surface));
  }

  public set groups(value: TabGroup[]) {
    this._cache.delete("groups");
    writeGroups(this.surface, value);
    this._host.requestUpdate();
  }

  /** The edge the strip is docked to. */
  public get dock(): DockEdge {
    return this._cached("dock", () => readDock(this.surface));
  }

  public set dock(edge: DockEdge) {
    this._cache.delete("dock");
    writeDock(this.surface, edge);
    this._host.requestUpdate();
  }

  /** The look the person gave each tab, by tab id. */
  public get appearance(): TabAppearanceStore {
    return this._cached("appearance", readTabAppearance);
  }

  /** The look the person gave each group header, by strip and group id. */
  public get groupAppearance(): GroupAppearanceStore {
    return this._cached("groupAppearance", readGroupAppearance);
  }

  public get locks(): LockStore {
    return this._cached("locks", readLocks);
  }

  private _pageTabs(): PageTab[] {
    const hass = this._host.hass;
    return computePageTabs(
      hass.panels,
      getDefaultPanelUrlPath(hass),
      Boolean(hass.user?.is_admin),
      hass.localize
    );
  }

  /** Every tab that can be in the strip: pages, then opened settings pages and tools. */
  private _allTabs(): PageTab[] {
    return computeStripTabs(this._host.hass, this.surface);
  }

  /** The tab selected for the location shown now. */
  public currentTabId(): string | undefined {
    return this._host.hass
      ? currentTabId(this._host.hass, this.surface)
      : undefined;
  }

  /** The strip's layout of the given tabs: pinned region, groups and loose tabs. */
  public layout(ids: readonly string[]): StripSegment[] {
    return layoutStrip({
      visible: ids,
      order: this.order,
      pinned: this.pinned,
      groups: this.groups,
    });
  }

  /** Every page that can be a tab, in strip order: pinned first, groups together. */
  public orderedTabs(): PageTab[] {
    const tabs = this._allTabs();
    const byId = new Map(tabs.map((tab) => [tab.urlPath, tab]));
    const ids: string[] = [];
    this.layout(tabs.map((tab) => tab.urlPath)).forEach((segment) => {
      if (segment.kind === "tab") {
        ids.push(segment.id);
      } else {
        ids.push(...segment.ids);
      }
    });
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  }
}
