import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiAccountVoice,
  mdiBackupRestore,
  mdiChartBoxOutline,
  mdiClose,
  mdiCodeBraces,
  mdiCogOutline,
  mdiContentDuplicate,
  mdiDevices,
  mdiDotsVertical,
  mdiDownload,
  mdiExportVariant,
  mdiInformationOutline,
  mdiLinkVariant,
  mdiPencil,
  mdiPencilOff,
  mdiPencilOutline,
  mdiPlusBoxMultipleOutline,
  mdiTransitConnectionVariant,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { cache } from "lit/directives/cache";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { keyed } from "lit/directives/keyed";
import type { RequestSelectedDetail } from "@material/mwc-list/mwc-list-item";
import { dynamicElement } from "../../common/dom/dynamic-element-directive";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { mainWindow } from "../../common/dom/get_main_window";
import { stopPropagation } from "../../common/dom/stop_propagation";
import { consume } from "../../common/decorators/consume";
import { computeDomain } from "../../common/entity/compute_domain";
import {
  computeEntityEntryNameParts,
  computeEntityNameParts,
  type EntityNameType,
} from "../../common/entity/compute_entity_name_display";
import {
  collectPageExport,
  exportContent,
  exportFileName,
  type ExportFormat,
} from "../../common/page/export-page";
import {
  getPersonalPreferences,
  PERSONAL_PREFERENCES_NOT_SAVED_EVENT,
  preferenceHolder,
  subscribePersonalPreferences,
  updatePersonalPreferences,
} from "../../common/preferences/personal-preferences";
import { shouldHandleRequestSelectedEvent } from "../../common/mwc/handle-request-selected-event";
import {
  getHistoryState,
  navigate,
  replaceCurrentUrl,
  updateHistoryState,
} from "../../common/navigate";
import {
  createMoreInfoUrl,
  decodeMoreInfoUrl,
} from "../../common/url/more-info-query-params";
import type { LocalizeKeys } from "../../common/translations/localize";
import { computeRTL } from "../../common/util/compute_rtl";
import { withViewTransition } from "../../common/util/view-transition";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-icon-button";
import "../../components/ha-icon-button-prev";
import "../../components/ha-svg-icon";
import "../../components/ha-switch";
import "./ha-more-info-related";
import { downloadCameraSnapshot } from "../../data/camera";
import { apiContext } from "../../data/context";
import type {
  EntityRegistryEntry,
  ExtEntityRegistryEntry,
} from "../../data/entity/entity_registry";
import {
  getExtendedEntityRegistryEntry,
  updateEntityRegistryEntry,
} from "../../data/entity/entity_registry";
import { UNAVAILABLE } from "../../data/entity/entity";
import { DirtyStateProviderMixin } from "../../mixins/dirty-state-provider-mixin";
import type { EntitySettingsState } from "../../panels/config/entities/entity-registry-settings-editor";
import type { Helper } from "../../panels/config/helpers/const";
import { ScrollableFadeMixin } from "../../mixins/scrollable-fade-mixin";
import {
  haStyleDialog,
  haStyleDialogFixedTop,
  haStyleScrollbar,
} from "../../resources/styles";
import "../../state-summary/state-card-content";
import type { HomeAssistant, HomeAssistantApi } from "../../types";
import { fileDownload } from "../../util/file_download";
import { showToast } from "../../util/toast";
import { showConfirmationDialog } from "../generic/show-dialog-box";
import {
  computeShowHistoryComponent,
  computeShowLogBookComponent,
  DOMAINS_WITH_MORE_INFO,
  EDITABLE_DOMAINS_WITH_ID,
  EDITABLE_DOMAINS_WITH_UNIQUE_ID,
  type MoreInfoView,
} from "./const";
import "./controls/more-info-default";
import type { FavoritesDialogContext } from "./favorites";
import { getFavoritesDialogHandler } from "./favorites";
import "./ha-more-info-add-to";
import "./ha-more-info-details";
import "./ha-more-info-history-and-logbook";
import "./ha-more-info-info";
import "./ha-more-info-settings";
import "./more-info-content";

export interface MoreInfoDialogParams {
  entityId: string | null;
  view?: MoreInfoView;
  /** @deprecated Use `view` instead */
  tab?: MoreInfoView;
  large?: boolean;
  data?: Record<string, any>;
  fromUrl?: boolean;
  returnUrl?: string;
  parentElement?: LitElement;
}

interface ChildView {
  viewTag: string;
  viewTitle?: string;
  viewImport?: () => Promise<unknown>;
  viewParams?: any;
  viewHeaderTag?: string;
  viewHeaderImport?: () => Promise<unknown>;
}

declare global {
  interface HASSDomEvents {
    "show-child-view": ChildView;
    "toggle-edit-mode": boolean;
    "close-child-view": undefined;
  }
}

const DEFAULT_VIEW: MoreInfoView = "info";

const TAB_VIEWS: MoreInfoView[] = ["info", "history", "settings", "related"];

const BREADCRUMB_NAME: EntityNameType[] = [
  "area",
  "parent_device",
  "device",
  "entity",
];

@customElement("ha-more-info-dialog")
export class MoreInfoDialog extends DirtyStateProviderMixin<
  EntitySettingsState | Helper | Record<string, string[]> | null,
  "entity-registry" | "helper" | "vacuum-segment-mapping"
