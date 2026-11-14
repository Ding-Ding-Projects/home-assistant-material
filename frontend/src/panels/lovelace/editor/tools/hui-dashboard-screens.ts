import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import type { HASSDomCurrentTargetEvent } from "../../../../common/dom/fire_event";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../../types";
import {
  capCardWidths,
  customScreen,
  rotateScreen,
  findWideCards,
  PHONE_GRID_COLUMNS,
  SCREENS,
  viewAddress,
} from "./dashboard-screens";

/**
 * Phone, tablet, wall panel and desktop side by side. Each screen is a frame
 * of this dashboard's own page at that width, so it shows the real saved view
 * with the real layout rules for that width. Frames load only on request
 * because each one starts the whole dashboard.
 */
@customElement("hui-dashboard-screens")
export class HuiDashboardScreens extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: LovelaceConfig;

  @property({ type: Number }) public view = 0;

  @state() private _shown = false;

  @state() private _nonce = 0;

  @state() private _previewing = false;

  @state() private _hiddenScreens: string[] = [];

  @state() private _rotatedScreens: string[] = [];

  @state() private _customWidth = "";

  @state() private _customHeight = "";

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.screens.${key}` as LocalizeKeys,
      values
    );
  }

  private _wideCards() {
    return findWideCards(this.config, this.view);
  }

  private _renderWideWarning() {
    const wide = this._wideCards();
    if (!wide.length) {
      return nothing;
    }
    return html`
      <ha-alert alert-type="warning">
        ${this._t("wide_warning", {
          count: wide.length,
          columns: PHONE_GRID_COLUMNS,
        })}
        <ha-button
          slot="action"
          size="s"
          @click=${this._togglePreview}
          .disabled=${this._previewing}
        >
          ${this._t("make_friendly")}
        </ha-button>
      </ha-alert>
      ${
        this._previewing
          ? html`<div class="preview" role="group">
              <h3>${this._t("preview_title")}</h3>
              <ul>
                ${wide.map(
                  (card) =>
                    html`<li>
                      <span class="name">${card.label}</span>
                      <span class="size"
                        >${this._t("preview_row", {
                          from: card.columns,
                          to: PHONE_GRID_COLUMNS,
                        })}</span
                      >
                    </li>`
                )}
              </ul>
              <p class="hint">${this._t("preview_note")}</p>
              <div class="actions">
                <ha-button @click=${this._applyFriendly}>
                  ${this._t("apply")}
                </ha-button>
                <ha-button appearance="plain" @click=${this._togglePreview}>
                  ${this._t("cancel")}
                </ha-button>
              </div>
            </div>`
          : nothing
      }
    `;
  }

  private _togglePreview() {
    this._previewing = !this._previewing;
  }

  private _applyFriendly() {
    this._previewing = false;
    fireEvent(this, "dashboard-config-change", {
      config: capCardWidths(this.config, this._wideCards()),
    });
  }

  protected render() {
    const view = this.config.views[this.view];
    const src = viewAddress(window.location.pathname, view?.path, this.view);
    const custom = customScreen(this._customWidth, this._customHeight);
    const screens = [...SCREENS, ...(custom ? [custom] : [])];
    return html`
      <p class="hint">${this._t("intro")}</p>
      ${this._renderWideWarning()}
      <div class="actions" role="group" aria-label=${this._t("devices")}>
        ${SCREENS.map(
          (screen) => html`
            <ha-button
              size="s"
              appearance=${this._hiddenScreens.includes(screen.id) ? "outlined" : "filled"}
              aria-pressed=${this._hiddenScreens.includes(screen.id) ? "false" : "true"}
              data-screen-id=${screen.id}
              @click=${this._toggleScreen}
              >${this._t(screen.id)}</ha-button
            >
          `
        )}
      </div>
      <div class="actions custom-size">
        <ha-input
          type="number"
          min="240"
          max="3840"
          step="1"
          .label=${this._t("custom_width")}
          .value=${this._customWidth}
          @input=${this._widthChanged}
        ></ha-input>
        <ha-input
          type="number"
          min="240"
          max="3840"
          step="1"
          .label=${this._t("custom_height")}
          .value=${this._customHeight}
          @input=${this._heightChanged}
        ></ha-input>
      </div>
      ${
        !custom && (this._customWidth || this._customHeight)
          ? html`<ha-alert alert-type="info"
              >${this._t("custom_invalid")}</ha-alert
            >`
          : nothing
      }

      <div class="actions">
        <ha-button @click=${this._toggle}>
          ${this._t(this._shown ? "hide" : "show")}
        </ha-button>
        ${
          this._shown
            ? html`<ha-button appearance="outlined" @click=${this._reload}>
                ${this._t("reload")}
              </ha-button>`
            : ""
        }
      </div>
      ${
        this._shown
          ? html`<div class="screens">
              ${screens
                .filter((screen) => !this._hiddenScreens.includes(screen.id))
                .map((preset) => {
                  const screen = this._rotatedScreens.includes(preset.id)
                    ? rotateScreen(preset)
                    : preset;
                  return html`<figure>
                    <div
                      class="frame"
                      style=${styleMap({
                        width: `${screen.width * screen.scale}px`,
                        height: `${screen.height * screen.scale}px`,
                      })}
                    >
                      <iframe
                        title=${this._t(screen.id)}
                        src=${`${src}?preview=${this._nonce}`}
                        loading="lazy"
                        style=${styleMap({
                          width: `${screen.width}px`,
                          height: `${screen.height}px`,
                          transform: `scale(${screen.scale})`,
                        })}
                      ></iframe>
                    </div>
                    <figcaption>
                      ${this._t(screen.id)}
                      <span class="size"
                        >${screen.width} × ${screen.height}</span
                      >
                      <ha-button
                        size="s"
                        appearance="plain"
                        aria-label=${this._t("rotate_device", { device: this._t(screen.id) })}
                        data-screen-id=${screen.id}
                        @click=${this._rotate}
                        >${this._t("rotate")}</ha-button
                      >
                    </figcaption>
                  </figure>`;
                })}
            </div>`
          : ""
      }
    `;
  }

  private _toggleScreen(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const id = ev.currentTarget.dataset.screenId;
    if (!id) return;
    this._hiddenScreens = this._hiddenScreens.includes(id)
      ? this._hiddenScreens.filter((item) => item !== id)
      : [...this._hiddenScreens, id];
  }

  private _rotate(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const id = ev.currentTarget.dataset.screenId;
    if (!id) return;
    this._rotatedScreens = this._rotatedScreens.includes(id)
      ? this._rotatedScreens.filter((item) => item !== id)
      : [...this._rotatedScreens, id];
  }

  private _widthChanged(ev: HASSDomCurrentTargetEvent<HaInput>) {
    this._customWidth = ev.currentTarget.value ?? "";
  }

  private _heightChanged(ev: HASSDomCurrentTargetEvent<HaInput>) {
    this._customHeight = ev.currentTarget.value ?? "";
  }

  private _toggle() {
    this._shown = !this._shown;
  }

  private _reload() {
    this._nonce += 1;
  }

  static styles = css`
    .hint {
      margin-top: 0;
      color: var(--secondary-text-color);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-3);
    }
    .custom-size ha-input {
      flex: 1 1 160px;
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    .preview {
      margin-bottom: var(--ha-space-4);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
    }
    .preview h3 {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-semibold);
    }
    .preview ul {
      list-style: none;
      margin: 0 0 var(--ha-space-2);
      padding: 0;
    }
    .preview li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-3);
      padding: var(--ha-space-1) 0;
    }
    .name {
      flex: 1 1 160px;
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    .screens {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--ha-space-5);
    }
    figure {
      margin: 0;
    }
    .frame {
      overflow: hidden;
      border: 4px solid var(--ha-color-outline, var(--divider-color));
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      box-sizing: content-box;
    }
    iframe {
      border: 0;
      transform-origin: top left;
      background: var(--primary-background-color);
    }
    :host-context([style*="direction: rtl"]) iframe {
      transform-origin: top right;
    }
    figcaption {
      margin-top: var(--ha-space-2);
      font-weight: var(--ha-font-weight-semibold);
    }
    .size {
      margin-inline-start: var(--ha-space-2);
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-normal);
      font-size: var(--ha-font-size-s);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-screens": HuiDashboardScreens;
  }
}
