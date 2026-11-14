import {
  mdiAlphaABoxOutline,
  mdiClose,
  mdiDotsVertical,
  mdiGrid,
  mdiListBoxOutline,
  mdiStarOutline,
  mdiDelete,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { transform } from "../../common/decorators/transform";
import { configContext } from "../../data/context";
import type { HomeAssistantConfig } from "../../types";
import {
  addRecentMedia,
  createMediaShortcut,
  emptyMediaShortcuts,
  mediaShortcutKey,
  mediaShortcutStorageKey,
  parseMediaShortcuts,
  saveMediaShortcuts,
  shortcutWithinRoot,
  toggleFavoriteMedia,
} from "../../common/media-browser/shortcuts";
import type {
  MediaShortcut,
  MediaShortcuts,
} from "../../common/media-browser/shortcuts";
import "../ha-bottom-sheet";
import "../ha-alert";
import { showToast } from "../../util/toast";
import {
  consumeEntityState,
  consumeLocalize,
} from "../../common/decorators/consume-context-entry";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomEvent,
} from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { stopPropagation } from "../../common/dom/stop_propagation";
import {
  mediaNavigationKey,
  mediaNavigationAncestor,
} from "../../common/media-browser/navigation";
import type { LocalizeFunc } from "../../common/translations/localize";
import type {
  MediaPickedEvent,
  MediaPlayerBrowseAction,
  MediaPlayerItem,
  MediaPlayerLayoutType,
} from "../../data/media-player";
import { haStyleDialog, haStyleDialogFixedTop } from "../../resources/styles";
import "../ha-dialog-header";
import "../ha-button";
import type { HaButton } from "../ha-button";
import "../ha-dropdown";
import type { HaDropdownSelectEvent } from "../ha-dropdown";
import "../ha-dropdown-item";
import "../ha-icon-button-arrow-prev";
import "../ha-dialog";
import "./ha-media-manage-button";
import "./ha-media-player-browse";
import type {
  HaMediaPlayerBrowse,
  MediaPlayerItemId,
} from "./ha-media-player-browse";
import type { MediaPlayerBrowseDialogParams } from "./show-media-browser-dialog";

@customElement("dialog-media-player-browse")
class DialogMediaPlayerBrowse extends LitElement {
  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  @state() private _currentItem?: MediaPlayerItem;

  @state()
  @consumeEntityState({ entityIdPath: ["_params", "entityId"] })
  private _destination?: HassEntity;

  @state() private _navigateIds?: MediaPlayerItemId[];

  @state() private _params?: MediaPlayerBrowseDialogParams;

  @state() _preferredLayout: MediaPlayerLayoutType = "auto";

  @state() private _open = false;

  @state() private _shortcuts: MediaShortcuts = emptyMediaShortcuts();

  @state() private _shortcutsOpen = false;

  @state() private _shortcutSaveFailed = false;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, string | undefined>({
    transformer: (value) =>
      value.user?.id
        ? mediaShortcutStorageKey(value.auth.data.hassUrl, value.user.id)
        : undefined,
  })
  private _shortcutOwner?: string;

  private _browseTitles = new Map<string, string>();

  @query("ha-media-player-browse") private _browser!: HaMediaPlayerBrowse;

  public showDialog(params: MediaPlayerBrowseDialogParams): void {
    this._browseTitles.clear();
    this._loadShortcuts();
    this._params = params;
    this._navigateIds = params.navigateIds || [
      {
        media_content_id: undefined,
        media_content_type: undefined,
      },
    ];
    this._open = true;
  }

