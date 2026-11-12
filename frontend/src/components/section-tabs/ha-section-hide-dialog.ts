import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type {
  ClosePlan,
  ClosePlanKind,
} from "../../common/tabs/tab-close-plans";
import type { HomeAssistant } from "../../types";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import type { Placement } from "../tabs/tab-menu-placement";
import { placeBeside } from "../tabs/tab-menu-placement";
import { tabSharedStyles } from "../tabs/tab-shared-styles";
import { hidePopover, popoverOpen, showPopover } from "./section-popover";
import type { SectionPlanInput } from "./section-surface";
import { planSectionGroupHide, planSectionHide } from "./section-surface";

declare global {
  interface HTMLElementTagNameMap {
    "ha-section-hide-dialog": HaSectionHideDialog;
  }
}

/** What the dialog hides: a kind of the shared plans, or one group's sections. */
export type SectionHideKind = ClosePlanKind | "group";

export interface SectionHideRequest {
  kind: SectionHideKind;
  anchor: HTMLElement;
  /** Reads the surface right now, so the preview is never stale. */
  input: () => SectionPlanInput;
  /** The section the menu was opened on, for the plans that start from one. */
  targetId?: string;
  /** The group whose sections are hidden, for the kind `group`. */
  groupId?: string;
  /** Called with the sections to hide when the person confirms. */
  onConfirm: (ids: string[], kind: SectionHideKind) => void;
}

const TEXT_KINDS: SectionHideKind[] = ["containing", "not_containing"];

const BASE = "ui.components.section_tabs.hide_dialog.";

/**
 * @element ha-section-hide-dialog
 *
 * @summary
 * The review step of hiding many sections of a settings surface. It opens
 * beside the tab it came from, is not modal, and always shows what hides and
 * what stays (the open section, pinned and locked sections) before anything
 * is hidden. For "Hide tabs containing text" and "Hide tabs not containing
 * text" it has a search field, plain text with the pattern workbench beside
 * it, that matches the visible label only and hides nothing for an empty text
 * or a pattern that cannot be used. Sections are hidden from the row, never
 * removed, so the wording says hide.
 */
