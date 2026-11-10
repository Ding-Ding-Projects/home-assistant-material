import {
  mdiBellOutline,
  mdiCheckboxMultipleMarkedOutline,
  mdiClose,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { relativeTime } from "../../../common/datetime/relative_time";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-markdown";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { PersistentNotification } from "../../../data/persistent_notification";
import { subscribeNotifications } from "../../../data/persistent_notification";
import "../../../layouts/hass-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

/**
 * Notifications as a page: every notification the instance holds, with a
 * search, and dismissing one, the selected ones, or all of them.
 */
@customElement("ha-config-notifications")
class HaConfigNotifications extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _notifications?: PersistentNotification[];

  @state() private _filter = "";

  @state() private _selecting = false;

  @state() private _selected: string[] = [];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeNotifications(this.hass.connection, (notifications) => {
        this._notifications = [...notifications].sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
        );
        // A notification that is gone cannot stay selected.
        const ids = new Set(notifications.map((item) => item.notification_id));
        this._selected = this._selected.filter((id) => ids.has(id));
      }),
    ];
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.notifications.${key}` as any,
      values
    );
  }

  private _shown(): PersistentNotification[] {
    const matches = searchMatcher(this._filter);
    return (this._notifications ?? []).filter((item) =>
      matches(item.title ?? "", item.message, item.notification_id)
    );
  }

  protected render(): TemplateResult {
    const all = this._notifications ?? [];
    const shown = this._shown();
    const search = this._l("search");
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this.hass.localize("ui.notification_drawer.title")}
      >
        <div class="content">
          <div class="page-heading">
            <h1>${this.hass.localize("ui.notification_drawer.title")}</h1>
            <p>${this._l("summary", { count: all.length })}</p>
          </div>
          <div class="filters">
            <ha-input-search
              appearance="outlined"
              .placeholder=${search}
              .accessibleLabel=${search}
              .value=${this._filter}
              .patternSamples=${all.map(
                (item) => `${item.title ?? ""} ${item.message}`
              )}
              @input=${this._filterChanged}
            ></ha-input-search>
            <ha-button
              size="s"
              appearance=${this._selecting ? "accent" : "outlined"}
              ?disabled=${!all.length}
              @click=${this._toggleSelecting}
            >
              <ha-svg-icon
                slot="start"
                .path=${mdiCheckboxMultipleMarkedOutline}
              ></ha-svg-icon>
              ${this._l("select")}
            </ha-button>
            ${
              this._selecting
                ? html`<ha-button
                    size="s"
                    appearance="filled"
                    ?disabled=${!this._selected.length}
                    @click=${this._dismissSelected}
                  >
                    ${this._l("dismiss_selected", {
                      count: this._selected.length,
                    })}
                  </ha-button>`
                : html`<ha-button
                    size="s"
                    appearance="plain"
                    ?disabled=${!all.length}
                    @click=${this._dismissAll}
                  >
                    ${this.hass.localize("ui.notification_drawer.dismiss_all")}
                  </ha-button>`
            }
          </div>
          ${
            !this._notifications
              ? nothing
              : !shown.length
                ? html`<div class="empty" role="status">
                    <ha-svg-icon .path=${mdiBellOutline}></ha-svg-icon>
                    <p>
                      ${
                        all.length
                          ? this._l("no_match")
                          : this.hass.localize("ui.notification_drawer.empty")
                      }
                    </p>
                  </div>`
                : html`<ul>
                    ${shown.map((item) => {
                      const selected = this._selected.includes(
                        item.notification_id
                      );
                      return html`
                        <li class=${classMap({ selected })}>
                          ${
                            this._selecting
                              ? html`<input
                                  type="checkbox"
                                  .checked=${selected}
                                  aria-label=${item.title || item.notification_id}
                                  data-id=${item.notification_id}
                                  @change=${this._toggleSelected}
                                />`
                              : html`<span class="tile"
                                  ><ha-svg-icon
                                    .path=${mdiBellOutline}
                                  ></ha-svg-icon
                                ></span>`
                          }
                          <div class="text">
                            <strong
                              >${item.title || item.notification_id}</strong
                            >
                            <span class="time"
                              >${relativeTime(
                                new Date(item.created_at),
                                this.hass.locale
                              )}</span
                            >
                            <ha-markdown
                              breaks
                              .content=${item.message}
                            ></ha-markdown>
                          </div>
                          <ha-icon-button
                            .label=${this._l("dismiss", {
                              title: item.title || item.notification_id,
                            })}
                            .path=${mdiClose}
                            data-id=${item.notification_id}
                            @click=${this._dismiss}
                          ></ha-icon-button>
                        </li>
                      `;
                    })}
                  </ul>`
          }
          <p class="note">${this._l("note")}</p>
        </div>
      </hass-subpage>
    `;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _toggleSelecting(): void {
    this._selecting = !this._selecting;
    this._selected = [];
  }

  private _toggleSelected(ev: Event): void {
    const input = ev.currentTarget as HTMLInputElement;
    const id = input.dataset.id!;
    this._selected = input.checked
      ? [...this._selected, id]
      : this._selected.filter((item) => item !== id);
  }

  private _dismissOne(id: string): Promise<unknown> {
    return this.hass.callService("persistent_notification", "dismiss", {
      notification_id: id,
    });
  }

  private _dismiss(ev: Event): void {
    this._dismissOne((ev.currentTarget as HTMLElement).dataset.id!);
  }

  private async _dismissSelected(): Promise<void> {
    await Promise.all(this._selected.map((id) => this._dismissOne(id)));
    this._selected = [];
    this._selecting = false;
  }

  private _dismissAll(): void {
    this.hass.callService("persistent_notification", "dismiss_all");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          box-sizing: border-box;
          max-width: 980px;
          margin: 0 auto;
          padding: var(--ha-space-2) var(--ha-space-8) var(--ha-space-8);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        :host([narrow]) .content {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .page-heading h1 {
          margin: var(--ha-space-4) 0 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-4xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .page-heading p {
          margin: var(--ha-space-1) 0 0;
          font-size: var(--ha-font-size-l);
          color: var(--secondary-text-color);
        }
        .filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        ha-input-search {
          flex: 1 1 240px;
          --ha-input-search-height: var(--ha-space-12);
          --ha-input-search-border-radius: var(--ha-border-radius-pill);
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        li {
          display: flex;
          align-items: flex-start;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
        }
        li.selected {
          background: color-mix(
            in srgb,
            var(--primary-color) 20%,
            var(--primary-background-color)
          );
        }
        .tile {
          flex: none;
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
        }
        input[type="checkbox"] {
          flex: none;
          width: 20px;
          height: 20px;
          margin: 10px;
          accent-color: var(--primary-color);
        }
        .text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .time {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        ha-markdown {
          overflow-wrap: anywhere;
        }
        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-12) 0;
          color: var(--secondary-text-color);
          --mdc-icon-size: 40px;
        }
        .empty p,
        .note {
          margin: 0;
        }
        .note {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-notifications": HaConfigNotifications;
  }
}
