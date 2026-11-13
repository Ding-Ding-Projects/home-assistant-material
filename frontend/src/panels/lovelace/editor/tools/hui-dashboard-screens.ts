import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../../types";
import { SCREENS, viewAddress } from "./dashboard-screens";

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

  private _t(key: string): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.screens.${key}` as LocalizeKeys
    );
  }

  protected render() {
    const view = this.config.views[this.view];
    const src = viewAddress(window.location.pathname, view?.path, this.view);
    return html`
      <p class="hint">${this._t("intro")}</p>
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
              ${SCREENS.map(
                (screen) =>
                  html`<figure>
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
                    </figcaption>
                  </figure>`
              )}
            </div>`
          : ""
      }
    `;
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
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-3);
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