>()(ScrollableFadeMixin(LitElement)) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @property({ type: Boolean, reflect: true }) public large = false;

  @state() private _fill = false;

  @state() private _open = false;

  @state() private _parentEntityIds: string[] = [];

  @query(".content") private _contentElement?: HTMLDivElement;

  @query("ha-adaptive-dialog") private _dialogElement?: HTMLElement;

  @query(".tools") private _toolsElement?: HTMLElement;

  @state() private _entityId?: string | null;

  @state() private _data?: Record<string, any>;

  private _returnUrl?: string;

  @state() private _currView: MoreInfoView = DEFAULT_VIEW;

  @state() private _initialView: MoreInfoView = DEFAULT_VIEW;

  @state() private _childViewStack: ChildView[] = [];

  private get _childView(): ChildView | undefined {
    return this._childViewStack[this._childViewStack.length - 1];
  }

  @state() private _entry?: ExtEntityRegistryEntry | null;

  @state() private _infoEditMode = false;

  @state() private _detailsYamlMode = false;

  @state() private _isEscapeEnabled = true;

  @state() private _narratorOn = false;

  @state() private _exportedName = "";

  private _unsubscribePreferences?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribePreferences = subscribePersonalPreferences(
      this._syncTools
    );
    this._syncTools();
    window.addEventListener(
      PERSONAL_PREFERENCES_NOT_SAVED_EVENT,
      this._preferencesNotSaved
    );
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribePreferences?.();
    this._unsubscribePreferences = undefined;
    window.removeEventListener(
      PERSONAL_PREFERENCES_NOT_SAVED_EVENT,
      this._preferencesNotSaved
    );
  }

  // Tells the person when the browser could not keep a choice.
  private _preferencesNotSaved = (): void => {
    showToast(this, {
      message: this.hass.localize("ui.dialogs.quick-bar.setting_not_saved"),
    });
  };

  private _syncTools = (): void => {
    this._narratorOn = getPersonalPreferences().narratorEnabled;
  };

  protected scrollFadeThreshold = 24;

  protected get scrollableElement(): HTMLElement | null {
    return this._contentElement || null;
  }

  public showDialog(params: MoreInfoDialogParams) {
    this._entityId = params.entityId;
    if (!this._entityId) {
      this.closeDialog();
      return;
    }

    const view = params.view || params.tab || DEFAULT_VIEW;

    this._data = params.data;
    this._returnUrl = params.returnUrl;
    this._currView = view;
    this._initialView = view;
    this._childViewStack = [];
    this._infoEditMode = false;
    this._detailsYamlMode = false;

    this.large = params.large ?? false;
    this._fill = false;
    this._open = true;
    this._loadEntityRegistryEntry();
  }

  private async _loadEntityRegistryEntry() {
    if (!this._entityId) {
      return;
    }
    try {
      this._entry = await getExtendedEntityRegistryEntry(
        this.hass,
        this._entityId
      );
    } catch (_e) {
      this._entry = null;
    }
  }

  public closeDialog() {
    const dialog = this._dialogElement?.shadowRoot?.querySelector("ha-dialog");
    if (dialog) {
      fireEvent(dialog as HTMLElement, "dialog-set-fullscreen", false);
    }
    this._open = false;
  }

  private _dialogClosed() {
    // Restore the pre-dialog URL only while the URL still carries this
    // dialog's deep-link params: navigate() waits for the close only up to
    // DIALOG_WAIT_TIMEOUT and may have committed a new URL already.
    if (
      this._returnUrl &&
      decodeMoreInfoUrl(mainWindow.location.search).entityId === this._entityId
    ) {
      replaceCurrentUrl(this._returnUrl);
    }
    this._entityId = undefined;
    this._parentEntityIds = [];
    this._entry = undefined;
    this._infoEditMode = false;
    this._detailsYamlMode = false;
    this._initialView = DEFAULT_VIEW;
    this._currView = DEFAULT_VIEW;
    this._childViewStack = [];
    this._returnUrl = undefined;
    this._isEscapeEnabled = true;
    window.removeEventListener("dialog-closed", this._enableEscapeKeyClose);
    window.removeEventListener("show-dialog", this._disableEscapeKeyClose);
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _shouldShowEditIcon(
    domain: string,
    stateObj: HassEntity | undefined
  ): boolean {
    if (__DEMO__ || !stateObj) {
      return false;
    }
    if (EDITABLE_DOMAINS_WITH_ID.includes(domain) && stateObj.attributes.id) {
      return true;
    }
    if (EDITABLE_DOMAINS_WITH_UNIQUE_ID.includes(domain)) {
      return true;
    }
    if (domain === "person" && stateObj.attributes.editable !== "false") {
      return true;
    }

    return false;
  }

  private _shouldShowHistory(domain: string): boolean {
    return (
      DOMAINS_WITH_MORE_INFO.includes(domain) &&
      (computeShowHistoryComponent(this.hass, this._entityId!) ||
        computeShowLogBookComponent(this.hass, this._entityId!))
    );
  }

  private _shouldShowAddEntityTo(): boolean {
    return (
      !!this.hass.user?.is_admin ||
      !!this.hass.auth.external?.config.hasEntityAddTo
    );
  }

  private _getDeviceId(): string | null {
    const entity = this.hass.entities[this._entityId!] as
      EntityRegistryEntry | undefined;
    return entity?.device_id ?? null;
  }

  private _setView(view: MoreInfoView) {
    updateHistoryState({
      dialogParams: {
        ...getHistoryState()?.dialogParams,
        view,
      },
    });
    this._currView = view;
    this._syncUrl();
  }

  private _syncUrl() {
    if (!this._returnUrl || !this._entityId) {
      return;
    }
    replaceCurrentUrl(
      createMoreInfoUrl(this._returnUrl, {
        entityId: this._entityId,
        view: this._currView,
      })
    );
  }

  private _goBack() {
    if (this._childView) {
      const dialog =
        this._dialogElement?.shadowRoot?.querySelector("ha-dialog");
      if (dialog) {
        fireEvent(dialog as HTMLElement, "dialog-set-fullscreen", false);
      }
      this._childViewStack = this._childViewStack.slice(0, -1);
      this._detailsYamlMode = false;
      return;
    }
    if (
      this._initialView !== DEFAULT_VIEW &&
      this._currView === this._initialView
    ) {
      this._resetInitialView();
      return;
    }
    if (this._initialView !== this._currView) {
      this._setView(this._initialView);
      return;
    }
    if (this._parentEntityIds.length > 0) {
      this._entityId = this._parentEntityIds.pop();
      this._currView = DEFAULT_VIEW;
      this._loadEntityRegistryEntry();
      this._syncUrl();
    }
  }

  private _resetInitialView() {
    this._initialView = DEFAULT_VIEW;
    this._setView(DEFAULT_VIEW);
  }

  private _goToHistory() {
    this._setView("history");
  }

  private _goToSettings(): void {
    this._setView("settings");
  }

  private _computeViewTitle(): string | undefined {
    switch (this._currView) {
      case "details":
        return this.hass.localize("ui.dialogs.more_info_control.details");
      case "related":
        return this.hass.localize("ui.dialogs.more_info_control.related");
      case "add_to":
        return this.hass.localize("ui.dialogs.more_info_control.add_to.item");
      case "settings":
        return (
          this._childView?.viewTitle ||
          this.hass.localize("ui.dialogs.more_info_control.settings")
        );
      default:
        return this._childView?.viewTitle;
    }
  }

  private _showChildView(ev: CustomEvent): void {
    this._pushChildView(ev.detail as ChildView);
  }

  private _pushChildView(view: ChildView): void {
    if (view.viewImport) {
      view.viewImport();
    }
    if (view.viewHeaderImport) {
      view.viewHeaderImport();
    }
    this._childViewStack = [...this._childViewStack, view];
  }

  private _goToDevice(): void {
    const deviceId = this._getDeviceId();
    if (!deviceId) return;
    navigate(`/config/devices/device/${deviceId}`);
    this.closeDialog();
  }

  private _goToEdit() {
    const stateObj = this.hass.states[this._entityId!];
    const domain = computeDomain(this._entityId!);
    let idToPassThroughUrl = stateObj.entity_id;
    if (EDITABLE_DOMAINS_WITH_ID.includes(domain) || domain === "person") {
      idToPassThroughUrl = stateObj.attributes.id;
    }
    if (EDITABLE_DOMAINS_WITH_UNIQUE_ID.includes(domain)) {
      if (!this._entry) {
        return;
      }
      idToPassThroughUrl = this._entry.unique_id;
    }

    navigate(`/config/${domain}/edit/${idToPassThroughUrl}`);
    this.closeDialog();
  }

  private _toggleInfoEditMode() {
    withViewTransition(() => {
      this._infoEditMode = !this._infoEditMode;
    });
  }

  private _toggleDetailsYamlMode() {
    const dialog = this._dialogElement?.shadowRoot?.querySelector("ha-dialog");
    if (dialog) {
      fireEvent(dialog as HTMLElement, "dialog-set-fullscreen", false);
    }
    this._detailsYamlMode = !this._detailsYamlMode;
  }

  private _handleToggleInfoEditModeEvent(ev) {
    withViewTransition(() => {
      this._infoEditMode = ev.detail;
    });
  }

  private _goToRelated(): void {
    this._setView("related");
  }

  private _getFavoritesContext(): FavoritesDialogContext | undefined {
    const entityId = this._entityId;
    const stateObj =
      entityId && (this.hass.states[entityId] as HassEntity | undefined);

    if (!this._entry || !stateObj) {
      return undefined;
    }

    return {
      host: this,
      hass: this.hass,
      entry: this._entry,
      stateObj,
    };
  }

  private _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;
    switch (action) {
      case "device":
        this._goToDevice();
        break;
      case "edit":
        this._goToEdit();
        break;
      case "toggle_edit":
        this._toggleInfoEditMode();
        break;
      case "reset_favorites":
        this._resetFavorites();
        break;
      case "copy_favorites":
        this._copyFavorites();
        break;
      case "related":
        this._goToRelated();
        break;
      case "add_to":
        this._setView("add_to");
        break;
      case "info":
        this._resetInitialView();
        break;
      case "details":
        this._setView("details");
        break;
      case "download_snapshot":
        this._downloadSnapshot();
        break;
      default:
        break;
    }
  }

  private async _resetFavorites() {
    const favoritesContext = this._getFavoritesContext();

    if (!favoritesContext) {
      return;
    }

    const favoritesHandler = getFavoritesDialogHandler(
      favoritesContext.stateObj
    );

    if (!favoritesHandler) {
      return;
    }

    const labels = favoritesHandler.getLabels(this.hass);

    if (
      !(await showConfirmationDialog(this, {
        title: labels.reset,
        text: labels.resetText,
        dismissText: this.hass.localize("ui.common.cancel"),
        confirmText: this.hass.localize("ui.common.reset"),
        destructive: true,
      }))
    ) {
      return;
    }

    const result = await updateEntityRegistryEntry(
      this.hass,
      favoritesContext.entry.entity_id,
      {
        options_domain: favoritesHandler.domain,
        options: favoritesHandler.getResetOptions(favoritesContext.stateObj),
      }
    );
    this._entry = result.entity_entry;
  }

  private async _copyFavorites() {
    const favoritesContext = this._getFavoritesContext();

    if (!favoritesContext) {
      return;
    }

    const favoritesHandler = getFavoritesDialogHandler(
      favoritesContext.stateObj
    );

    if (!favoritesHandler) {
      return;
    }

    await favoritesHandler.copy(favoritesContext);
  }

  private _goToAddEntityTo(ev: CustomEvent<RequestSelectedDetail>) {
    // Only check for request-selected events (from menu items), not regular clicks (from icon button)
    if (
      ev.type === "request-selected" &&
      !shouldHandleRequestSelectedEvent(ev)
    ) {
      return;
    }
    this._setView("add_to");
  }

  private async _downloadSnapshot() {
    try {
      await downloadCameraSnapshot(this._api, this._entityId!);
    } catch (_err) {
      showToast(this, {
        message: this.hass.localize(
          "ui.dialogs.more_info_control.camera.failed_to_download"
        ),
      });
    }
  }

  private _breadcrumbClick(ev: Event) {
    ev.stopPropagation();
    this._setView("related");
  }

  private _availableTabs(): MoreInfoView[] {
    const entityId = this._entityId!;
    const admin = !__DEMO__ && !!this.hass.user?.is_admin;
    return TAB_VIEWS.filter((view) => {
      switch (view) {
        case "history":
          return (
            computeShowHistoryComponent(this.hass, entityId) ||
            computeShowLogBookComponent(this.hass, entityId)
          );
        case "settings":
        case "related":
          return admin;
        default:
          return true;
      }
    });
  }

  private _tabLabel(view: MoreInfoView): string {
    return view === "info"
      ? this.hass.localize("ui.dialogs.more_info_control.frame.tab_details")
      : this.hass.localize(
          `ui.dialogs.more_info_control.${view}` as LocalizeKeys
        );
  }

  private _tabClick(ev: Event) {
    const view = (ev.currentTarget as HTMLElement).dataset.view as MoreInfoView;
    if (view === this._currView) {
      return;
    }
    if (view === "info") {
      this._resetInitialView();
      return;
    }
    this._setView(view);
  }

  private _tabKeydown(ev: KeyboardEvent) {
    const tabs = Array.from(
      this.shadowRoot!.querySelectorAll<HTMLElement>(".tabs [role='tab']")
    );
    const index = tabs.indexOf(ev.currentTarget as HTMLElement);
    if (index < 0) {
      return;
    }
    const rtl = computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
    let next = -1;
    if (ev.key === "ArrowRight") {
      next = index + (rtl ? -1 : 1);
    } else if (ev.key === "ArrowLeft") {
      next = index + (rtl ? 1 : -1);
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = tabs.length - 1;
    }
    if (next < 0) {
      return;
    }
    ev.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    target.focus();
    target.click();
  }

  /** The tabs that are shown, or none when the row is not shown. */
  private _shownTabs(): MoreInfoView[] {
    if (
      !this._entityId ||
      this._childView ||
      !(TAB_VIEWS as string[]).includes(this._currView)
    ) {
      return [];
    }
    const tabs = this._availableTabs();
    return tabs.length < 2 ? [] : tabs;
  }

  private _renderTabs() {
    const tabs = this._shownTabs();
    if (!tabs.length) {
      return nothing;
    }
    // When the current view is not among the tabs, the first tab takes the
    // tab stop so the row can still be reached with the keyboard.
    const focusable = tabs.includes(this._currView) ? this._currView : tabs[0];
    return html`
      <div
        class="tabs"
        role="tablist"
        aria-label=${this.hass.localize(
          "ui.dialogs.more_info_control.frame.tabs"
        )}
      >
        ${tabs.map(
          (view) => html`
            <button
              type="button"
              role="tab"
              class=${classMap({ tab: true, active: view === this._currView })}
              id=${`more-info-tab-${view}`}
              data-view=${view}
              aria-selected=${view === this._currView ? "true" : "false"}
              aria-controls="more-info-tabpanel"
              tabindex=${view === focusable ? 0 : -1}
              @click=${this._tabClick}
              @keydown=${this._tabKeydown}
            >
              ${this._tabLabel(view)}
            </button>
          `
        )}
      </div>
    `;
  }

  // School mode or a schedule can hold the read-aloud choice; the switch then
  // stays still and says why, instead of writing a choice nobody can see.
  private _narratorHeldText(holder: "school" | "schedule"): string {
    return this.hass.localize(
      holder === "schedule"
        ? "ui.dialogs.quick-bar.setting_held_schedule"
        : "ui.dialogs.quick-bar.setting_held"
    );
  }

  private _toggleNarrator(ev: Event) {
    if (preferenceHolder("narratorEnabled")) {
      (ev.target as HTMLInputElement).checked = this._narratorOn;
      return;
    }
    updatePersonalPreferences({
      narratorEnabled: (ev.target as HTMLInputElement).checked,
    });
  }

  private _exportAs(ev: Event) {
    const format = (ev.currentTarget as HTMLElement).dataset
      .format as ExportFormat;
    if (!this._contentElement || !this._entityId) {
      return;
    }
    const stateObj = this.hass.states[this._entityId] as HassEntity | undefined;
    const title = stateObj
      ? computeEntityNameParts(stateObj, this.hass).entity || this._entityId
      : this._entityId;
    // The frame's own tools are not part of what the dialog shows about the
    // entity, so they are left out of the export.
    const tools = this._toolsElement;
    tools?.setAttribute("hidden", "");
    let page;
    try {
      page = collectPageExport(this._contentElement, title);
    } finally {
      tools?.removeAttribute("hidden");
    }
    const { content, mime, extension } = exportContent(page, format);
    const name = exportFileName(page, extension);
    fileDownload(
      URL.createObjectURL(new Blob([content], { type: mime })),
      name
    );
    this._exportedName = name;
  }

  private _renderTools() {
    const localize = this.hass.localize;
    const narratorHeld = preferenceHolder("narratorEnabled");
    const key = (name: string) =>
      localize(`ui.dialogs.more_info_control.frame.${name}` as LocalizeKeys);
    return html`
      <section class="tools" aria-label=${key("tools_title")}>
        <label class="tool">
          <span class="tool-icon"
            ><ha-svg-icon .path=${mdiAccountVoice}></ha-svg-icon
          ></span>
          <span class="tool-text">
            <span class="tool-title">${key("read_aloud")}</span>
            <span class="tool-description"
              >${key("read_aloud_description")}</span
            >
          </span>
          <ha-switch
            .checked=${this._narratorOn}
            .disabled=${narratorHeld}
            title=${narratorHeld ? this._narratorHeldText(narratorHeld) : ""}
            @change=${this._toggleNarrator}
          ></ha-switch>
          ${
            narratorHeld
              ? html`<span class="tool-description" role="status"
                  >${this._narratorHeldText(narratorHeld)}</span
                >`
              : nothing
          }
        </label>
        <div class="tool export">
          <span class="tool-icon"
            ><ha-svg-icon .path=${mdiExportVariant}></ha-svg-icon
          ></span>
          <span class="tool-text">
            <span class="tool-title">${key("export")}</span>
            <span class="tool-description">${key("export_description")}</span>
            <span class="export-buttons">
              ${(["json", "markdown", "text"] as ExportFormat[]).map(
                (format) => html`
                  <button
                    type="button"
                    class="chip"
                    data-format=${format}
                    @click=${this._exportAs}
                  >
                    ${key(`export_${format}`)}
                  </button>
                `
              )}
            </span>
            ${
              this._exportedName
                ? html`<span class="tool-description" role="status"
                    >${localize("ui.dialogs.more_info_control.frame.exported", {
                      name: this._exportedName,
                    })}</span
                  >`
                : nothing
            }
          </span>
        </div>
      </section>
    `;
  }

  protected render() {
    if (!this._entityId) {
      return nothing;
    }
    const entityId = this._entityId;
    const stateObj = this.hass.states[entityId] as HassEntity | undefined;

    const domain = computeDomain(entityId);

    const isAdmin = this.hass.user!.is_admin;

    const deviceId = this._getDeviceId();
    const deviceType =
      (deviceId && this.hass.devices[deviceId].entry_type) || "device";

    const isDefaultView = this._currView === DEFAULT_VIEW && !this._childView;
    const showCloseIcon =
      isDefaultView && this._parentEntityIds.length === 0 && !this._childView;

    const nameParts = stateObj
      ? computeEntityNameParts(stateObj, this.hass)
      : this._entry
        ? computeEntityEntryNameParts(this._entry, this.hass)
        : undefined;
    const breadcrumb = (
      nameParts ? BREADCRUMB_NAME.map((type) => nameParts[type]) : [entityId]
    ).filter((v): v is string => Boolean(v));
    const addToMenuItem = this.hass.localize(
      "ui.dialogs.more_info_control.add_to.item"
    );
    const downloadSnapshotMenuItem =
      domain === "camera"
        ? html`
            <ha-dropdown-item
              value="download_snapshot"
              .disabled=${stateObj?.state === UNAVAILABLE}
            >
              <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
              ${this.hass.localize(
                "ui.dialogs.more_info_control.camera.download_snapshot"
              )}
            </ha-dropdown-item>
          `
        : nothing;
    const viewTitle = this._computeViewTitle();
    const defaultTitle = breadcrumb[breadcrumb.length - 1] || entityId;
    if (!viewTitle) {
      breadcrumb.pop();
    }
    const title = viewTitle || defaultTitle;

    const favoritesContext =
      this._entry && stateObj
        ? {
            host: this,
            hass: this.hass,
            entry: this._entry,
            stateObj,
          }
        : undefined;

    const favoritesHandler = favoritesContext
      ? getFavoritesDialogHandler(favoritesContext.stateObj)
      : undefined;

    const favoritesLabels = favoritesHandler?.getLabels(this.hass);

    const supportsFavorites = Boolean(favoritesHandler && favoritesContext);

    const resetFavoritesDisabled =
      favoritesContext && favoritesHandler
        ? !favoritesHandler.hasCustomFavorites(favoritesContext.entry)
        : false;

    const copyFavoritesDisabled =
      favoritesContext && favoritesHandler?.canCopy
        ? !favoritesHandler.canCopy(favoritesContext.entry)
        : false;

    const isRTL = computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );

    const tabsShown = this._shownTabs().includes(this._currView);

    const childViewContent = this._childView
      ? html`
          <div class="child-view">
            ${dynamicElement(this._childView.viewTag, {
              hass: this.hass,
              entry: this._entry,
              params: this._childView.viewParams,
            })}
          </div>
        `
      : nothing;

    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        .width=${this._fill ? "full" : this.large ? "large" : "medium"}
        @closed=${this._dialogClosed}
        @opened=${this._handleOpened}
        @show-child-view=${this._showChildView}
        .preventScrimClose=${
          ((this._currView === "settings" || this._childView) &&
            this.isDirtyState) ||
          !this._isEscapeEnabled
        }
        flexcontent
      >
        ${
          showCloseIcon
            ? html`
                <ha-icon-button
                  slot="headerNavigationIcon"
                  @click=${this.closeDialog}
                  .label=${this.hass.localize("ui.common.close")}
                  .path=${mdiClose}
                ></ha-icon-button>
              `
            : html`
                <ha-icon-button-prev
                  slot="headerNavigationIcon"
                  @click=${this._goBack}
                  .label=${this.hass.localize(
                    "ui.dialogs.more_info_control.back_to_info"
                  )}
                ></ha-icon-button-prev>
              `
        }
        <span slot="headerTitle" @click=${this._enlarge} class="title">
          ${
            breadcrumb.length > 0
              ? !__DEMO__ && isAdmin
                ? html`
                    <button class="breadcrumb" @click=${this._breadcrumbClick}>
                      ${breadcrumb.join(isRTL ? " ◂ " : " ▸ ")}
                    </button>
                  `
                : html`
                    <p class="breadcrumb">
                      ${breadcrumb.join(isRTL ? " ◂ " : " ▸ ")}
                    </p>
                  `
              : nothing
          }
          <p class="main">${title}</p>
        </span>
        ${
          isDefaultView
            ? html`
                ${
                  this._shouldShowHistory(domain)
                    ? html`
                        <ha-icon-button
                          slot="headerActionItems"
                          .label=${this.hass.localize(
                            "ui.dialogs.more_info_control.history"
                          )}
                          .path=${mdiChartBoxOutline}
                          @click=${this._goToHistory}
                        ></ha-icon-button>
                      `
                    : nothing
                }
                ${
                  !__DEMO__ && isAdmin
                    ? html`
                        <ha-icon-button
                          slot="headerActionItems"
                          .label=${this.hass.localize(
                            "ui.dialogs.more_info_control.settings"
                          )}
                          .path=${mdiCogOutline}
                          @click=${this._goToSettings}
                        ></ha-icon-button>
                        <ha-dropdown
                          slot="headerActionItems"
                          @closed=${stopPropagation}
                          @wa-select=${this._handleMenuAction}
                          placement="bottom-end"
                        >
                          <ha-icon-button
                            slot="trigger"
                            .label=${this.hass.localize("ui.common.menu")}
                            .path=${mdiDotsVertical}
                          ></ha-icon-button>

                          ${
                            domain === "camera"
                              ? html`
                                  ${downloadSnapshotMenuItem}
                                  <wa-divider></wa-divider>
                                `
                              : nothing
                          }
                          ${
                            this._shouldShowAddEntityTo()
                              ? html`
                                  <ha-dropdown-item value="add_to">
                                    <ha-svg-icon
                                      slot="icon"
                                      .path=${mdiPlusBoxMultipleOutline}
                                    ></ha-svg-icon>
                                    ${addToMenuItem}
                                  </ha-dropdown-item>

                                  <wa-divider></wa-divider>
                                `
                              : nothing
                          }
                          ${
                            supportsFavorites
                              ? html`
                                  <ha-dropdown-item value="toggle_edit">
                                    <ha-svg-icon
                                      slot="icon"
                                      .path=${
                                        this._infoEditMode
                                          ? mdiPencilOff
                                          : mdiPencil
                                      }
                                    ></ha-svg-icon>
                                    ${
                                      this._infoEditMode
                                        ? this.hass.localize(
                                            "ui.dialogs.more_info_control.exit_edit_mode"
                                          )
                                        : favoritesLabels?.editMode
                                    }
                                  </ha-dropdown-item>
                                  <ha-dropdown-item
                                    value="reset_favorites"
                                    .disabled=${resetFavoritesDisabled}
                                  >
                                    <ha-svg-icon
                                      slot="icon"
                                      .path=${mdiBackupRestore}
                                    ></ha-svg-icon>
                                    ${favoritesLabels?.reset}
                                  </ha-dropdown-item>
                                  <ha-dropdown-item
                                    value="copy_favorites"
                                    .disabled=${copyFavoritesDisabled}
                                  >
                                    <ha-svg-icon
                                      slot="icon"
                                      .path=${mdiContentDuplicate}
                                    ></ha-svg-icon>
                                    ${favoritesLabels?.copy}
                                  </ha-dropdown-item>
                                  <wa-divider></wa-divider>
                                `
                              : nothing
                          }
                          ${
                            deviceId
                              ? html`
                                  <ha-dropdown-item value="device">
                                    <ha-svg-icon
                                      slot="icon"
                                      .path=${
                                        deviceType === "service"
                                          ? mdiTransitConnectionVariant
                                          : mdiDevices
                                      }
                                    ></ha-svg-icon>
                                    ${this.hass.localize(
                                      `ui.dialogs.more_info_control.${deviceType}_info`
                                    )}
                                  </ha-dropdown-item>
                                `
                              : nothing
                          }
                          ${
                            this._shouldShowEditIcon(domain, stateObj)
                              ? html`
                                  <ha-dropdown-item value="edit">
                                    <ha-svg-icon
                                      slot="icon"
                                      .path=${mdiPencilOutline}
                                    ></ha-svg-icon>
                                    ${
                                      this.hass.localize(
                                        `ui.dialogs.more_info_control.edit_domain.${domain}` as LocalizeKeys
                                      ) ||
                                      this.hass.localize(
                                        "ui.dialogs.more_info_control.edit"
                                      )
                                    }
                                  </ha-dropdown-item>
                                `
                              : nothing
                          }
                          <ha-dropdown-item value="related">
                            <ha-svg-icon
                              slot="icon"
                              .path=${mdiLinkVariant}
                            ></ha-svg-icon>
                            ${this.hass.localize(
                              "ui.dialogs.more_info_control.related"
                            )}
                          </ha-dropdown-item>
                          <ha-dropdown-item value="details">
                            <ha-svg-icon
                              slot="icon"
                              .path=${mdiInformationOutline}
                            ></ha-svg-icon>
                            ${this.hass.localize(
                              "ui.dialogs.more_info_control.details"
                            )}
                          </ha-dropdown-item>
                        </ha-dropdown>
                      `
                    : html`
                        ${
                          !__DEMO__ && this._shouldShowAddEntityTo()
                            ? html`
                                <ha-icon-button
                                  slot="headerActionItems"
                                  .label=${addToMenuItem}
                                  .path=${mdiPlusBoxMultipleOutline}
                                  @click=${this._goToAddEntityTo}
                                ></ha-icon-button>
                              `
                            : nothing
                        }
                        ${
                          domain === "camera"
                            ? html`
                                <ha-dropdown
                                  slot="headerActionItems"
                                  @closed=${stopPropagation}
                                  @wa-select=${this._handleMenuAction}
                                  placement="bottom-end"
                                >
                                  <ha-icon-button
                                    slot="trigger"
                                    .label=${this.hass.localize(
                                      "ui.common.menu"
                                    )}
                                    .path=${mdiDotsVertical}
                                  ></ha-icon-button>
                                  ${downloadSnapshotMenuItem}
                                </ha-dropdown>
                              `
                            : nothing
                        }
                      `
                }
              `
            : this._currView === "details"
              ? html`
                  <ha-icon-button
                    slot="headerActionItems"
                    .label=${this.hass.localize(
                      "ui.dialogs.more_info_control.toggle_yaml_mode"
                    )}
                    .path=${mdiCodeBraces}
                    @click=${this._toggleDetailsYamlMode}
                  ></ha-icon-button>
                `
              : this._childView?.viewHeaderTag
                ? dynamicElement(this._childView.viewHeaderTag, {
                    slot: "headerActionItems",
                    hass: this.hass,
                    params: this._childView.viewParams,
                  })
                : nothing
        }
        <div
          class=${classMap({
            "content-wrapper": true,
            "settings-view": this._currView === "settings",
          })}
        >
          ${this._renderTabs()}
          ${keyed(
            this._entityId,
            html`
              <div
                class="content ha-scrollbar"
                id="more-info-tabpanel"
                role=${ifDefined(tabsShown ? "tabpanel" : undefined)}
                aria-labelledby=${ifDefined(
                  tabsShown ? `more-info-tab-${this._currView}` : undefined
                )}
                tabindex="-1"
                @entity-entry-updated=${this._entryUpdated}
                @toggle-edit-mode=${this._handleToggleInfoEditModeEvent}
                @hass-more-info=${this._handleMoreInfoEvent}
              >
                ${
                  this._currView === "settings"
                    ? html`
                        <div ?hidden=${!!this._childView}>
                          <ha-more-info-settings
                            .hass=${this.hass}
                            .entityId=${this._entityId}
                            .entry=${this._entry}
                          ></ha-more-info-settings>
                        </div>
                        ${childViewContent}
                      `
                    : cache(
                        this._childView
                          ? childViewContent
                          : this._currView === "info"
                            ? html`
                                <ha-more-info-info
                                  .hass=${this.hass}
                                  .entityId=${this._entityId}
                                  .entry=${this._entry}
                                  .editMode=${this._infoEditMode}
                                  .data=${this._data}
                                ></ha-more-info-info>
                              `
                            : this._currView === "history"
                              ? html`
                                  <ha-more-info-history-and-logbook
                                    .hass=${this.hass}
                                    .entityId=${this._entityId}
                                  ></ha-more-info-history-and-logbook>
                                  ${this._renderTools()}
                                `
                              : this._currView === "related"
                                ? html`
                                    <ha-more-info-related
                                      .hass=${this.hass}
                                      .entry=${this._entry}
                                      .params=${{ entityId }}
                                    ></ha-more-info-related>
                                  `
                                : this._currView === "add_to"
                                  ? html`
                                      <ha-more-info-add-to
                                        .entityId=${entityId}
                                        @add-to-action-selected=${this._goBack}
                                      ></ha-more-info-add-to>
                                    `
                                  : this._currView === "details"
                                    ? html`
                                        <ha-more-info-details
                                          .hass=${this.hass}
                                          .entry=${this._entry}
                                          .params=${{ entityId }}
                                          .yamlMode=${this._detailsYamlMode}
                                        ></ha-more-info-details>
                                      `
                                    : nothing
                      )
                }
              </div>
            `
          )}
          ${this.renderScrollableFades()}
        </div>
      </ha-adaptive-dialog>
    `;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.addEventListener("close-dialog", () => this.closeDialog());
    this.addEventListener("close-child-view", () => this._goBack());
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    const previousView = changedProps.get("_currView") as
      MoreInfoView | undefined;

    if (previousView === "settings" && this._currView !== "settings") {
      this._discardDirtyStateChanges();
    }

    if (previousView === "details" && this._currView !== "details") {
      const dialog =
        this._dialogElement?.shadowRoot?.querySelector("ha-dialog");
      if (dialog) {
        fireEvent(dialog as HTMLElement, "dialog-set-fullscreen", false);
      }
    }

    if (
      this._currView === "settings" &&
      this._entry &&
      ((changedProps.has("_currView") &&
        changedProps.get("_currView") !== "settings") ||
        (changedProps.has("_entry") && !changedProps.get("_entry")))
    ) {
      this._initDirtyTracking({ type: "deep" });
    }

    if (changedProps.has("_currView")) {
      this._infoEditMode = false;
      this._detailsYamlMode = false;
    }

    if (changedProps.has("_entityId")) {
      this._reportShownEntityToExternalApp(
        changedProps.get("_entityId") as string | null | undefined
      );
    }
  }

  private _reportShownEntityToExternalApp(
    previousEntityId: string | null | undefined
  ) {
    const external = this.hass.auth.external;
    if (!external) {
      return;
    }
    if (this._entityId) {
      external.fireMessage({
        type: "more_info/opened",
        payload: { entity_id: this._entityId },
      });
    } else if (previousEntityId) {
      external.fireMessage({
        type: "more_info/closed",
        payload: { entity_id: previousEntityId },
      });
    }
  }

  private _entryUpdated(ev: CustomEvent<ExtEntityRegistryEntry>) {
    this._entry = ev.detail;
  }

  private _enlarge() {
    withViewTransition(() => {
      this._fill = !this._fill;
    });
  }

  private _handleOpened() {
    window.addEventListener("dialog-closed", this._enableEscapeKeyClose);
    window.addEventListener("show-dialog", this._disableEscapeKeyClose);
  }

  private _handleMoreInfoEvent(ev: HASSDomEvent<MoreInfoDialogParams>) {
    ev.stopPropagation();
    const entityId = ev.detail.entityId;
    if (!entityId) {
      return;
    }
    const view = ev.detail.view || ev.detail.tab || DEFAULT_VIEW;
    if (entityId === this._entityId) {
      this._infoEditMode = false;
      this._detailsYamlMode = false;
      this._setView(view);
      return;
    }
    this._parentEntityIds = [...this._parentEntityIds, this._entityId!];
    this._entityId = entityId;
    this._currView = view === "details" ? view : DEFAULT_VIEW;
    this._initialView = view;
    this._infoEditMode = false;
    this._detailsYamlMode = false;
    this._childViewStack = [];
    this._loadEntityRegistryEntry();
    this._syncUrl();
  }

  private _enableEscapeKeyClose = () => {
    this._isEscapeEnabled = true;
  };

  private _disableEscapeKeyClose = () => {
    this._isEscapeEnabled = false;
  };

  static get styles() {
    return [
      ...super.styles,
      haStyleDialog,
      haStyleDialogFixedTop,
      haStyleScrollbar,
      css`
        :host {
          --ha-bottom-sheet-height: calc(
            100vh - max(var(--safe-area-inset-top), 48px)
          );
          --ha-bottom-sheet-height: calc(
            100dvh - max(var(--safe-area-inset-top), 48px)
          );
          --ha-bottom-sheet-max-height: var(--ha-bottom-sheet-height);
        }

        ha-adaptive-dialog {
          --dialog-content-padding: 0;
        }

        .content-wrapper {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .content {
          outline: none;
          flex: 1;
          overflow: auto;
          /* Keep the content width constant when the scrollbar toggles;
             otherwise width-dependent content can flicker at the overflow
             threshold (#53228). */
          scrollbar-gutter: stable;
        }

        .content-wrapper.settings-view .fade-bottom {
          bottom: calc(
            var(--ha-space-14) +
              max(var(--safe-area-inset-bottom), var(--ha-space-4))
          );
        }

        ha-more-info-history-and-logbook {
          padding: var(--ha-space-2) 0 var(--ha-space-6) 0;
          display: block;
        }

        .tabs {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1) var(--ha-space-6) var(--ha-space-2);
        }

        .tab {
          min-height: 44px;
          min-width: 44px;
          padding: 0 var(--ha-space-4);
          border: none;
          border-radius: var(--ha-border-radius-pill);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
        }

        .tab:hover {
          background: var(--secondary-background-color);
        }

        .tab.active {
          background: var(--primary-text-color);
          color: var(--card-background-color);
        }

        .tab:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }

        .tools {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          padding: 0 var(--ha-space-6) var(--ha-space-4);
        }

        .tool {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          min-height: 44px;
          padding: var(--ha-space-2);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
          box-sizing: border-box;
          width: 100%;
        }

        .tool.export {
          cursor: default;
          align-items: flex-start;
        }

        .tool:disabled {
          cursor: default;
          opacity: 0.7;
        }

        .tool:not(:disabled):not(.export):hover {
          background: var(--secondary-background-color);
        }

        .tool:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }

        .tool-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: none;
          width: 44px;
          height: 44px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
        }

        .tool-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          gap: var(--ha-space-1);
        }

        .tool-title {
          font-weight: var(--ha-font-weight-medium);
        }

        .tool-description {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        .export-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }

        .chip {
          min-height: 44px;
          min-width: 44px;
          padding: 0 var(--ha-space-4);
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-pill);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }

        .chip:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }

        .title {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin: 0 0 calc(var(--ha-space-2) * -1) 0;
        }

        .title p {
          margin: 0;
          min-width: 0;
          width: 100%;
          text-overflow: ellipsis;
          overflow: hidden;
        }

        .title .main {
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-xl);
          line-height: var(--ha-line-height-condensed);
        }

        .title .breadcrumb {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
          font-family: var(--ha-font-family-heading, inherit);
          line-height: 16px;
          --mdc-icon-size: 16px;
          padding: var(--ha-space-1);
          margin: calc(var(--ha-space-1) * -1);
          margin-top: calc(var(--ha-space-2) * -1);
          background: none;
          border: none;
          outline: none;
          display: inline;
          border-radius: var(--ha-border-radius-md);
          transition: background-color 180ms ease-in-out;
          min-width: 0;
          max-width: 100%;
          text-overflow: ellipsis;
          overflow: hidden;
          text-align: left;
        }

        .title button.breadcrumb {
          cursor: pointer;
        }

        .title button.breadcrumb:focus-visible,
        .title button.breadcrumb:hover {
          background-color: rgba(var(--rgb-secondary-text-color), 0.08);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-dialog": MoreInfoDialog;
  }
}
