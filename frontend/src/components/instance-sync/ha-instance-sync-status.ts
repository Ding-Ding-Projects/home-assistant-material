import { mdiAlertOutline, mdiCheck, mdiCloudSync } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type {
  SyncSnapshot,
  UserDataSync,
} from "../../common/instance-sync/user-data-sync";
import { isOnlyInBrowser } from "../../common/instance-sync/user-data-sync";
import "../ha-button";
import "../ha-svg-icon";

type Localize = (key: string) => string;

/**
 * Shows whether a setting is saved on this instance for the signed-in
 * account: "Saved on this instance", "Saving…", or "Could not save: only in
 * this browser" with a Retry button. The text sits in a polite live region and
 * changes only when the state changes, so it is announced once per change.
 * Nothing about the saved value is ever shown.
 */
@customElement("ha-instance-sync-status")
export class HaInstanceSyncStatus extends LitElement {
  @property({ attribute: false }) public sync!: UserDataSync<any>;

  @property({ attribute: false }) public localize!: Localize;

  @state() private _snapshot?: SyncSnapshot;

  private _unsub?: () => void;

  public connectedCallback() {
    super.connectedCallback();
    this._snapshot = this.sync.snapshot;
    this._unsub = this.sync.subscribe((snapshot) => {
      this._snapshot = snapshot;
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  protected render(): TemplateResult | typeof nothing {
    const snapshot = this._snapshot;
    if (!snapshot || snapshot.status === "idle") {
      return nothing;
    }
    const failed = isOnlyInBrowser(snapshot.status);
    const icon =
      snapshot.status === "saved"
        ? mdiCheck
        : failed
          ? mdiAlertOutline
          : mdiCloudSync;
    const notice = snapshot.replacedInvalid
      ? "replaced_invalid"
      : snapshot.used
        ? `used_${snapshot.used}`
        : undefined;
    return html`
      <div class="status ${failed ? "failed" : ""}">
        <span class="line" role="status" aria-live="polite">
          <ha-svg-icon .path=${icon}></ha-svg-icon>
          <span
            >${this.localize(`ui.instance_sync.status.${snapshot.status}`)}</span
          >
        </span>
        ${
          failed && snapshot.status !== "too_large"
            ? html`<ha-button appearance="plain" @click=${this._retry}>
                ${this.localize("ui.instance_sync.retry")}
              </ha-button>`
            : nothing
        }
      </div>
      ${
        notice
          ? html`<p class="notice">
              ${this.localize(`ui.instance_sync.${notice}`)}
            </p>`
          : nothing
      }
    `;
  }

  private _retry() {
    this.sync.retry();
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--secondary-text-color);
    }
    .status.failed {
      color: var(--error-color);
    }
    .line {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .notice {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-instance-sync-status": HaInstanceSyncStatus;
  }
}
