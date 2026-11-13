import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import "./hui-tool-a11y";
import "./hui-tool-diff";
import "./hui-tool-entities";
import "./hui-tool-library";
import "./hui-tool-perf";
import "./hui-tool-tablets";
import "./hui-tool-wall";
import type { MoreToolsDialogParams } from "./show-more-tools-dialog";

/** One dialog that hosts the entity inspector, accessibility checker, wall panel, card library, performance meter and checkpoint diff. */
@customElement("hui-dialog-more-tools")
export class HuiDialogMoreTools extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: MoreToolsDialogParams;

  @state() private _open = false;

  public showDialog(params: MoreToolsDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _t(key: string): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.more.${key}` as LocalizeKeys
    );
  }

  private _renderTool(params: MoreToolsDialogParams): TemplateResult {
    const common = { hass: this.hass, params };
    switch (params.tool) {
      case "a11y":
        return html`<hui-tool-a11y
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-a11y>`;
      case "wall":
        return html`<hui-tool-wall
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-wall>`;
      case "tablets":
        return html`<hui-tool-tablets
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-tablets>`;
      case "library":
        return html`<hui-tool-library
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-library>`;
      case "perf":
        return html`<hui-tool-perf
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-perf>`;
      case "diff":
        return html`<hui-tool-diff
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-diff>`;
      default:
        return html`<hui-tool-entities
          .hass=${common.hass}
          .params=${params}
          @close-tool=${this.closeDialog}
        ></hui-tool-entities>`;
    }
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        header-title=${this._t(`${this._params.tool}.title`)}
        header-subtitle=${this._t(`${this._params.tool}.subtitle`)}
        @closed=${this._dialogClosed}
      >
        ${this._renderTool(this._params)}
        <ha-button slot="footer" appearance="plain" @click=${this.closeDialog}>
          ${this.hass.localize("ui.common.close")}
        </ha-button>
      </ha-dialog>
    `;
  }

  static get styles(): CSSResultGroup {
    return [haStyleDialog, css``];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-more-tools": HuiDialogMoreTools;
  }
}
