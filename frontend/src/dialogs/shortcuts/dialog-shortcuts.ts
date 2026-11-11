import type { ContextType } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { ctrlOrCmdLabel } from "../../common/keyboard/ctrl-or-cmd";
import type { LocalizeKeys } from "../../common/translations/localize";
import "../../components/ha-alert";
import "../../components/ha-dialog";
import "../../components/ha-svg-icon";
import { internationalizationContext } from "../../data/context";
import { DialogMixin } from "../dialog-mixin";

interface Text {
  textTranslationKey: LocalizeKeys;
}

interface LocalizedShortcut {
  shortcutTranslationKey: LocalizeKeys;
}

type ShortcutString = string | LocalizedShortcut;

interface Shortcut {
  shortcut: ShortcutString[];
  descriptionTranslationKey: LocalizeKeys;
}

interface Section {
  titleTranslationKey: LocalizeKeys;
  items: (Text | Shortcut)[];
}

const CTRL_CMD = "__CTRL_CMD__";

const _SHORTCUTS: Section[] = [
  {
    titleTranslationKey: "ui.dialogs.shortcuts.searching.title",
    items: [
      {
        textTranslationKey: "ui.dialogs.shortcuts.searching.on_any_page",
      },
      {
        shortcut: [CTRL_CMD, "Shift", "F"],
        descriptionTranslationKey: "ui.dialogs.shortcuts.searching.search",
      },
      {
        shortcut: ["C"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.searching.search_command",
      },
      {
        shortcut: ["E"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.searching.search_entities",
      },
      {
        shortcut: ["D"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.searching.search_devices",
      },
      {
        textTranslationKey:
          "ui.dialogs.shortcuts.searching.on_pages_with_tables",
      },
      {
        shortcut: [CTRL_CMD, "F"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.searching.search_in_table",
      },
    ],
  },
  {
    titleTranslationKey: "ui.dialogs.shortcuts.assist.title",
    items: [
      {
        shortcut: ["A"],
        descriptionTranslationKey: "ui.dialogs.shortcuts.assist.open_assist",
      },
    ],
  },
  {
    titleTranslationKey: "ui.dialogs.shortcuts.automation_script.title",
    items: [
      {
        shortcut: [CTRL_CMD, "C"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.automation_script.copy",
      },
      {
        shortcut: [CTRL_CMD, "X"],
        descriptionTranslationKey: "ui.dialogs.shortcuts.automation_script.cut",
      },
      {
        shortcut: [
          CTRL_CMD,
          { shortcutTranslationKey: "ui.dialogs.shortcuts.keys.del" },
        ],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.automation_script.delete",
      },
      {
        shortcut: [CTRL_CMD, "V"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.automation_script.paste",
      },
      {
        shortcut: [CTRL_CMD, "S"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.automation_script.save",
      },
      {
        shortcut: [CTRL_CMD, "Z"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.automation_script.undo",
      },
      {
        shortcut: [CTRL_CMD, "Y"],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.automation_script.redo",
      },
    ],
  },
  {
    titleTranslationKey: "ui.dialogs.shortcuts.charts.title",
    items: [
      {
        shortcut: [
          { shortcutTranslationKey: "ui.dialogs.shortcuts.shortcuts.drag" },
        ],
        descriptionTranslationKey: "ui.dialogs.shortcuts.charts.drag_to_zoom",
      },
      {
        shortcut: [
          "Shift",
          {
            shortcutTranslationKey:
              "ui.dialogs.shortcuts.shortcuts.scroll_wheel",
          },
        ],
        descriptionTranslationKey: "ui.dialogs.shortcuts.charts.scroll_to_pan",
      },
      {
        shortcut: [
          CTRL_CMD,
          {
            shortcutTranslationKey:
              "ui.dialogs.shortcuts.shortcuts.scroll_wheel",
          },
        ],
        descriptionTranslationKey: "ui.dialogs.shortcuts.charts.scroll_to_zoom",
      },
      {
        shortcut: [
          {
            shortcutTranslationKey:
              "ui.dialogs.shortcuts.shortcuts.double_click",
          },
        ],
        descriptionTranslationKey: "ui.dialogs.shortcuts.charts.double_click",
      },
      {
        shortcut: [
          CTRL_CMD,
          {
            shortcutTranslationKey: "ui.dialogs.shortcuts.shortcuts.click",
          },
        ],
        descriptionTranslationKey:
          "ui.dialogs.shortcuts.charts.click_legend_solo",
      },
    ],
  },
  {
    titleTranslationKey: "ui.dialogs.shortcuts.other.title",
    items: [
      {
        shortcut: ["M"],
        descriptionTranslationKey: "ui.dialogs.shortcuts.other.my_link",
      },
      {
        shortcut: ["Shift", "/"],
        descriptionTranslationKey: "ui.dialogs.shortcuts.other.show_shortcuts",
      },
      {
        shortcut: [CTRL_CMD, "Shift", "Y"],
        descriptionTranslationKey: "ui.dialogs.shortcuts.other.toggle_yaml",
      },
    ],
  },
];

@customElement("dialog-shortcuts")
class DialogShortcuts extends DialogMixin(LitElement) {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  private _renderShortcut(
    shortcutKeys: ShortcutString[],
    descriptionKey: LocalizeKeys
  ) {
    return html`
      <div class="shortcut">
        <span class="description">${this._i18n.localize(descriptionKey)}</span>
        <span class="keys">
          ${shortcutKeys.map(
            (shortcutKey) =>
              html`<kbd
                >${
                  shortcutKey === CTRL_CMD
                    ? ctrlOrCmdLabel(this._i18n.localize)
                    : typeof shortcutKey === "string"
                      ? shortcutKey
                      : this._i18n.localize(shortcutKey.shortcutTranslationKey)
                }</kbd
              >`
          )}
        </span>
      </div>
    `;
  }

  protected render() {
    return html`
      <ha-dialog
        open
        .headerTitle=${this._i18n.localize("ui.dialogs.shortcuts.title")}
      >
        <div class="content">
          ${_SHORTCUTS.map(
            (section) => html`
              <section class="card">
                <h3>${this._i18n.localize(section.titleTranslationKey)}</h3>
                <div class="items">
                  ${section.items.map((item) => {
                    if ("shortcut" in item) {
                      return this._renderShortcut(
                        (item as Shortcut).shortcut,
                        (item as Shortcut).descriptionTranslationKey
                      );
                    }
                    return html`<p class="group-label">
                      ${this._i18n.localize((item as Text).textTranslationKey)}
                    </p>`;
                  })}
                </div>
              </section>
            `
          )}
        </div>

        <ha-alert slot="footer">
          ${this._i18n.localize("ui.dialogs.shortcuts.enable_shortcuts_hint", {
            user_profile: html`<a href="/profile/browser#shortcuts"
              >${this._i18n.localize(
                "ui.dialogs.shortcuts.enable_shortcuts_hint_user_profile"
              )}</a
            >`,
          })}
        </ha-alert>
      </ha-dialog>
    `;
  }

  static styles = [
    css`
      .content {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: var(--ha-space-4);
        align-items: start;
      }

      .card {
        padding: var(--ha-space-4) var(--ha-space-5);
        border-radius: var(--ha-border-radius-xl);
        background: var(--secondary-background-color);
      }

      .card h3 {
        margin: 0 0 var(--ha-space-3);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }

      .shortcut {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-3);
        padding: var(--ha-space-2) 0;
      }

      .keys {
        direction: ltr;
        display: flex;
        flex: none;
        gap: var(--ha-space-1);
      }

      kbd {
        min-width: 24px;
        padding: var(--ha-space-1) var(--ha-space-2);
        box-sizing: border-box;
        text-align: center;
        font-family: inherit;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        border: 1px solid var(--outline-color);
        border-radius: var(--ha-border-radius-md);
        background: var(--card-background-color);
      }

      .group-label {
        margin: var(--ha-space-3) 0 var(--ha-space-1);
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }

      ha-alert a {
        color: var(--primary-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-shortcuts": DialogShortcuts;
  }
}
