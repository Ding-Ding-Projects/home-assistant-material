import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import {
  getDroppedSettingKeys,
  settingsBundleSync,
  subscribeDroppedSettingKeys,
} from "../../common/instance-sync/settings-bundle";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import "./ha-instance-sync-status";

type Localize = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * Whether the person's settings are saved on this instance, and which large
 * ones could not be and stay only in this browser.
 */
@customElement("ha-settings-sync-status")
export class HaSettingsSyncStatus extends LitElement {
  @property({ attribute: false }) public localize!: Localize;

  @state() private _dropped: string[] = getDroppedSettingKeys();

  private _lang = new LanguageModeController(this);

  private _unsub?: () => void;

  public connectedCallback() {
    super.connectedCallback();
    this._dropped = getDroppedSettingKeys();
    this._unsub = subscribeDroppedSettingKeys((keys) => {
      this._dropped = keys;
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  protected render(): TemplateResult {
    return html`
      <ha-instance-sync-status
        .sync=${settingsBundleSync}
        .localize=${this.localize}
      ></ha-instance-sync-status>
      ${
        this._dropped.length
          ? html`<p class="notice" role="status">
              ${this._lang.text(
                this.localize,
                "ui.instance_sync.settings_dropped",
                {
                  count: this._dropped.length,
                  names: this._dropped.join(", "),
                }
              )}
            </p>`
          : nothing
      }
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .notice {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-settings-sync-status": HaSettingsSyncStatus;
  }
}
