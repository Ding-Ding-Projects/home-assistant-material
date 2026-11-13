import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiCheckboxMarkedCircleOutline,
  mdiClipboardTextClockOutline,
  mdiContentCopy,
  mdiContentCut,
  mdiContentPaste,
  mdiCursorMove,
  mdiDelete,
  mdiDotsVertical,
  mdiPencil,
  mdiPlusCircleMultipleOutline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { storage } from "../../../common/decorators/storage";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { fireEvent } from "../../../common/dom/fire_event";
import { highlightElement } from "../../../common/dom/highlight-element";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import { haStyle } from "../../../resources/styles";
import type { HuiCard } from "../cards/hui-card";
import { takeCardHighlight } from "../editor/card-highlight";
import {
  cardSelection,
  SELECTION_CHANGED_EVENT,
} from "../editor/card-selection";
import { showCardTargetsDialog } from "../editor/card-targets-dialog/show-dialog-card-targets";
import type { LovelacePath } from "../editor/lovelace-path";
import type { Lovelace } from "../types";

@customElement("hui-card-edit-mode")
export class HuiCardEditMode extends LitElement {
  @property({ attribute: false }) public lovelace!: Lovelace;

  @property({ attribute: false }) public path!: LovelacePath;

  @property({ type: Boolean, attribute: "hidden-overlay" })
  public hiddenOverlay = false;

  @property({ type: Boolean, attribute: "no-edit" })
  public noEdit = false;

  @property({ type: Boolean, attribute: "no-duplicate" })
  public noDuplicate = false;

  @property({ type: Boolean, attribute: "no-move" })
  public noMove = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @storage({
    key: "dashboardCardClipboard",
    state: true,
    subscribe: true,
    storage: "sessionStorage",
  })
  private _clipboard?: LovelaceCardConfig;

  @state()
  public _hover = false;

  @state()
  public _focused = false;

  @query(".card-wrapper") private _cardWrapper!: HTMLDivElement;

  @queryAssignedElements({ selector: "hui-card" })
  private _huiCards?: HuiCard[];

  private _touchStarted = false;

  /** Used by the selection to read the card's text and to show dialogs. */
  public get localize(): LocalizeFunc {
    return this._localize;
  }

  private get _selected(): boolean {
    return Boolean(this.path) && cardSelection.has(this.path);
  }

  private _selectionChanged = () => this.requestUpdate();

