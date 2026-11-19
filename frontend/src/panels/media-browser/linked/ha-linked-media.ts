import { mdiImage, mdiMovieOpen, mdiMusic, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatTime } from "../../../common/datetime/format_time";
import { fireEvent } from "../../../common/dom/fire_event";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import {
  renderStackedLabel,
  stackedLabelStyles,
} from "../../../common/language-mode/stacked-label";
import { searchMatcher } from "../../../common/regex/filter";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type { LinkedFile } from "../../../data/linked_media";
import { checkLinkedFile, fetchLinkedFiles } from "../../../data/linked_media";
import type { HomeAssistant } from "../../../types";
import "./ha-linked-file-add";
import "./ha-linked-file-sheet";
import { linkedFailureText, linkedUsedByText } from "./linked-text";

const KIND_ICON = {
  audio: mdiMusic,
  video: mdiMovieOpen,
  image: mdiImage,
};

const REFRESH_MS = 10000;

/**
 * The Linked tab of the media page: files that live at a web address, fetched
 * only when something plays or shows them and thrown away after.
 */
@customElement("ha-linked-media")
export class HaLinkedMedia extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The text of the page search in the top bar. */
  @property() public filter = "";

  @state() private _files?: LinkedFile[];

  @state() private _error = false;

  @state() private _checking = new Set<string>();

  @state() private _addOpen = false;

  @state() private _openFileId?: string;

  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  private _timer?: number;

  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._modeLocalize(
      `ui.panel.media-browser.linked.${key}` as any,
      values
    );
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) {
      this._load();
    }
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  protected firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    this._load();
  }

  /** The names the page search matches, for its pattern builder. */
  public get searchSamples(): string[] {
    return (this._files ?? []).map((file) => file.name);
  }

  /** How many rows the search leaves. */
  public get shownCount(): number {
    return this._shown().length;
  }

  private _lastShown = -1;

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const shown = this.shownCount;
    if (shown !== this._lastShown) {
      this._lastShown = shown;
      fireEvent(this, "linked-shown-changed");
    }
  }

  private async _load(): Promise<void> {
    try {
      this._files = (await fetchLinkedFiles(this.hass)).files;
      this._error = false;
    } catch (_err) {
      this._error = true;
    }
  }

  private _shown(): LinkedFile[] {
    const matches = searchMatcher(this.filter);
    return (this._files ?? []).filter((file) =>
      matches(file.name, file.host, file.kind)
    );
  }

  protected render(): TemplateResult {
    const isAdmin = !!this.hass.user?.is_admin;
    const files = this._files;
    const shown = this._shown();
    const openFile = files?.find((file) => file.id === this._openFileId);
    return html`
      <div class="content">
        <p class="intro">${this._l("intro")}</p>
        ${
          this._error
            ? html`<ha-alert alert-type="error"
                >${this._l("load_failed")}</ha-alert
              >`
            : nothing
        }
        ${
          files === undefined && !this._error
            ? html`<div class="loading"><ha-spinner></ha-spinner></div>`
            : nothing
        }
        ${
          files && shown.length
            ? html`<div class="card" role="list">
                ${shown.map((file) => this._renderRow(file, isAdmin))}
              </div>`
            : nothing
        }
        ${
          files && !shown.length
            ? html`<p class="empty">
                ${
                  files.length
                    ? this._l("empty_search")
                    : isAdmin
                      ? this._l("empty_admin")
                      : this._l("empty")
                }
              </p>`
            : nothing
        }
        ${this._renderInUse(files ?? [])}
        ${
          isAdmin
            ? html`<ha-button appearance="filled" @click=${this._openAdd}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${renderStackedLabel(this._l("add"))}
              </ha-button>`
            : nothing
        }
      </div>
      <ha-linked-file-add
        .hass=${this.hass}
        .open=${this._addOpen}
        @linked-sheet-closed=${this._addClosed}
        @linked-file-added=${this._load}
      ></ha-linked-file-add>
      <ha-linked-file-sheet
        .hass=${this.hass}
        .file=${openFile}
        .open=${!!openFile}
        @linked-sheet-closed=${this._sheetClosed}
        @linked-file-changed=${this._load}
      ></ha-linked-file-sheet>
    `;
  }

  private _renderRow(file: LinkedFile, isAdmin: boolean): TemplateResult {
    const failed = file.reachable === false && file.last_failure_reason;
    const kind = this._l(`kind.${file.kind}`);
    let line: string;
    if (failed) {
      line = this._l("failed_at", {
        time: this._time(file.last_failure_at),
        reason: linkedFailureText(this._modeLocalize, file),
      });
    } else {
      const usage = file.last_used_at
        ? this._l("used_at", { time: this._time(file.last_used_at) })
        : file.fetch === "keep"
          ? this._l("kept")
          : this._l("fetched_each_time");
      line = `${kind} · ${file.host} · ${usage}`;
    }
    const checking = this._checking.has(file.id);
    return html`
      <div class="row" role="listitem">
        <button
          class="row-main"
          .fileId=${file.id}
          @click=${this._openSheet}
          aria-label=${file.name}
        >
          <span class="icon ${failed ? "failed" : ""}">
            <ha-svg-icon .path=${KIND_ICON[file.kind]}></ha-svg-icon>
          </span>
          <span class="text">
            <span class="name">${file.name}</span>
            <span class="secondary ${failed ? "error" : ""}">${line}</span>
          </span>
        </button>
        ${
          failed && isAdmin
            ? html`<ha-button
                appearance="plain"
                size="small"
                .fileId=${file.id}
                .loading=${checking}
                @click=${this._check}
                >${renderStackedLabel(this._l("check"))}</ha-button
              >`
            : html`<span class="state ${failed ? "error" : ""}"
                >${
                  file.reachable === null
                    ? this._l("not_checked")
                    : file.reachable
                      ? this._l("reachable")
                      : this._l("unreachable")
                }</span
              >`
        }
      </div>
    `;
  }

  private _renderInUse(files: LinkedFile[]): TemplateResult | typeof nothing {
    const inUse = files.filter((file) => file.status.in_use);
    if (!inUse.length) {
      return nothing;
    }
    return html`
      <h2 class="section">${this._l("in_use.title")}</h2>
      <div class="card">
        ${inUse.map((file) => {
          const parts = [
            file.status.fetched_at
              ? this._l("in_use.fetched", {
                  time: this._time(file.status.fetched_at, true),
                })
              : undefined,
            file.status.playing_on
              ? this._l("in_use.playing_on", {
                  player: linkedUsedByText(
                    this.hass,
                    this._modeLocalize,
                    file.status.playing_on
                  ),
                })
              : undefined,
            file.fetch === "keep"
              ? this._l("in_use.kept")
              : this._l("in_use.thrown_away"),
          ].filter(Boolean);
          return html`<div class="in-use">
            <span class="name">${file.name}</span>
            <span class="secondary">${parts.join(" · ")}</span>
          </div>`;
        })}
      </div>
    `;
  }

  private _time(value: string | null, seconds = false): string {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (seconds) {
      return date.toLocaleTimeString(this.hass.locale.language, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    }
    return formatTime(date, this.hass.locale, this.hass.config);
  }

  private _openAdd(): void {
    this._addOpen = true;
  }

  private _addClosed(): void {
    this._addOpen = false;
  }

  private _openSheet(ev: Event): void {
    this._openFileId = (ev.currentTarget as any).fileId;
  }

  private _sheetClosed(): void {
    this._openFileId = undefined;
  }

  private async _check(ev: Event): Promise<void> {
    const fileId: string = (ev.currentTarget as any).fileId;
    this._checking = new Set([...this._checking, fileId]);
    try {
      await checkLinkedFile(this.hass, fileId);
    } catch (_err) {
      // The list shows the result of the check; a failed call changes nothing.
    }
    const next = new Set(this._checking);
    next.delete(fileId);
    this._checking = next;
    await this._load();
  }

  static get styles(): CSSResultGroup {
    return [
      stackedLabelStyles,
      css`
        :host {
          display: block;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4);
          max-width: 720px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .intro,
        .empty {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
          line-height: var(--ha-line-height-normal);
        }
        .loading {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-6);
        }
        .card {
          background: var(--ha-card-background, var(--card-background-color));
          border-radius: var(--ha-border-radius-xl);
          overflow: hidden;
        }
        .row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 58px;
          padding-inline-end: var(--ha-space-3);
        }
        .row + .row {
          border-top: 1px solid var(--divider-color);
        }
        .row-main {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 58px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          background: none;
          color: inherit;
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .row-main:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: -2px;
        }
        .icon {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: var(--ha-border-radius-md);
          background: var(--secondary-background-color);
          color: var(--primary-color);
          --mdc-icon-size: 20px;
        }
        .icon.failed {
          color: var(--error-color);
        }
        .text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .name,
        .secondary {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .name {
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .secondary {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .secondary.error,
        .state.error {
          color: var(--error-color);
        }
        .state {
          flex: none;
          font-size: var(--ha-font-size-s);
          color: var(--success-color, var(--secondary-text-color));
        }
        .section {
          margin: var(--ha-space-2) 0 0;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .in-use {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 56px;
          padding: var(--ha-space-2) var(--ha-space-4);
          box-sizing: border-box;
        }
        ha-button {
          align-self: flex-start;
        }
        .row ha-button {
          align-self: center;
          flex: none;
          min-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HASSDomEvents {
    "linked-shown-changed": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-linked-media": HaLinkedMedia;
  }
}
