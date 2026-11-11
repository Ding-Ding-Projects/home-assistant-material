import {
  mdiCheckboxBlankOutline,
  mdiCheckboxMarkedOutline,
  mdiChevronRight,
  mdiClose,
  mdiDelete,
  mdiDotsVertical,
  mdiFolder,
  mdiFolderMove,
  mdiFolderPlus,
  mdiRenameBox,
} from "@mdi/js";
import type { ContextType } from "@lit/context";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { consume } from "../../common/decorators/consume";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { transform } from "../../common/decorators/transform";
import { fireEvent } from "../../common/dom/fire_event";
import type { LocalizeFunc } from "../../common/translations/localize";
import { apiContext, configContext } from "../../data/context";
import { deleteImage, getIdFromUrl } from "../../data/image_upload";
import type { MediaPlayerItem } from "../../data/media-player";
import { MediaClassBrowserSettings } from "../../data/media-player";
import type { MediaFolderCounts } from "../../data/media_source";
import {
  browseLocalMediaPlayer,
  createLocalMediaFolder,
  getLocalMediaFolderCounts,
  getMediaBreadcrumbs,
  isImageUploadMediaSourceContentId,
  isLocalMediaSourceContentId,
  isMediaSourceRoot,
  isValidMediaName,
  moveLocalMedia,
  normalizeMediaFolderId,
  removeLocalMedia,
  removeLocalMediaFolder,
  renameLocalMedia,
} from "../../data/media_source";
import {
  showAlertDialog,
  showConfirmationDialog,
  showPromptDialog,
} from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistantConfig } from "../../types";
import "../ha-button";
import "../ha-checkbox";
import "../ha-dialog";
import "../ha-dialog-header";
import "../ha-dropdown";
import "../ha-dropdown-item";
import type { HaDropdownSelectEvent } from "../ha-dropdown";
import "../ha-icon-button";
import "../ha-spinner";
import "../ha-svg-icon";
import "../ha-tip";
import "./ha-media-upload-button";
import type { MediaManageDialogParams } from "./show-media-manage-dialog";

const SOURCE_PREFIX = "media-source://media_source/";

const FOLDER_ERROR_CODES = [
  "exists",
  "invalid_name",
  "not_found",
  "not_empty",
  "not_allowed",
  "changed",
];

@customElement("dialog-media-manage")
class DialogMediaManage extends LitElement {
  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, boolean>({
    transformer: (value) =>
      !!value?.config && isComponentLoaded(value.config, "hassio"),
  })
  private _hassioLoaded = false;

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state() private _currentItem?: MediaPlayerItem;

  @state() private _folderId = "";

  @state() private _loading = false;

  @state() private _params?: MediaManageDialogParams;

  @state() private _uploading = false;

  @state() private _working = false;

  // True while a delete confirmation is open, so nothing else can start under it
  @state() private _confirming = false;

  @state() private _selected = new Set<string>();

  @state() private _open = false;

  // The items being moved, and the folder the picker shows
  @state() private _moving?: MediaPlayerItem[];

  @state() private _pickerId = "";

  @state() private _pickerItem?: MediaPlayerItem;

