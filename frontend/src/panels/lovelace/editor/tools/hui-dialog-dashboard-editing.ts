import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-button-toggle-group";
import "../../../../components/ha-dialog";
import "../../../../components/ha-select";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { isStrategyView } from "../../../../data/lovelace/config/view";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant, ToggleButton } from "../../../../types";
import type { CopiedStyle } from "./dashboard-edit";
import {
  getCard,
  listEditableCards,
  pathFromKey,
  replaceCard,
} from "./dashboard-edit";
import "./hui-dashboard-interactions";
import "./hui-dashboard-layout";
import "./hui-dashboard-screens";
import "./hui-dashboard-simulate";
import "./hui-dashboard-style";
import "./hui-dashboard-visibility";
import type {
  DashboardEditingDialogParams,
  EditingTool,
} from "./show-dashboard-editing-dialog";

declare global {
  interface HASSDomEvents {
    /** A tool changed the dashboard configuration; the dialog saves it. */
    "dashboard-config-change": { config: LovelaceConfig };
    /** A tool changed the draft of the selected card; the dialog keeps it until Save. */
    "dashboard-card-change": { card: LovelaceCardConfig };
    "dashboard-style-copied": { style: CopiedStyle };
  }
}

const TOOLS: EditingTool[] = [
  "screens",
  "layout",
  "visibility",
  "interactions",
  "style",
  "simulate",
];

const CARD_TOOLS = new Set<EditingTool>([
  "visibility",
  "interactions",
  "style",
]);

