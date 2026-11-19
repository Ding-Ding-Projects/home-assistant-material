import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import {
  renderStackedLabel,
  stackedLabelStyles,
} from "../../../common/language-mode/stacked-label";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-adaptive-dialog";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import type { LinkedCheck } from "../../../data/linked_media";
import {
  addLinkedFile,
  checkLinkedAddress,
  DEFAULT_LINKED_MAX_SIZE_MB,
} from "../../../data/linked_media";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import { linkedFailureText } from "./linked-text";

declare global {
  interface HASSDomEvents {
    "linked-file-added": undefined;
    "linked-file-changed": undefined;
    "linked-sheet-closed": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-linked-file-add": HaLinkedFileAdd;
  }
}

/** The sheet that adds a linked file: a name, a web address, Check, then Add. */
@customElement("ha-linked-file-add")
export class HaLinkedFileAdd extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public open = false;

  @state() private _name = "";

  @state() private _address = "";

  @state() private _homeNetwork = false;

  @state() private _check?: LinkedCheck;

  @state() private _checkedAddress?: string;

  @state() private _busy = false;

  @state() private _error = false;

  private _lang = new LanguageModeController(this);

  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._modeLocalize(
      `ui.panel.media-browser.linked.add_dialog.${key}` as any,
      values
    );
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (changed.has("open") && this.open) {
      this._name = "";
      this._address = "";
      this._homeNetwork = false;
      this._check = undefined;
      this._checkedAddress = undefined;
      this._error = false;
    }
  }

  protected render(): TemplateResult {
    const checked =
      this._check?.reachable && this._checkedAddress === this._address.trim();
    return html`
      <ha-adaptive-dialog
        .open=${this.open}
        header-title=${this._l("title")}
        @closed=${this._closed}
      >
        <div class="body">
          <ha-input
            .value=${this._name}
            .label=${this._l("name")}
            @input=${this._nameChanged}
          ></ha-input>
          <ha-input
            type="url"
            .value=${this._address}
            .label=${this._l("address")}
            .hint=${this._l("address_hint")}
            inputmode="url"
            autocomplete="off"
            @input=${this._addressChanged}
          ></ha-input>
          <label class="switch-row">
            <span class="switch-text">
              <span>${this._l("home_network")}</span>
              <span class="secondary">${this._l("home_network_hint")}</span>
            </span>
            <ha-switch
              .checked=${this._homeNetwork}
              @change=${this._homeNetworkChanged}
            ></ha-switch>
          </label>
          ${this._renderCheck()}
          ${
            this._error
              ? html`<ha-alert alert-type="error"
                  >${this._l("add_failed")}</ha-alert
                >`
              : nothing
          }
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            .loading=${this._busy && !checked}
            .disabled=${!this._address.trim() || this._busy}
            @click=${this._doCheck}
            >${renderStackedLabel(this._l("check"))}</ha-button
          >
          <ha-button
            slot="primaryAction"
            .loading=${this._busy && !!checked}
            .disabled=${!checked || !this._name.trim() || this._busy}
            @click=${this._add}
            >${renderStackedLabel(this._l("add"))}</ha-button
          >
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _renderCheck(): TemplateResult | typeof nothing {
    const check = this._check;
    if (!check || this._checkedAddress !== this._address.trim()) {
      return html`<p class="secondary">${this._l("check_first")}</p>`;
    }
    if (!check.reachable) {
      return html`<ha-alert alert-type="error"
        >${linkedFailureText(this._modeLocalize, check)}</ha-alert
      >`;
    }
    const kind = this._modeLocalize(
      `ui.panel.media-browser.linked.kind.${check.kind}` as any
    );
    const seconds = ((check.elapsed_ms ?? 0) / 1000).toFixed(1);
    return html`<p class="found" role="status">
      ${
        check.size == null
          ? this._l("found_unknown_size", { kind, seconds })
          : this._l("found", {
              kind,
              size: bytesToString(check.size, 0),
              seconds,
            })
      }
    </p>`;
  }

  private _nameChanged(ev: Event): void {
    this._name = (ev.target as HaInput).value ?? "";
  }

  private _addressChanged(ev: Event): void {
    this._address = (ev.target as HaInput).value ?? "";
  }

  private _homeNetworkChanged(ev: Event): void {
    this._homeNetwork = (ev.target as HaSwitch).checked;
    this._check = undefined;
  }

  private async _doCheck(): Promise<void> {
    const address = this._address.trim();
    this._busy = true;
    this._error = false;
    try {
      this._check = await checkLinkedAddress(
        this.hass,
        address,
        this._homeNetwork,
        DEFAULT_LINKED_MAX_SIZE_MB
      );
      this._checkedAddress = address;
    } catch (_err) {
      this._check = { reachable: false, reason: "invalid_address" };
      this._checkedAddress = address;
    } finally {
      this._busy = false;
    }
  }

  private async _add(): Promise<void> {
    this._busy = true;
    this._error = false;
    try {
      const result = await addLinkedFile(this.hass, {
        name: this._name.trim(),
        address: this._address.trim(),
        fetch: "each_time",
        max_size_mb: DEFAULT_LINKED_MAX_SIZE_MB,
        home_network: this._homeNetwork,
      });
      if (!result.added) {
        this._check = result.check;
        return;
      }
      // The address is forgotten here as soon as it is stored.
      this._address = "";
      fireEvent(this, "linked-file-added");
      this.open = false;
    } catch (_err) {
      this._error = true;
    } finally {
      this._busy = false;
    }
  }

  private _closed(): void {
    this._address = "";
    fireEvent(this, "linked-sheet-closed");
  }

  static get styles(): CSSResultGroup {
    return [
      stackedLabelStyles,
      css`
        .body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .switch-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 56px;
          cursor: pointer;
        }
        .switch-text {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .secondary {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .found {
          margin: 0;
          font-size: var(--ha-font-size-m);
          color: var(--success-color, var(--primary-text-color));
        }
      `,
    ];
  }
}
