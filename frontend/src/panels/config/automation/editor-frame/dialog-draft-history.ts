import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { DraftHistoryDialogParams } from "./show-dialog-draft-history";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-spinner";
import {
  fetchEditorDraftHistory,
  restoreEditorDraftVersion,
} from "../../../../data/editor-drafts";
import type { EditorDraftVersion } from "../../../../data/editor-drafts";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import { formatDraftTime } from "./draft-logic";
import { draftText } from "./draft-strings";

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-draft-history": DialogDraftHistory;
  }
}

@customElement("ha-dialog-draft-history")
class DialogDraftHistory extends LitElement implements HassDialog {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: DraftHistoryDialogParams;

  @state() private _open = false;

  @state() private _versions?: EditorDraftVersion[];

  @state() private _error = false;

  public async showDialog(params: DraftHistoryDialogParams): Promise<void> {
    this._params = params;
    this._versions = undefined;
    this._error = false;
    this._open = true;
    try {
      this._versions = await fetchEditorDraftHistory(
        this.hass,
        params.kind,
        params.itemId
      );
    } catch {
      this._error = true;
      this._versions = [];
    }
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _closed() {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${draftText(this.hass, "history")}
        @closed=${this._closed}
      >
        <p class="hint">${draftText(this.hass, "history_hint")}</p>
        ${this._error ? html`<p class="error">${draftText(this.hass, "history_error")}</p>` : nothing}
        ${
          this._versions === undefined
            ? html`<ha-spinner></ha-spinner>`
            : this._versions.length === 0
              ? html`<p>${draftText(this.hass, "history_empty")}</p>`
              : html`<ul>
                  ${this._versions.map(
                    (version) => html`
                      <li>
                        <span class="when">
                          ${new Date(version.time).toLocaleDateString()}
                          ${formatDraftTime(version.time)}
                        </span>
                        <ha-button
                          size="s"
                          appearance="plain"
                          .sha=${version.sha}
                          @click=${this._restore}
                        >
                          ${draftText(this.hass, "restore")}
                        </ha-button>
                      </li>
                    `
                  )}
                </ul>`
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${draftText(this.hass, "close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private async _restore(ev: Event) {
    const sha = (ev.currentTarget as HTMLElement & { sha?: string }).sha;
    const params = this._params;
    if (!sha || !params) {
      return;
    }
    try {
      const result = await restoreEditorDraftVersion(
        this.hass,
        params.kind,
        params.itemId,
        sha
      );
      params.onRestore(result.config);
      showToast(this, { message: draftText(this.hass, "restored") });
      this.closeDialog();
    } catch {
      this._error = true;
    }
  }

  static styles: CSSResultGroup = [
    haStyleDialog,
    css`
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 50vh;
        overflow: auto;
      }
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        min-height: 40px;
      }
      .error {
        color: var(--error-color);
      }
      .hint {
        margin-top: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
    `,
  ];
}
