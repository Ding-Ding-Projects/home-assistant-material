import { mdiPlus } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeRTL } from "../../../common/util/compute_rtl";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "./hui-view-add-content-notice";
import type { LovelaceViewElement } from "../../../data/lovelace";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import type { HomeAssistant } from "../../../types";
import type { HuiCard } from "../cards/hui-card";
import type { HuiCardOptions } from "../components/hui-card-options";
import type { LovelacePath } from "../editor/lovelace-path";
import type { Lovelace } from "../types";
import type { ViewAddContentMode } from "./view-add-content";
import {
  convertPanelViewToSections,
  getViewAddContentMode,
} from "./view-add-content";

let editCodeLoaded = false;

@customElement("hui-panel-view")
export class PanelView extends LitElement implements LovelaceViewElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public lovelace?: Lovelace;

  @property({ attribute: false }) public path?: LovelacePath;

  @property({ attribute: false }) public isStrategy = false;

  @property({ attribute: false }) public cards: HuiCard[] = [];

  @state() private _card?: HuiCard | HuiCardOptions;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public setConfig(_config: LovelaceViewConfig): void {}

  public willUpdate(changedProperties: PropertyValues<this>): void {
    super.willUpdate(changedProperties);

    if (this.lovelace?.editMode && !editCodeLoaded) {
      editCodeLoaded = true;
      import("./default-view-editable");
    }

    this.toggleAttribute("has-notice", this._addContentMode !== "none");

    if (changedProperties.has("cards")) {
      this._createCard();
    }

    if (!changedProperties.has("lovelace")) {
      return;
    }

    const oldLovelace = changedProperties.get("lovelace") as
      Lovelace | undefined;

    if (
      (!changedProperties.has("cards") &&
        oldLovelace?.config !== this.lovelace?.config) ||
      (oldLovelace && oldLovelace?.editMode !== this.lovelace?.editMode)
    ) {
      this._createCard();
    }
  }

  protected render(): TemplateResult {
    const addContentMode = this._addContentMode;
    return html`
      ${
        addContentMode !== "none"
          ? html`<hui-view-add-content-notice
              .hass=${this.hass}
              .mode=${addContentMode}
              @view-add-content-action=${this._handleAddContentAction}
            ></hui-view-add-content-notice>`
          : nothing
      }
      ${
        this.cards!.length > 1
          ? html`<ha-alert alert-type="warning"
              >${this.hass!.localize(
                "ui.panel.lovelace.editor.view.panel_mode.warning_multiple_cards"
              )}</ha-alert
            >`
          : ""
      }
      ${this._card}
      ${
        this.lovelace?.editMode && this.cards.length === 0
          ? html`
              <ha-button
                size="l"
                @click=${this._addCard}
                class=${classMap({
                  rtl: computeRTL(
                    this.hass!.language,
                    this.hass!.translationMetadata.translations
                  ),
                })}
              >
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass!.localize("ui.panel.lovelace.editor.edit_card.add")}
              </ha-button>
            `
          : ""
      }
    `;
  }

  private get _addContentMode(): ViewAddContentMode {
    return getViewAddContentMode({
      editMode: Boolean(this.lovelace?.editMode),
      isStrategy: this.isStrategy,
      isPanel: true,
      cardCount: this.cards.length,
    });
  }

  private _handleAddContentAction = (
    ev: HASSDomEvent<{ mode: ViewAddContentMode }>
  ): void => {
    // Taking control of a generated view is handled by the view that hosts
    // this layout; the conversion below only concerns this layout.
    if (ev.detail.mode !== "convert" || !this.lovelace || !this.path) {
      return;
    }
    ev.stopPropagation();
    this.lovelace.saveConfig(
      convertPanelViewToSections(this.lovelace.config, this.path[1] as number)
    );
  };

  private _addCard(): void {
    fireEvent(this, "ll-create-card", { path: [...this.path!, "cards"] });
  }

  private _createCard(): void {
    if (this.cards.length === 0) {
      this._card = undefined;
      return;
    }

    const card: HuiCard = this.cards[0];
    card.layout = "panel";

    if (this.isStrategy || !this.lovelace?.editMode) {
      card.preview = false;
      this._card = card;
      return;
    }

    const wrapper = document.createElement("hui-card-options");
    wrapper.hass = this.hass;
    wrapper.lovelace = this.lovelace;
    wrapper.path = [...this.path!, "cards", 0];
    wrapper.hidePosition = true;
    card.preview = true;
    wrapper.appendChild(card);
    this._card = wrapper;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      --restore-card-border-radius: var(
        --ha-card-border-radius,
        var(--ha-border-radius-lg)
      );
      --restore-card-border-width: var(--ha-card-border-width, 1px);
      --restore-card-box-shadow: var(--ha-card-box-shadow, none);
    }

    /* With a notice above it, the card gives up the height the notice takes
       instead of pushing its own bar below the fold */
    :host([has-notice]) {
      display: flex;
      flex-direction: column;
    }

    :host([has-notice]) hui-card-options,
    :host([has-notice]) hui-card {
      flex: 1 1 auto;
      min-height: 0;
    }

    * {
      --ha-card-border-radius: var(--ha-border-radius-square);
      --ha-card-border-width: 0;
      --ha-card-box-shadow: none;
    }

    ha-button {
      position: fixed;
      right: calc(16px + var(--safe-area-inset-right));
      bottom: calc(16px + var(--safe-area-inset-bottom));
      z-index: 1;
      float: var(--float-end);
      inset-inline-end: calc(16px + var(--safe-area-inset-right));
      inset-inline-start: initial;
      --ha-button-box-shadow: var(--ha-box-shadow-l);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-panel-view": PanelView;
  }
}
