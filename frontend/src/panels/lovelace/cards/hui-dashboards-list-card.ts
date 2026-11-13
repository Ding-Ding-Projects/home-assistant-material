import { mdiGestureSwipeHorizontal, mdiViewDashboardOutline } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { storage } from "../../../common/decorators/storage";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-icon";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { ListedDashboard } from "../../../data/dashboard-list";
import { listDashboards } from "../../../data/dashboard-list";
import {
  fetchConfig,
  isStrategyDashboard,
} from "../../../data/lovelace/config/types";
import { getDefaultPanelUrlPath } from "../../../data/panel";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";

export interface DashboardsListCardConfig extends LovelaceCardConfig {
  /** An optional heading above the list. */
  title?: string;
}

/** How many views each dashboard has; null when it cannot be told (a strategy, or not readable). */
const viewCounts = new Map<string, number | null>();

/**
 * Lists every dashboard the person can open, by itself: a dashboard that is
 * added later shows up here without anyone editing the card. Each tile opens
 * its dashboard. On a phone the page can also be swiped between dashboards;
 * the switch here turns that off for this browser.
 */
@customElement("hui-dashboards-list-card")
export class HuiDashboardsListCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: DashboardsListCardConfig;

  @state() private _counts: Record<string, number | null> = {};

  @storage({ key: "dashboardSwipe", state: true, subscribe: true })
  private _swipeEnabled?: boolean;

  private _requested = new Set<string>();

  public static getStubConfig(): DashboardsListCardConfig {
    return { type: "dashboards-list" };
  }

  public setConfig(config: DashboardsListCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: "auto" };
  }

  private _dashboards = memoizeOne(
    (
      panels: HomeAssistant["panels"],
      conditions: unknown,
      language: string
    ): ListedDashboard[] => {
      void panels;
      void conditions;
      void language;
      return listDashboards(
        this.hass!,
        getDefaultPanelUrlPath(this.hass!),
        undefined
      );
    }
  );

  protected updated(changedProps: PropertyValues<this>): void {
    if (changedProps.has("hass") && this.hass) {
      this._loadCounts();
    }
  }

  private _loadCounts(): void {
    const hass = this.hass;
    if (!hass) {
      return;
    }
    this._list().forEach(({ urlPath }) => {
      if (viewCounts.has(urlPath)) {
        if (this._counts[urlPath] === undefined) {
          this._counts = {
            ...this._counts,
            [urlPath]: viewCounts.get(urlPath)!,
          };
        }
        return;
      }
      if (this._requested.has(urlPath)) {
        return;
      }
      this._requested.add(urlPath);
      fetchConfig(
        hass.connection,
        urlPath === "lovelace" ? null : urlPath,
        false
      )
        .then((config) =>
          isStrategyDashboard(config) ? null : (config.views?.length ?? 0)
        )
        .catch(() => null)
        .then((count) => {
          viewCounts.set(urlPath, count);
          this._counts = { ...this._counts, [urlPath]: count };
        });
    });
  }

  private _list(): ListedDashboard[] {
    return this._dashboards(
      this.hass!.panels,
      this.hass!.systemData?.dashboard_visibility,
      this.hass!.language
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const localize = this.hass.localize;
    const dashboards = this._list();
    return html`
      ${
        this._config.title
          ? html`<h2 class="title">${this._config.title}</h2>`
          : nothing
      }
      ${
        dashboards.length
          ? html`<ul class="tiles">
              ${dashboards.map((dashboard) => this._renderTile(dashboard))}
            </ul>`
          : html`<p class="hint">
              ${localize("ui.panel.lovelace.cards.dashboards_list.empty")}
            </p>`
      }
      <div class="note">
        <ha-svg-icon .path=${mdiGestureSwipeHorizontal}></ha-svg-icon>
        <span class="note-text">
          ${localize("ui.panel.lovelace.cards.dashboards_list.note")}
          <span class="phone-only">
            ${localize("ui.panel.lovelace.cards.dashboards_list.swipe_note")}
          </span>
        </span>
        <label class="phone-only swipe-switch">
          <span>
            ${localize("ui.panel.lovelace.cards.dashboards_list.swipe_label")}
          </span>
          <ha-switch
            .checked=${this._swipeEnabled !== false}
            @change=${this._swipeChanged}
          ></ha-switch>
        </label>
      </div>
    `;
  }

  private _renderTile(dashboard: ListedDashboard) {
    const localize = this.hass!.localize;
    const count = this._counts[dashboard.urlPath];
    return html`<li>
      <a
        class="tile"
        href=${`/${dashboard.urlPath}`}
        @click=${this._open}
        .urlPath=${dashboard.urlPath}
      >
        <span class="icon-area" aria-hidden="true">
          ${
            dashboard.icon
              ? html`<ha-icon .icon=${dashboard.icon}></ha-icon>`
              : html`<ha-svg-icon
                  .path=${mdiViewDashboardOutline}
                ></ha-svg-icon>`
          }
        </span>
        <span class="name">${dashboard.title}</span>
        <span class="views">
          ${
            typeof count === "number"
              ? localize("ui.panel.lovelace.cards.dashboards_list.views", {
                  count,
                })
              : ""
          }
        </span>
      </a>
    </li>`;
  }

  private _open(ev: MouseEvent): void {
    // Let the browser handle a click that wants a new tab or window.
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) {
      return;
    }
    ev.preventDefault();
    navigate(
      `/${(ev.currentTarget as HTMLAnchorElement & { urlPath: string }).urlPath}`
    );
  }

  private _swipeChanged(ev: Event): void {
    this._swipeEnabled = (ev.target as HTMLInputElement).checked;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .title {
      margin: 0 0 var(--ha-space-3);
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-title, 600);
    }
    .tiles {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--ha-space-3);
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      height: 100%;
      box-sizing: border-box;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      box-shadow: var(--ha-shadow-card, none);
      color: var(--primary-text-color);
      text-decoration: none;
      outline: none;
    }
    .tile:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .icon-area {
      display: grid;
      place-items: center;
      height: 72px;
      margin-bottom: var(--ha-space-2);
      border-radius: var(--ha-border-radius-lg);
      background: linear-gradient(
        135deg,
        var(--ha-color-primary-container),
        var(--ha-color-tertiary-container, var(--ha-color-primary-container))
      );
      color: var(--ha-color-on-primary-container, var(--primary-color));
      --mdc-icon-size: 32px;
    }
    .name {
      font-weight: var(--ha-font-weight-semibold, 500);
      overflow-wrap: anywhere;
    }
    .views,
    .hint {
      min-height: 1.2em;
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .note {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ha-space-3);
      margin-top: var(--ha-space-3);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-primary-container);
      color: var(--ha-color-on-primary-container);
      font-size: var(--ha-font-size-s);
    }
    .note-text {
      flex: 1;
      min-width: 160px;
    }
    .swipe-switch {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .phone-only {
      display: none;
    }
    @media (max-width: 600px) {
      .phone-only {
        display: inline;
      }
      .swipe-switch.phone-only {
        display: flex;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboards-list-card": HuiDashboardsListCard;
  }
}
