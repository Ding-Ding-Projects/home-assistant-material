import { mdiClose } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomEvent,
} from "../common/dom/fire_event";
import { popoverSupported } from "../common/feature-detect/support-popover";
import type { LocalizeKeys } from "../common/translations/localize";
import "../components/ha-button";
import "../components/ha-icon-button";
import "../components/ha-toast";
import {
  normalizeToastDuration,
  ToastStack,
} from "../common/toast/toast-stack";
import type { ToastStackItem } from "../common/toast/toast-stack";
import type { ToastClosedEventDetail } from "../components/ha-toast";
import type { HomeAssistant } from "../types";

export interface ShowToastParams {
  // Unique ID for updating or closing a specific toast without flickering.
  id?: string;
  message:
    | string
    | { translationKey: LocalizeKeys; args?: Record<string, string | number> };
  announceMessage?:
    | string
    | { translationKey: LocalizeKeys; args?: Record<string, string | number> };
  action?: ToastActionParams;
  secondaryAction?: ToastActionParams;
  dismiss?: () => void;
  duration?: number;
  dismissable?: boolean;
  bottomOffset?: number;
  /**
   * Shows a progress bar from 0 to 100 and keeps the toast until it is closed
   * or replaced (give it an id and show it again with a new value).
   */
  progress?: number;
  /** Warnings and errors stay until dismissed, unless a duration is given. */
  severity?: "info" | "warning" | "error";
}

export interface ToastActionParams {
  action: () => void;
  primary?: boolean;
  text:
    | string
    | { translationKey: LocalizeKeys; args?: Record<string, string | number> };
}

type Notification = ToastStackItem<ShowToastParams>;

