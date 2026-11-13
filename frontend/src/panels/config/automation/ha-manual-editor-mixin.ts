import {
  html,
  nothing,
  type LitElement,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../../../common/decorators/consume";
import { storage } from "../../../common/decorators/storage";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import { replaceCurrentUrl } from "../../../common/navigate";
import { constructUrlCurrentPath } from "../../../common/url/construct-url";
import {
  extractSearchParam,
  removeSearchParam,
} from "../../../common/url/search-params";
import "../../../components/editor/ha-editor-save-bar";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-markdown";
import type { SidebarConfig } from "../../../data/automation";
import {
  dirtyStateContext,
  type DirtyStateContext,
} from "../../../data/context/dirty-state";
import type {
  Constructor,
  HomeAssistant,
  ValueChangedEvent,
} from "../../../types";
import { showToast } from "../../../util/toast";
import "./ha-automation-sidebar";
import "./search/ha-automation-search-scope";
import type HaAutomationSidebar from "./ha-automation-sidebar";

export const SIDEBAR_DEFAULT_WIDTH = 500;

export const PASTED_CONFIG_TOAST_ID = "pasted-config";

export const ManualEditorMixin = <TConfig>(
  superClass: Constructor<LitElement>
) => {
  class ManualEditorClass extends superClass {
    @property({ attribute: false }) public hass!: HomeAssistant;

    @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

    @property({ type: Boolean }) public narrow = false;

    @property({ type: Boolean }) public disabled = false;

    @property({ type: Boolean }) public saving = false;

    @property({ attribute: false }) public config!: TConfig;

    @consume({ context: dirtyStateContext, subscribe: true })
    @state()
    private _dirtyState?: DirtyStateContext;

    protected get dirty(): boolean {
      return this._dirtyState?.isDirty ?? false;
    }

    @state() protected pastedConfig?: TConfig;

    @state() protected sidebarConfig?: SidebarConfig;

    @state() protected sidebarKey = 0;

    @state() private _bottomSheetHeight?: number;

    @storage({
      key: "automation-sidebar-width",
      state: false,
      subscribe: false,
    })
    protected sidebarWidthPx = SIDEBAR_DEFAULT_WIDTH;

    @query("ha-automation-sidebar")
    protected sidebarElement?: HaAutomationSidebar;

    declare protected collapsableElements?: NodeListOf<
      Element & {
        expandAll(): void;
        collapseAll(): void;
      }
    >;

    private _prevSidebarWidthPx?: number;

    protected handlePaste = async (_ev: ClipboardEvent): Promise<void> => {
      throw new Error("Not implemented");
    };

    public connectedCallback() {
      super.connectedCallback();
      window.addEventListener("paste", this.handlePaste);
    }

    public disconnectedCallback() {
      window.removeEventListener("paste", this.handlePaste);
      super.disconnectedCallback();
    }

    protected renderContent(): TemplateResult | typeof nothing {
      throw new Error("Not implemented");
    }

    protected saveConfig() {
      throw new Error("Not implemented");
    }

    /**
     * Whether the save bar stays out of the way while nothing is unsaved, and
     * offers Discard beside Save while something is. An editor opts in.
     */
    protected hideSaveBarWhenClean = false;

    /**
     * Whether this editor draws its own save bar. An editor whose page already
     * floats one bar with Save (the automation editor) turns this off, so the
     * page never shows two bars and two Save buttons.
     */
    protected renderSaveBar = true;

    private _saveBarSave = (ev: Event) => {
      ev.stopPropagation();
      this.saveConfig();
    };

    protected render() {
      return html`
        <div
          class=${classMap({
            "has-sidebar": this.sidebarConfig && !this.narrow,
          })}
        >
          <div
            class="content-wrapper ${
              this.sidebarConfig && this.narrow ? "has-bottom-sheet" : ""
            }"
            style=${styleMap({
              "--automation-bottom-sheet-settled-height":
                this._bottomSheetHeight === undefined
                  ? undefined
                  : `${this._bottomSheetHeight}px`,
            })}
          >
            <div class="content">
              <slot name="alerts"></slot>
              <ha-automation-search-scope
                .hass=${this.hass}
                .config=${this.config}
              >
                ${this.renderContent()}
              </ha-automation-search-scope>
            </div>
            ${
              this.renderSaveBar
                ? html`<ha-editor-save-bar
                    .hass=${this.hass}
                    .dirty=${this.dirty}
                    .saving=${this.saving}
                    .disabled=${this.disabled}
                    .hideWhenClean=${this.hideSaveBarWhenClean}
                    .showDiscard=${this.hideSaveBarWhenClean}
                    show-shortcut
                    @save-bar-save=${this._saveBarSave}
                  ></ha-editor-save-bar>`
                : nothing
            }
          </div>
          <div class="sidebar-positioner">
            <ha-automation-sidebar
              tabindex="-1"
              class=${classMap({ hidden: !this.sidebarConfig })}
              .isWide=${this.isWide}
              .hass=${this.hass}
              .narrow=${this.narrow}
              .config=${this.sidebarConfig}
              .disabled=${this.disabled}
              .sidebarKey=${this.sidebarKey}
              @value-changed=${this.sidebarConfigChanged}
              @sidebar-resized=${this.resizeSidebar}
              @sidebar-resizing-stopped=${this.stopResizeSidebar}
              @sidebar-reset-size=${this.resetSidebarWidth}
              @bottom-sheet-resized=${this._handleBottomSheetResized}
            ></ha-automation-sidebar>
          </div>
        </div>
      `;
    }

    protected firstUpdated(changedProps: PropertyValues<this>): void {
      super.firstUpdated(changedProps);

      this.style.setProperty(
        "--sidebar-dynamic-width",
        `${this.sidebarWidthPx}px`
      );

      const expanded = extractSearchParam("expanded");
      if (expanded === "1") {
        this.clearParam("expanded");
        this.expandAll();
      }
    }

    protected clearParam(param: string) {
      replaceCurrentUrl(constructUrlCurrentPath(removeSearchParam(param)));
    }

    protected async openSidebar(ev: CustomEvent<SidebarConfig>) {
      // deselect previous selected row
      this.sidebarConfig?.close?.();
      this.sidebarConfig = ev.detail;
      // The sheet opens items at half height, so make room before rows scroll
      this._bottomSheetHeight = undefined;
      this.dispatchEvent(
        new CustomEvent("sidebar-config-changed", {
          detail: { value: this.sidebarConfig },
          bubbles: true,
          composed: true,
        })
      );

      // be sure the sidebar editor is recreated
      this.sidebarKey++;

      await this.sidebarElement?.updateComplete;
      this.sidebarElement?.focus();
    }

    protected sidebarConfigChanged(ev: ValueChangedEvent<SidebarConfig>) {
      ev.stopPropagation();
      if (!this.sidebarConfig) {
        return;
      }

      this.sidebarConfig = {
        ...this.sidebarConfig,
        ...ev.detail.value,
      };
      this.dispatchEvent(
        new CustomEvent("sidebar-config-changed", {
          detail: { value: this.sidebarConfig },
          bubbles: true,
          composed: true,
        })
      );
    }

    public get sidebarOpen(): boolean {
      return !!this.sidebarConfig;
    }

    /** The side pane element, for a page bar that must stay clear of it. */
    public get sidebarLayoutElement(): HTMLElement | undefined {
      return this.sidebarElement;
    }

    /**
     * The horizontal range, in viewport pixels, that the open side pane takes
     * at the end of the page (the right in a left-to-right layout, the left in
     * a right-to-left one), or undefined when no pane sits beside the content
     * (closed, or shown as a bottom sheet). The pane is fixed and may be
     * sliding in, so the range is worked out from its positioner and its
     * width rather than from its own moving box.
     */
    public get sidebarRange(): { left: number; right: number } | undefined {
      if (!this.sidebarConfig || this.narrow || !this.sidebarElement) {
        return undefined;
      }
      const positioner = this.renderRoot.querySelector(".sidebar-positioner");
      if (!positioner) {
        return undefined;
      }
      const rect = positioner.getBoundingClientRect();
      const width = this.sidebarElement.clientWidth;
      return getComputedStyle(positioner).direction === "rtl"
        ? { left: rect.left, right: rect.left + width }
        : { left: rect.right - width, right: rect.right };
    }

    public triggerCloseSidebar() {
      if (this.sidebarConfig) {
        if (this.sidebarElement) {
          this.sidebarElement.triggerCloseSidebar();
          return;
        }
        this.sidebarConfig?.close();
        this.sidebarKey = 0;
      }
    }

    public get canToggleSidebarYamlMode(): boolean {
      return !!this.sidebarElement?.canToggleYamlMode;
    }

    public toggleSidebarYamlMode() {
      this.sidebarElement?.toggleYamlMode();
    }

    private _handleBottomSheetResized(
      ev: HASSDomEvent<HASSDomEvents["bottom-sheet-resized"]>
    ) {
      this._bottomSheetHeight = ev.detail.height;
    }

    protected handleCloseSidebar() {
      this.sidebarConfig = undefined;
      this._bottomSheetHeight = undefined;
      this.dispatchEvent(
        new CustomEvent("sidebar-config-changed", {
          detail: { value: undefined },
          bubbles: true,
          composed: true,
        })
      );
    }

    protected replaceExistingConfig(config: TConfig) {
      this.pastedConfig = config;

      this.showPastedToastWithUndo();

      fireEvent(this, "value-changed", {
        value: {
          ...config,
        },
      });
    }

    protected showPastedToastWithUndo() {
      // Override in subclass with appropriate localize key
    }

    public resetPastedConfig() {
      this.pastedConfig = undefined;

      showToast(this, {
        id: PASTED_CONFIG_TOAST_ID,
        message: "",
        duration: 0,
      });
    }

    public expandAll() {
      this.collapsableElements?.forEach((element) => {
        element.expandAll();
      });
    }

    public collapseAll() {
      this.collapsableElements?.forEach((element) => {
        element.collapseAll();
      });
    }

    protected tryInsertAfterSelected(config: any): boolean {
      if (this.sidebarConfig && "insertAfter" in this.sidebarConfig) {
        return this.sidebarConfig.insertAfter(config as any);
      }
      return false;
    }

    public copySelectedRow() {
      if (this.sidebarConfig && "copy" in this.sidebarConfig) {
        this.sidebarConfig.copy();
      }
    }

    public cutSelectedRow() {
      if (this.sidebarConfig && "cut" in this.sidebarConfig) {
        this.sidebarConfig.cut();
      }
    }

    public deleteSelectedRow() {
      if (this.sidebarConfig && "delete" in this.sidebarConfig) {
        this.sidebarConfig.delete();
      }
    }

    protected resizeSidebar(ev) {
      ev.stopPropagation();
      const delta = ev.detail.deltaInPx as number;

      // set initial resize width to add / reduce delta from it
      if (!this._prevSidebarWidthPx) {
        this._prevSidebarWidthPx =
          this.sidebarElement?.clientWidth || SIDEBAR_DEFAULT_WIDTH;
      }

      const widthPx = delta + this._prevSidebarWidthPx;

      this.sidebarWidthPx = widthPx;

      this.style.setProperty(
        "--sidebar-dynamic-width",
        `${this.sidebarWidthPx}px`
      );
    }

    protected stopResizeSidebar(ev) {
      ev.stopPropagation();
      this._prevSidebarWidthPx = undefined;
    }

    protected resetSidebarWidth(ev: Event) {
      ev.stopPropagation();
      this._prevSidebarWidthPx = undefined;
      this.sidebarWidthPx = SIDEBAR_DEFAULT_WIDTH;
      this.style.setProperty(
        "--sidebar-dynamic-width",
        `${this.sidebarWidthPx}px`
      );
    }
  }
  return ManualEditorClass;
};
