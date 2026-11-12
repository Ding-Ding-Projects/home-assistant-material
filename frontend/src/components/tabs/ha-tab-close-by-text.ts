import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type {
  ClosePlan,
  ClosePlanKind,
} from "../../common/tabs/tab-close-plans";
import {
  planEdgeClose,
  planTextClose,
} from "../../common/tabs/tab-close-plans";
import type { DockEdge } from "../../common/tabs/tab-dock";
import type { HomeAssistant } from "../../types";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import "./ha-tab-menu-close-preview";
import type { TabMenuState } from "./tab-menu-actions";
import type { Placement } from "./tab-menu-placement";
import { placeBeside } from "./tab-menu-placement";
import { tabSharedStyles } from "./tab-shared-styles";

declare global {
  interface HASSDomEvents {
    /** The person confirmed a close; `ids` are the tabs of the plan. */
    "tab-menu-close": { ids: string[]; kind: ClosePlanKind };
  }
  interface HTMLElementTagNameMap {
    "ha-tab-close-by-text": HaTabCloseByText;
  }
}

const TEXT_KINDS: ClosePlanKind[] = ["containing", "not_containing"];

/**
 * @element ha-tab-close-by-text
 *
 * @summary
 * The bulk close dialog opened from the tab menu. It sits beside the tab, is
 * not modal and always previews before it closes: for "Close tabs containing
 * text" and "Close tabs not containing text" it has a search field, plain text
 * by default with the pattern workbench beside it, which matches the visible
 * label only and refuses an empty text or a pattern that cannot be used. It
 * also carries the preview of "Close other tabs" and the two close-to-edge
 * actions, which have no field.
 *
 * @fires tab-menu-close - The person confirmed; `detail.ids` close.
 */
