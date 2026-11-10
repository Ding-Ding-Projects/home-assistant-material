import { ContextProvider } from "@lit/context";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { HASSDomEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { listenMediaQuery } from "../common/dom/media_query";
import { storage } from "../common/decorators/storage";
import { DEBUG_SAFE_AREA_TOOL_STORAGE_KEY } from "../common/util/debug-safe-area";
import { computeRTLDirection } from "../common/util/compute_rtl";
import "../components/ha-drawer";
import "../components/ha-page-tabs";
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

  @storage({
    key: DEBUG_SAFE_AREA_TOOL_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _debugSafeAreaTool = false;

  private _narrowViewportProvider = new ContextProvider(this, {
    context: narrowViewportContext,
    initialValue: this.narrow,
  });

  constructor() {
    super();
    listenMediaQuery("(max-width: 870px)", (matches) => {
      this.narrow = matches;
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

    this.addEventListener("hass-show-notifications", () => {
      showNotificationDrawer(this, {
        narrow: this.narrow,
      });
    });
  }

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

    this.toggleAttribute("expanded", this.hass.dockedSidebar === "docked");

    this.toggleAttribute(
      "modal",
      this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode
    );
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
      --ha-sidebar-width: calc(88px + var(--safe-area-inset-left, 0px));
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
      --ha-page-tabs-height: 52px;
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
    .pane-frame {
      display: none;
    }
    :host(:not([modal])) .pane-frame {
      display: block;
      position: fixed;
      z-index: 5;
      inset-block: var(--ha-pane-gap);
      inset-inline-start: var(--ha-sidebar-width);
      inset-inline-end: var(--ha-pane-gap);
      border-radius: var(--ha-pane-radius);
      box-shadow: 0 0 0 100vmax var(--ha-color-window);
      pointer-events: none;
      transition: inset-inline-start var(--ha-animation-duration-normal) ease;
    }
    /* The bar of open pages sits at the top of the pane, above the page
       headers, and rounds its own top corners to match the frame. Its height
       is reported to pages as safe area. */
    ha-page-tabs {
      position: fixed;
      z-index: 6;
      top: var(--ha-page-tabs-top);
      inset-inline-start: var(--ha-sidebar-width);
      inset-inline-end: var(--ha-pane-gap);
      height: var(--ha-page-tabs-height);
      border-start-start-radius: var(--ha-pane-radius);
      border-start-end-radius: var(--ha-pane-radius);
      transition: inset-inline-start var(--ha-animation-duration-normal) ease;
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