@customElement("notification-manager")
class NotificationManager extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The visible toasts, oldest first (the newest is nearest the edge). */
  @state() private _notifications: Notification[] = [];

  @state() private _queuedCount = 0;

  @state() private _announcement = "";

  @query(".stack") private _stack?: HTMLDivElement;

  @queryAll("ha-toast")
  private _toasts!: NodeListOf<HTMLElementTagNameMap["ha-toast"]>;

  private _toastStack = new ToastStack<ShowToastParams>();

  private _announced = new Map<string, string>();

  private _anonymousId = 0;

  private _text(
    value: NonNullable<ShowToastParams["message"]> | undefined
  ): string {
    if (value === undefined) {
      return "";
    }
    return typeof value !== "string"
      ? this.hass.localize(value.translationKey, value.args)
      : value;
  }

  public async showDialog(parameters: ShowToastParams) {
    if (parameters.duration === 0) {
      if (parameters.id) {
        await this._closeNotification(`identified-${parameters.id}`);
      } else {
        const notification = [...this._toastStack.all]
          .reverse()
          .find(({ identified }) => !identified);
        if (notification) {
          await this._closeNotification(notification.key);
        }
      }
      return;
    }

    const normalizedParameters = {
      ...parameters,
      dismissable:
        parameters.dismissable ??
        (parameters.severity === "warning" || parameters.severity === "error"
          ? true
          : undefined),
      duration: normalizeToastDuration(
        parameters.duration,
        parameters.severity,
        parameters.progress !== undefined
      ),
    };
    const key = parameters.id
      ? `identified-${parameters.id}`
      : `anonymous-${this._anonymousId + 1}`;
    const { outcome } = this._toastStack.push({
      key,
      text: this._text(parameters.message),
      identified: Boolean(parameters.id),
      data: normalizedParameters,
    });
    if (outcome === "duplicate") {
      return;
    }
    if (!parameters.id) {
      this._anonymousId += 1;
    }
    this._syncFromStack();

    if (outcome === "queued" || outcome === "updated-queued") {
      return;
    }

    this._announceIfChanged(key, normalizedParameters);
    await this.updateComplete;
    this._showStack();
    this._getToast(key)?.show();
  }

  private _announceIfChanged(key: string, parameters: ShowToastParams) {
    const text = this._text(parameters.announceMessage ?? parameters.message);
    if (this._announced.get(key) === text) {
      return;
    }
    this._announced.set(key, text);
    // Clear first so an identical text arriving again is still read out.
    this._announcement = "";
    this.updateComplete.then(() => {
      if (this._announced.get(key) === text) {
        this._announcement = text;
      }
    });
  }

  private _syncFromStack() {
    this._notifications = [...this._toastStack.visible];
    this._queuedCount = this._toastStack.queued.length;
  }

  private _toastClosed(
    ev: HASSDomEvent<ToastClosedEventDetail> &
      HASSDomCurrentTargetEvent<HTMLElementTagNameMap["ha-toast"]>
  ) {
    const key = ev.currentTarget.dataset.notificationKey!;
    if (ev.detail.reason === "dismiss") {
      this._getNotification(key)?.data.dismiss?.();
    }
    this._removeNotification(key);
  }

  protected render() {
    const live = html`<div
      class="live"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      ${this._announcement}
    </div>`;
    if (!this._notifications.length) {
      return live;
    }
    const bottomOffset = Math.max(
      ...this._notifications.map(({ data }) => data.bottomOffset ?? 0)
    );
    const count = this._notifications.length;
    return html`
      ${live}
      <div
        class="stack"
        style=${styleMap({
          "--notification-stack-bottom-offset": `${bottomOffset}px`,
        })}
        popover=${ifDefined(popoverSupported ? "manual" : undefined)}
      >
        ${
          this._queuedCount > 0
            ? html`<div class="more">
                ${this.hass.localize("ui.notification_toast.more_waiting", {
                  count: this._queuedCount,
                })}
              </div>`
            : nothing
        }
        ${repeat(
          this._notifications,
          (notification) => notification.key,
          ({ key, data: parameters }, index) => html`
            <ha-toast
              data-notification-key=${key}
              .labelText=${this._text(parameters.message)}
              .announceText=${
                parameters.announceMessage
                  ? this._text(parameters.announceMessage)
                  : undefined
              }
              .timeoutMs=${parameters.duration!}
              .stacked=${true}
              .silent=${true}
              .depth=${count - 1 - index}
              @toast-closed=${this._toastClosed}
            >
              ${this._renderProgress(parameters)}
              ${this._renderAction(key, parameters.secondaryAction, true)}
              ${this._renderAction(key, parameters.action, false)}
              ${
                parameters.dismissable
                  ? html`
                      <ha-icon-button
                        data-notification-key=${key}
                        .label=${this.hass.localize("ui.common.close")}
                        .path=${mdiClose}
                        slot="dismiss"
                        @click=${this._dismissClicked}
                      ></ha-icon-button>
                    `
                  : nothing
              }
            </ha-toast>
          `
        )}
      </div>
    `;
  }

  private _renderProgress(parameters: ShowToastParams) {
    if (parameters.progress === undefined) {
      return nothing;
    }
    const value = Math.max(0, Math.min(100, Math.round(parameters.progress)));
    return html`
      <progress
        slot="action"
        class="progress"
        max="100"
        .value=${value}
        aria-label=${this.hass.localize("ui.notification_toast.progress", {
          percent: value,
        })}
      ></progress>
    `;
  }

  private _renderAction(
    key: string,
    action: ToastActionParams | undefined,
    secondary: boolean
  ) {
    if (!action) {
      return nothing;
    }
    return html`
      <ha-button
        data-notification-key=${key}
        appearance=${action.primary ? "filled" : "plain"}
        size="s"
        slot="action"
        @click=${secondary ? this._secondaryButtonClicked : this._buttonClicked}
      >
        ${
          typeof action.text !== "string"
            ? this.hass.localize(action.text.translationKey, action.text.args)
            : action.text
        }
      </ha-button>
    `;
  }

  private _buttonClicked(
    ev: HASSDomCurrentTargetEvent<HTMLElementTagNameMap["ha-button"]>
  ) {
    const key = ev.currentTarget.dataset.notificationKey!;
    this._getToast(key)?.hide("action");
    this._getNotification(key)?.data.action?.action();
  }

  private _secondaryButtonClicked(
    ev: HASSDomCurrentTargetEvent<HTMLElementTagNameMap["ha-button"]>
  ) {
    const key = ev.currentTarget.dataset.notificationKey!;
    this._getToast(key)?.hide("action");
    this._getNotification(key)?.data.secondaryAction?.action();
  }

  private _dismissClicked(
    ev: HASSDomCurrentTargetEvent<HTMLElementTagNameMap["ha-icon-button"]>
  ) {
    this._getToast(ev.currentTarget.dataset.notificationKey!)?.hide("dismiss");
  }

  private _getNotification(key: string) {
    return this._toastStack.get(key);
  }

  private _getToast(key: string) {
    return [...this._toasts].find(
      (toast) => toast.dataset.notificationKey === key
    );
  }

  private async _closeNotification(key: string) {
    const notification = this._getNotification(key);
    if (!notification) {
      return;
    }
    await this._getToast(key)?.hide();
    if (this._getNotification(key) === notification) {
      this._removeNotification(key);
    }
  }

  private _removeNotification(key: string) {
    this._announced.delete(key);
    const promoted = this._toastStack.remove(key);
    this._syncFromStack();
    if (!this._notifications.length) {
      this._hideStack();
    }
    if (promoted) {
      this._announceIfChanged(promoted.key, promoted.data);
      this.updateComplete.then(() => {
        this._showStack();
        this._getToast(promoted.key)?.show();
      });
    }
  }

  private _showStack() {
    if (!popoverSupported || !this._stack) {
      return;
    }
    // Top-layer order is order of entry — re-enter so we paint above any
    // dialog backdrop opened since the stack was first shown.
    if (this._stack.matches(":popover-open")) {
      this._stack.hidePopover();
    }
    this._stack.showPopover();
  }

  private _hideStack() {
    if (!popoverSupported || !this._stack?.matches(":popover-open")) {
      return;
    }
    this._stack.hidePopover();
  }

  static override styles = css`
    .progress {
      width: 96px;
      height: 6px;
      accent-color: var(--ha-color-on-neutral-loud, currentColor);
    }
    .live {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .more {
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill, 999px);
      color: var(--ha-color-on-neutral-loud);
      background-color: var(--ha-color-neutral-10);
      font-size: var(--ha-font-size-s, 0.8125rem);
      opacity: 0.85;
    }
    .stack {
      position: fixed;
      inset-block-start: auto;
      inset-inline-end: auto;
      inset-block-end: calc(
        var(--safe-area-inset-bottom, 0px) + var(--ha-space-4) +
          var(--notification-stack-bottom-offset, 0px) +
          var(--ha-toast-bottom-bar-height, 0px)
      );
      inset-inline-start: 50%;
      margin: 0;
      padding: 0;
      border: none;
      overflow: visible;
      background: transparent;
      transform: translateX(
        calc(
          -50% * var(--scale-direction) +
            var(--safe-area-offset-left, 0px) - var(
              --safe-area-offset-right,
              0px
            )
        )
      );
      max-width: var(--safe-width);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
    }
    /* On a phone the page can carry a bottom bar of tabs; stay above it. */
    @media all and (max-width: 870px) {
      .stack {
        --ha-toast-bottom-bar-height: var(--ha-bottom-bar-height, 0px);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "notification-manager": NotificationManager;
  }

  // for fire event
  interface HASSDomEvents {
    "hass-notification": ShowToastParams;
  }
}
