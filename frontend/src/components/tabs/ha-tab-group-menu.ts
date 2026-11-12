import {
  mdiArrowCollapseLeft,
  mdiArrowCollapseRight,
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiChevronUp,
  mdiClose,
  mdiFolderRemoveOutline,
  mdiLock,
  mdiLockOpenVariantOutline,
  mdiPalette,
  mdiRenameBox,
  mdiTabRemove,
  mdiUngroup,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, query, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import {
  lockAgain,
  isUnlocked,
  setLockLocalize,
} from "../../common/locks/element-lock-session";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import {
  readGroups,
  setGroupCollapsed,
  writeGroups,
} from "../../common/tabs/tab-groups";
import { groupLockKey } from "../../common/tabs/tab-locks";
import { isVerticalDock, readDock } from "../../common/tabs/tab-dock";
import "../ha-svg-icon";
import {
  closeTabs,
  groupPlanTabs,
  lockedAmong,
  moveGroup,
  planGroupClose,
  removeGroupKeepingTabs,
} from "./tab-group-actions";
import type { GroupMove } from "./tab-group-actions";
import { TabGroupPanel } from "./tab-group-panel";
import { readStripState } from "./tab-group-state";

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-group-menu": HaTabGroupMenu;
  }
}

interface MenuEntry {
  id: string;
  label: string;
  iconPath: string;
  run: () => void;
  disabled?: boolean;
  note?: string;
  destructive?: boolean;
  /** A line above this entry, to set groups of entries apart. */
  divider?: boolean;
}

/**
 * @element ha-tab-group-menu
 *
 * @summary
 * The menu of a group header. The strip asks for it with the window event
 * `tab-group-context-menu` (`{ groupId, anchor, shift, surface }`): right
 * click, the context menu key or Shift+F10 on a header, or a long press. With
 * `shift` set it opens the group editor directly instead. Entries: Rename,
 * Edit group appearance, Collapse or Expand, Move group left, right, to the
 * start or to the end (worded for the strip's direction and dock), Ungroup,
 * Close the group's tabs (with a preview of what closes and what is protected),
 * Lock or Unlock group, and Remove group. Ungroup and Remove group both keep
 * the tabs open; closing tabs is its own entry. The menu is anchored to the
 * header, reachable by keyboard (arrow keys, Home, End, Enter, Escape) and
 * gives focus back to the header.
 */
@customElement("ha-tab-group-menu")
export class HaTabGroupMenu extends TabGroupPanel {
  protected readonly openEvent = "tab-group-context-menu";

  @query("[role=menuitem]:not([disabled])")
  private _firstItem?: HTMLElement;

  @query("#confirm-close") private _confirmButton?: HTMLElement;

  @queryAll("[role=menuitem]:not([disabled])")
  private _itemElements!: NodeListOf<HTMLButtonElement>;

  @state() private _groupId = "";

  @state() private _view: "menu" | "close" = "menu";

  // The shift flag sends the press straight to the editor, no menu.
  protected _beforeOpen(detail: {
    groupId?: string;
    anchor: HTMLElement;
    shift?: boolean;
  }): boolean {
    this._groupId = detail.groupId ?? "";
    this._view = "menu";
    if (detail.shift) {
      this._openEditor(this._groupId, detail.anchor, "appearance");
      return false;
    }
    return true;
  }

  protected _afterClose() {
    this._view = "menu";
  }

  protected _focusFirst() {
    this._firstItem?.focus();
  }

  private _openEditor(
    groupId: string,
    anchor: HTMLElement,
    focus: "name" | "appearance"
  ) {
    window.dispatchEvent(
      new CustomEvent("tab-group-editor-open", {
        detail: { groupId, anchor, surface: this.surface, focus },
      })
    );
  }

