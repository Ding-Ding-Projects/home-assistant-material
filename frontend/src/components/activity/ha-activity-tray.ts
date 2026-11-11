import { mdiAlertCircle, mdiCancel, mdiCheckCircle } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import type { Activity } from "../../common/activity/activity-store";
import {
  activityPercent,
  activityStore,
  sanitizeProgress,
} from "../../common/activity/activity-store";
import { navigate } from "../../common/navigate";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../ha-button";
import "../ha-svg-icon";
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

  private _unsub?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsub = activityStore.subscribe((items) => {
      this._items = items;
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`ui.activity.${key}` as any, values);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._items.length) {
      return nothing;
    }
    const running = activityStore.runningCount;
    const hasFinished = this._items.some((item) => item.state !== "running");
    return html`<section aria-label=${this._l("title")}>
      <div class="head">
        <h2>
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
        ${this._items.map((item) => this._renderItem(item))}
      </ul>
    </section>`;
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
          : html`<p class="detail" role="status">
              ${item.message ?? this._l(`state.${item.state}`)}
            </p>`
      }
      ${
        item.state === "failed"
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

  private _call(action?: () => void | Promise<void>): void {
    if (action) {
      Promise.resolve(action()).catch(() => undefined);
    }
  }

  private _cancelItem(ev: Event): void {
    this._call(this._itemOf(ev)?.cancel);
  }

  private _retryItem(ev: Event): void {
    this._call(this._itemOf(ev)?.retry);
  }

  private _undoItem(ev: Event): void {
    this._call(this._itemOf(ev)?.undo?.run);
  }

  private _dismissItem(ev: Event): void {
    const item = this._itemOf(ev);
    if (item) {
      activityStore.dismiss(item.id);
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
        min-height: 44px;
      }
      ha-recovery-card {
        margin-top: var(--ha-space-2);
      }
    `,
  ];
}
