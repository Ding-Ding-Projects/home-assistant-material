import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { getStorage } from "../../common/decorators/storage";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { DockEdge } from "../../common/tabs/tab-dock";
import {
  DOCK_EDGES,
  DOCK_STORAGE_KEY,
  isDockEdge,
  readDock,
  writeDock,
} from "../../common/tabs/tab-dock";
import "../../components/ha-select";
import type { HaSelectSelectEvent } from "../../components/ha-select";
import "../../components/item/ha-row-item";
import { MAIN_SURFACE } from "../../components/tabs/tab-strip-layout";
import type { HomeAssistant } from "../../types";

/**
 * @element ha-tab-dock-row
 *
 * @summary
 * The settings choice of the edge the strip of open pages is docked to. It
 * reads and writes the same stored value as the strip's own menu, so the two
 * always agree, and the strip moves as soon as the choice changes.
 */
@customElement("ha-tab-dock-row")
class HaTabDockRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _edge: DockEdge = readDock(MAIN_SURFACE);

  private _lang = new LanguageModeController(this);

  private _stop?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    const refresh = () => {
      this._edge = readDock(MAIN_SURFACE);
    };
    getStorage().subscribeChanges(DOCK_STORAGE_KEY, refresh);
    this._stop = () =>
      getStorage().unsubscribeChanges(DOCK_STORAGE_KEY, refresh);
    refresh();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stop?.();
    this._stop = undefined;
  }

  private _t(key: string): string {
    return this._lang.text(this.hass.localize, key);
  }

  protected render(): TemplateResult {
    const base = "ui.page_tabs.menu.";
    return html`
      <ha-row-item>
        <span slot="headline">${this._t(`${base}dock_setting_header`)}</span>
        <span slot="supporting-text"
          >${this._t(`${base}dock_setting_description`)}</span
        >
        <ha-select
          slot="end"
          .label=${this._t(`${base}dock_setting_header`)}
          .value=${this._edge}
          .options=${DOCK_EDGES.map((edge) => ({
            value: edge,
            label: this._t(`${base}dock_${edge}`),
          }))}
          @selected=${this._selected}
        ></ha-select>
      </ha-row-item>
    `;
  }

  private _selected(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    const value = String(ev.detail.value);
    if (isDockEdge(value) && value !== this._edge) {
      writeDock(MAIN_SURFACE, value);
    }
  }

  static styles: CSSResultGroup = css`
    ha-select {
      min-width: 200px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-dock-row": HaTabDockRow;
  }
}