  public showDialog(params: MediaManageDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._currentItem = undefined;
    this._folderId = "";
    this._moving = undefined;
    this._uploading = false;
    this._working = false;
    this._confirming = false;
    this._selected = new Set();
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected willUpdate(changedProps: PropertyValues) {
    if (changedProps.has("_params") && this._params) {
      this._folderId = this._params.currentItem.media_content_id;
      this._refreshMedia();
    }
  }

  private get _isLocal(): boolean {
    return isLocalMediaSourceContentId(
      this._params?.currentItem.media_content_id || ""
    );
  }

  private get _busy(): boolean {
    return (
      this._uploading || this._working || this._loading || this._confirming
    );
  }

  // Folder actions need a folder inside a media directory, not the list of them
  private get _canManageFolders(): boolean {
    return this._isLocal && !isMediaSourceRoot(this._folderId);
  }

  private _canChange(item: MediaPlayerItem): boolean {
    if (this._isLocal) {
      return this._canManageFolders;
    }
    return !item.can_expand;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    return html`
      <ha-dialog
        .open=${this._open}
        ?prevent-scrim-close=${this._busy}
        @closed=${this._dialogClosed}
      >
        <ha-dialog-header slot="header">
          ${
            !(this._uploading || this._working)
              ? html`<slot name="headerNavigationIcon" slot="navigationIcon">
                  <ha-icon-button
                    data-dialog="close"
                    .label=${this._localize("ui.common.close")}
                    .path=${mdiClose}
                  ></ha-icon-button
                ></slot>`
              : nothing
          }
          <h1 class="title" slot="title" id="dialog-box-title">
            ${this._localize(
              "ui.components.media-browser.file_management.title"
            )}
          </h1>
        </ha-dialog-header>
        ${this._moving ? this._renderPicker() : this._renderManager()}
        ${
          this._hassioLoaded
            ? html`<ha-tip>
                ${this._localize(
                  "ui.components.media-browser.file_management.tip_media_storage",
                  {
                    storage: html`<a
                      href="/config/storage"
                      @click=${this.closeDialog}
                    >
                      ${this._localize(
                        "ui.components.media-browser.file_management.tip_storage_panel"
                      )}</a
                    >`,
                  }
                )}
              </ha-tip>`
            : nothing
        }
      </ha-dialog>
    `;
  }

  private _renderBreadcrumbs(
    rootId: string,
    currentId: string,
    rootName: string
  ): TemplateResult {
    const crumbs = getMediaBreadcrumbs(rootId, currentId, rootName);
    return html`<nav
      class="crumbs"
      aria-label=${this._localize(
        "ui.components.media-browser.file_management.location"
      )}
    >
      ${crumbs.map(
        (crumb, index) => html`
          ${
            index > 0
              ? html`<ha-svg-icon
                  class="separator"
                  .path=${mdiChevronRight}
                ></ha-svg-icon>`
              : nothing
          }
          ${
            index === crumbs.length - 1
              ? html`<span class="crumb current" aria-current="location"
                  >${crumb.name}</span
                >`
              : html`<button
                  class="crumb"
                  type="button"
                  .disabled=${this._busy}
                  data-id=${crumb.id}
                  @click=${this._crumbClicked}
                >
                  ${crumb.name}
                </button>`
          }
        `
      )}
    </nav>`;
  }

  private _renderManager(): TemplateResult {
    const children = this._currentItem?.children || [];
    const selectable = children.filter((item) => this._canChange(item));
    const folderActions = this._canManageFolders;

    return html`
      ${
        this._currentItem
          ? this._renderBreadcrumbs(
              this._params!.currentItem.media_content_id,
              this._folderId,
              this._params!.currentItem.title
            )
          : nothing
      }
      ${
        this._currentItem && (!this._loading || this._uploading)
          ? html`<div class="actions">
              ${
                this._selected.size === 0
                  ? html`<ha-media-upload-button
                        .currentItem=${this._currentItem}
                        @uploading=${this._startUploading}
                        @media-refresh=${this._doneUploading}
                      ></ha-media-upload-button>
                      ${
                        folderActions
                          ? html`<ha-button
                              appearance="filled"
                              .disabled=${this._busy}
                              @click=${this._createFolder}
                            >
                              <ha-svg-icon
                                .path=${mdiFolderPlus}
                                slot="start"
                              ></ha-svg-icon>
                              ${this._localize(
                                "ui.components.media-browser.file_management.new_folder"
                              )}
                            </ha-button>`
                          : nothing
                      }`
                  : html`<ha-button
                        variant="danger"
                        .disabled=${this._busy}
                        @click=${this._deleteSelected}
                      >
                        <ha-svg-icon
                          .path=${mdiDelete}
                          slot="start"
                        ></ha-svg-icon>
                        ${this._localize(
                          `ui.components.media-browser.file_management.${
                            this._working ? "deleting" : "delete"
                          }`,
                          { count: this._selected.size }
                        )}
                      </ha-button>
                      ${
                        folderActions
                          ? html`<ha-button
                              appearance="filled"
                              .disabled=${this._busy}
                              @click=${this._moveSelected}
                            >
                              <ha-svg-icon
                                .path=${mdiFolderMove}
                                slot="start"
                              ></ha-svg-icon>
                              ${this._localize(
                                "ui.components.media-browser.file_management.move"
                              )}
                            </ha-button>`
                          : nothing
                      }`
              }
              ${
                selectable.length
                  ? html`<ha-button
                      appearance="plain"
                      .disabled=${this._busy}
                      @click=${
                        this._selected.size === 0
                          ? this._handleSelectAll
                          : this._handleDeselectAll
                      }
                    >
                      <ha-svg-icon
                        .path=${
                          this._selected.size === 0
                            ? mdiCheckboxMarkedOutline
                            : mdiCheckboxBlankOutline
                        }
                        slot="start"
                      ></ha-svg-icon>
                      ${this._localize(
                        `ui.components.media-browser.file_management.${
                          this._selected.size === 0
                            ? "select_all"
                            : "deselect_all"
                        }`
                      )}
                    </ha-button>`
                  : nothing
              }
            </div>`
          : nothing
      }
      ${
        !this._currentItem || this._loading
          ? html`<div class="refresh"><ha-spinner></ha-spinner></div>`
          : !children.length
            ? html`<div class="no-items">
                <p>
                  ${this._localize(
                    "ui.components.media-browser.file_management.no_items"
                  )}
                </p>
              </div>`
            : html`<div class="list" role="list">
                ${repeat(
                  children,
                  (item) => item.media_content_id,
                  (item) => this._renderRow(item)
                )}
              </div>`
      }
    `;
  }

  private _renderRow(item: MediaPlayerItem): TemplateResult {
    const canChange = this._canChange(item);
    const selected = this._selected.has(item.media_content_id);
    const icon = item.can_expand
      ? mdiFolder
      : MediaClassBrowserSettings[item.media_class].icon;

    return html`
      <div class="row" role="listitem">
        ${
          canChange
            ? html`<ha-checkbox
                class="check"
                .checked=${selected}
                .disabled=${this._busy}
                .ariaLabel=${item.title}
                .item=${item}
                @change=${this._checkboxChanged}
              ></ha-checkbox>`
            : html`<span class="check"></span>`
        }
        <button
          class="entry"
          type="button"
          .disabled=${this._busy}
          .item=${item}
          @click=${this._entryClicked}
        >
          <ha-svg-icon .path=${icon}></ha-svg-icon>
          <span class="name">${item.title}</span>
          ${
            item.can_expand
              ? html`<span class="kind"
                  >${this._localize(
                    "ui.components.media-browser.file_management.folder"
                  )}</span
                >`
              : nothing
          }
        </button>
        ${
          this._canManageFolders
            ? html`<ha-dropdown
                .item=${item}
                @wa-select=${this._handleRowAction}
              >
                <ha-icon-button
                  slot="trigger"
                  .disabled=${this._busy}
                  .path=${mdiDotsVertical}
                  .label=${this._localize(
                    "ui.components.media-browser.file_management.actions",
                    { name: item.title }
                  )}
                ></ha-icon-button>
                <ha-dropdown-item value="rename">
                  <ha-svg-icon .path=${mdiRenameBox} slot="icon"></ha-svg-icon>
                  ${this._localize(
                    "ui.components.media-browser.file_management.rename"
                  )}
                </ha-dropdown-item>
                <ha-dropdown-item value="move">
                  <ha-svg-icon .path=${mdiFolderMove} slot="icon"></ha-svg-icon>
                  ${this._localize(
                    "ui.components.media-browser.file_management.move"
                  )}
                </ha-dropdown-item>
                <ha-dropdown-item value="delete" variant="danger">
                  <ha-svg-icon .path=${mdiDelete} slot="icon"></ha-svg-icon>
                  ${this._localize(
                    "ui.components.media-browser.file_management.delete_item"
                  )}
                </ha-dropdown-item>
              </ha-dropdown>`
            : nothing
        }
      </div>
    `;
  }

  private _renderPicker(): TemplateResult {
    const moving = this._moving!;
    const movingIds = new Set(moving.map((item) => item.media_content_id));
    const sourceId = this._sourceRootId();
    const folders = (this._pickerItem?.children || []).filter(
      (item) => item.can_expand && !movingIds.has(item.media_content_id)
    );
    const here = normalizeMediaFolderId(this._pickerId);
    const alreadyHere = moving.every(
      (item) =>
        normalizeMediaFolderId(item.media_content_id).replace(
          /\/[^/]*$/,
          ""
        ) === here
    );
    const insideMoved = [...movingIds].some(
      (id) => here === id || here.startsWith(`${id}/`)
    );

    return html`
      <p class="picker-text">
        ${this._localize(
          "ui.components.media-browser.file_management.move_to",
          { count: moving.length }
        )}
      </p>
      ${this._renderBreadcrumbs(
        sourceId,
        this._pickerId,
        sourceId.slice(SOURCE_PREFIX.length)
      )}
      ${
        !this._pickerItem || this._loading
          ? html`<div class="refresh"><ha-spinner></ha-spinner></div>`
          : folders.length
            ? html`<div class="list" role="list">
                ${folders.map(
                  (item) =>
                    html`<div class="row" role="listitem">
                      <button
                        class="entry"
                        type="button"
                        .item=${item}
                        @click=${this._pickerEntryClicked}
                      >
                        <ha-svg-icon .path=${mdiFolder}></ha-svg-icon>
                        <span class="name">${item.title}</span>
                      </button>
                    </div>`
                )}
              </div>`
            : html`<div class="no-items">
                <p>
                  ${this._localize(
                    "ui.components.media-browser.file_management.no_folders"
                  )}
                </p>
              </div>`
      }
      <div class="actions">
        <ha-button
          .disabled=${
            this._working || this._loading || alreadyHere || insideMoved
          }
          @click=${this._confirmMove}
        >
          <ha-svg-icon .path=${mdiFolderMove} slot="start"></ha-svg-icon>
          ${this._localize(
            "ui.components.media-browser.file_management.move_here"
          )}
        </ha-button>
        <ha-button
          appearance="plain"
          .disabled=${this._working}
          @click=${this._cancelMove}
        >
          ${this._localize("ui.common.cancel")}
        </ha-button>
      </div>
    `;
  }

  // The media directory the open folder belongs to, e.g. media-source://media_source/local
  private _sourceRootId(): string {
    const id = normalizeMediaFolderId(this._folderId);
    const dir = id.slice(SOURCE_PREFIX.length).split("/")[0];
    return `${SOURCE_PREFIX}${dir}`;
  }

  private _crumbClicked(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id!;
    if (this._moving) {
      this._browsePicker(id);
    } else {
      this._navigate(id);
    }
  }

  private _checkboxChanged(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement & {
      item: MediaPlayerItem;
    };
    this._toggle(target.item, target.checked);
  }

  private _entryClicked(ev: Event) {
    const item = (ev.currentTarget as any).item as MediaPlayerItem;
    if (item.can_expand) {
      this._navigate(item.media_content_id);
    } else if (this._canChange(item)) {
      this._toggle(item, !this._selected.has(item.media_content_id));
    }
  }

  private _pickerEntryClicked(ev: Event) {
    const item = (ev.currentTarget as any).item as MediaPlayerItem;
    this._browsePicker(item.media_content_id);
  }

  private _toggle(item: MediaPlayerItem, selected: boolean) {
    const next = new Set(this._selected);
    if (selected) {
      next.add(item.media_content_id);
    } else {
      next.delete(item.media_content_id);
    }
    this._selected = next;
  }

  private _startUploading() {
    this._uploading = true;
  }

  private _doneUploading() {
    this._uploading = false;
    this._changed();
    this._refreshMedia();
  }

  private _handleDeselectAll() {
    this._selected = new Set();
  }

  private _handleSelectAll() {
    this._selected = new Set(
      (this._currentItem?.children || [])
        .filter((item) => this._canChange(item))
        .map((item) => item.media_content_id)
    );
  }

  private _selectedItems(): MediaPlayerItem[] {
    return (this._currentItem?.children || []).filter((item) =>
      this._selected.has(item.media_content_id)
    );
  }

  // Lets the Media page behind the dialog show what changed
  private _changed() {
    this._params?.onClose?.();
  }

  private _errorText(err: any): string {
    const code = err?.code;
    if (FOLDER_ERROR_CODES.includes(code)) {
      return this._localize(
        `ui.components.media-browser.file_management.error_${code}` as any
      );
    }
    if (typeof code === "string") {
      // A server answer this dialog does not know: its text may name a path
      return this._localize(
        "ui.components.media-browser.file_management.error_unknown"
      );
    }
    return err?.message || this._localize("ui.common.unknown_error");
  }

  private _showFailure(key: "action_failed" | "upload_failed", err: unknown) {
    showAlertDialog(this, {
      text: this._localize(
        `ui.components.media-browser.file_management.${key}`,
        { reason: this._errorText(err) }
      ),
    });
  }

  private async _navigate(id: string) {
    if (this._busy) {
      return;
    }
    this._folderId = id;
    await this._refreshMedia();
  }

  private async _createFolder() {
    const name = await showPromptDialog(this, {
      title: this._localize(
        "ui.components.media-browser.file_management.new_folder"
      ),
      inputLabel: this._localize(
        "ui.components.media-browser.file_management.folder_name"
      ),
      confirmText: this._localize(
        "ui.components.media-browser.file_management.create"
      ),
    });
    if (name === null || name === undefined) {
      return;
    }
    if (!isValidMediaName(name)) {
      this._showFailure("action_failed", { code: "invalid_name" });
      return;
    }
    await this._run(() =>
      createLocalMediaFolder(
        this._api.callWS,
        normalizeMediaFolderId(this._folderId),
        name
      )
    );
  }

  private async _rename(item: MediaPlayerItem) {
    const name = await showPromptDialog(this, {
      title: this._localize(
        "ui.components.media-browser.file_management.rename"
      ),
      inputLabel: this._localize(
        "ui.components.media-browser.file_management.new_name"
      ),
      defaultValue: item.title,
      confirmText: this._localize(
        "ui.components.media-browser.file_management.rename"
      ),
    });
    if (name === null || name === undefined || name === item.title) {
      return;
    }
    if (!isValidMediaName(name)) {
      this._showFailure("action_failed", { code: "invalid_name" });
      return;
    }
    await this._run(() =>
      renameLocalMedia(this._api.callWS, item.media_content_id, name)
    );
  }

  private _handleRowAction(ev: HaDropdownSelectEvent) {
    const item = (ev.currentTarget as any).item as MediaPlayerItem;
    switch (ev.detail.item.value) {
      case "rename":
        this._rename(item);
        break;
      case "move":
        this._startMove([item]);
        break;
      case "delete":
        this._delete([item]);
        break;
    }
  }

  private _moveSelected() {
    this._startMove(this._selectedItems());
  }

  private _startMove(items: MediaPlayerItem[]) {
    if (!items.length) {
      return;
    }
    this._moving = items;
    this._browsePicker(normalizeMediaFolderId(this._folderId));
  }

  private _cancelMove() {
    this._moving = undefined;
    this._pickerItem = undefined;
  }

  private async _browsePicker(id: string) {
    this._pickerId = id;
    this._loading = true;
    try {
      this._pickerItem = await browseLocalMediaPlayer(this._api.callWS, id);
      this._pickerId = this._pickerItem.media_content_id;
    } catch (err: any) {
      this._moving = undefined;
      this._showFailure("action_failed", err);
    } finally {
      this._loading = false;
    }
  }

  private async _confirmMove() {
    const moving = this._moving;
    if (!moving) {
      return;
    }
    const destination = normalizeMediaFolderId(this._pickerId);
    this._moving = undefined;
    this._pickerItem = undefined;
    let moved = 0;
    await this._run(
      async () => {
        for (const item of moving) {
          // eslint-disable-next-line no-await-in-loop
          await moveLocalMedia(
            this._api.callWS,
            item.media_content_id,
            destination
          );
          moved++;
        }
      },
      (err) => {
        if (moved === 0) {
          this._showFailure("action_failed", err);
          return;
        }
        showAlertDialog(this, {
          text: this._localize(
            "ui.components.media-browser.file_management.partly_moved",
            {
              moved,
              total: moving.length,
              reason: this._errorText(err),
            }
          ),
        });
      }
    );
  }

  private _deleteSelected() {
    this._delete(this._selectedItems());
  }

  private async _delete(items: MediaPlayerItem[]) {
    if (!items.length || this._busy) {
      return;
    }
    const folders = items.filter((item) => item.can_expand);
    let held = { files: 0, folders: 0 };
    let heldFolders = 0;
    // What the person is told each folder holds; the delete is held to it
    const confirmedCounts = new Map<string, MediaFolderCounts>();

    if (folders.length) {
      this._working = true;
      try {
        const counts = await Promise.all(
          folders.map((item) =>
            getLocalMediaFolderCounts(this._api.callWS, item.media_content_id)
          )
        );
        for (const [index, count] of counts.entries()) {
          confirmedCounts.set(folders[index].media_content_id, count);
          if (count.files || count.folders) {
            heldFolders++;
          }
          held = {
            files: held.files + count.files,
            folders: held.folders + count.folders,
          };
        }
      } catch (err) {
        this._showFailure("action_failed", err);
        return;
      } finally {
        this._working = false;
      }
    }

    const hasContents = heldFolders > 0;
    this._confirming = true;
    let confirmed: boolean;
    try {
      confirmed = await this._confirmDelete(items, hasContents, {
        heldFolders,
        held,
      });
    } finally {
      this._confirming = false;
    }
    if (!confirmed) {
      return;
    }

    await this._run(async () => {
      await Promise.all(
        items.map(async (item) => {
          if (item.can_expand) {
            const counts = confirmedCounts.get(item.media_content_id)!;
            const hasInside = counts.files > 0 || counts.folders > 0;
            await removeLocalMediaFolder(
              this._api.callWS,
              item.media_content_id,
              hasInside,
              counts
            );
          } else if (isLocalMediaSourceContentId(item.media_content_id)) {
            await removeLocalMedia(this._api.callWS, item.media_content_id);
          } else if (isImageUploadMediaSourceContentId(item.media_content_id)) {
            const mediaId = getIdFromUrl(item.media_content_id);
            if (mediaId) {
              await deleteImage(this._api.callWS, mediaId);
            }
          }
        })
      );
    });
  }

  private _confirmDelete(
    items: MediaPlayerItem[],
    hasContents: boolean,
    summary: { heldFolders: number; held: MediaFolderCounts }
  ): Promise<boolean> {
    const { heldFolders, held } = summary;
    return showConfirmationDialog(this, {
      text: hasContents
        ? this._localize(
            "ui.components.media-browser.file_management.confirm_delete_contents",
            {
              count: items.length,
              nonempty: heldFolders,
              files: held.files,
              subfolders: held.folders,
            }
          )
        : this._localize(
            "ui.components.media-browser.file_management.confirm_delete_items",
            { count: items.length }
          ),
      warning: true,
      destructive: hasContents,
      // The same strength for one non-empty folder and for several items
      confirmName: hasContents
        ? items.length === 1
          ? items[0].title
          : String(items.length)
        : undefined,
    });
  }

  // Runs one change, then shows the result in the list and on the Media page
  private async _run(
    action: () => Promise<unknown>,
    onFailure?: (err: unknown) => void
  ) {
    this._working = true;
    try {
      await action();
    } catch (err) {
      if (onFailure) {
        onFailure(err);
      } else {
        this._showFailure("action_failed", err);
      }
    } finally {
      this._working = false;
    }
    this._changed();
    await this._refreshMedia();
  }

  private async _refreshMedia() {
    if (!this._params) {
      return;
    }
    this._selected = new Set();
    this._loading = true;
    try {
      const item = await browseLocalMediaPlayer(
        this._api.callWS,
        this._folderId
      );
      this._currentItem = item;
      this._folderId = item.media_content_id || this._folderId;
    } catch (err: any) {
      if (this._currentItem) {
        this._showFailure("action_failed", err);
        // Back to the last folder that could be read
        this._folderId = this._currentItem.media_content_id;
      } else {
        this._showFailure("action_failed", err);
        this.closeDialog();
      }
    } finally {
      this._loading = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        ha-dialog {
          --dialog-content-padding: 0;
        }

        ha-tip {
          margin: 16px;
        }

        .refresh {
          display: flex;
          height: 200px;
          justify-content: center;
          align-items: center;
        }
        .no-items {
          text-align: center;
          padding: 16px;
        }
        .title {
          font: inherit;
          font-size: inherit;
          margin: inherit;
        }
        .picker-text {
          margin: 16px 16px 0;
        }

        .crumbs {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 2px;
          padding: 8px 12px 0;
        }
        .crumb {
          min-height: 44px;
          padding: 0 8px;
          border: 0;
          border-radius: var(--ha-border-radius-md, 8px);
          background: none;
          color: var(--primary-color);
          font: inherit;
          cursor: pointer;
          overflow-wrap: anywhere;
        }
        .crumb.current {
          display: inline-flex;
          align-items: center;
          color: var(--primary-text-color);
          cursor: default;
        }
        .crumb:disabled {
          cursor: default;
          color: var(--secondary-text-color);
        }
        .separator {
          --mdc-icon-size: 20px;
          color: var(--secondary-text-color);
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
        }
        .actions ha-button,
        .actions ha-media-upload-button {
          --ha-button-height: 44px;
          --button-height: 44px;
        }

        .list {
          display: flex;
          flex-direction: column;
          padding: 0 8px 8px;
        }
        .row {
          display: flex;
          align-items: center;
          min-height: 48px;
          gap: 4px;
        }
        .check {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          min-height: 44px;
        }
        .entry {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 44px;
          padding: 0 8px;
          border: 0;
          border-radius: var(--ha-border-radius-md, 8px);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .entry:hover:not(:disabled) {
          background: var(--secondary-background-color);
        }
        .entry:disabled {
          cursor: default;
          color: var(--secondary-text-color);
        }
        .entry ha-svg-icon {
          flex: none;
          color: var(--secondary-text-color);
        }
        .name {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .kind {
          flex: none;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s, 0.85em);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-media-manage": DialogMediaManage;
  }
}
