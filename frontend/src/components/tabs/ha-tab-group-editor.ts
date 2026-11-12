import { mdiCheck, mdiClose, mdiRestore } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import {
  computeCssColor,
  resolveThemeColor,
} from "../../common/color/compute-color";
import {
  GROUP_COLOURS,
  cleanColour,
  readGroups,
  recolourGroup,
  renameGroup,
  writeGroups,
} from "../../common/tabs/tab-groups";
import "../ha-color-picker";
import "../ha-icon";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import {
  GROUP_APPEARANCE_CHOICES,
  GROUP_APPEARANCE_NUMBERS,
  cleanGroupAppearanceValue,
  groupAppearanceFor,
  groupChipStyle,
  groupColourCss,
  readGroupAppearance,
  resetAllGroups,
  resetGroup,
  resetGroupProperty,
  setGroupAppearance,
  writeGroupAppearance,
} from "./tab-group-appearance-store";
import type { GroupAppearanceProperty } from "./tab-group-appearance-store";
import { TabGroupPanel } from "./tab-group-panel";
import { readStripState } from "./tab-group-state";

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-group-editor": HaTabGroupEditor;
  }
}

type Kind = "choice" | "number" | "icon" | "colour";

/** The appearance controls in the order they are shown. */
const CONTROLS: { property: GroupAppearanceProperty; kind: Kind }[] = [
  { property: "fontWeight", kind: "choice" },
  { property: "fontStyle", kind: "choice" },
  { property: "icon", kind: "icon" },
  { property: "color", kind: "colour" },
  { property: "background", kind: "colour" },
  { property: "borderColor", kind: "colour" },
  { property: "borderWidth", kind: "number" },
  { property: "shape", kind: "choice" },
  { property: "radius", kind: "number" },
  { property: "spacing", kind: "number" },
  { property: "collapsedLook", kind: "choice" },
  { property: "expandedLook", kind: "choice" },
];

/**
 * @element ha-tab-group-editor
 *
 * @summary
 * The editor of one group, anchored beside its header and not modal: the page
 * stays usable and nothing is dimmed. It is opened by the window event
 * `tab-group-editor-open` (`{ groupId, anchor, surface, focus }`) from the
 * group menu's Rename and Edit group appearance entries, or directly by
 * Shift+right-click on a header. Name and colour are the group model's;
 * the rest (text weight and style, an icon or emoji, text, background and
 * border colours, border width, shape, corner radius, spacing, and the
 * collapsed and expanded looks) are saved in the group look store
 * (`pageTabsGroupAppearance`). Every change applies live, can be reset per
 * property, for this group or for every group, and a decoration never
 * replaces the group's name or strip.
 */
@customElement("ha-tab-group-editor")
export class HaTabGroupEditor extends TabGroupPanel {
  protected readonly openEvent = "tab-group-editor-open";

  protected readonly closeOnOutside = false;

  protected readonly beside = true;

  protected readonly panelWidth = 420;

  @query("#group-name") private _nameField?: HaInput;

  @query(".panel button") private _firstButton?: HTMLElement;

  @state() private _groupId = "";

  @state() private _focusName = false;

  @state() private _nameText = "";

  @state() private _message = "";

  protected _beforeOpen(detail: { groupId?: string; focus?: string }) {
    this._groupId = detail.groupId ?? "";
    this._focusName = detail.focus === "name";
    this._message = "";
    this._nameText =
      readGroups(this.surface).find((group) => group.id === this._groupId)
        ?.name ?? "";
    return true;
  }

