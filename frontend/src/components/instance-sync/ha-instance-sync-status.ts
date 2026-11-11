import { mdiAlertOutline, mdiCheck, mdiCloudSync } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type {
  SyncSnapshot,
  UserDataSync,
} from "../../common/instance-sync/user-data-sync";
import { isOnlyInBrowser } from "../../common/instance-sync/user-data-sync";
import "../ha-button";
import "../ha-svg-icon";

type Localize = (key: string) => string;

/** The key of the notice about which copy was used, if there is one. */
const noticeKey = (snapshot: SyncSnapshot): string | undefined =>
  snapshot.replacedInvalid
    ? "replaced_invalid"
    : snapshot.used
      ? `used_${snapshot.used}`
      : undefined;

/**
 * Shows whether a setting is saved on this instance for the signed-in
 * account: "Saved on this instance", "Saving…", or "Could not save: only in
 * this browser" with a Retry button. A hidden polite live region exists from
 * the start and speaks only failures, the first saved state after a failure
 * and which copy was used, never the routine "Saving" and "Saved" of each
 * edit. Nothing about the saved value is ever shown.
 */
@customElement("ha-instance-sync-status")
export class HaInstanceSyncStatus extends LitElement {
  @property({ attribute: false }) public sync!: UserDataSync<any>;

  @property({ attribute: false }) public localize!: Localize;

  @state() private _snapshot?: SyncSnapshot;

  // The one message the live region holds. It changes only for a failure, for
  // the first saved state after a failure, and for a notice about which copy
  // was used, never for the routine "Saving" and "Saved" of every edit.
  @state() private _announcement = "";

  private _lang = new LanguageModeController(this);

  private _unsub?: () => void;

  private _failed = false;

  private _noticeKey?: string;

  public connectedCallback() {
    super.connectedCallback();
    this._snapshot = this.sync.snapshot;
    this._failed = isOnlyInBrowser(this._snapshot.status);
    this._noticeKey = noticeKey(this._snapshot);
    this._unsub = this.sync.subscribe((snapshot) => {
      this._snapshot = snapshot;
      this._announce(snapshot);
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  private _text(key: string): string {
    return this._lang.text(this.localize, key);
  }

  private _failureText(snapshot: SyncSnapshot): string {
    const text = this._text(`ui.instance_sync.status.${snapshot.status}`);
    return snapshot.status === "too_large"
      ? `${text} ${this._text(this._hintKey(snapshot))}`
      : text;
  }

  private _hintKey(snapshot: SyncSnapshot): string {
    return snapshot.largestPart
      ? `ui.instance_sync.too_large_part.${snapshot.largestPart}`
      : "ui.instance_sync.too_large_hint";
  }

  private _announce(snapshot: SyncSnapshot) {
    const failed = isOnlyInBrowser(snapshot.status);
    const notice = noticeKey(snapshot);
    if (failed) {
      this._announcement = this._failureText(snapshot);
    } else if (this._failed && snapshot.status === "saved") {
      this._announcement = this._text("ui.instance_sync.status.saved");
    }
    if (notice && notice !== this._noticeKey) {
      this._announcement = this._text(`ui.instance_sync.${notice}`);
    }
    this._failed = failed;
    this._noticeKey = notice;
  }

  protected render(): TemplateResult {
    const snapshot = this._snapshot;
    // The live region exists from the start, so the first message is spoken.
    const region = html`<span class="sr-only" role="status" aria-live="polite"
      >${this._announcement}</span
    >`;
    if (!snapshot || snapshot.status === "idle") {
      return region;
    }
    const failed = isOnlyInBrowser(snapshot.status);
    const icon =
      snapshot.status === "saved"
        ? mdiCheck
        : failed
          ? mdiAlertOutline
          : mdiCloudSync;
    const notice = noticeKey(snapshot);
    return html`
      ${region}
      <div class="status ${failed ? "failed" : ""}">
        <span class="line">
          <ha-svg-icon .path=${icon}></ha-svg-icon>
          <span
            >${this._lang.text(
              this.localize,
              `ui.instance_sync.status.${snapshot.status}`
            )}</span
          >
        </span>
        ${
          failed
            ? html`<ha-button appearance="plain" @click=${this._retry}>
                ${this._lang.text(this.localize, "ui.instance_sync.retry")}
              </ha-button>`
            : nothing
        }
      </div>
      ${
        snapshot.status === "too_large"
          ? html`<p class="notice">
              ${this._lang.text(this.localize, this._hintKey(snapshot))}
            </p>`
          : nothing
      }
      ${
        notice
          ? html`<p class="notice">
              ${this._lang.text(this.localize, `ui.instance_sync.${notice}`)}
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
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
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