  public closeDialog() {
    this._open = false;
    this._shortcutsOpen = false;
    this._shortcuts = emptyMediaShortcuts();
    this._params = undefined;
    this._navigateIds = undefined;
    this._currentItem = undefined;
    this._browseTitles.clear();
    this._preferredLayout = "auto";
    this.classList.remove("opened");
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("_shortcutOwner")) this._loadShortcuts();
  }

  protected render() {
    if (!this._params || !this._navigateIds) {
      return nothing;
    }

    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        flexcontent
        @closed=${this.closeDialog}
        @opened=${this._dialogOpened}
      >
        <ha-dialog-header show-border slot="header">
          ${
            this._navigateIds.length > (this._params.minimumNavigateLevel ?? 1)
              ? html`
                  <ha-icon-button-arrow-prev
                    slot="navigationIcon"
                    @click=${this._goBack}
                  ></ha-icon-button-arrow-prev>
                `
              : nothing
          }
          <span slot="title">
            ${
              !this._currentItem
                ? this._localize(
                    "ui.components.media-browser.media-player-browser"
                  )
                : this._currentItem.title
            }
          </span>
          ${
            this._shortcutOwner
              ? html`<ha-icon-button
                  slot="actionItems"
                  .path=${mdiStarOutline}
                  .label=${this._localize("ui.components.media-browser.shortcuts.title")}
                  @click=${this._openShortcuts}
                ></ha-icon-button>`
              : nothing
          }
          <ha-media-manage-button
            slot="actionItems"
            .currentItem=${this._currentItem}
            @media-refresh=${this._refreshMedia}
          ></ha-media-manage-button>
          <ha-dropdown
            slot="actionItems"
            @wa-select=${this._handleMenuAction}
            @closed=${stopPropagation}
          >
            <ha-icon-button
              slot="trigger"
              .label=${this._localize("ui.common.menu")}
              .path=${mdiDotsVertical}
            ></ha-icon-button>
            <ha-dropdown-item value="auto">
              <ha-svg-icon
                class=${
                  this._preferredLayout === "auto" ? "selected_menu_item" : ""
                }
                slot="icon"
                .path=${mdiAlphaABoxOutline}
              ></ha-svg-icon>
              ${this._localize("ui.components.media-browser.auto")}
            </ha-dropdown-item>
            <ha-dropdown-item value="grid">
              <ha-svg-icon
                class=${
                  this._preferredLayout === "grid" ? "selected_menu_item" : ""
                }
                slot="icon"
                .path=${mdiGrid}
              ></ha-svg-icon>
              ${this._localize("ui.components.media-browser.grid")}
            </ha-dropdown-item>
            <ha-dropdown-item value="list">
              <ha-svg-icon
                slot="icon"
                class=${
                  this._preferredLayout === "list" ? "selected_menu_item" : ""
                }
                .path=${mdiListBoxOutline}
              ></ha-svg-icon>
              ${this._localize("ui.components.media-browser.list")}
            </ha-dropdown-item>
          </ha-dropdown>
          <ha-icon-button
            .label=${this._localize("ui.common.close")}
            .path=${mdiClose}
            data-dialog="close"
            slot="actionItems"
          ></ha-icon-button>
          <p class="media-mode">
            ${
              this._action === "pick"
                ? this._localize("ui.components.media-browser.selection_mode")
                : this._localize("ui.components.media-browser.playback_mode", {
                    player:
                      this._destination?.attributes.friendly_name ||
                      (this._params.entityId &&
                      this._params.entityId !== "browser"
                        ? this._params.entityId
                        : this._localize(
                            "ui.components.media-browser.web-browser"
                          )),
                  })
            }
          </p>
        </ha-dialog-header>
        <nav
          class="browse-path"
          aria-label=${this._localize("ui.components.media-browser.breadcrumbs")}
        >
          ${this._navigateIds.map((item, index) =>
            index < (this._params!.minimumNavigateLevel ?? 1) - 1
              ? nothing
              : html`<ha-button
                  appearance="plain"
                  size="s"
                  .value=${String(index)}
                  .disabled=${index === this._navigateIds!.length - 1}
                  aria-current=${
                    index === this._navigateIds!.length - 1
                      ? "location"
                      : "false"
                  }
                  @click=${this._navigateToBreadcrumb}
                >
                  ${
                    this._browseTitles.get(mediaNavigationKey(item)) ||
                    (index === 0
                      ? this._localize(
                          "ui.components.media-browser.media-player-browser"
                        )
                      : this._localize(
                          "ui.components.media-browser.location_level",
                          {
                            level: index + 1,
                          }
                        ))
                  }
                </ha-button>`
          )}
        </nav>
        <ha-media-player-browse
          dialog
          .entityId=${this._params.entityId}
          .favoriteKeys=${this._shortcutOwner ? this._shortcuts.favorites.map(mediaShortcutKey) : undefined}
          @media-favorite-toggle=${this._toggleFavorite}
          .navigateIds=${this._navigateIds}
          .action=${this._action}
          .preferredLayout=${this._preferredLayout}
          .accept=${this._params.accept}
          .defaultId=${this._params.defaultId}
          .defaultType=${this._params.defaultType}
          .hideContentType=${this._params.hideContentType ?? false}
          .contentIdHelper=${this._params.contentIdHelper}
          @close-dialog=${this.closeDialog}
          @media-picked=${this._mediaPicked}
          @media-browsed=${this._mediaBrowsed}
        ></ha-media-player-browse>
        ${this._renderShortcuts()}
      </ha-dialog>
    `;
  }

  private _dialogOpened() {
    this.classList.add("opened");
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;
    switch (action) {
      case "auto":
        this._preferredLayout = "auto";
        break;
      case "grid":
        this._preferredLayout = "grid";
        break;
      case "list":
        this._preferredLayout = "list";
        break;
    }
  }

  private _goBack() {
    this._navigateIds = this._navigateIds?.slice(0, -1);
    this._currentItem = undefined;
  }

  private _navigateToBreadcrumb(ev: HASSDomCurrentTargetEvent<HaButton>) {
    if (!this._navigateIds) return;
    const next = mediaNavigationAncestor(
      this._navigateIds,
      Number(ev.currentTarget.value),
      this._params?.minimumNavigateLevel ?? 1
    );
    if (next === this._navigateIds) return;
    this._navigateIds = next;
    this._currentItem = undefined;
  }

  private _mediaBrowsed(ev: { detail: HASSDomEvents["media-browsed"] }) {
    this._navigateIds = ev.detail.ids;
    this._currentItem = ev.detail.current;
    if (ev.detail.current && ev.detail.ids.length) {
      this._browseTitles.set(
        mediaNavigationKey(ev.detail.ids[ev.detail.ids.length - 1]),
        ev.detail.current.title
      );
    }
  }

  private _mediaPicked(ev: HASSDomEvent<MediaPickedEvent>): void {
    const entry = createMediaShortcut(
      ev.detail.item,
      ev.detail.navigateIds,
      this._params?.entityId
    );
    if (entry) this._changeShortcuts((data) => addRecentMedia(data, entry));
    this._params!.mediaPickedCallback(ev.detail);
    if (this._action !== "play") {
      this.closeDialog();
    }
  }

  private _loadShortcuts() {
    this._shortcuts = emptyMediaShortcuts();
    this._shortcutSaveFailed = false;
    if (!this._shortcutOwner) return;
    try {
      this._shortcuts = parseMediaShortcuts(
        localStorage.getItem(this._shortcutOwner)
      );
    } catch {
      this._shortcutSaveFailed = true;
    }
  }

  private _changeShortcuts(change: (data: MediaShortcuts) => MediaShortcuts) {
    if (!this._shortcutOwner) return;
    try {
      // Read before changing so another picker in this browser is not overwritten.
      const data = parseMediaShortcuts(
        localStorage.getItem(this._shortcutOwner)
      );
      const next = change(data);
      if (!saveMediaShortcuts(localStorage, this._shortcutOwner, next)) {
        throw new Error("Media shortcut storage unavailable or full");
      }
      this._shortcuts = next;
      this._shortcutSaveFailed = false;
    } catch {
      this._shortcutSaveFailed = true;
      showToast(this, {
        message: this._localize(
          "ui.components.media-browser.shortcuts.storage_failed"
        ),
      });
    }
  }

  private _toggleFavorite(ev: HASSDomEvent<MediaPickedEvent>) {
    ev.stopPropagation();
    const entry = createMediaShortcut(
      ev.detail.item,
      ev.detail.navigateIds,
      this._params?.entityId
    );
    if (entry) {
      this._changeShortcuts((data) => toggleFavoriteMedia(data, entry));
    }
  }

  private _openShortcuts() {
    this._loadShortcuts();
    this._shortcutsOpen = true;
  }

  private _openShortcut(entry: MediaShortcut) {
    if (!this._shortcutAllowed(entry)) return;
    // Navigate only. Never replay cached playback capabilities or a saved URL.
    this._navigateIds = entry.parent.map((id) => ({ ...id }));
    this._currentItem = undefined;
    this._shortcutsOpen = false;
  }

  private _shortcutAllowed(entry: MediaShortcut): boolean {
    const minimum = this._params?.minimumNavigateLevel ?? 1;
    const root = (this._params?.navigateIds || [{}]).slice(0, minimum);
    return shortcutWithinRoot(entry, this._params?.entityId, root);
  }

  private _shortcutClicked(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const key = ev.currentTarget.dataset.shortcut;
    const entry = [
      ...this._shortcuts.favorites,
      ...this._shortcuts.recents,
    ].find((candidate) => mediaShortcutKey(candidate) === key);
    if (entry) this._openShortcut(entry);
  }

  private _favoriteRemoved(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const key = ev.currentTarget.dataset.shortcut;
    this._changeShortcuts((data) => ({
      ...data,
      favorites: data.favorites.filter(
        (entry) => mediaShortcutKey(entry) !== key
      ),
    }));
  }

  private _closeShortcuts(ev: Event) {
    ev.stopPropagation();
    this._shortcutsOpen = false;
  }

  private _clearRecents() {
    this._changeShortcuts((data) => ({ ...data, recents: [] }));
  }

  private _renderShortcuts() {
    const renderEntries = (entries: MediaShortcut[], favorite: boolean) => {
      const visible = entries.filter((entry) => this._shortcutAllowed(entry));
      return visible.length
        ? visible.map(
            (entry) =>
              html`<div class="shortcut-row">
                <ha-button
                  appearance="plain"
                  data-shortcut=${mediaShortcutKey(entry)}
                  @click=${this._shortcutClicked}
                  >${entry.title}</ha-button
                >
                ${
                  favorite
                    ? html`<ha-icon-button
                        .path=${mdiDelete}
                        .label=${this._localize("ui.components.media-browser.shortcuts.remove_favorite", { name: entry.title })}
                        data-shortcut=${mediaShortcutKey(entry)}
                        @click=${this._favoriteRemoved}
                      ></ha-icon-button>`
                    : nothing
                }
              </div>`
          )
        : html`<p>
            ${this._localize("ui.components.media-browser.shortcuts.empty")}
          </p>`;
    };
    return html`<ha-bottom-sheet
      .ariaLabelledBy=${"media-shortcuts-heading"}
      .open=${this._shortcutsOpen}
      @closed=${this._closeShortcuts}
    >
      <section
        class="shortcuts"
        aria-label=${this._localize("ui.components.media-browser.shortcuts.title")}
      >
        <h2 id="media-shortcuts-heading">
          ${this._localize("ui.components.media-browser.shortcuts.title")}
        </h2>
        <p>
          ${this._localize("ui.components.media-browser.shortcuts.explanation")}
        </p>
        ${this._shortcutSaveFailed ? html`<ha-alert alert-type="warning">${this._localize("ui.components.media-browser.shortcuts.storage_failed")}</ha-alert>` : nothing}
        <h3>
          ${this._localize("ui.components.media-browser.shortcuts.favorites")}
        </h3>
        ${renderEntries(this._shortcuts.favorites, true)}
        <h3>
          ${this._localize("ui.components.media-browser.shortcuts.recents")}
        </h3>
        ${renderEntries(this._shortcuts.recents, false)}
        <ha-button
          appearance="plain"
          .disabled=${!this._shortcuts.recents.length}
          @click=${this._clearRecents}
        >
          ${this._localize("ui.components.media-browser.shortcuts.clear_recents")}
        </ha-button>
        <ha-button appearance="plain" @click=${this._closeShortcuts}
          >${this._localize("ui.common.close")}</ha-button
        >
      </section>
    </ha-bottom-sheet>`;
  }

  private get _action(): MediaPlayerBrowseAction {
    return this._params!.action || "play";
  }

  private _refreshMedia() {
    this._browser.refresh();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      haStyleDialogFixedTop,
      css`
        ha-dialog {
          --dialog-content-padding: 0;
        }

        .media-mode {
          margin: 0;
          padding: var(--ha-space-2) var(--ha-space-4);
          border-top: 1px solid var(--divider-color);
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }
        .shortcuts {
          padding: var(--ha-space-4);
          max-height: 70vh;
          overflow-y: auto;
        }
        .shortcut-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .shortcut-row ha-button {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .browse-path {
          display: flex;
          flex: 0 0 auto;
          gap: var(--ha-space-1);
          padding: var(--ha-space-1) var(--ha-space-4);
          overflow-x: auto;
          border-bottom: 1px solid var(--divider-color);
        }
        .browse-path ha-button {
          flex-shrink: 0;
        }
        ha-media-player-browse {
          --media-browser-max-height: calc(
            100vh - 157px - var(--safe-area-inset-y)
          );
          height: 100vh;
          height: 100dvh;
        }

        :host(.opened) ha-media-player-browse {
          height: calc(100vh - 157px - var(--safe-area-inset-y));
        }

        @media (min-width: 800px) {
          ha-dialog {
            --ha-dialog-max-width: 800px;
            --ha-dialog-max-height: calc(
              100vh - var(--ha-space-18) - var(--safe-area-inset-y)
            );
          }
          ha-media-player-browse {
            position: initial;
            --media-browser-max-height: calc(
              100vh - 237px - var(--safe-area-inset-y)
            );
          }
        }

        ha-dialog-header ha-media-manage-button {
          --mdc-theme-primary: var(--primary-text-color);
          margin: 6px;
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-media-player-browse": DialogMediaPlayerBrowse;
  }
}
