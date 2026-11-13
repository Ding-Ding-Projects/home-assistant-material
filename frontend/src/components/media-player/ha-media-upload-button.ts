import type { ContextType } from "@lit/context";
import { mdiUpload } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { convertImage } from "../../common/converter/image-convert";
import { planChosenFiles } from "../../common/file-drop/chosen-files";
import { convertPicture } from "../../common/file-drop/drop-convert";
import {
  convertedText,
  skipText,
  warningText,
} from "../../common/file-drop/drop-upload-queue";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../common/translations/localize";
import { apiContext } from "../../data/context";
import type { MediaPlayerItem } from "../../data/media-player";
import { createImage, imageFolderFromMediaId } from "../../data/image_upload";
import {
  isImageUploadMediaSourceContentId,
  isLocalMediaSourceContentId,
  uploadLocalMedia,
} from "../../data/media_source";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import "../ha-button";
import "../ha-svg-icon";

declare global {
  interface HASSDomEvents {
    uploading: unknown;
    "media-refresh": unknown;
  }
}

@customElement("ha-media-upload-button")
class MediaUploadButton extends LitElement {
  @property({ attribute: false }) currentItem?: MediaPlayerItem;

  @state() @consumeLocalize() private _localize!: LocalizeFunc;
  private _languageMode = new LanguageModeController(this);

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state() _uploading = 0;

  private _transfer?: AbortController;
  private _stopped?: "cancelled" | "timeout";

  // Where the last press said the upload goes
  private _pressed?: { kind: "local" | "image"; id: string };

  @query("input") private _input?: HTMLInputElement;

  protected render() {
    const kind = this._target();
    if (!this.currentItem || !kind) {
      return nothing;
    }
    // No file type is named on the field: a phone greys out every file it
    // cannot play itself (Ogg audio, for one) when the chooser is limited.
    // What is not a picture, video or audio file is turned away after it is
    // chosen, before anything is sent.
    // The file field lives here, next to the button, and is never
    // `display: none`: this button is used inside dialogs, and a field added
    // to the page body sits outside the open dialog, where the browser treats
    // it as inactive and never opens the file chooser.
    return html`
      <input
        type="file"
        multiple
        tabindex="-1"
        aria-hidden="true"
        @change=${this._filesChosen}
      />
      <ha-button
        .disabled=${this._uploading > 0}
        @click=${this._startUpload}
        .loading=${this._uploading > 0}
      >
        <ha-svg-icon .path=${mdiUpload} slot="start"></ha-svg-icon>
        ${
          this._uploading > 0
            ? this._localize(
                "ui.components.media-browser.file_management.uploading",
                {
                  count: this._uploading,
                }
              )
            : this._localize(
                "ui.components.media-browser.file_management.add_media"
              )
        }
      </ha-button>
      ${
        this._uploading > 0
          ? html`<ha-button appearance="plain" @click=${this._cancelUpload}>
              ${this._localize("ui.common.cancel")}
            </ha-button>`
          : nothing
      }
    `;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._transfer?.abort();
  }

  private _cancelUpload() {
    if (this._transfer && !this._transfer.signal.aborted) {
      this._stopped = "cancelled";
      this._transfer.abort();
    }
  }

