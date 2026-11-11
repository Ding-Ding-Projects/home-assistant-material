import { ContextProvider } from "@lit/context";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import {
  importWordingFile,
  looksLikeWordingFile,
  reportWordingImport,
} from "../common/vocabulary/wording-import";
import { showToast } from "../util/toast";
import {
  applyAccessibilitySettings,
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../common/accessibility/accessibility-tools";
import type { HASSDomEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { listenMediaQuery } from "../common/dom/media_query";
import { getStorage, storage } from "../common/decorators/storage";
import {
  HISTORY_SUBJECTS,
  noteLocalChange,
  startLocalHistory,
} from "../common/history/local-history";
import { DEBUG_SAFE_AREA_TOOL_STORAGE_KEY } from "../common/util/debug-safe-area";
import { initPersonalPreferences } from "../common/preferences/personal-preferences";
import { computeRTLDirection } from "../common/util/compute_rtl";
import "../components/appearance/ha-appearance-tools";
import type { HaAppearanceTools } from "../components/appearance/ha-appearance-tools";
import "../components/ha-accessibility-tools";
import type { HaAccessibilityTools } from "../components/ha-accessibility-tools";
import "../components/ha-drawer";
import "../components/ha-page-tabs";
import "../components/phone/ha-phone-bar";
import "../components/page/ha-page-tool-panel";
import type { HaPageToolPanel } from "../components/page/ha-page-tool-panel";
import { narrowViewportContext } from "../data/context";
import { showNotificationDrawer } from "../dialogs/notifications/show-notification-drawer";
import type { HomeAssistant, Route } from "../types";
import "./partial-panel-resolver";

declare global {
  // for fire event
  interface HASSDomEvents {
    "hass-toggle-menu": undefined | { open?: boolean };
    "hass-show-notifications": undefined;
  }
  interface HTMLElementEventMap {
    "hass-toggle-menu": HASSDomEvent<HASSDomEvents["hass-toggle-menu"]>;
  }
}

@customElement("home-assistant-main")
export class HomeAssistantMain extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route?: Route;

  @property({ type: Boolean }) public narrow = false;

  @state() private _sidebarEditMode = false;

  @state() private _externalSidebar = false;

  @state() private _drawerOpen = false;

  /** Below 700 px the tab bar gives way to the bottom bar. */
  @state() private _phone = false;

  @storage({
    key: DEBUG_SAFE_AREA_TOOL_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _debugSafeAreaTool = false;

  private _unsubAccessibility?: UnsubscribeFunc;

  private _appearanceTools?: HaAppearanceTools;

  private _pageToolPanel?: HaPageToolPanel;

  private _unsubHistory: UnsubscribeFunc[] = [];

  private _noteWording = () => noteLocalChange("wording");

  @query("ha-accessibility-tools")
  private _accessibilityTools?: HaAccessibilityTools;

  @query("partial-panel-resolver") private _panelResolver?: HTMLElement;

  private _narrowViewportProvider = new ContextProvider(this, {
    context: narrowViewportContext,
    initialValue: this.narrow,
  });

  constructor() {
    super();
    listenMediaQuery("(max-width: 870px)", (matches) => {
      this.narrow = matches;
    });
    listenMediaQuery("(max-width: 700px)", (matches) => {
      this._phone = matches;
    });
  }

  protected render(): TemplateResult {
    const sidebarNarrow =
      this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode;

    const isPanelReady =
      this.hass.panels && this.hass.userData && this.hass.systemData;

    return html`
      <ha-snowflakes .narrow=${this.narrow}></ha-snowflakes>
      <div class="pane-frame" aria-hidden="true"></div>
      ${
        isPanelReady && !sidebarNarrow
          ? html`<ha-page-tabs .hass=${this.hass}></ha-page-tabs>`
          : nothing
      }
      ${
        isPanelReady && this._showPhoneBar
          ? html`<ha-phone-bar
              .hass=${this.hass}
              .phone=${this._phone}
            ></ha-phone-bar>`
          : nothing
      }
      <ha-drawer
        .type=${sidebarNarrow ? "modal" : ""}
        .open=${sidebarNarrow ? this._drawerOpen : false}
        .direction=${computeRTLDirection(this.hass)}
        @hass-drawer-closed=${this._drawerClosed}
      >
        <ha-sidebar
          .hass=${this.hass}
          .narrow=${sidebarNarrow}
          .route=${this.route}
          .alwaysExpand=${sidebarNarrow || this.hass.dockedSidebar === "docked"}
        ></ha-sidebar>
        ${
          isPanelReady
            ? html`<partial-panel-resolver
                .hass=${this.hass}
                .route=${this.route}
                slot="appContent"
              ></partial-panel-resolver>`
            : nothing
        }
      </ha-drawer>
      <ha-accessibility-tools
        .hass=${this.hass}
        .pageRoot=${this._pageRoot}
      ></ha-accessibility-tools>
      ${
        this._debugSafeAreaTool
          ? html`<ha-debug-safe-area-tool></ha-debug-safe-area-tool>`
          : nothing
      }
    `;
  }

  protected firstUpdated() {
    import(/* webpackPreload: true */ "../components/ha-sidebar");
    import("../components/ha-snowflakes");

    if (this.hass.auth.external) {
      this._externalSidebar =
        this.hass.auth.external.config.hasSidebar === true;
      import("../external_app/external_app_entrypoint").then((mod) =>
        mod.attachExternalToApp(this)
      );
    }

    this.addEventListener("hass-toggle-menu", (ev) => {
      if (this._sidebarEditMode) {
        return;
      }
      if (this._externalSidebar) {
        this.hass.auth.external!.fireMessage({
          type: "sidebar/show",
        });
        return;
      }
      if (this._sidebarNarrow || this.hass.kioskMode) {
        this._drawerOpen = ev.detail?.open ?? !this._drawerOpen;
      } else {
        fireEvent(this, "hass-dock-sidebar", {
          dock: ev.detail?.open
            ? "docked"
            : ev.detail?.open === false
              ? "auto"
              : this.hass.dockedSidebar === "auto"
                ? "docked"
                : "auto",
        });
      }
    });

    this.addEventListener("hass-pick-appearance", () => {
      this._appearanceTools?.startPicking();
    });

    this.addEventListener("hass-page-tool", (ev) => {
      this._pageToolPanel?.open(ev.detail);
    });

    this.addEventListener("hass-show-accessibility-tools", () => {
      this._accessibilityTools?.toggle();
    });

    this.addEventListener("hass-show-notifications", () => {
      showNotificationDrawer(this, {
        narrow: this.narrow,
      });
    });
  }

  public connectedCallback() {
    super.connectedCallback();
    // Stored personal settings apply on every page, not only after the
    // personal settings page has been opened.
    initPersonalPreferences();
    // Created here, not in the template: the tools move into an open modal
    // dialog and back, which a rendered template would not follow.
    this._appearanceTools ??= document.createElement("ha-appearance-tools");
    this._pageToolPanel ??= document.createElement("ha-page-tool-panel");
    this.updateComplete.then(() => {
      if (this._appearanceTools && !this._appearanceTools.isConnected) {
        this.shadowRoot?.appendChild(this._appearanceTools);
      }
      if (this._pageToolPanel && !this._pageToolPanel.isConnected) {
        this.shadowRoot?.appendChild(this._pageToolPanel);
      }
    });
    startLocalHistory();
    this._unsubHistory = [
      getStorage().subscribeChanges(HISTORY_SUBJECTS.accessibility.key, () =>
        noteLocalChange("accessibility")
      ),
      getStorage().subscribeChanges(HISTORY_SUBJECTS.tabs.key, () =>
        noteLocalChange("tabs")
      ),
      getStorage().subscribeChanges(HISTORY_SUBJECTS.tabOrder.key, () =>
        noteLocalChange("tabOrder")
      ),
      getStorage().subscribeChanges(HISTORY_SUBJECTS.tabPins.key, () =>
        noteLocalChange("tabPins")
      ),
    ];
    window.addEventListener("personal-vocabulary-changed", this._noteWording);
    window.addEventListener("keydown", this._handleAccessibilityShortcut);
    window.addEventListener("dragover", this._handleWordingDragOver);
    window.addEventListener("drop", this._handleWordingDrop);
    this._unsubAccessibility = subscribeAccessibilitySettings(() =>
      this._applyAccessibility()
    );
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._appearanceTools?.stop();
    this._appearanceTools?.remove();
    this._pageToolPanel?.close();
    this._pageToolPanel?.remove();
    this._unsubHistory.forEach((unsubscribe) => unsubscribe());
    this._unsubHistory = [];
    window.removeEventListener(
      "personal-vocabulary-changed",
      this._noteWording
    );
    window.removeEventListener("keydown", this._handleAccessibilityShortcut);
    window.removeEventListener("dragover", this._handleWordingDragOver);
    window.removeEventListener("drop", this._handleWordingDrop);
    this._unsubAccessibility?.();
    this._unsubAccessibility = undefined;
  }

  private _applyAccessibility() {
    applyAccessibilitySettings(
      getAccessibilitySettings(),
      Boolean(this.hass?.themes?.darkMode)
    );
  }

  // A wording file can be dropped anywhere in the window. A drop that a page
  // already took (an upload field, a card editor) is left to that page.
  private _handleWordingDragOver = (ev: DragEvent) => {
    if (!ev.defaultPrevented && ev.dataTransfer?.types.includes("Files")) {
      ev.preventDefault();
    }
  };

  private _handleWordingDrop = async (ev: DragEvent) => {
    const files = ev.dataTransfer?.files;
    if (ev.defaultPrevented || !files?.length) {
      return;
    }
    // Never let a dropped file replace the page.
    ev.preventDefault();
    const result =
      files.length === 1 && looksLikeWordingFile(files[0])
        ? await importWordingFile(files[0])
        : ({ ok: false, error: "not_json" } as const);
    reportWordingImport(result, this.hass.localize);
    if (result.ok) {
      return;
    }
    showToast(this, {
      message: `${this.hass.localize("ui.personal_wording.not_applied")} ${this.hass.localize(
        `ui.personal_wording.error.${result.error}`
      )}`,
      duration: 8000,
    });
  };

  // Alt+A opens the accessibility tools, also while their button is hidden.
  private _handleAccessibilityShortcut = (ev: KeyboardEvent) => {
    if (
      ev.altKey &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.shiftKey &&
      ev.code === "KeyA"
    ) {
      ev.preventDefault();
      this._accessibilityTools?.toggle();
    }
  };

  private _pageRoot = (): Node | null => this._panelResolver ?? null;

  public willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("narrow")) {
      this._narrowViewportProvider.setValue(this.narrow);
    }

    if (changedProps.has("route") && this._sidebarNarrow) {
      this._drawerOpen = false;
    }

    if (this._debugSafeAreaTool) {
      import("../components/ha-debug-safe-area-tool");
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);

    this._applyAccessibility();

    this.toggleAttribute("expanded", this.hass.dockedSidebar === "docked");

    this.toggleAttribute("phone", this._showPhoneBar);

    this.toggleAttribute(
      "modal",
      this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode
    );
  }

  private get _showPhoneBar() {
    return this._phone && !this._externalSidebar && !this.hass.kioskMode;
  }

  private get _sidebarNarrow() {
    return this.narrow || this.hass.dockedSidebar === "always_hidden";
  }

  private _drawerClosed() {
    this._drawerOpen = false;
    this._sidebarEditMode = false;
  }

  static styles = css`
    :host {
      color: var(--primary-text-color);
      /* remove the grey tap highlights in iOS on the fullscreen touch targets */
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
      /* Keep the negative z-index panel backgrounds (the resolver's ::before
         and the Lovelace view background) in this host's stacking context.
         Isolating the conditionally rendered partial-panel-resolver instead
         can intermittently leave the Android WebView (Chromium 109-124)
         accessibility tree with an empty panel subtree while the page paints
         normally, which breaks UI automation such as the companion app E2E. */
      isolation: isolate;
      /* The rail grows with the text size so its labels still fit. */
      --ha-sidebar-width: calc(
        88px * var(--ha-font-size-scale, 1) + var(--safe-area-inset-left, 0px)
      );
      --ha-top-app-bar-width: calc(
        100% - var(--ha-sidebar-width) - var(--safe-area-inset-right, 0px)
      );
      --safe-area-content-inset-left: 0px;
      --safe-area-content-inset-right: var(--safe-area-inset-right);
      background-color: var(--ha-color-window);
    }
    /* The floating pane. Pages keep scrolling the window as before: the
       pane is drawn by a frame that paints the window colour over the gap
       around it, and the gap is reported to pages as safe area so nothing
       sits under the frame. */
    :host(:not([modal])) {
      --ha-pane-gap: 12px;
      --ha-pane-radius: var(--ha-border-radius-4xl);
      --ha-page-tabs-height: calc(
        52px + 8px * (var(--ha-font-size-scale, 1) - 1)
      );
      --ha-page-tabs-top: calc(
        var(--app-safe-area-inset-top, env(safe-area-inset-top, 0px)) +
          var(--ha-pane-gap)
      );
      --safe-area-inset-top: calc(
        var(--app-safe-area-inset-top, env(safe-area-inset-top, 0px)) +
          var(--ha-pane-gap) + var(--ha-page-tabs-height)
      );
      --safe-area-inset-bottom: calc(
        var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) +
          var(--ha-pane-gap)
      );
      --safe-area-inset-right: calc(
        var(--app-safe-area-inset-right, env(safe-area-inset-right, 0px)) +
          var(--ha-pane-gap)
      );
    }
    /* Below 700 px a slim top bar and a bottom bar replace the tab bar. Pages
       are told about both so nothing sits under them. */
    :host([phone]) {
      --ha-phone-top-height: 48px;
      --ha-phone-bar-height: 64px;
      --safe-area-inset-top: calc(
        var(--app-safe-area-inset-top, env(safe-area-inset-top, 0px)) +
          var(--ha-phone-top-height)
      );
      --safe-area-inset-bottom: calc(
        var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) +
          var(--ha-phone-bar-height)
      );
    }
    .pane-frame {
      display: none;
    }
    :host(:not([modal])) .pane-frame {
      display: block;
      position: fixed;
      z-index: 6;
      inset-block: var(--ha-pane-gap);
      inset-inline-start: var(--ha-sidebar-width);
      inset-inline-end: var(--ha-pane-gap);
      border-radius: var(--ha-pane-radius);
      box-shadow: 0 0 0 100vmax var(--ha-color-window);
      outline: var(--ha-pane-outline, none);
      pointer-events: none;
      transition: inset-inline-start var(--ha-animation-duration-normal) ease;
    }
    /* The bar of open pages sits at the top of the pane: above the page
       headers, and under the frame, which rounds its corners. Its height is
       reported to pages as safe area. */
    ha-page-tabs {
      position: fixed;
      z-index: 5;
      top: var(--ha-page-tabs-top);
      inset-inline-start: var(--ha-sidebar-width);
      inset-inline-end: var(--ha-pane-gap);
      height: var(--ha-page-tabs-height);
      transition: inset-inline-start var(--ha-animation-duration-normal) ease;
    }
    /* The rail starts at the top of the window, not under the bar. */
    :host(:not([modal])) ha-sidebar {
      --safe-area-inset-top: var(
        --app-safe-area-inset-top,
        env(safe-area-inset-top, 0px)
      );
    }
    :host([expanded]) {
      --ha-sidebar-width: calc(256px + var(--safe-area-inset-left, 0px));
    }
    :host([modal]) {
      --ha-sidebar-width: unset;
      --ha-top-app-bar-width: 100%;
      --safe-area-content-inset-left: var(--safe-area-inset-left);
    }
    partial-panel-resolver,
    ha-sidebar {
      /* allow a light tap highlight on the actual interface elements  */
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
    }
    partial-panel-resolver {
      display: block;
      height: 100%;
    }
    partial-panel-resolver::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      background: var(--ha-panel-background, var(--primary-background-color));
      background-attachment: scroll !important;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "home-assistant-main": HomeAssistantMain;
  }
}