  protected _focusFirst() {
    const target = this._focusName ? this._nameField : this._firstButton;
    target?.focus();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._open || !this.hass) {
      return nothing;
    }
    const strip = readStripState(this.hass, this.surface);
    const group = strip.groups.find((item) => item.id === this._groupId);
    if (!group) {
      return nothing;
    }
    const look = groupAppearanceFor(
      readGroupAppearance(),
      this.surface,
      group.id
    );
    const sheet = this._narrow;
    const custom = !(GROUP_COLOURS as readonly string[]).includes(group.colour);
    const chipStyle = {
      ...groupChipStyle(look),
      "--group-colour": groupColourCss(group.colour),
    };
    const name = group.name || this._t("ui.page_tabs.groups.unnamed");
    return html`
      <div
        class=${classMap({ panel: true, sheet, bottom: sheet })}
        style=${styleMap(sheet ? {} : this._position)}
        role="dialog"
        aria-label=${this._t("ui.page_tabs.groups.editor_label", { name })}
        @keydown=${this._panelKeydown}
      >
        <header>
          <div class="titles">
            <h2>${this._t("ui.page_tabs.groups.editor_title", { name })}</h2>
          </div>
          <button
            class="close"
            type="button"
            aria-label=${this._t("ui.page_tabs.groups.close_editor")}
            @click=${this._done}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </header>
        <p class="preview" aria-hidden="true">
          <span class="chip" style=${styleMap(chipStyle)}>
            ${this._renderIcon(look.icon)}
            <span>${name}</span>
            <span class="count">${group.members.length}</span>
          </span>
        </p>
        <ha-input
          id="group-name"
          appearance="outlined"
          .label=${this._t("ui.page_tabs.groups.name")}
          .value=${this._nameText}
          .maxlength=${60}
          @input=${this._nameChanged}
        ></ha-input>
        <div
          role="radiogroup"
          class="colours"
          aria-label=${this._t("ui.page_tabs.groups.colour")}
        >
          ${GROUP_COLOURS.map(
            (colour) =>
              html`<button
                type="button"
                class=${classMap({ colour: true, chosen: group.colour === colour })}
                role="radio"
                aria-checked=${group.colour === colour ? "true" : "false"}
                aria-label=${this._t(`ui.page_tabs.group_picker.colours.${colour}`)}
                .colour=${colour}
                style=${styleMap({ "background-color": groupColourCss(colour) })}
                @click=${this._pickColour}
              >
                ${
                  group.colour === colour
                    ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
                    : nothing
                }
              </button>`
          )}
        </div>
        <ha-color-picker
          .label=${this._t("ui.page_tabs.groups.custom_colour")}
          .value=${custom ? group.colour : ""}
          @value-changed=${this._customColour}
        ></ha-color-picker>
        <h3>${this._t("ui.page_tabs.groups.appearance.title")}</h3>
        ${CONTROLS.map((control) => this._renderControl(control, look))}
        ${this._message ? html`<p class="note error" role="alert">${this._message}</p>` : nothing}
        <div class="buttons">
          <button type="button" class="text" @click=${this._resetGroup}>
            ${this._t("ui.page_tabs.groups.appearance.reset_group")}
          </button>
          <button type="button" class="text" @click=${this._resetAll}>
            ${this._t("ui.page_tabs.groups.appearance.reset_all")}
          </button>
        </div>
        <span class="live" role="status" aria-live="polite"></span>
      </div>
    `;
  }

  private _renderIcon(icon?: string) {
    if (!icon) {
      return nothing;
    }
    return icon.startsWith("mdi:")
      ? html`<ha-icon .icon=${icon}></ha-icon>`
      : html`<span class="emoji">${icon}</span>`;
  }

  private _renderControl(
    control: { property: GroupAppearanceProperty; kind: Kind },
    look: Partial<Record<GroupAppearanceProperty, string>>
  ) {
    const { property, kind } = control;
    const label = this._t(`ui.page_tabs.groups.appearance.${property}`);
    const value = look[property];
    return html`<div class="control" role="group" aria-label=${label}>
      <span class="control-label">${label}</span>
      ${
        kind === "choice"
          ? html`<div role="radiogroup" class="choices" aria-label=${label}>
              ${(GROUP_APPEARANCE_CHOICES[property] ?? []).map(
                (word) =>
                  html`<button
                    type="button"
                    class=${classMap({ choice: true, chosen: value === word })}
                    role="radio"
                    aria-checked=${value === word ? "true" : "false"}
                    .property=${property}
                    .word=${word}
                    @click=${this._pickChoice}
                  >
                    ${this._t(`ui.page_tabs.groups.appearance.choices.${word}`)}
                  </button>`
              )}
            </div>`
          : kind === "number"
            ? html`<ha-input
                type="number"
                appearance="outlined"
                .accessibleLabel=${label}
                .value=${value ?? ""}
                .min=${String(GROUP_APPEARANCE_NUMBERS[property]?.min ?? 0)}
                .max=${String(GROUP_APPEARANCE_NUMBERS[property]?.max ?? 0)}
                .property=${property}
                @change=${this._setText}
              ></ha-input>`
            : kind === "icon"
              ? html`<ha-input
                  appearance="outlined"
                  .accessibleLabel=${label}
                  .placeholder=${this._t("ui.page_tabs.groups.appearance.icon_hint")}
                  .value=${value ?? ""}
                  .property=${property}
                  @change=${this._setText}
                ></ha-input>`
              : html`<ha-color-picker
                  .label=${label}
                  .value=${value ?? ""}
                  .property=${property}
                  @value-changed=${this._setColour}
                ></ha-color-picker>`
      }
      <button
        type="button"
        class="reset"
        ?disabled=${value === undefined}
        aria-label=${this._t("ui.page_tabs.groups.appearance.reset_property", {
          name: label,
        })}
        .property=${property}
        @click=${this._resetProperty}
      >
        <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
      </button>
    </div>`;
  }

  private _nameChanged = (ev: Event) => {
    const text = (ev.target as HaInput).value ?? "";
    this._nameText = text;
    if (!text.trim()) {
      return;
    }
    writeGroups(
      this.surface,
      renameGroup(readGroups(this.surface), this._groupId, text)
    );
    this.requestUpdate();
  };

  private _pickColour = (ev: Event) => {
    const colour = (ev.currentTarget as HTMLElement & { colour: string })
      .colour;
    writeGroups(
      this.surface,
      recolourGroup(readGroups(this.surface), this._groupId, colour)
    );
    this.requestUpdate();
  };

  private _customColour = (ev: CustomEvent<{ value?: string }>) => {
    ev.stopPropagation();
    const value = ev.detail.value?.trim();
    if (!value) {
      return;
    }
    const resolved =
      cleanColour(value) ?? cleanColour(resolveThemeColor(value));
    if (!resolved) {
      this._message = this._t("ui.page_tabs.group_picker.bad_colour");
      return;
    }
    this._message = "";
    writeGroups(
      this.surface,
      recolourGroup(readGroups(this.surface), this._groupId, resolved)
    );
    this.requestUpdate();
  };

  private _apply(property: GroupAppearanceProperty, value: string) {
    if (cleanGroupAppearanceValue(property, value) === undefined) {
      this._message = this._t("ui.page_tabs.groups.appearance.bad_value", {
        name: this._t(`ui.page_tabs.groups.appearance.${property}`),
      });
      this.requestUpdate();
      return;
    }
    this._message = "";
    writeGroupAppearance(
      setGroupAppearance(
        readGroupAppearance(),
        this.surface,
        this._groupId,
        property,
        value
      )
    );
    this.requestUpdate();
  }

  private _pickChoice = (ev: Event) => {
    const button = ev.currentTarget as HTMLElement & {
      property: GroupAppearanceProperty;
      word: string;
    };
    this._apply(button.property, button.word);
  };

  private _setText = (ev: Event) => {
    const field = ev.target as HaInput & { property: GroupAppearanceProperty };
    const text = (field.value ?? "").trim();
    if (!text) {
      this._reset(field.property);
      return;
    }
    this._apply(field.property, text);
  };

  // The colour picker gives a hex colour or a theme colour name; a name is
  // saved as the theme variable so it follows the theme.
  private _setColour = (ev: CustomEvent<{ value?: string }>) => {
    ev.stopPropagation();
    const picker = ev.target as HTMLElement & {
      property: GroupAppearanceProperty;
    };
    const value = ev.detail.value?.trim();
    if (!value) {
      this._reset(picker.property);
      return;
    }
    this._apply(picker.property, computeCssColor(value));
  };

  private _reset(property: GroupAppearanceProperty) {
    writeGroupAppearance(
      resetGroupProperty(
        readGroupAppearance(),
        this.surface,
        this._groupId,
        property
      )
    );
    this.requestUpdate();
  }

  private _resetProperty = (ev: Event) => {
    this._reset(
      (ev.currentTarget as HTMLElement & { property: GroupAppearanceProperty })
        .property
    );
    this._announce(this._t("ui.page_tabs.groups.appearance.property_reset"));
  };

  private _resetGroup = () => {
    writeGroupAppearance(
      resetGroup(readGroupAppearance(), this.surface, this._groupId)
    );
    this._message = "";
    this.requestUpdate();
    this._announce(this._t("ui.page_tabs.groups.appearance.group_reset"));
  };

  private _resetAll = () => {
    writeGroupAppearance(resetAllGroups(readGroupAppearance(), this.surface));
    this._message = "";
    this.requestUpdate();
    this._announce(this._t("ui.page_tabs.groups.appearance.all_reset"));
  };

  private _done = () => this.close(true);

  public static styles = [
    ...TabGroupPanel.panelStyles,
    css`
      .panel {
        max-height: calc(100dvh - 16px);
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-m, 1rem);
      }
      .preview {
        margin: 0;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: 999px;
        background-color: color-mix(
          in srgb,
          var(--group-colour) 30%,
          transparent
        );
        border: 0 solid var(--group-colour);
        max-width: 100%;
      }
      .chip .count {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .colours,
      .choices {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .colour {
        width: 44px;
        height: 44px;
        min-height: 44px;
        padding: 0;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .colour.chosen,
      .choice.chosen {
        outline: 2px solid var(--primary-text-color);
        outline-offset: 2px;
      }
      .choice {
        min-height: 44px;
        padding: 0 var(--ha-space-3);
      }
      .control {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--ha-space-2);
        align-items: center;
      }
      .control-label {
        grid-column: 1 / -1;
        font-size: var(--ha-font-size-s, 0.85rem);
        color: var(--secondary-text-color);
      }
      .control > :not(.control-label):not(.reset) {
        grid-column: 1;
      }
      .reset {
        grid-column: 2;
        grid-row: 2;
        width: 44px;
        padding: 0;
        display: grid;
        place-items: center;
      }
    `,
  ];
}