  private _entries(): { entries: MenuEntry[]; name: string } | undefined {
    const strip = readStripState(this.hass, this.surface);
    const group = strip.groups.find((item) => item.id === this._groupId);
    if (!group) {
      return undefined;
    }
    const key = groupLockKey(this.surface, group.id);
    const locked = readLocks().locked.includes(key);
    const unlocked = locked && isUnlocked(key);
    const lockedNow = locked && !unlocked;
    const lockNote = this._t("ui.page_tabs.groups.locked_note");
    const vertical = isVerticalDock(readDock(this.surface));
    const rtl = this._rtl;
    const move = (how: GroupMove) => () => {
      const moved = moveGroup(strip, group.id, how, vertical ? false : rtl);
      this.close(true);
      this._announceOutside(
        moved
          ? this._t("ui.page_tabs.groups.moved", { name: group.name })
          : this._t("ui.page_tabs.groups.cannot_move", { name: group.name })
      );
    };
    const entries: MenuEntry[] = [
      {
        id: "rename",
        label: this._t("ui.page_tabs.groups.rename"),
        iconPath: mdiRenameBox,
        run: () => this._edit("name"),
      },
      {
        id: "appearance",
        label: this._t("ui.page_tabs.groups.edit_appearance"),
        iconPath: mdiPalette,
        run: () => this._edit("appearance"),
      },
      {
        id: "collapse",
        label: this._t(
          group.collapsed
            ? "ui.page_tabs.groups.expand"
            : "ui.page_tabs.groups.collapse"
        ),
        iconPath: group.collapsed ? mdiChevronDown : mdiChevronUp,
        run: () => {
          writeGroups(
            this.surface,
            setGroupCollapsed(
              readGroups(this.surface),
              group.id,
              !group.collapsed
            )
          );
          this.close(true);
        },
      },
      {
        id: "move_left",
        divider: true,
        label: this._t(
          vertical
            ? "ui.page_tabs.groups.move_up"
            : "ui.page_tabs.groups.move_left"
        ),
        iconPath: vertical ? mdiChevronUp : mdiChevronLeft,
        run: move("left"),
      },
      {
        id: "move_right",
        label: this._t(
          vertical
            ? "ui.page_tabs.groups.move_down"
            : "ui.page_tabs.groups.move_right"
        ),
        iconPath: vertical ? mdiChevronDown : mdiChevronRight,
        run: move("right"),
      },
      {
        id: "move_start",
        label: this._t("ui.page_tabs.groups.move_start"),
        iconPath: mdiArrowCollapseLeft,
        run: move("start"),
      },
      {
        id: "move_end",
        label: this._t("ui.page_tabs.groups.move_end"),
        iconPath: mdiArrowCollapseRight,
        run: move("end"),
      },
      {
        id: "ungroup",
        divider: true,
        label: this._t("ui.page_tabs.groups.ungroup"),
        iconPath: mdiUngroup,
        note: lockedNow
          ? lockNote
          : this._t("ui.page_tabs.groups.ungroup_note"),
        disabled: lockedNow,
        run: () => this._remove(group.name, "ungrouped"),
      },
      {
        id: "close_tabs",
        label: this._t("ui.page_tabs.groups.close_tabs"),
        iconPath: mdiTabRemove,
        note: lockedNow ? lockNote : undefined,
        disabled: lockedNow,
        run: () => {
          this._view = "close";
          this.updateComplete.then(() => this._confirmButton?.focus());
        },
      },
      locked && !unlocked
        ? {
            id: "unlock",
            label: this._t("ui.page_tabs.groups.unlock"),
            iconPath: mdiLockOpenVariantOutline,
            run: () => this._unlock(key),
          }
        : unlocked
          ? {
              id: "lock_again",
              label: this._t("ui.page_tabs.groups.lock_again"),
              iconPath: mdiLock,
              run: () => {
                lockAgain(key);
                this.close(true);
              },
            }
          : {
              id: "lock",
              label: this._t("ui.page_tabs.groups.lock"),
              iconPath: mdiLock,
              run: () => this._lock(key, group.name),
            },
      {
        id: "remove",
        divider: true,
        label: this._t("ui.page_tabs.groups.remove"),
        iconPath: mdiFolderRemoveOutline,
        note: lockedNow ? lockNote : this._t("ui.page_tabs.groups.remove_note"),
        disabled: lockedNow,
        destructive: true,
        run: () => this._remove(group.name, "removed"),
      },
    ];
    return { entries, name: group.name };
  }