@customElement("hui-dialog-dashboard-editing")
export class HuiDialogDashboardEditing extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: DashboardEditingDialogParams;

  @state() private _open = false;

  @state() private _tool: EditingTool = "screens";

  @state() private _config?: LovelaceConfig;

  @state() private _key = "";

  @state() private _draft?: LovelaceCardConfig;

  @state() private _view = 0;

  @state() private _clip?: CopiedStyle;

  @state() private _busy = false;

  @state() private _error?: string;

  @state() private _notice?: string;

  public showDialog(params: DashboardEditingDialogParams): void {
    this._params = params;
    this._config = params.lovelace()?.config;
    this._tool = params.tool;
    this._error = undefined;
    this._notice = undefined;
    const first = this._config
      ? listEditableCards(this._config)[0]?.key
      : undefined;
    this._selectCard(first ?? "");
    const firstView = this._config?.views.findIndex((v) => !isStrategyView(v));
    this._view = firstView !== undefined && firstView >= 0 ? firstView : 0;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.${key}` as LocalizeKeys,
      values
    );
  }

  private _cards = memoizeOne((config: LovelaceConfig) =>
    listEditableCards(config)
  );

  private _selectCard(key: string) {
    this._key = key;
    const card =
      key && this._config ? getCard(this._config, pathFromKey(key)) : undefined;
    this._draft = card ? structuredClone(card) : undefined;
  }

  private get _dirty(): boolean {
    if (!this._config || !this._key || !this._draft) {
      return false;
    }
    const saved = getCard(this._config, pathFromKey(this._key));
    return JSON.stringify(saved) !== JSON.stringify(this._draft);
  }

  protected render() {
    if (!this._params || !this._config) {
      return nothing;
    }
    const buttons: ToggleButton[] = TOOLS.map((tool) => ({
      label: this._t(`names.${tool}`),
      value: tool,
    }));
    const cardTool = CARD_TOOLS.has(this._tool);
    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        header-title=${this._t("title")}
        header-subtitle=${this._t(`${this._tool}_subtitle`)}
        @closed=${this._dialogClosed}
      >
        <ha-button-toggle-group
          variant="neutral"
          active-variant="brand"
          size="s"
          full-width
          .buttons=${buttons}
          .active=${this._tool}
          @value-changed=${this._toolChanged}
        ></ha-button-toggle-group>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${
          this._notice
            ? html`<ha-alert alert-type="success">${this._notice}</ha-alert>`
            : nothing
        }
        <div class="picker">
          ${cardTool ? this._renderCardPicker() : this._renderViewPicker()}
        </div>
        <div class="body">${this._renderTool()}</div>
        ${
          cardTool
            ? html`<ha-button
                slot="footer"
                .disabled=${!this._dirty || this._busy}
                @click=${this._save}
              >
                ${this._t("save")}
              </ha-button>`
            : nothing
        }
        <ha-button slot="footer" appearance="plain" @click=${this.closeDialog}>
          ${this.hass.localize("ui.common.close")}
        </ha-button>
      </ha-dialog>
    `;
  }

  private _renderViewPicker(): TemplateResult {
    const options = this._config!.views.flatMap((view, index) =>
      isStrategyView(view)
        ? []
        : [
            {
              value: String(index),
              label: view.title ?? view.path ?? String(index + 1),
            },
          ]
    );
    return html`<ha-select
      .label=${this._t("view")}
      .value=${String(this._view)}
      .options=${options}
      @selected=${this._viewChanged}
    ></ha-select>`;
  }

  private _renderCardPicker(): TemplateResult {
    const cards = this._cards(this._config!);
    if (!cards.length) {
      return html`<p class="empty">${this._t("no_cards")}</p>`;
    }
    return html`<ha-select
      .label=${this._t("card")}
      .value=${this._key}
      .options=${cards.map((c) => ({
        value: c.key,
        label: `${c.viewTitle} › ${c.card.type}: ${c.label}`,
      }))}
      @selected=${this._cardChanged}
    ></ha-select>`;
  }

  private _renderTool(): TemplateResult {
    const hass = this.hass;
    const config = this._config!;
    const draft = this._draft;
    if (CARD_TOOLS.has(this._tool) && !draft) {
      return html`<p class="empty">${this._t("no_cards")}</p>`;
    }
    switch (this._tool) {
      case "layout":
        return html`<hui-dashboard-layout
          .hass=${hass}
          .config=${config}
          .view=${this._view}
          @dashboard-config-change=${this._configChange}
        ></hui-dashboard-layout>`;
      case "visibility":
        return html`<hui-dashboard-visibility
          .hass=${hass}
          .card=${draft}
          @dashboard-card-change=${this._cardChange}
        ></hui-dashboard-visibility>`;
      case "interactions":
        return html`<hui-dashboard-interactions
          .hass=${hass}
          .card=${draft}
          @dashboard-card-change=${this._cardChange}
        ></hui-dashboard-interactions>`;
      case "style":
        return html`<hui-dashboard-style
          .hass=${hass}
          .config=${config}
          .card=${draft}
          .view=${pathFromKey(this._key).view}
          .copied=${this._clip}
          @dashboard-card-change=${this._cardChange}
          @dashboard-config-change=${this._configChange}
          @dashboard-style-copied=${this._styleCopied}
        ></hui-dashboard-style>`;
      case "simulate":
        return html`<hui-dashboard-simulate
          .hass=${hass}
          .config=${config}
          .view=${this._view}
        ></hui-dashboard-simulate>`;
      default:
        return html`<hui-dashboard-screens
          .hass=${hass}
          .config=${config}
          .view=${this._view}
        ></hui-dashboard-screens>`;
    }
  }

  private _toolChanged(ev: CustomEvent<{ value?: string }>) {
    this._tool = (ev.detail.value as EditingTool) ?? "screens";
    this._notice = undefined;
    this._error = undefined;
  }

  private _viewChanged(ev: CustomEvent<{ value?: string }>) {
    this._view = Number(ev.detail.value ?? 0);
  }

  private _cardChanged(ev: CustomEvent<{ value?: string }>) {
    this._selectCard(ev.detail.value ?? "");
  }

  private _cardChange(ev: CustomEvent<{ card: LovelaceCardConfig }>) {
    ev.stopPropagation();
    this._draft = ev.detail.card;
    this._notice = undefined;
  }

  private _styleCopied(ev: CustomEvent<{ style: CopiedStyle }>) {
    ev.stopPropagation();
    this._clip = ev.detail.style;
  }

  private _configChange(ev: CustomEvent<{ config: LovelaceConfig }>) {
    ev.stopPropagation();
    this._apply(ev.detail.config);
  }

  private _save() {
    if (!this._config || !this._draft) {
      return;
    }
    this._apply(
      replaceCard(this._config, pathFromKey(this._key), this._draft),
      true
    );
  }

  private async _apply(next: LovelaceConfig, keepCard = false) {
    const lovelace = this._params?.lovelace();
    if (!lovelace) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    this._notice = undefined;
    try {
      await lovelace.saveConfig(next);
      this._config = this._params?.lovelace()?.config ?? next;
      this._selectCard(this._key);
      this._notice = this._t(keepCard ? "saved_card" : "saved");
    } catch (err: unknown) {
      this._error = this.hass.localize(
        "ui.panel.lovelace.editor.dashboard_tools.failed" as LocalizeKeys,
        { error: err instanceof Error ? err.message : String(err) }
      );
    } finally {
      this._busy = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-dialog {
          --ha-dialog-width-lg: 820px;
        }
        .picker {
          margin: var(--ha-space-3) 0;
        }
        .picker ha-select {
          width: 100%;
        }
        .empty {
          color: var(--secondary-text-color);
        }
        ha-alert {
          display: block;
          margin-top: var(--ha-space-3);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-dashboard-editing": HuiDialogDashboardEditing;
  }
}