@customElement("ha-tab-close-by-text")
export class HaTabCloseByText extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The saved snap of the strip, read when the menu opened. */
  @property({ attribute: false }) public tabState?: TabMenuState;

  @property({ attribute: false }) public dock: DockEdge = "left";

  @state() private _kind: ClosePlanKind = "containing";

  @state() private _targetId?: string;

  @state() private _query = "";

  @state() private _includePinned = false;

  @state() private _placement?: Placement;

  private _anchor?: HTMLElement;

  @query("#dialog") private _dialog?: HTMLElement;

  @query("ha-input-search") private _search?: HaInputSearch;

  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  /** Opens the dialog beside `anchor` for one kind of close. */
  public async show(
    kind: ClosePlanKind,
    anchor: HTMLElement,
    targetId?: string
  ) {
    this._kind = kind;
    this._targetId = targetId;
    this._anchor = anchor;
    this._query = "";
    this._includePinned = false;
    this._placement = undefined;
    await this.updateComplete;
    this._dialog?.showPopover();
    window.addEventListener("resize", this._place);
    await this.updateComplete;
    this._place();
    if (TEXT_KINDS.includes(kind)) {
      await this._search?.updateComplete;
      this._search?.focus();
    } else {
      this._dialog?.focus();
    }
  }

  public close(returnFocus = true) {
    window.removeEventListener("resize", this._place);
    if (this._dialog?.matches(":popover-open")) {
      this._dialog.hidePopover();
    }
    if (returnFocus && this._anchor?.isConnected) {
      this._anchor.focus();
    }
  }

  public get isOpen(): boolean {
    return Boolean(this._dialog?.matches(":popover-open"));
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._place);
  }

  private _place = () => {
    if (!this._anchor || !this._dialog) {
      return;
    }
    const rect = this._anchor.getBoundingClientRect();
    const size = this._dialog.getBoundingClientRect();
    this._placement = placeBeside(
      rect,
      { width: Math.max(size.width, 320), height: size.height || 360 },
      {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      this.dock,
      document.dir === "rtl"
    );
  };

  private _plan(includePinned: boolean): ClosePlan {
    const tabs = this.tabState?.planTabs ?? [];
    const options = { includePinned };
    if (this._kind === "containing" || this._kind === "not_containing") {
      return planTextClose(tabs, this._query, this._kind, options);
    }
    return planEdgeClose(
      tabs,
      this._targetId ?? "",
      this._kind as "others" | "to_start" | "to_end",
      options
    );
  }

  protected render(): TemplateResult {
    const snap = this.tabState;
    const placement = this._placement;
    const text = TEXT_KINDS.includes(this._kind);
    let plan: ClosePlan | undefined;
    let pinnedKept: string[] = [];
    if (snap && this.hass) {
      plan = this._plan(this._includePinned);
      pinnedKept = this._plan(false)
        .protected.filter(
          (item) =>
            item.reasons.includes("pinned") && !item.reasons.includes("current")
        )
        .map((item) => item.id);
    }
    const base = "ui.page_tabs.close_by_text.";
    const title = this.hass ? this._t(`${base}title_${this._kind}`) : "";
    return html`
      <div
        id="dialog"
        popover="manual"
        role="dialog"
        aria-label=${title}
        tabindex="-1"
        class=${placement?.sheet ? "sheet" : ""}
        style=${styleMap(
          placement && !placement.sheet
            ? {
                left: `${placement.left}px`,
                top: `${placement.top}px`,
                "max-height": `${placement.maxHeight}px`,
                "max-width": `${placement.maxWidth}px`,
              }
            : {}
        )}
        @keydown=${this._keydown}
      >
        ${
          this.hass && snap
            ? html`
                <h2 class="title">${title}</h2>
                ${
                  text
                    ? html`<ha-input-search
                        appearance="outlined"
                        .value=${this._query}
                        .placeholder=${this._t("ui.common.search")}
                        .hint=${this._t(`${base}field`)}
                        .accessibleLabel=${this._t(`${base}field`)}
                        .patternSamples=${snap.planTabs
                          .filter((tab) => tab.open)
                          .map((tab) => tab.label)}
                        @input=${this._queryChanged}
                      ></ha-input-search>`
                    : nothing
                }
                <ha-tab-menu-close-preview
                  .hass=${this.hass}
                  .plan=${plan}
                  .labels=${snap.labels}
                  .pinnedKept=${pinnedKept}
                  .includePinned=${this._includePinned}
                  @tab-close-include-pinned=${this._includeChanged}
                  @tab-close-confirm=${this._confirm}
                  @tab-close-cancel=${this._cancel}
                ></ha-tab-menu-close-preview>
              `
            : nothing
        }
      </div>
    `;
  }

  private _queryChanged(ev: Event) {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _includeChanged(ev: CustomEvent<{ value: boolean }>) {
    ev.stopPropagation();
    this._includePinned = ev.detail.value;
  }

  private _confirm(ev: Event) {
    ev.stopPropagation();
    const plan = this._plan(this._includePinned);
    if (plan.blocked || !plan.ids.length) {
      return;
    }
    // Close first: the strip may redraw its tabs, and focus goes to the one
    // that is still there.
    this.close(false);
    fireEvent(this, "tab-menu-close", { ids: plan.ids, kind: this._kind });
  }

  private _cancel(ev: Event) {
    ev.stopPropagation();
    this.close();
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this.close();
    }
  }

  static styles: CSSResultGroup = [
    tabSharedStyles,
    css`
      #dialog {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        width: min(360px, calc(100vw - 16px));
        padding: var(--ha-space-4);
        border: none;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
        overflow-y: auto;
      }
      #dialog:popover-open {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      #dialog:focus {
        outline: none;
      }
      #dialog.sheet {
        inset: auto 0 0 0;
        width: 100%;
        max-width: none;
        max-height: 90vh;
        border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0
          0;
      }
      .title {
        margin: 0;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      @media (prefers-reduced-motion: no-preference) {
        #dialog:popover-open {
          animation: appear 120ms ease-out;
        }
        @keyframes appear {
          from {
            opacity: 0;
          }
        }
      }
    `,
  ];
}
