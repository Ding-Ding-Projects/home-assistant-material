import {
  mdiAlertCircle,
  mdiCancel,
  mdiCheckCircle,
  mdiInformationOutline,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { trackActivityAnnouncements } from "../../common/activity/activity-announcer";
import type { Activity } from "../../common/activity/activity-store";
import {
  activityPercent,
  activityStore,
  sanitizeProgress,
} from "../../common/activity/activity-store";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { navigate } from "../../common/navigate";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../ha-button";
import "../ha-svg-icon";
import type { UpdateTrayRow } from "../update-progress/update-install-tracker";
import {
  deriveUpdateTrayRows,
  updateInstallTracker,
} from "../update-progress/update-install-tracker";
import "./ha-recovery-card";

declare global {
  interface HTMLElementTagNameMap {
    "ha-activity-tray": HaActivityTray;
  }
}

/** Lists what is running and what finished recently. */
@customElement("ha-activity-tray")
export class HaActivityTray extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _items: readonly Activity[] = [];

  @query("h2") private _heading?: HTMLElement;

  @queryAll("li.item") private _entries!: NodeListOf<HTMLElement>;

  private _lang = new LanguageModeController(this);

  @state() private _updateRows: readonly UpdateTrayRow[] = [];

  private _unsub?: () => void;

  private _unsubUpdates?: () => void;

  private _expiryTimer?: ReturnType<typeof setTimeout>;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsub = activityStore.subscribe((items) => {
      this._items = items;
    });
    this._unsubUpdates = updateInstallTracker.subscribe(() =>
      this._syncUpdates()
    );
    this._syncUpdates();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    this._unsubUpdates?.();
    this._unsubUpdates = undefined;
    clearTimeout(this._expiryTimer);
    this._expiryTimer = undefined;
  }

  // Reads the update installs the tracker follows and schedules the moment the
  // first finished row has to leave, so the tray empties by itself.
  private _syncUpdates(): void {
    clearTimeout(this._expiryTimer);
    const now = Date.now();
    this._updateRows = deriveUpdateTrayRows(updateInstallTracker.list(), now);
    const next = Math.min(
      ...this._updateRows.map((row) => row.expiresAt ?? Infinity)
    );
    if (Number.isFinite(next)) {
      this._expiryTimer = setTimeout(
        () => this._syncUpdates(),
        Math.max(next - now, 0) + 50
      );
    }
  }

  // The tracker has an activity entry of its own for each install. The row
  // below replaces it, so it is left out of the plain list.
  private _plainItems(): Activity[] {
    const covered = new Set(
      updateInstallTracker.list().map((run) => run.activityId)
    );
    return this._items.filter((item) => !covered.has(item.id));
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    if (changedProps.has("hass") && this.hass) {
      // Keep the live region speaking the current language.
      trackActivityAnnouncements(this.hass.localize);
    }
  }

  // A pressed button can leave the page with its entry. Focus then goes to
  // the entry that took its place, or to the heading, never to the page top.
  private async _keepFocus(index: number): Promise<void> {
    await this.updateComplete;
    if (this.shadowRoot?.activeElement) {
      return;
    }
    const entries = this._entries;
    const entry = entries.length
      ? entries[Math.min(index, entries.length - 1)]
      : undefined;
    const target =
      (entry?.querySelector("ha-button") as HTMLElement | null) ??
      this._heading;
    target?.focus();
  }

  private _indexOf(ev: Event): number {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    return this._items.findIndex((item) => item.id === id);
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize as any,
      `ui.activity.${key}`,
      values
    );
  }

  protected render(): TemplateResult | typeof nothing {
    const plain = this._plainItems();
    const rows = this._updateRows;
    if (!plain.length && !rows.length) {
      return nothing;
    }
    const running =
      plain.filter((item) => item.state === "running").length +
      rows.filter((row) => row.state === "running").length;
    const hasFinished =
      plain.some((item) => item.state !== "running") ||
      rows.some((row) => row.state !== "running");
    return html`<section aria-label=${this._l("title")}>
      <div class="head">
        <h2 tabindex="-1">
          ${this._l("title")}
          ${running ? html`<span class="count">${this._l("running_count", { count: running })}</span>` : nothing}
        </h2>
        ${
          hasFinished
            ? html`<ha-button appearance="plain" @click=${this._clearFinished}
                >${this._l("dismiss_finished")}</ha-button
              >`
            : nothing
        }
      </div>
      <ul>
        ${rows.map((row) => this._renderUpdateRow(row))}
        ${plain.map((item) => this._renderItem(item))}
      </ul>
    </section>`;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize as any, key, values);
  }

  private _renderBar(
    percent: number | undefined,
    label: string
  ): TemplateResult {
    return html`<div
      class=${classMap({ bar: true, unknown: percent === undefined })}
      role="progressbar"
      aria-label=${label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${percent ?? nothing}
      aria-valuetext=${
        percent === undefined
          ? this._l("working")
          : this._l("percent", { percent })
      }
    >
      <span
        class="fill"
        style=${styleMap({
          width: percent === undefined ? "" : `${percent}%`,
        })}
      ></span>
    </div>`;
  }

  // One update install, from the tracker. Selecting the row shows the update
  // dialog of that entity again.
  private _renderUpdateRow(row: UpdateTrayRow): TemplateResult {
    const name = this._t("ui.update_progress.activity_title", {
      name: row.title,
    });
    const stage = this._t(`ui.update_progress.stage.${row.stage}`);
    return html`<li
      class=${classMap({ item: true, update: true, [row.state]: true })}
    >
      <div class="title">
        ${
          row.state === "done"
            ? html`<ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon>`
            : row.state === "failed"
              ? html`<ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>`
              : nothing
        }
        <span class="name">${name}</span>
      </div>
      ${
        row.state === "running"
          ? html`${this._renderBar(
                row.percent,
                this._t("ui.update_progress.progress_label", {
                  name: row.title,
                })
              )}
              <p class="detail">${stage}</p>
              ${
                row.slow
                  ? html`<p class="detail">
                      ${this._t("ui.update_progress.slow_start")}
                    </p>`
                  : nothing
              }`
          : html`<p class="detail">
              ${
                row.state === "failed"
                  ? this._t("ui.update_progress.failed_message")
                  : stage
              }
            </p>`
      }
      ${
        row.state === "failed"
          ? html`<ha-recovery-card
              .hass=${this.hass}
              .heading=${this._t("ui.update_progress.failed_heading", {
                name: row.title,
              })}
              .message=${this._t("ui.update_progress.failed_message")}
              .details=${row.details ?? ""}
              .canRetry=${row.canRetry}
              data-entity-id=${row.entityId}
              @recovery-retry=${this._retryUpdate}
            ></ha-recovery-card>`
          : nothing
      }
      <div class="actions">
        <ha-button
          appearance="plain"
          data-entity-id=${row.entityId}
          aria-label=${this._l("update_row.show_label", { title: row.title })}
          @click=${this._showUpdate}
          >${this._l("update_row.show")}</ha-button
        >
        ${
          row.state !== "running"
            ? html`<ha-button
                appearance="plain"
                data-entity-id=${row.entityId}
                @click=${this._dismissUpdate}
                >${this._l("dismiss")}</ha-button
              >`
            : nothing
        }
      </div>
    </li>`;
  }

  private _showUpdate(ev: Event): void {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  private _retryUpdate(ev: Event): void {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) {
      void updateInstallTracker.retry(entityId);
    }
  }

  private _dismissUpdate(ev: Event): void {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) {
      updateInstallTracker.dismiss(entityId);
      void this._keepFocus(0);
    }
  }

  private _renderItem(item: Activity): TemplateResult {
    const percent = activityPercent(item);
    const progress = sanitizeProgress(item.progress);
    return html`<li class=${classMap({ item: true, [item.state]: true })}>
      <div class="title">
        ${
          item.state === "done"
            ? html`<ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon>`
            : item.state === "failed"
              ? html`<ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>`
              : item.state === "cancelled"
                ? html`<ha-svg-icon .path=${mdiCancel}></ha-svg-icon>`
                : item.state === "ended"
                  ? html`<ha-svg-icon
                      .path=${mdiInformationOutline}
                    ></ha-svg-icon>`
                  : nothing
        }
        <span class="name">${item.title}</span>
      </div>
      ${
        item.state === "running"
          ? html`<div
                class=${classMap({ bar: true, unknown: percent === undefined })}
                role="progressbar"
                aria-label=${this._l("progress_label", { title: item.title })}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow=${percent ?? nothing}
                aria-valuetext=${
                  percent === undefined
                    ? this._l("working")
                    : this._l("percent", { percent })
                }
              >
                <span
                  class="fill"
                  style=${styleMap({
                    width: percent === undefined ? "" : `${percent}%`,
                  })}
                ></span>
              </div>
              <p class="detail">
                ${item.status ?? (progress ? "" : this._l("working"))}
              </p>`
          : html`<p class="detail">
              ${item.message ?? this._l(`state.${item.state}`)}
            </p>`
      }
      ${
        item.state === "failed" && !item.compact
          ? html`<ha-recovery-card
              .hass=${this.hass}
              .heading=${this._l("failed_heading", { title: item.title })}
              .message=${item.message ?? ""}
              .details=${item.details ?? ""}
              .canRetry=${!!item.retry}
              .undoLabel=${item.undo?.label ?? ""}
              data-id=${item.id}
              @recovery-retry=${this._retryItem}
              @recovery-undo=${this._undoItem}
            ></ha-recovery-card>`
          : nothing
      }
      <div class="actions">
        ${
          item.state === "running" && item.cancel
            ? html`<ha-button
                appearance="plain"
                variant="danger"
                data-id=${item.id}
                @click=${this._cancelItem}
                >${this._l("cancel")}</ha-button
              >`
            : nothing
        }
        ${
          item.openPath
            ? html`<ha-button
                appearance="plain"
                data-id=${item.id}
                @click=${this._openItem}
                >${this._l("open")}</ha-button
              >`
            : nothing
        }
        ${
          item.state === "done" && item.undo
            ? html`<ha-button
                appearance="plain"
                data-id=${item.id}
                @click=${this._undoItem}
                >${item.undo.label}</ha-button
              >`
            : nothing
        }
        ${
          item.state !== "running"
            ? html`<ha-button
                appearance="plain"
                data-id=${item.id}
                @click=${this._dismissItem}
                >${this._l("dismiss")}</ha-button
              >`
            : nothing
        }
      </div>
    </li>`;
  }

  private _itemOf(ev: Event): Activity | undefined {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    return id ? activityStore.get(id) : undefined;
  }

  private async _call(
    action: (() => void | Promise<void>) | undefined,
    index: number
  ): Promise<void> {
    if (action) {
      await Promise.resolve(action()).catch(() => undefined);
    }
    await this._keepFocus(index);
  }

  private _cancelItem(ev: Event): void {
    void this._call(this._itemOf(ev)?.cancel, this._indexOf(ev));
  }

  private _retryItem(ev: Event): void {
    void this._call(this._itemOf(ev)?.retry, this._indexOf(ev));
  }

  private _undoItem(ev: Event): void {
    void this._call(this._itemOf(ev)?.undo?.run, this._indexOf(ev));
  }

  private _dismissItem(ev: Event): void {
    const item = this._itemOf(ev);
    const index = this._indexOf(ev);
    if (item) {
      activityStore.dismiss(item.id);
      void this._keepFocus(index);
    }
  }

  private _openItem(ev: Event): void {
    const item = this._itemOf(ev);
    if (item?.openPath) {
      navigate(item.openPath);
    }
  }

  private _clearFinished(): void {
    activityStore.dismissFinished();
    this._updateRows
      .filter((row) => row.state !== "running")
      .forEach((row) => updateInstallTracker.dismiss(row.entityId));
    void this._keepFocus(0);
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      section {
        padding: var(--ha-space-4) var(--ha-space-4) 0;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
        font-size: var(--ha-font-size-l);
      }
      .count {
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-normal);
        color: var(--secondary-text-color);
        margin-inline-start: var(--ha-space-2);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .item {
        padding: var(--ha-space-3) 0;
        border-top: 1px solid var(--divider-color);
      }
      .title {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .name {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .done ha-svg-icon {
        color: var(--success-color);
      }
      .failed ha-svg-icon {
        color: var(--error-color);
      }
      .detail {
        margin: var(--ha-space-1) 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .bar {
        position: relative;
        height: 8px;
        margin-top: var(--ha-space-2);
        border-radius: 4px;
        background: var(--secondary-background-color);
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        background: var(--primary-color);
        transition: width 0.25s linear;
      }
      .bar.unknown .fill {
        width: 40%;
        animation: slide 1.4s ease-in-out infinite;
      }
      @keyframes slide {
        from {
          margin-inline-start: -40%;
        }
        to {
          margin-inline-start: 100%;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .fill {
          transition: none;
        }
        .bar.unknown .fill {
          animation: none;
          width: 100%;
          opacity: 0.4;
        }
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .actions ha-button {
        --ha-button-height: 44px;
      }
      ha-recovery-card {
        margin-top: var(--ha-space-2);
      }
    `,
  ];
}
