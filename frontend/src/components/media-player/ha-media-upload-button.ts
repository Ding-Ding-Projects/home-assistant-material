import type { ContextType } from "@lit/context";
import { mdiUpload } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { fireEvent } from "../../common/dom/fire_event";
import type { LocalizeFunc } from "../../common/translations/localize";
import { apiContext } from "../../data/context";
import type { MediaPlayerItem } from "../../data/media-player";
import { createImage } from "../../data/image_upload";
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

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state() _uploading = 0;

  @query("input") private _input?: HTMLInputElement;

  protected render() {
    const kind = this._target();
    if (!this.currentItem || !kind) {
      return nothing;
    }
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
        .accept=${kind === "image" ? "image/*" : "audio/*,video/*,image/*"}
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
    `;
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
    // Opened in the same step as the press: a browser only shows the file
    // chooser while it still counts the press as the person's own action.
    this._input?.click();
  }

  private async _filesChosen() {
    const input = this._input;
    const kind = this._target();
    const files = input?.files ? Array.from(input.files) : [];
    if (input) {
      // Lets the same file be chosen again later.
      input.value = "";
    }
    if (!files.length || !kind || this._uploading > 0) {
      return;
    }
    fireEvent(this, "uploading");
    const target = this.currentItem!.media_content_id!;

    for (let i = 0; i < files.length; i++) {
      this._uploading = files.length - i;

      try {
        // eslint-disable-next-line no-await-in-loop
        await (kind === "image"
          ? createImage(this._api.fetchWithAuth, this._localize, files[i])
          : uploadLocalMedia(
              this._api.fetchWithAuth,
              this._localize,
              target,
              files[i]
            ));
      } catch (err: any) {
        showAlertDialog(this, {
          text: this._localize(
            "ui.components.media-browser.file_management.upload_failed",
            {
              reason: err.message || err,
            }
          ),
        });
        break;
      }
    }
    this._uploading = 0;
    fireEvent(this, "media-refresh");
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