  private _edit(focus: "name" | "appearance") {
    const anchor = this._anchor;
    const groupId = this._groupId;
    this.close(false);
    if (anchor) {
      this._openEditor(groupId, anchor, focus);
    }
  }

  private _remove(name: string, what: "ungrouped" | "removed") {
    removeGroupKeepingTabs(this.surface, this._groupId);
    this.close(true);
    this._announceOutside(this._t(`ui.page_tabs.groups.${what}`, { name }));
  }

  private _lock(key: string, name: string) {
    const anchor = this._anchor;
    this.close(false);
    setLockLocalize(this.hass.localize);
    void import("../locks/ha-lock-wizard").then(({ openLockWizard }) =>
      openLockWizard({
        key,
        label: name || this._t("ui.page_tabs.groups.unnamed"),
        anchor,
        onStartDefault: false,
        onCreated: () =>
          this._announceOutside(
            this._t("ui.page_tabs.groups.locked", { name })
          ),
      })
    );
  }

  // The prompt asks for the group's own credentials; no credential is read or
  // stored here. When it succeeds the lock is taken away.
  private _unlock(key: string) {
    const anchor = this._anchor;
    this.close(false);
    setLockLocalize(this.hass.localize);
    void import("../locks/ha-lock-prompt").then(({ openLockPrompt }) =>
      openLockPrompt(key, anchor!, {
        grant: false,
        returnTo: anchor,
        onSuccess: () => writeLocks(withLock(readLocks(), key, false)),
      })
    );
  }