@customElement("ha-section-hide-dialog")
export class HaSectionHideDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _request?: SectionHideRequest;

  @state() private _query = "";

  @state() private _placement?: Placement;

  @query("#dialog") private _dialog?: HTMLElement;

  @query("ha-input-search") private _search?: HaInputSearch;

  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  /** Opens the dialog beside the element it came from. */
  public async show(request: SectionHideRequest) {
    this._request = request;
    this._query = "";
    this._placement = undefined;
    await this.updateComplete;
    showPopover(this._dialog);
    window.addEventListener("resize", this._place);
    await this.updateComplete;
    this._place();
    if (TEXT_KINDS.includes(request.kind)) {
      await this._search?.updateComplete;
      this._search?.focus();
    } else {
      this._dialog?.focus();
    }
  }

  public close(returnFocus = true) {
    window.removeEventListener("resize", this._place);
    if (popoverOpen(this._dialog)) {
      hidePopover(this._dialog);
    }
    const anchor = this._request?.anchor;
    if (returnFocus && anchor?.isConnected) {
      anchor.focus();
    }
  }

  public get isOpen(): boolean {
    return popoverOpen(this._dialog);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._place);
  }

  private _place = () => {
    const anchor = this._request?.anchor;
    if (!anchor || !this._dialog) {
      return;
    }
    const size = this._dialog.getBoundingClientRect();
    this._placement = placeBeside(
      anchor.getBoundingClientRect(),
      { width: Math.max(size.width, 320), height: size.height || 360 },
      {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      "top",
      document.dir === "rtl"
    );
  };

  /** The plan for what is typed now. */
  private _plan(request: SectionHideRequest): ClosePlan {
    const input = request.input();
    return request.kind === "group"
      ? planSectionGroupHide(input, request.groupId ?? "")
      : planSectionHide(input, request.kind, this._query, request.targetId);
  }

  protected render(): TemplateResult {
    const request = this._request;
    const placement = this._placement;
    const ready = Boolean(this.hass && request);
    const plan = ready ? this._plan(request!) : undefined;
    const kind = request?.kind ?? "containing";
    const title = ready ? this._t(`${BASE}title_${kind}`) : "";
    const labels = (id: string) => request?.input().labels[id] ?? id;
    const count = plan?.ids.length ?? 0;
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
          ready && plan
            ? html`
                <h2 class="title">${title}</h2>
                ${
                  TEXT_KINDS.includes(kind)
                    ? html`<ha-input-search
                        appearance="outlined"
                        .value=${this._query}
                        .placeholder=${this._t("ui.common.search")}
                        .hint=${this._t(`${BASE}field`)}
                        .accessibleLabel=${this._t(`${BASE}field`)}
                        .patternSamples=${request!
                          .input()
                          .paths.map((id) => labels(id))}
                        @input=${this._queryChanged}
                      ></ha-input-search>`
                    : nothing
                }
                <div class="preview">
                  ${
                    plan.blocked
                      ? html`<p class="note" role="status">
                          ${this._t(`${BASE}blocked_${plan.blocked}`)}
                        </p>`
                      : html`
                          ${
                            plan.matchMode
                              ? html`<p class="note">
                                  ${this._t(`${BASE}mode_${plan.matchMode}`)}
                                </p>`
                              : nothing
                          }
                          <p class="summary" role="status">
                            ${this._t(`${BASE}summary`, { count })}
                          </p>
                          ${
                            count
                              ? html`<ul
                                  class="list"
                                  aria-label=${this._t(`${BASE}will_hide`)}
                                >
                                  ${plan.ids.map(
                                    (id) => html`<li>${labels(id)}</li>`
                                  )}
                                </ul>`
                              : nothing
                          }
                          ${
                            plan.protected.length
                              ? html`
                                  <p class="heading">
                                    ${this._t(`${BASE}protected_heading`, {
                                      count: plan.protected.length,
                                    })}
                                  </p>
                                  <ul
                                    class="list"
                                    aria-label=${this._t(
                                      `${BASE}protected_heading`,
                                      { count: plan.protected.length }
                                    )}
                                  >
                                    ${plan.protected.map(
                                      (item) =>
                                        html`<li class="kept">
                                          <span>${labels(item.id)}</span>
                                          <span class="why"
                                            >${item.reasons
                                              .map((reason) =>
                                                this._t(
                                                  `${BASE}reason_${reason}`
                                                )
                                              )
                                              .join(", ")}</span
                                          >
                                        </li>`
                                    )}
                                  </ul>
                                `
                              : nothing
                          }
                        `
                  }
                  <div class="buttons">
                    <button class="text-button quiet" @click=${this._cancel}>
                      ${this._t(`${BASE}cancel`)}
                    </button>
                    <button
                      class="text-button"
                      ?disabled=${!count || Boolean(plan.blocked)}
                      @click=${this._confirm}
                    >
                      ${this._t(`${BASE}confirm`, { count })}
                    </button>
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  private _queryChanged(ev: Event) {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _confirm() {
    const request = this._request;
    if (!request) {
      return;
    }
    const plan = this._plan(request);
    if (plan.blocked || !plan.ids.length) {
      return;
    }
    // Close first: the row redraws, and focus goes to a tab that is still there.
    this.close(false);
    request.onConfirm(plan.ids, request.kind);
  }

  private _cancel() {
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
      .preview {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      p {
        margin: 0;
      }
      .note,
      .why {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .summary,
      .heading {
        font-weight: var(--ha-font-weight-medium);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 160px;
        overflow-y: auto;
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
      }
      .list li {
        padding: var(--ha-space-2) var(--ha-space-3);
        overflow-wrap: anywhere;
      }
      .list li + li {
        border-top: 1px solid var(--divider-color);
      }
      .kept {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .buttons {
        display: flex;
        justify-content: flex-end;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      .text-button {
        min-height: 44px;
      }
      .text-button.quiet {
        background: none;
        color: var(--primary-color);
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
