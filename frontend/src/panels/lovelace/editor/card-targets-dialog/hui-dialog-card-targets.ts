import { mdiCardMultipleOutline, mdiViewDashboardOutline } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { formatTime } from "../../../../common/datetime/format_time";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { CardClipboardEntry } from "../card-clipboard-history";
import {
  clearClipboardHistory,
  readClipboardHistory,
  subscribeClipboardHistory,
  summarizeClipboardEntry,
  withoutCardStyle,
} from "../card-clipboard-history";
import type { CardTarget } from "../multi-select-actions";
import {
  addEmptySection,
  appendCardsTo,
  listCardTargets,
  listTargetViews,
  moveSelectedCards,
} from "../multi-select-actions";
import type { CardTargetsDialogParams } from "./show-dialog-card-targets";

const NEW_SECTION = "new";

@customElement("hui-dialog-card-targets")
export class HuiDialogCardTargets extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: CardTargetsDialogParams;

  @state() private _open = false;

  @state() private _view = 0;

  @state() private _section = NEW_SECTION;

  @state() private _keepStyles = true;

  @state() private _history: CardClipboardEntry[] = [];

  @state() private _busy = false;

  private _unsubscribe?: () => void;

  public showDialog(params: CardTargetsDialogParams): void {
    this._params = params;
    this._view = params.viewIndex ?? 0;
    this._section = NEW_SECTION;
    this._keepStyles = true;
    this._history = readClipboardHistory();
    this._unsubscribe?.();
    this._unsubscribe = subscribeClipboardHistory((history) => {
      this._history = history;
    });
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.${key}` as "ui.panel.lovelace.editor.header",
      values
    );
  }

  private get _config(): LovelaceConfig | undefined {
    return this._params?.lovelace()?.config;
  }

  private _targets(config: LovelaceConfig): CardTarget[] {
    return listCardTargets(
      config,
      this.hass.localize("ui.panel.lovelace.views.unnamed_view")
    );
  }

  protected render() {
    const config = this._config;
    if (!this._params || !config) {
      return nothing;
    }
    const paste = this._params.mode === "paste";
    const targets = this._targets(config);
    const views = listTargetViews(targets);
    const view = views.find((item) => item.view === this._view) ?? views[0];
    const sections = view?.hasSections
      ? targets.filter((target) => target.view === view.view)
      : [];

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t(
          paste ? "clipboard.title" : "multi_select.move_title"
        )}
        @closed=${this._dialogClosed}
      >
        <div class="layout">
          ${
            paste
              ? html`<section class="panel" aria-labelledby="clip-title">
                  <div class="panel-head">
                    <h3 id="clip-title">${this._t("clipboard.history")}</h3>
                    ${
                      this._history.length
                        ? html`<ha-button
                            appearance="plain"
                            size="small"
                            @click=${this._clear}
                          >
                            ${this._t("clipboard.clear")}
                          </ha-button>`
                        : nothing
                    }
                  </div>
                  ${
                    this._history.length
                      ? html`<ul class="entries">
                          ${this._history.map((entry) =>
                            this._renderEntry(entry, Boolean(view))
                          )}
                        </ul>`
                      : html`<p class="hint">${this._t("clipboard.empty")}</p>`
                  }
                </section>`
              : nothing
          }
          <section class="panel" aria-labelledby="where-title">
            <h3 id="where-title">${this._t("clipboard.where")}</h3>
            ${
              view
                ? html`
                    <ha-select
                      .label=${this._t(
                        paste
                          ? "clipboard.paste_into"
                          : "multi_select.move_into"
                      )}
                      .value=${String(view.view)}
                      .options=${views.map((item) => ({
                        value: String(item.view),
                        label: item.title,
                      }))}
                      @selected=${this._viewChanged}
                    ></ha-select>
                    ${
                      view.hasSections
                        ? html`<ha-select
                            .label=${this._t("clipboard.section")}
                            .value=${this._section}
                            .options=${[
                              ...sections.map((target) => ({
                                value: String(target.section),
                                label: this._t("clipboard.section_n", {
                                  number: (target.section ?? 0) + 1,
                                }),
                              })),
                              {
                                value: NEW_SECTION,
                                label: this._t("clipboard.new_section"),
                              },
                            ]}
                            @selected=${this._sectionChanged}
                          ></ha-select>`
                        : nothing
                    }
                  `
                : html`<p class="hint">${this._t("clipboard.no_views")}</p>`
            }
            ${
              paste
                ? html`<label class="switch-row">
                    <span>${this._t("clipboard.keep_styles")}</span>
                    <ha-switch
                      .checked=${this._keepStyles}
                      @change=${this._keepStylesChanged}
                    ></ha-switch>
                  </label>`
                : nothing
            }
          </section>
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          ${
            paste
              ? nothing
              : html`<ha-button
                  slot="primaryAction"
                  .disabled=${!view || this._busy}
                  @click=${this._move}
                >
                  ${this.hass.localize("ui.common.move")}
                </ha-button>`
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderEntry(entry: CardClipboardEntry, canPaste: boolean) {
    const { count, type } = summarizeClipboardEntry(entry);
    const title =
      count === 1
        ? this._t("clipboard.one_card", { type })
        : this._t("clipboard.n_cards", { count });
    const when = formatTime(
      new Date(entry.time),
      this.hass.locale,
      this.hass.config
    );
    const date = new Date(entry.time).toLocaleDateString(
      this.hass.locale.language
    );
    return html`<li class="entry">
      <span class="tile" aria-hidden="true">
        <ha-svg-icon
          .path=${count === 1 ? mdiViewDashboardOutline : mdiCardMultipleOutline}
        ></ha-svg-icon>
      </span>
      <span class="entry-text">
        <span class="entry-title">${title}</span>
        <span class="entry-sub">${date} ${when}</span>
      </span>
      <ha-button
        size="small"
        .disabled=${!canPaste || this._busy}
        .entry=${entry}
        @click=${this._pasteClicked}
      >
        ${this._t("clipboard.paste")}
      </ha-button>
    </li>`;
  }

  private _viewChanged(ev: HaSelectSelectEvent): void {
    this._view = Number(ev.detail.value);
    this._section = NEW_SECTION;
  }

  private _sectionChanged(ev: HaSelectSelectEvent): void {
    this._section = ev.detail.value;
  }

  private _keepStylesChanged(ev: Event): void {
    this._keepStyles = (ev.target as HTMLInputElement).checked;
  }

  private _clear(): void {
    clearClipboardHistory();
  }

  /** The path of the chosen view or section, adding a section when asked to. */
  private _destination(config: LovelaceConfig): {
    config: LovelaceConfig;
    path: (string | number)[];
  } | null {
    const target = this._targets(config).find(
      (item) =>
        item.view === this._view &&
        (item.section === undefined || String(item.section) === this._section)
    );
    if (target) {
      return { config, path: target.path };
    }
    const viewConfig = config.views[this._view];
    if (!viewConfig || "strategy" in viewConfig) {
      return null;
    }
    // A sections view and the "new section" choice.
    return addEmptySection(config, this._view);
  }

  private _pasteClicked(ev: Event): void {
    void this._paste(
      (ev.currentTarget as HTMLElement & { entry: CardClipboardEntry }).entry
    );
  }

  private async _paste(entry: CardClipboardEntry): Promise<void> {
    const lovelace = this._params?.lovelace();
    if (!lovelace || this._busy) {
      return;
    }
    const destination = this._destination(lovelace.config);
    if (!destination) {
      return;
    }
    this._busy = true;
    const cards = this._keepStyles
      ? entry.cards
      : entry.cards.map(withoutCardStyle);
    try {
      await lovelace.saveConfig(
        appendCardsTo(destination.config, destination.path, cards)
      );
    } catch (_err: unknown) {
      lovelace.showToast({ message: this._t("clipboard.paste_error") });
      this._busy = false;
      return;
    }
    this._busy = false;
    lovelace.showToast({
      message: this._t("clipboard.pasted", { count: cards.length }),
      duration: 8000,
      action: {
        action: () => fireEvent(window, "undo-change"),
        text: this.hass.localize("ui.common.undo"),
      },
    });
    this._params?.onDone?.();
    this.closeDialog();
  }

  private async _move(): Promise<void> {
    const lovelace = this._params?.lovelace();
    const paths = this._params?.paths;
    if (!lovelace || !paths?.length || this._busy) {
      return;
    }
    const destination = this._destination(lovelace.config);
    if (!destination) {
      return;
    }
    this._busy = true;
    try {
      await lovelace.saveConfig(
        moveSelectedCards(destination.config, paths, destination.path)
      );
    } catch (_err: unknown) {
      lovelace.showToast({ message: this._t("multi_select.move_error") });
      this._busy = false;
      return;
    }
    this._busy = false;
    lovelace.showToast({
      message: this._t("multi_select.moved", { count: paths.length }),
      duration: 8000,
      action: {
        action: () => fireEvent(window, "undo-change"),
        text: this.hass.localize("ui.common.undo"),
      },
    });
    this._params?.onDone?.();
    this.closeDialog();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-dialog {
          --ha-dialog-width-lg: 760px;
        }
        .layout {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--ha-space-4);
        }
        .panel {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-title, 600);
        }
        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
        .entries {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .entry {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .tile {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          flex: none;
          border-radius: var(--ha-border-radius-lg);
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
        }
        .entry-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .entry-title {
          font-weight: var(--ha-font-weight-semibold, 500);
          overflow-wrap: anywhere;
        }
        .entry-sub,
        .hint {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          margin: 0;
        }
        ha-select {
          width: 100%;
        }
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
          font-weight: var(--ha-font-weight-semibold, 500);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-card-targets": HuiDialogCardTargets;
  }
}