  /** Speaks a result after the menu is gone, so the message is not lost. */
  private _announceOutside(message: string) {
    this.dispatchEvent(
      new CustomEvent("tab-group-menu-done", {
        detail: { message, surface: this.surface },
        bubbles: true,
        composed: true,
      })
    );
    const live = document.createElement("div");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)";
    document.body.append(live);
    requestAnimationFrame(() => {
      live.textContent = message;
      window.setTimeout(() => live.remove(), 4000);
    });
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._open || !this.hass) {
      return nothing;
    }
    const built = this._entries();
    if (!built) {
      return nothing;
    }
    const sheet = this._narrow;
    return html`
      <div
        class=${classMap({ panel: true, sheet, bottom: sheet })}
        style=${styleMap(sheet ? {} : this._position)}
        role=${this._view === "menu" ? "menu" : "dialog"}
        aria-label=${this._t("ui.page_tabs.groups.menu_label", {
          name: built.name || this._t("ui.page_tabs.groups.unnamed"),
        })}
        @keydown=${this._panelKeydown}
      >
        ${
          this._view === "menu"
            ? html`
                <header>
                  <div class="titles">
                    <h2>
                      ${built.name || this._t("ui.page_tabs.groups.unnamed")}
                    </h2>
                  </div>
                  <button
                    class="close"
                    type="button"
                    aria-label=${this._t("ui.page_tabs.groups.close_menu")}
                    @click=${this._dismiss}
                  >
                    <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
                  </button>
                </header>
                <ul class="list" @keydown=${this._menuKeydown}>
                  ${built.entries.map(
                    (entry) =>
                      html`<li
                        role="none"
                        class=${classMap({ divider: Boolean(entry.divider) })}
                      >
                        <button
                          class=${classMap({
                            row: true,
                            destructive: Boolean(entry.destructive),
                          })}
                          role="menuitem"
                          type="button"
                          ?disabled=${entry.disabled}
                          @click=${entry.run}
                        >
                          <ha-svg-icon .path=${entry.iconPath}></ha-svg-icon>
                          <span class="grow">
                            ${entry.label}
                            ${
                              entry.note
                                ? html`<span class="sub">${entry.note}</span>`
                                : nothing
                            }
                          </span>
                        </button>
                      </li>`
                  )}
                </ul>
              `
            : this._renderClose()
        }
      </div>
    `;
  }

  private _renderClose() {
    const strip = readStripState(this.hass, this.surface);
    const locks = readLocks().locked;
    const members =
      strip.groups.find((g) => g.id === this._groupId)?.members ?? [];
    const plan = planGroupClose(
      groupPlanTabs(
        strip,
        this._groupId,
        this.hass.panelUrl,
        lockedAmong(strip, members, locks)
      )
    );
    const label = (id: string) =>
      strip.tabs.find((tab) => tab.id === id)?.label ?? id;
    return html`
      <header>
        <div class="titles">
          <h2>${this._t("ui.page_tabs.groups.close_title")}</h2>
          <p class="sub">${this._t("ui.page_tabs.groups.close_intro")}</p>
        </div>
      </header>
      <p class="preview-head" role="status">
        ${this._t("ui.page_tabs.groups.close_count", { count: plan.ids.length })}
      </p>
      <ul class="list">
        ${plan.ids.map((id) => html`<li class="preview">${label(id)}</li>`)}
      </ul>
      ${
        plan.protected.length
          ? html`<p class="preview-head">
                ${this._t("ui.page_tabs.groups.close_kept", {
                  count: plan.protected.length,
                })}
              </p>
              <ul class="list">
                ${plan.protected.map(
                  (item) =>
                    html`<li class="preview kept">
                      ${label(item.id)}
                      <span class="sub"
                        >${item.reasons
                          .map((reason) =>
                            this._t(`ui.page_tabs.groups.reason_${reason}`)
                          )
                          .join(", ")}</span
                      >
                    </li>`
                )}
              </ul>`
          : nothing
      }
      <div class="buttons">
        <button type="button" class="text" @click=${this._backToMenu}>
          ${this._t("ui.page_tabs.groups.back")}
        </button>
        <button
          id="confirm-close"
          type="button"
          class="primary"
          ?disabled=${!plan.ids.length}
          .ids=${plan.ids}
          @click=${this._confirmClose}
        >
          ${this._t("ui.page_tabs.groups.close_confirm", { count: plan.ids.length })}
        </button>
      </div>
    `;
  }

  private _backToMenu = () => {
    this._view = "menu";
    this.updateComplete.then(() => this._focusFirst());
  };

  private _confirmClose = (ev: Event) => {
    const ids = (ev.currentTarget as HTMLElement & { ids: string[] }).ids;
    closeTabs(this.surface, ids);
    this.close(true);
    this._announceOutside(
      this._t("ui.page_tabs.groups.closed", { count: ids.length })
    );
  };

  private _dismiss = () => this.close(true);

  private _menuKeydown = (ev: KeyboardEvent) => {
    const items = Array.from(this._itemElements);
    const at = items.indexOf(ev.target as HTMLButtonElement);
    let next: number | undefined;
    if (ev.key === "ArrowDown") {
      next = (at + 1) % items.length;
    } else if (ev.key === "ArrowUp") {
      next = (at - 1 + items.length) % items.length;
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = items.length - 1;
    }
    if (next !== undefined) {
      ev.preventDefault();
      items[next]?.focus();
    }
  };

  public static styles = [
    ...TabGroupPanel.panelStyles,
    css`
      .panel {
        display: grid;
      }
      .divider {
        border-top: 1px solid var(--divider-color);
        padding-top: var(--ha-space-1);
      }
      .sub {
        display: block;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .preview {
        padding: var(--ha-space-1) var(--ha-space-3);
        overflow-wrap: anywhere;
      }
      .preview.kept {
        color: var(--secondary-text-color);
      }
      .preview-head {
        margin: 0;
        font-weight: var(--ha-font-weight-medium);
      }
    `,
  ];
}
