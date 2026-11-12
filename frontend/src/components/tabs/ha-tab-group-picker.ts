import {
  mdiCheck,
  mdiClose,
  mdiFolderPlusOutline,
  mdiTabRemove,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, query, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { resolveThemeColor } from "../../common/color/compute-color";
import { regexQuery } from "../../common/regex/filter";
import { GROUP_COLOURS, cleanColour } from "../../common/tabs/tab-groups";
import type { GroupColour } from "../../common/tabs/tab-groups";
import { searchGroupNames } from "../../common/tabs/tab-search";
import "../ha-color-picker";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import { createGroupWithTabs, moveTabsToGroup } from "./tab-group-actions";
import { groupColourCss } from "./tab-group-appearance-store";
import { TabGroupPanel } from "./tab-group-panel";
import { readStripState } from "./tab-group-state";

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-group-picker": HaTabGroupPicker;
  }
}

/**
 * @element ha-tab-group-picker
 *
 * @summary
 * The anchored dialog behind the single Move into group entry. It opens beside
 * the tab it was opened from (the window event `tab-group-picker-open` with
 * `{ tabIds, anchor, surface, create? }`), lists the groups with name, colour
 * and member count, has its own search field with the pattern workbench, a
 * New group path (name, a colour from the palette or a custom colour) that
 * makes the group and moves the tabs in, and No group to take them out.
 * Arrow keys move between the search field and the rows, Enter chooses,
 * Escape cancels, and focus goes back to the tab either way. Pinned tabs
 * cannot join a group: the picker says so and moves only the others. On a
 * phone width it is a bottom sheet and every row is at least 44 px tall.
 * Changes go through the group model and its storage; the strip follows.
 */
@customElement("ha-tab-group-picker")
export class HaTabGroupPicker extends TabGroupPanel {
  protected readonly openEvent = "tab-group-picker-open";

  protected readonly panelWidth = 380;

  @query("#new-name") private _newName?: HaInput;

  @query("#picker-search") private _pickerSearch?: HaInputSearch;

  @queryAll(".list button.row:not([disabled])")
  private _rowElements!: NodeListOf<HTMLButtonElement>;

  @state() private _tabIds: string[] = [];

  @state() private _query = "";

  @state() private _creating = false;

  @state() private _name = "";

  @state() private _colour: GroupColour = "blue";

  @state() private _message = "";

  protected _beforeOpen(detail: { tabIds?: string[]; create?: boolean }) {
    this._tabIds = [...(detail.tabIds ?? [])];
    this._query = "";
    this._name = "";
    this._colour = "blue";
    this._message = "";
    this._creating = detail.create === true;
    return true;
  }

  protected _afterClose() {
    this._query = "";
    this._creating = false;
  }

