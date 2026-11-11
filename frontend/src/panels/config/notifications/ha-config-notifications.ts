import {
  mdiBellOutline,
  mdiCheckboxMultipleMarkedOutline,
  mdiClose,
  mdiHistory,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { relativeTime } from "../../../common/datetime/relative_time";
import { navigate } from "../../../common/navigate";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/bulk/ha-bulk-bar";
import type {
  BulkAction,
  BulkPreview,
} from "../../../components/bulk/bulk-selection";
import {
  invertSelection,
  pruneSelection,
  selectRange,
  toggleSelected,
} from "../../../components/bulk/bulk-selection";
import "../../../components/ha-button";
import "../../../components/ha-checkbox";
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
import { showToast } from "../../../util/toast";
import type { DismissedNotification } from "./dismissed-notifications";
import {
  DISMISSED_KEEP_DAYS,
  forgetDismissed,
  loadDismissed,
  rememberDismissed,
} from "./dismissed-notifications";
import { notificationActions } from "./notification-insight";

/** The most titles named in the preview of a bulk dismissal. */
const PREVIEW_TITLES = 3;

/**
 * Notifications as a page: every notification the instance holds, all drawn the
 * same way because the instance reports no severity, with the links of its message as buttons, a search,
 * and dismissing one, the selected ones, or all of them. A dismissed
 * notification is kept in this browser for 30 days and can be put back.
 */
@customElement("ha-config-notifications")
class HaConfigNotifications extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _notifications?: PersistentNotification[];

  @state() private _filter = "";

  @state() private _selecting = false;

  @state() private _selected: string[] = [];

  @state() private _showDismissed = false;

  @state() private _dismissed: DismissedNotification[] = [];

  @state() private _confirmClear = false;

  private _anchor?: string;

  private _shiftHeld = false;

  public connectedCallback(): void {
    super.connectedCallback();
    this._dismissed = loadDismissed();
  }

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeNotifications(this.hass.connection, (notifications) => {
        this._notifications = [...notifications].sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
        );
        // A notification that is gone cannot stay selected.
        this._selected = pruneSelection(
          this._selected,
          notifications.map((item) => item.notification_id)
        );
      }),
    ];
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.notifications.${key}` as any,
      values
    );
  }

  private _bulkLocalize = (
    key: string,
    values?: Record<string, string | number>
  ): string => this.hass.localize(key as any, values);

  private _shown(): PersistentNotification[] {
    const matches = searchMatcher(this._filter);
    return (this._notifications ?? []).filter((item) =>
      matches(item.title ?? "", item.message, item.notification_id)
    );
  }

  private _shownDismissed(): DismissedNotification[] {
    const matches = searchMatcher(this._filter);
    return this._dismissed.filter((item) =>
      matches(item.title ?? "", item.message, item.notification_id)
    );
  }

  private _bulkActions(): BulkAction[] {
    return [
      {
        id: "dismiss",
        label: this._l("bulk_dismiss"),
        path: mdiClose,
        destructive: true,
      },
    ];
  }

  private _bulkPreview = (id: string): BulkPreview | undefined => {
    if (id !== "dismiss") {
      return undefined;
    }
    const chosen = (this._notifications ?? []).filter((item) =>
      this._selected.includes(item.notification_id)
    );
    const names = chosen
      .slice(0, PREVIEW_TITLES)
      .map((item) => item.title || item.notification_id);
    const rest = chosen.length - names.length;
    return {
      title: this._l("bulk_preview_title", { count: chosen.length }),
      items: [
        {
          kind: "change",
          text: `${this._l("bulk_preview_dismiss", { count: chosen.length })}: ${names.join(", ")}${rest > 0 ? "…" : ""}`,
        },
      ],
      changeCount: chosen.length,
      confirmLabel: this._l("bulk_dismiss"),
      note: this._l("bulk_preview_note", { days: DISMISSED_KEEP_DAYS }),
    };
  };

  protected render(): TemplateResult {
    const all = this._notifications ?? [];
    const shown = this._shown();
    const search = this._l("search");
    const dismissedShown = this._shownDismissed();
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
              .patternSamples=${(this._showDismissed
                ? this._dismissed
                : all
              ).map((item) => `${item.title ?? ""} ${item.message}`)}
              @input=${this._filterChanged}
            ></ha-input-search>
            ${
              this._showDismissed
                ? html`<ha-button
                    size="s"
                    appearance="outlined"
                    @click=${this._toggleDismissed}
                  >
                    ${this._l("hide_dismissed")}
                  </ha-button>`
                : html`
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
                    <ha-button
                      size="s"
                      appearance="plain"
                      ?disabled=${!all.length}
                      @click=${this._dismissAll}
                    >
                      ${this.hass.localize("ui.notification_drawer.dismiss_all")}
                    </ha-button>
                    <ha-button
                      size="s"
                      appearance="plain"
                      @click=${this._toggleDismissed}
                    >
                      <ha-svg-icon
                        slot="start"
                        .path=${mdiHistory}
                      ></ha-svg-icon>
                      ${this._l("show_dismissed", {
                        count: this._dismissed.length,
                      })}
                    </ha-button>
                  `
            }
          </div>
          ${
            this._showDismissed
              ? this._renderDismissed(dismissedShown)
              : html`
                  ${
                    this._selecting
                      ? html`<ha-bulk-bar
                          .localize=${this._bulkLocalize}
                          .count=${this._selected.length}
                          .pageCount=${shown.length}
                          .matchCount=${shown.length}
                          .actions=${this._bulkActions()}
                          .getPreview=${this._bulkPreview}
                          @bulk-select-page=${this._selectAllShown}
                          @bulk-select-matches=${this._selectAllShown}
                          @bulk-invert=${this._invertShown}
                          @bulk-clear=${this._clearSelection}
                          @bulk-confirm=${this._dismissSelected}
                        ></ha-bulk-bar>`
                      : nothing
                  }
                  ${this._renderList(all, shown)}
                `
          }
          <p class="note">${this._l("note", { days: DISMISSED_KEEP_DAYS })}</p>
        </div>
      </hass-subpage>
    `;
  }

  private _renderList(
    all: PersistentNotification[],
    shown: PersistentNotification[]
  ) {
    if (!this._notifications) {
      return nothing;
    }
    if (!shown.length) {
      return html`<div class="empty" role="status">
        <ha-svg-icon .path=${mdiBellOutline}></ha-svg-icon>
        <p>
          ${
            all.length
              ? this._l("no_match")
              : this.hass.localize("ui.notification_drawer.empty")
          }
        </p>
      </div>`;
    }
    return html`<ul>
      ${shown.map((item) => this._renderRow(item))}
    </ul>`;
  }

  private _renderRow(item: PersistentNotification) {
    const selected = this._selected.includes(item.notification_id);
    const actions = notificationActions(item.message);
    const title = item.title || item.notification_id;
    return html`
      <li class=${classMap({ selected })}>
        ${
          this._selecting
            ? html`<ha-checkbox
                class="pick"
                .checked=${selected}
                aria-label=${title}
                data-id=${item.notification_id}
                @pointerdown=${this._rememberShift}
                @keydown=${this._rememberShift}
                @change=${this._toggleSelected}
              ></ha-checkbox>`
            : html`<span class="tile"
                ><ha-svg-icon .path=${mdiBellOutline}></ha-svg-icon
              ></span>`
        }
        <div class="text">
          <strong>${title}</strong>
          <span class="time"
            >${relativeTime(new Date(item.created_at), this.hass.locale)}</span
          >
          <ha-markdown breaks .content=${item.message}></ha-markdown>
        </div>
        ${actions.map(
          (action) => html`
            <ha-button
              size="s"
              appearance="filled"
              data-href=${action.href}
              @click=${this._openAction}
            >
              ${action.label}${action.host ? ` (${action.host})` : ""}
            </ha-button>
          `
        )}
        <ha-icon-button
          .label=${this._l("dismiss", { title })}
          .path=${mdiClose}
          data-id=${item.notification_id}
          @click=${this._dismiss}
        ></ha-icon-button>
      </li>
    `;
  }

  private _renderDismissed(shown: DismissedNotification[]) {
    return html`
      <div class="dismissed-head">
        <h2>${this._l("dismissed_title", { days: DISMISSED_KEEP_DAYS })}</h2>
        ${
          this._confirmClear
            ? html`<span class="confirm" role="alert">
                ${this._l("clear_dismissed_confirm", {
                  count: this._dismissed.length,
                })}
                <ha-button
                  size="s"
                  appearance="filled"
                  @click=${this._clearDismissed}
                >
                  ${this._l("clear_dismissed_yes")}
                </ha-button>
                <ha-button
                  size="s"
                  appearance="plain"
                  @click=${this._cancelClear}
                >
                  ${this._l("clear_dismissed_no")}
                </ha-button>
              </span>`
            : html`<ha-button
                size="s"
                appearance="plain"
                ?disabled=${!this._dismissed.length}
                @click=${this._askClear}
              >
                ${this._l("clear_dismissed")}
              </ha-button>`
        }
      </div>
      ${
        shown.length
          ? html`<ul>
              ${shown.map((item) => {
                const title = item.title || item.notification_id;
                return html`
                  <li>
                    <span class="tile"
                      ><ha-svg-icon .path=${mdiBellOutline}></ha-svg-icon
                    ></span>
                    <div class="text">
                      <strong>${title}</strong>
                      <span class="time"
                        >${this._l("dismissed_at", {
                          time: relativeTime(
                            new Date(item.dismissed_at),
                            this.hass.locale
                          ),
                        })}</span
                      >
                      <ha-markdown
                        breaks
                        .content=${item.message}
                      ></ha-markdown>
                    </div>
                    <ha-icon-button
                      .label=${this._l("forget", { title })}
                      .path=${mdiClose}
                      data-id=${item.notification_id}
                      @click=${this._forget}
                    ></ha-icon-button>
                  </li>
                `;
              })}
            </ul>`
          : html`<div class="empty" role="status">
              <ha-svg-icon .path=${mdiHistory}></ha-svg-icon>
              <p>
                ${
                  this._dismissed.length
                    ? this._l("no_match")
                    : this._l("dismissed_empty", { days: DISMISSED_KEEP_DAYS })
                }
              </p>
            </div>`
      }
    `;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
    // A notification the search hides cannot stay selected, so the count,
    // the preview and the action always speak about the same rows.
    this._selected = pruneSelection(
      this._selected,
      this._shown().map((item) => item.notification_id)
    );
  }

  private _toggleSelecting(): void {
    this._selecting = !this._selecting;
    this._selected = [];
    this._anchor = undefined;
  }

  private _toggleDismissed(): void {
    this._showDismissed = !this._showDismissed;
    this._confirmClear = false;
    this._dismissed = loadDismissed();
  }

  /**
   * The checkbox reports a change, not the pointer, so whether Shift was held
   * is noted from the press or key that caused it.
   */
  private _rememberShift(ev: PointerEvent | KeyboardEvent): void {
    this._shiftHeld = ev.shiftKey;
  }

  private _toggleSelected(ev: Event): void {
    const box = ev.currentTarget as HTMLElement & { checked: boolean };
    const id = box.dataset.id!;
    const ordered = this._shown().map((item) => item.notification_id);
    const shift = this._shiftHeld;
    this._shiftHeld = false;
    const isSelected = this._selected.includes(id);
    if (shift && box.checked) {
      this._selected = selectRange(ordered, this._selected, this._anchor, id);
    } else if (box.checked !== isSelected) {
      this._selected = toggleSelected(this._selected, id);
    }
    this._anchor = id;
  }

  private _selectAllShown(): void {
    this._selected = this._shown().map((item) => item.notification_id);
  }

  private _invertShown(): void {
    this._selected = invertSelection(
      this._shown().map((item) => item.notification_id),
      this._selected
    );
  }

  private _clearSelection(): void {
    this._selected = [];
    this._anchor = undefined;
  }

  private _openAction(ev: Event): void {
    const href = (ev.currentTarget as HTMLElement).dataset.href!;
    if (href.startsWith("/")) {
      navigate(href);
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  private _dismiss(ev: Event): void {
    this._dismissMany([(ev.currentTarget as HTMLElement).dataset.id!]);
  }

  private async _dismissSelected(): Promise<void> {
    const failed = await this._dismissMany(this._selected);
    // Only a notification that could not be dismissed stays selected.
    this._selected = pruneSelection(this._selected, failed);
    if (!failed.length) {
      this._selecting = false;
    }
  }

  private _dismissAll(): void {
    this._dismissMany(
      (this._notifications ?? []).map((n) => n.notification_id)
    );
  }

  /**
   * Dismisses the notifications, keeps the ones that were dismissed in the
   * dismissed list and offers Undo. Returns the ids that could not be
   * dismissed; those stay active and are not put in the dismissed list.
   */
  private async _dismissMany(ids: string[]): Promise<string[]> {
    const chosen = (this._notifications ?? []).filter((item) =>
      ids.includes(item.notification_id)
    );
    if (!chosen.length) {
      return [];
    }
    const results = await Promise.allSettled(
      chosen.map((item) =>
        this.hass.callService("persistent_notification", "dismiss", {
          notification_id: item.notification_id,
        })
      )
    );
    const done = chosen.filter(
      (_item, index) => results[index].status === "fulfilled"
    );
    const failed = chosen.filter(
      (_item, index) => results[index].status === "rejected"
    );
    if (done.length) {
      this._dismissed = rememberDismissed(done);
      showToast(this, {
        message: this._l("dismissed_toast", { count: done.length }),
        duration: 6000,
        action: {
          text: this._l("undo"),
          action: () => this._restore(done),
        },
      });
    }
    if (failed.length) {
      showToast(this, {
        message: this._l("dismiss_failed", { count: failed.length }),
        severity: "error",
      });
    }
    return failed.map((item) => item.notification_id);
  }

  private async _restore(chosen: PersistentNotification[]): Promise<void> {
    const results = await Promise.allSettled(
      chosen.map((item) =>
        this.hass.callService("persistent_notification", "create", {
          notification_id: item.notification_id,
          message: item.message,
          ...(item.title ? { title: item.title } : {}),
        })
      )
    );
    // Only a notification that came back leaves the dismissed list.
    const restored = chosen.filter(
      (_item, index) => results[index].status === "fulfilled"
    );
    restored.forEach((item) => {
      this._dismissed = forgetDismissed(item.notification_id);
    });
    if (restored.length < chosen.length) {
      showToast(this, {
        message: this._l("restore_failed"),
        severity: "error",
      });
    }
  }

  private _forget(ev: Event): void {
    this._dismissed = forgetDismissed(
      (ev.currentTarget as HTMLElement).dataset.id!
    );
  }

  private _askClear(): void {
    this._confirmClear = true;
  }

  private _cancelClear(): void {
    this._confirmClear = false;
  }

  private _clearDismissed(): void {
    this._dismissed = forgetDismissed();
    this._confirmClear = false;
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
          flex-wrap: wrap;
          align-items: center;
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
          color: var(--primary-text-color);
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
        .pick {
          flex: none;
          margin: 0;
          min-width: 44px;
          min-height: 44px;
          --ha-checkbox-min-touch-size: 44px;
        }
        .pick::part(base) {
          justify-content: center;
          width: 100%;
          min-height: 44px;
        }
        .text {
          flex: 1 1 200px;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .time {
          font-size: var(--ha-font-size-s);
          opacity: 0.8;
        }
        ha-markdown {
          overflow-wrap: anywhere;
        }
        .dismissed-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
        .dismissed-head h2 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }
        .confirm {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          color: var(--error-color);
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