  connectedCallback(): void {
    super.connectedCallback();
    cardSelection.register(this);
    cardSelection.addEventListener(
      SELECTION_CHANGED_EVENT,
      this._selectionChanged
    );
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("lovelace") && this.lovelace) {
      cardSelection.checkConfig(this.lovelace.config);
    }
  }

  protected firstUpdated(): void {
    // Ctrl or Command and click adds the card to the selection (or removes it)
    // instead of opening the editor.
    this.addEventListener(
      "click",
      (ev: MouseEvent) => {
        if (!ev.ctrlKey && !ev.metaKey) {
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        cardSelection.toggle(this);
      },
      true
    );
    this.addEventListener("focus", () => {
      this._focused = true;
    });
    this.addEventListener("blur", () => {
      this._focused = false;
    });
    this.addEventListener("touchstart", () => {
      this._touchStarted = true;
      // Set hover on touchstart for touch devices
      this._hover = true;
      document.addEventListener("click", this._documentClicked);
    });
    this.addEventListener("touchend", () => {
      setTimeout(() => {
        this._touchStarted = false;
      }, 10);
    });
    this.addEventListener("mouseenter", () => {
      if (this._touchStarted) return;
      this._hover = true;
    });
    this.addEventListener("mouseleave", () => {
      this._hover = false;
    });
    this.addEventListener("click", () => {
      this._hover = true;
      document.addEventListener("click", this._documentClicked);
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this._documentClicked);
    cardSelection.removeEventListener(
      SELECTION_CHANGED_EVENT,
      this._selectionChanged
    );
    cardSelection.unregister(this);
  }

  private _documentClicked = (ev) => {
    this._hover = ev.composedPath().includes(this);
    document.removeEventListener("click", this._documentClicked);
  };

  protected updated(changedProperties: PropertyValues<this>): void {
    if (
      changedProperties.has("path") &&
      takeCardHighlight(this._huiCards?.[0]?.config)
    ) {
      highlightElement(this._cardWrapper);
    }
  }

  protected render(): TemplateResult {
    const showOverlay = (this._hover || this._focused) && !this.hiddenOverlay;

    return html`
      <div class="card-wrapper" inert><slot></slot></div>
      ${
        this._selected
          ? html`<div class="selection-ring" aria-hidden="true">
              <ha-svg-icon
                .path=${mdiCheckboxMarkedCircleOutline}
              ></ha-svg-icon>
            </div>`
          : nothing
      }
      <div class="card-overlay ${classMap({ visible: showOverlay })}">
        ${
          this.noEdit
            ? html`
                <div class="control">
                  <div class="control-overlay"></div>
                  <ha-svg-icon .path=${mdiCursorMove}> </ha-svg-icon>
                </div>
              `
            : html`
                <div
                  class="control"
                  role="button"
                  aria-label=${this._localize(
                    "ui.panel.lovelace.editor.edit_card.edit_label"
                  )}
                  @click=${this._handleOverlayClick}
                  @keydown=${this._handleOverlayClick}
                  tabindex="0"
                >
                  <div class="control-overlay"></div>
                  <ha-svg-icon .path=${mdiPencil}> </ha-svg-icon>
                </div>
              `
        }
        <ha-dropdown
          class="more"
          placement="bottom-end"
          @wa-select=${this._handleDropdownSelect}
        >
          <ha-icon-button slot="trigger" .path=${mdiDotsVertical}>
          </ha-icon-button>
          ${
            this.noEdit
              ? nothing
              : html`
                  <ha-dropdown-item value="edit">
                    <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
                    ${this._localize("ui.panel.lovelace.editor.edit_card.edit")}
                  </ha-dropdown-item>
                `
          }
          ${
            this.noDuplicate
              ? nothing
              : html`
                  <ha-dropdown-item value="duplicate">
                    <ha-svg-icon
                      slot="icon"
                      .path=${mdiPlusCircleMultipleOutline}
                    ></ha-svg-icon>
                    ${this._localize(
                      "ui.panel.lovelace.editor.edit_card.duplicate"
                    )}
                  </ha-dropdown-item>
                `
          }
          ${
            this.noMove
              ? nothing
              : html`
                  <ha-dropdown-item value="select">
                    <ha-svg-icon
                      slot="icon"
                      .path=${mdiCheckboxMarkedCircleOutline}
                    ></ha-svg-icon>
                    ${this._localize(
                      this._selected
                        ? "ui.panel.lovelace.editor.multi_select.deselect"
                        : "ui.panel.lovelace.editor.multi_select.select"
                    )}
                  </ha-dropdown-item>
                  <ha-dropdown-item value="copy">
                    <ha-svg-icon
                      slot="icon"
                      .path=${mdiContentCopy}
                    ></ha-svg-icon>
                    ${this._localize("ui.panel.lovelace.editor.edit_card.copy")}
                  </ha-dropdown-item>
                  <ha-dropdown-item value="cut">
                    <ha-svg-icon
                      slot="icon"
                      .path=${mdiContentCut}
                    ></ha-svg-icon>
                    ${this._localize("ui.panel.lovelace.editor.edit_card.cut")}
                  </ha-dropdown-item>
                  ${
                    this._clipboard && !this.noDuplicate
                      ? html`
                          <ha-dropdown-item value="paste">
                            <ha-svg-icon
                              slot="icon"
                              .path=${mdiContentPaste}
                            ></ha-svg-icon>
                            ${this._localize(
                              "ui.panel.lovelace.editor.edit_card.paste"
                            )}
                          </ha-dropdown-item>
                        `
                      : nothing
                  }
                  ${
                    this.noDuplicate
                      ? nothing
                      : html`
                          <ha-dropdown-item value="history">
                            <ha-svg-icon
                              slot="icon"
                              .path=${mdiClipboardTextClockOutline}
                            ></ha-svg-icon>
                            ${this._localize(
                              "ui.panel.lovelace.editor.clipboard.paste_from_history"
                            )}
                          </ha-dropdown-item>
                        `
                  }
                `
          }
          ${
            this.noDuplicate && this.noEdit && this.noMove
              ? nothing
              : html`<wa-divider></wa-divider>`
          }
          <ha-dropdown-item value="delete" variant="danger">
            ${this._localize("ui.panel.lovelace.editor.edit_card.delete")}
            <ha-svg-icon
              class="warning"
              slot="icon"
              .path=${mdiDelete}
            ></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>
      </div>
    `;
  }

  private _handleOverlayClick(ev): void {
    if (ev.defaultPrevented) {
      return;
    }
    if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this._editCard();
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "edit":
        this._editCard();
        break;
      case "duplicate":
        this._duplicateCard();
        break;
      case "copy":
        this._copyCard();
        break;
      case "cut":
        this._cutCard();
        break;
      case "paste":
        this._pasteCard();
        break;
      case "select":
        cardSelection.toggle(this);
        break;
      case "history":
        showCardTargetsDialog(this, {
          mode: "paste",
          lovelace: () => this.lovelace,
          viewIndex: typeof this.path[1] === "number" ? this.path[1] : 0,
        });
        break;
      case "delete":
        this._deleteCard();
        break;
    }
  }

  private _duplicateCard(): void {
    fireEvent(this, "ll-duplicate-card", { path: this.path! });
  }

  private _editCard(): void {
    fireEvent(this, "ll-edit-card", { path: this.path! });
  }

  private _cutCard(): void {
    fireEvent(this, "ll-cut-card", { path: this.path! });
  }

  private _copyCard(): void {
    fireEvent(this, "ll-copy-card", { path: this.path! });
  }

  private _pasteCard(): void {
    fireEvent(this, "ll-paste-card", { path: this.path! });
  }

  private _deleteCard(): void {
    fireEvent(this, "ll-delete-card", { path: this.path!, silent: false });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .card-overlay {
          position: absolute;
          opacity: 0;
          pointer-events: none;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 180ms ease-in-out;
        }

        .card-overlay.visible {
          opacity: 1;
          pointer-events: auto;
        }

        .card-wrapper {
          position: relative;
          height: 100%;
          z-index: 0;
          border-radius: var(
            --ha-card-border-radius,
            var(--ha-border-radius-lg)
          );
        }

        .selection-ring {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          border: 3px solid var(--primary-color);
          border-radius: var(
            --ha-card-border-radius,
            var(--ha-border-radius-lg)
          );
          background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        }
        .selection-ring ha-svg-icon {
          position: absolute;
          inset-block-start: 6px;
          inset-inline-start: 6px;
          color: var(--primary-color);
          background: var(--card-background-color);
          border-radius: var(--ha-border-radius-circle);
          --mdc-icon-size: 22px;
        }
        .control {
          outline: none !important;
          cursor: pointer;
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(
            --ha-card-border-radius,
            var(--ha-border-radius-lg)
          );
          z-index: 0;
        }
        .control-overlay {
          position: absolute;
          inset: 0;
          opacity: 0.8;
          background-color: var(--primary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: var(
            --ha-card-border-radius,
            var(--ha-border-radius-lg)
          );
          z-index: 0;
        }
        .control ha-svg-icon {
          display: flex;
          position: relative;
          color: var(--primary-text-color);
          border-radius: var(--ha-border-radius-circle);
          padding: 8px;
          background: var(--secondary-background-color);
          --mdc-icon-size: 20px;
        }
        .more ha-icon-button {
          position: absolute;
          right: -6px;
          top: -6px;
          inset-inline-end: -6px;
          inset-inline-start: initial;
          cursor: pointer;
          border-radius: var(--ha-border-radius-circle);
          background: var(--secondary-background-color);
          --ha-icon-button-size: 32px;
          --mdc-icon-size: 20px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card-edit-mode": HuiCardEditMode;
  }
}