  protected _focusFirst() {
    const target = this._creating ? this._newName : this._pickerSearch;
    this._focusWhenReady(target);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._open || !this.hass) {
      return nothing;
    }
    const strip = readStripState(this.hass, this.surface);
    const pinnedChosen = this._tabIds.filter((id) => strip.pinned.includes(id));
    const movable = this._tabIds.filter((id) => !strip.pinned.includes(id));
    const allPinned = this._tabIds.length > 0 && movable.length === 0;
    const result = searchGroupNames(strip.groups, this._query, (id) =>
      strip.openIds.includes(id)
    );
    const inGroup = (groupId: string) =>
      movable.length > 0 &&
      movable.every((id) =>
        strip.groups.find((group) => group.id === groupId)?.members.includes(id)
      );
    const anyGrouped = movable.some((id) =>
      strip.groups.some((group) => group.members.includes(id))
    );
    const labelOf = (id: string) =>
      strip.tabs.find((tab) => tab.id === id)?.label ?? id;
    const heading =
      this._tabIds.length === 1
        ? this._t("ui.page_tabs.group_picker.title_one", {
            name: labelOf(this._tabIds[0]),
          })
        : this._t("ui.page_tabs.group_picker.title", {
            count: this._tabIds.length,
          });
    const sheet = this._narrow;
    return html`
      <div
        class=${classMap({ panel: true, sheet, bottom: sheet })}
        style=${styleMap(sheet ? {} : this._position)}
        role="dialog"
        aria-label=${this._t("ui.page_tabs.group_picker.label")}
        @keydown=${this._panelKeydown}
      >
        <header>
          <div class="titles">
            <h2>${heading}</h2>
          </div>
          <button
            class="close"
            type="button"
            aria-label=${this._t("ui.page_tabs.group_picker.close")}
            @click=${this._cancel}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </header>
        ${
          pinnedChosen.length
            ? html`<p class="note callout" role="note">
                ${
                  allPinned
                    ? this._t("ui.page_tabs.group_picker.all_pinned")
                    : this._t("ui.page_tabs.group_picker.pinned_refused", {
                        count: pinnedChosen.length,
                      })
                }
              </p>`
            : nothing
        }
        ${
          this._creating
            ? this._renderCreate(allPinned)
            : html`
                <ha-input-search
                  id="picker-search"
                  appearance="outlined"
                  .value=${this._query}
                  .placeholder=${this._t("ui.page_tabs.group_picker.search")}
                  .accessibleLabel=${this._t(
                    "ui.page_tabs.group_picker.search"
                  )}
                  .patternSamples=${strip.groups.map((group) => group.name)}
                  @input=${this._queryChanged}
                  @keydown=${this._searchKeydown}
                ></ha-input-search>
                ${
                  result.invalid
                    ? html`<p class="note error">
                        ${this._t("ui.page_tabs.group_picker.invalid_pattern")}
                      </p>`
                    : nothing
                }
                <ul
                  class="list"
                  role="listbox"
                  aria-label=${this._t("ui.page_tabs.group_picker.groups")}
                  @keydown=${this._listKeydown}
                >
                  <li role="presentation">
                    <button
                      class="row"
                      role="option"
                      aria-selected="false"
                      type="button"
                      ?disabled=${!anyGrouped}
                      .groupId=${null}
                      @click=${this._choose}
                    >
                      <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
                      <span class="grow"
                        >${this._t("ui.page_tabs.group_picker.no_group")}</span
                      >
                    </button>
                  </li>
                  ${result.items.map(
                    (group) =>
                      html`<li role="presentation">
                        <button
                          class="row"
                          role="option"
                          type="button"
                          aria-selected=${inGroup(group.id) ? "true" : "false"}
                          ?disabled=${allPinned}
                          .groupId=${group.id}
                          @click=${this._choose}
                        >
                          <span
                            class="swatch"
                            aria-hidden="true"
                            style=${styleMap({
                              "background-color": groupColourCss(group.colour),
                            })}
                          ></span>
                          <span class="grow"
                            >${
                              group.name ||
                              this._t("ui.page_tabs.group_picker.unnamed")
                            }</span
                          >
                          <span class="count"
                            >${this._t("ui.page_tabs.group_picker.members", {
                              count: group.memberCount,
                            })}</span
                          >
                          ${
                            inGroup(group.id)
                              ? html`<ha-svg-icon
                                  .path=${mdiCheck}
                                ></ha-svg-icon>`
                              : nothing
                          }
                        </button>
                      </li>`
                  )}
                </ul>
                ${
                  !strip.groups.length
                    ? html`<p class="note">
                        ${this._t("ui.page_tabs.group_picker.no_groups")}
                      </p>`
                    : !result.items.length && !result.invalid
                      ? html`<p class="note">
                          ${this._t("ui.page_tabs.group_picker.no_match")}
                        </p>`
                      : nothing
                }
                <button
                  class="row new-group"
                  type="button"
                  ?disabled=${allPinned}
                  @click=${this._startCreate}
                >
                  <ha-svg-icon .path=${mdiFolderPlusOutline}></ha-svg-icon>
                  <span class="grow"
                    >${this._t("ui.page_tabs.group_picker.new_group")}</span
                  >
                </button>
              `
        }
        ${this._message ? html`<p class="note error" role="alert">${this._message}</p>` : nothing}
        <span class="live" role="status" aria-live="polite"></span>
      </div>
    `;
  }

  private _renderCreate(allPinned: boolean) {
    const custom = !(GROUP_COLOURS as readonly string[]).includes(this._colour);
    return html`
      <ha-input
        id="new-name"
        appearance="outlined"
        .label=${this._t("ui.page_tabs.group_picker.name")}
        .value=${this._name}
        .maxlength=${60}
        @input=${this._nameChanged}
        @keydown=${this._nameKeydown}
      ></ha-input>
      <div
        role="radiogroup"
        class="colours"
        aria-label=${this._t("ui.page_tabs.group_picker.colour")}
      >
        ${GROUP_COLOURS.map(
          (colour) =>
            html`<button
              type="button"
              class=${classMap({ colour: true, chosen: this._colour === colour })}
              role="radio"
              aria-checked=${this._colour === colour ? "true" : "false"}
              aria-label=${this._t(`ui.page_tabs.group_picker.colours.${colour}`)}
              .colour=${colour}
              style=${styleMap({ "background-color": groupColourCss(colour) })}
              @click=${this._pickColour}
            >
              ${
                this._colour === colour
                  ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
                  : nothing
              }
            </button>`
        )}
      </div>
      <ha-color-picker
        .label=${this._t("ui.page_tabs.group_picker.custom_colour")}
        .value=${custom ? this._colour : ""}
        @value-changed=${this._customColour}
      ></ha-color-picker>
      <div class="buttons">
        <button type="button" class="text" @click=${this._backToList}>
          ${this._t("ui.page_tabs.group_picker.back")}
        </button>
        <button
          type="button"
          class="primary"
          ?disabled=${allPinned || !this._name.trim()}
          @click=${this._create}
        >
          ${this._t("ui.page_tabs.group_picker.create")}
        </button>
      </div>
    `;
  }

  private _queryChanged = (ev: Event) => {
    this._query = (ev.target as HaInputSearch).value ?? "";
  };

  private _nameChanged = (ev: Event) => {
    this._name = (ev.target as HaInput).value ?? "";
  };

  private _nameKeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" && this._name.trim()) {
      ev.preventDefault();
      this._create();
    }
  };

  private _startCreate = () => {
    this._creating = true;
    this._message = "";
    this.updateComplete.then(() => this._focusFirst());
  };

  private _backToList = () => {
    this._creating = false;
    this._message = "";
    this.updateComplete.then(() => this._focusFirst());
  };

  private _pickColour = (ev: Event) => {
    this._colour = (
      ev.currentTarget as HTMLElement & { colour: GroupColour }
    ).colour;
  };

  // A custom colour must end up as a hex colour: the picker may give a theme
  // colour name, which is looked up in the current theme.
  private _customColour = (ev: CustomEvent<{ value?: string }>) => {
    ev.stopPropagation();
    const value = ev.detail.value?.trim();
    if (!value) {
      return;
    }
    const direct = cleanColour(value);
    const resolved = direct ?? cleanColour(resolveThemeColor(value));
    if (resolved) {
      this._colour = resolved;
      this._message = "";
    } else {
      this._message = this._t("ui.page_tabs.group_picker.bad_colour");
    }
  };

  private _choose = (ev: Event) => {
    const groupId = (
      ev.currentTarget as HTMLElement & {
        groupId: string | null;
      }
    ).groupId;
    const { moved, refused } = moveTabsToGroup(
      this.surface,
      this._tabIds,
      groupId
    );
    this._finish(
      groupId === null
        ? this._t("ui.page_tabs.group_picker.removed_from_group", {
            count: moved.length,
          })
        : this._t("ui.page_tabs.group_picker.moved", {
            count: moved.length,
          }),
      refused.length
    );
  };

  private _create = () => {
    const name = this._name.trim();
    if (!name) {
      return;
    }
    const { id, moved, refused } = createGroupWithTabs(this.surface, {
      name,
      colour: this._colour,
      tabIds: this._tabIds,
    });
    if (!id) {
      this._message = this._t("ui.page_tabs.group_picker.limit_reached");
      return;
    }
    this._finish(
      this._t("ui.page_tabs.group_picker.created", {
        name,
        count: moved.length,
      }),
      refused.length
    );
  };

  private _finish(message: string, refused: number) {
    const spoken = refused
      ? `${message} ${this._t("ui.page_tabs.group_picker.pinned_refused", { count: refused })}`
      : message;
    this._announce(spoken);
    this.dispatchEvent(
      new CustomEvent("tab-group-picker-done", {
        detail: { message: spoken, surface: this.surface },
        bubbles: true,
        composed: true,
      })
    );
    this.close(true);
  }

  private _cancel = () => this.close(true);

  private _rows(): HTMLButtonElement[] {
    return Array.from(this._rowElements);
  }

  private _searchKeydown = (ev: KeyboardEvent) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      this._rows()[0]?.focus();
    } else if (ev.key === "Enter") {
      const first = this._rows().find(
        (row) => (row as HTMLButtonElement & { groupId: string | null }).groupId
      );
      if (first && this._query.trim() && !regexQuery(this._query)?.error) {
        ev.preventDefault();
        first.click();
      }
    }
  };

  private _listKeydown = (ev: KeyboardEvent) => {
    const rows = this._rows();
    const at = rows.indexOf(ev.target as HTMLButtonElement);
    if (at === -1) {
      return;
    }
    let next: number | undefined;
    if (ev.key === "ArrowDown") {
      next = Math.min(at + 1, rows.length - 1);
    } else if (ev.key === "ArrowUp") {
      next = at - 1;
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = rows.length - 1;
    }
    if (next === undefined) {
      return;
    }
    ev.preventDefault();
    if (next < 0) {
      this._pickerSearch?.focus();
    } else {
      rows[next]?.focus();
    }
  };

  public static styles = [
    ...TabGroupPanel.panelStyles,
    css`
      .panel {
        display: grid;
      }
      ha-input-search {
        --ha-input-search-height: 44px;
        --ha-input-search-border-radius: var(--ha-border-radius-pill);
      }
      .note {
        margin: 0;
      }
      .colours {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .colour {
        width: 44px;
        min-height: 44px;
        height: 44px;
        padding: 0;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .colour.chosen {
        outline: 2px solid var(--primary-text-color);
        outline-offset: 2px;
      }
      .new-group {
        color: var(--primary-color);
      }
    `,
  ];
}