  private async _transferStep<T>(
    operation: () => Promise<T>,
    transfer: AbortController,
    timeoutMs: number
  ): Promise<T> {
    const { signal } = transfer;
    signal.throwIfAborted();
    const timeout = window.setTimeout(() => {
      this._stopped = "timeout";
      transfer.abort();
    }, timeoutMs);
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      return await Promise.race([aborted, operation()]);
    } finally {
      window.clearTimeout(timeout);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  /** Where an upload goes: a local media folder, or the image upload source. */
  private _target(): "local" | "image" | undefined {
    const id = this.currentItem?.media_content_id || "";
    if (isLocalMediaSourceContentId(id)) {
      return "local";
    }
    if (isImageUploadMediaSourceContentId(id)) {
      return "image";
    }
    return undefined;
  }

  private _startUpload() {
    if (this._uploading > 0) {
      return;
    }
    // The folder is fixed at the press: it may change while the chooser is open.
    const kind = this._target();
    const id = this.currentItem?.media_content_id;
    this._pressed = kind && id ? { kind, id } : undefined;
    // Opened in the same step as the press: a browser only shows the file
    // chooser while it still counts the press as the person's own action.
    this._input?.click();
  }

  private async _filesChosen() {
    const input = this._input;
    const pressed = this._pressed;
    this._pressed = undefined;
    const kind = pressed?.kind;
    const chosen = input?.files ? Array.from(input.files) : [];
    if (input) {
      // Lets the same file be chosen again later.
      input.value = "";
    }
    if (!chosen.length || !kind || this._uploading > 0) {
      return;
    }
    // The same rules as a dropped file: what is not a picture, video or audio
    // file is not sent, and pictures the target cannot take are converted.
    const plan = planChosenFiles(chosen, kind === "image" ? "image" : "media");
    if (plan.skipped.length > 0) {
      showAlertDialog(this, {
        text: warningText(
          plan.skipped.map((file) => skipText(file, this._localize)),
          this._localize
        ),
      });
    }
    if (!plan.items.length) {
      return;
    }
    const transfer = new AbortController();
    this._transfer = transfer;
    this._stopped = undefined;
    this._uploading = plan.items.length;
    fireEvent(this, "uploading");
    const target = pressed!.id;
    const notes: string[] = [];

    try {
      for (let i = 0; i < plan.items.length && !transfer.signal.aborted; i++) {
        this._uploading = plan.items.length - i;
        let file = plan.items[i].file;

        try {
          const conversion = plan.items[i].conversion;
          if (conversion) {
            // eslint-disable-next-line no-await-in-loop
            const outcome = await this._transferStep(
              () =>
                convertPicture(file, conversion, convertImage, transfer.signal),
              transfer,
              60_000
            );
            if (!outcome.ok) {
              notes.push(
                skipText(
                  {
                    name: file.name,
                    reason: "convert_failed",
                    detail: outcome.code,
                  },
                  this._localize
                )
              );
              continue;
            }
            notes.push(convertedText(outcome.change, this._localize));
            file = outcome.file;
          }
          if (transfer.signal.aborted) break;
          // Allow a large supported upload to finish on a slow connection.
          // eslint-disable-next-line no-await-in-loop
          await this._transferStep(
            () =>
              kind === "image"
                ? createImage(
                    this._api.fetchWithAuth,
                    this._localize,
                    file,
                    transfer.signal,
                    imageFolderFromMediaId(target) || undefined
                  )
                : uploadLocalMedia(
                    this._api.fetchWithAuth,
                    this._localize,
                    target,
                    file,
                    transfer.signal
                  ),
            transfer,
            15 * 60_000
          );
          if (transfer.signal.aborted) break;
        } catch (err: unknown) {
          if (!transfer.signal.aborted) {
            showAlertDialog(this, {
              text: this._localize(
                "ui.components.media-browser.file_management.upload_failed",
                {
                  reason: err instanceof Error ? err.message : String(err),
                }
              ),
            });
          }
          break;
        }
      }
    } finally {
      this._transfer = undefined;
      this._uploading = 0;
      if (this.isConnected) fireEvent(this, "media-refresh");
    }
    if (this.isConnected && this._stopped) {
      showAlertDialog(this, {
        text: this._languageMode.text(
          this._localize,
          `ui.components.media-browser.file_management.upload_${this._stopped}`
        ),
      });
    } else if (this.isConnected && notes.length > 0) {
      showAlertDialog(this, { text: warningText(notes, this._localize) });
    }
  }

  static styles = css`
    :host {
      position: relative;
    }
    /* Kept in the layout, out of sight and out of the way of touches. */
    input {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: 0;
      padding: 0;
      border: 0;
      opacity: 0;
      overflow: hidden;
      clip-path: inset(50%);
      pointer-events: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-upload-button": MediaUploadButton;
  }
}
