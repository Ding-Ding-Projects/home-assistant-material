import { mdiClockOutline, mdiClose, mdiMagnify, mdiPin } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { ExternalLinkMode } from "../../../common/links/external-link-mode";
import {
  EXTERNAL_LINK_MODES,
  normalizeExternalLinkMode,
  readExternalLinkMode,
  subscribeExternalLinkMode,
  writeExternalLinkMode,
} from "../../../common/links/external-link-mode";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-select-box";
import "../../../components/ha-svg-icon";
import {
  clearPinned,
  clearRecent,
  readQuickBarMemory,
  removeFromMemory,
  subscribeQuickBarMemory,
  writeQuickBarMemory,
  type QuickBarMemory,
  type QuickBarMemoryEntry,
} from "../../../dialogs/quick-bar/quick-bar-memory";
import { showQuickBar } from "../../../dialogs/quick-bar/show-dialog-quick-bar";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

/**
 * Settings, Links and the quick bar: where links to outside addresses open,
 * and the pinned and recent results the quick bar keeps for this person.
 */
@customElement("ha-config-section-links")
export class HaConfigSectionLinks extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _mode: ExternalLinkMode = readExternalLinkMode();

  @state() private _memory: QuickBarMemory = readQuickBarMemory();

  private _unsubscribe: (() => void)[] = [];

  public connectedCallback() {
    super.connectedCallback();
    this._mode = readExternalLinkMode();
    this._memory = readQuickBarMemory();
    this._unsubscribe = [
      subscribeExternalLinkMode((mode) => {
        this._mode = mode;
      }),
      subscribeQuickBarMemory((memory) => {
        this._memory = memory;
      }),
    ];
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe.forEach((unsubscribe) => unsubscribe());
    this._unsubscribe = [];
  }

  private _t = (key: string, values?: Record<string, string | number>) =>
    this.hass.localize(
      `ui.panel.config.links_quick_bar.${key}` as any,
      values as any
    );

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        back-path="/config/personal"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this._t("title")}
      >
        <div class="page">
          <div class="intro">
            <h2>${this._t("title")}</h2>
            <p>${this._t("summary")}</p>
          </div>
          <div class="columns">
            <ha-card>
              <h3 class="card-title">${this._t("outside_title")}</h3>
              <ha-select-box
                max_columns="3"
                .value=${this._mode}
                .options=${EXTERNAL_LINK_MODES.map((mode) => ({
                  value: mode,
                  label: this._t(mode),
                  description: this._t(`${mode}_help`),
                }))}
                @value-changed=${this._modeChanged}
              ></ha-select-box>
              <p class="note">${this._t("outside_note")}</p>
              <p class="note">${this._t("modifier_note")}</p>
            </ha-card>
            <ha-card>
              <h3 class="card-title">${this._t("memory_title")}</h3>
              ${this._renderList(
                "pinned",
                this._memory.pinned,
                mdiPin,
                "no_pins",
                "clear_pins",
                this._clearPins,
                "unpin"
              )}
              ${this._renderList(
                "recent",
                this._memory.recent,
                mdiClockOutline,
                "no_recent",
                "clear_recent",
                this._clearRecent,
                "forget"
              )}
              <div class="actions">
                <ha-button appearance="plain" @click=${this._openQuickBar}>
                  <ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>
                  ${this._t("open_quick_bar")}
                </ha-button>
              </div>
            </ha-card>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderList(
    titleKey: string,
    entries: QuickBarMemoryEntry[],
    iconPath: string,
    emptyKey: string,
    clearKey: string,
    onClear: () => void,
    removeKey: string
  ): TemplateResult {
    return html`
      <section class="list" aria-label=${this._t(titleKey)}>
        <div class="list-head">
          <h4>${this._t(titleKey)}</h4>
          ${
            entries.length
              ? html`<ha-button
                  appearance="plain"
                  size="small"
                  @click=${onClear}
                  >${this._t(clearKey)}</ha-button
                >`
              : nothing
          }
        </div>
        ${
          entries.length
            ? html`<ul>
                ${entries.map(
                  (entry) =>
                    html`<li>
                      <span class="tile"
                        ><ha-svg-icon .path=${iconPath}></ha-svg-icon
                      ></span>
                      <span class="title">${entry.title}</span>
                      <ha-icon-button
                        .path=${mdiClose}
                        .label=${this._t(removeKey, { title: entry.title })}
                        .title=${this._t(removeKey, { title: entry.title })}
                        .key=${entry.key}
                        @click=${this._remove}
                      ></ha-icon-button>
                    </li>`
                )}
              </ul>`
            : html`<p class="note">${this._t(emptyKey)}</p>`
        }
      </section>
    `;
  }

  private _modeChanged(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    const mode = normalizeExternalLinkMode(ev.detail.value);
    if (writeExternalLinkMode(mode)) {
      this._mode = mode;
    } else {
      showToast(this, { message: this._t("not_saved") });
    }
  }

  private _save(memory: QuickBarMemory) {
    if (writeQuickBarMemory(memory)) {
      this._memory = readQuickBarMemory();
    } else {
      showToast(this, { message: this._t("not_saved") });
    }
  }

  private _remove(ev: Event) {
    const { key } = ev.currentTarget as HTMLElement & { key: string };
    this._save(removeFromMemory(this._memory, key));
  }

  private _clearRecent = () => {
    this._save(clearRecent(this._memory));
    showToast(this, { message: this._t("cleared") });
  };

  private _clearPins = () => {
    this._save(clearPinned(this._memory));
    showToast(this, { message: this._t("cleared") });
  };

  private _openQuickBar() {
    showQuickBar(this, {});
  }

  static styles = [
    haStyle,
    css`
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
      }
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
      }
      .intro {
        margin-bottom: var(--ha-space-4);
      }
      .intro h2 {
        margin: 0;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-3xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      .intro p {
        margin: var(--ha-space-1) 0 0;
        color: var(--secondary-text-color);
        line-height: var(--ha-line-height-normal);
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .columns {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 800px) {
        .columns {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      ha-card {
        padding: var(--ha-space-4) var(--ha-space-5) var(--ha-space-5);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .card-title {
        margin: 0;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-title, 600);
      }
      .note {
        margin: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        line-height: var(--ha-line-height-normal);
      }
      .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
      }
      .list-head h4 {
        margin: 0;
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-2) 0;
        border-top: 1px solid var(--divider-color);
      }
      .tile {
        flex: none;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--ha-border-radius-lg);
        background: var(
          --ha-color-primary-container,
          var(--secondary-background-color)
        );
        color: var(--ha-color-on-primary-container, var(--primary-text-color));
      }
      .title {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-links": HaConfigSectionLinks;
  }
}
