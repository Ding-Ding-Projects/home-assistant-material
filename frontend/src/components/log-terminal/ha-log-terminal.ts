import {
  mdiAlert,
  mdiAlertCircle,
  mdiArrowCollapseDown,
  mdiChevronDown,
  mdiChevronUp,
  mdiClockOutline,
  mdiCodeJson,
  mdiContentCopy,
  mdiFileDocumentOutline,
  mdiFilterOutline,
  mdiFilterVariant,
  mdiFormatFontSizeDecrease,
  mdiFormatFontSizeIncrease,
  mdiPause,
  mdiPlay,
  mdiWrap,
  mdiWrapDisabled,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import type { HASSDomTargetEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type {
  LogLevel,
  LogLine,
} from "../../common/log-terminal/log-terminal-logic";
import {
  ALL_LEVELS,
  exportAsJsonLines,
  exportAsText,
  exportFileName,
  lineAsText,
  linesAsText,
  markSegments,
  matchIndexes,
  matchRanges,
  queryError,
  searchableText,
  stepMatch,
  visibleLines,
} from "../../common/log-terminal/log-terminal-logic";
import { parseAnsiSegments } from "../../common/string/ansi-segments";
import type { LocalizeFunc } from "../../common/translations/localize";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { ansiStyles } from "../../resources/ansi-styles";
import { haStyle, haStyleScrollbar } from "../../resources/styles";
import { fileDownload } from "../../util/file_download";
import { showToast } from "../../util/toast";
import type { HaDropdownSelectEvent } from "../ha-dropdown";
import "../ha-dropdown";
import "../ha-dropdown-item";
import "../ha-icon-button";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";

/** Text sizes the person can step through, in pixels. */
export const TERMINAL_TEXT_SIZES = [11, 12, 13, 14, 16, 18] as const;

const DEFAULT_SIZE_INDEX = 2;

/** How near the bottom counts as being at the bottom, in pixels. */
const BOTTOM_MARGIN = 24;

const STORAGE_KEY = "ha-log-terminal";

interface TerminalPreferences {
  wrap: boolean;
  timestamps: boolean;
  size: number;
}

const readPreferences = (): TerminalPreferences => {
  const defaults = {
    wrap: true,
    timestamps: true,
    size: DEFAULT_SIZE_INDEX,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      wrap: typeof stored.wrap === "boolean" ? stored.wrap : defaults.wrap,
      timestamps:
        typeof stored.timestamps === "boolean"
          ? stored.timestamps
          : defaults.timestamps,
      size:
        Number.isInteger(stored.size) &&
        stored.size >= 0 &&
        stored.size < TERMINAL_TEXT_SIZES.length
          ? stored.size
          : defaults.size,
    };
  } catch (_err) {
    return defaults;
  }
};

const writePreferences = (preferences: TerminalPreferences): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (_err) {
    // Storage is unavailable: the choice lasts until the page is left.
  }
};

declare global {
  interface HTMLElementTagNameMap {
    "ha-log-terminal": HaLogTerminal;
  }
}

/**
 * A live log that can only be read. The lines are given to it; it follows
 * the newest one, searches, filters, copies and exports them. It has no
 * input: it is a log terminal, not a shell.
 */
@customElement("ha-log-terminal")
export class HaLogTerminal extends LitElement {
  @property({ attribute: false }) public lines: readonly LogLine[] = [];

  /** How many older lines were dropped to stay within the buffer. */
  @property({ type: Number }) public dropped = 0;

  /** Names the export files, for example the app's name. */
  @property() public name = "log";

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _follow = true;

  @state() private _wrap = readPreferences().wrap;

  @state() private _timestamps = readPreferences().timestamps;

  @state() private _sizeIndex = readPreferences().size;

  @state() private _search = "";

  @state() private _onlyMatches = false;

  @state() private _levels: ReadonlySet<LogLevel> = new Set(ALL_LEVELS);

  @state() private _matchPos = -1;

  @state() private _selectedId?: number;

  @state() private _announcement = "";

  @query(".pane") private _pane?: HTMLElement;

  @query("ha-input-search") private _searchField?: HaInputSearch;

  @query(".tools [data-first]") private _firstTool?: HTMLElement;

  @queryAll(".line") private _rows!: NodeListOf<HTMLElement>;

  private _lang = new LanguageModeController(this);

  private _manualPause = false;

  private _programmatic = false;

  private _announcedId = 0;

  private _shown: LogLine[] = [];

  private _matches: number[] = [];

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this._localize as never,
      `ui.app_job.terminal.${key}`,
      values
    );
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this._localize as never, key, values);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (
      changed.has("lines") ||
      changed.has("_search") ||
      changed.has("_onlyMatches") ||
      changed.has("_levels")
    ) {
      this._shown = visibleLines(this.lines, {
        query: this._search,
        onlyMatches: this._onlyMatches,
        levels: this._levels,
      });
      this._matches = matchIndexes(this._shown, this._search);
      if (changed.has("_search") || changed.has("_onlyMatches")) {
        this._matchPos = -1;
      } else if (this._matchPos >= this._matches.length) {
        this._matchPos = this._matches.length ? this._matches.length - 1 : -1;
      }
    }
    if (changed.has("lines")) {
      const newestError = [...this.lines]
        .reverse()
        .find((line) => line.level === "error" && line.source !== "note");
      if (newestError && newestError.id > this._announcedId) {
        this._announcedId = newestError.id;
        this._announcement = `${this._l("level.error")}: ${searchableText(newestError).slice(0, 200)}`;
      }
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("lines") && this._follow) {
      this._scrollToBottom();
    }
  }

  // ---- following ----

  private _scrollToBottom(): void {
    const pane = this._pane;
    if (!pane) {
      return;
    }
    this._programmatic = true;
    pane.scrollTop = pane.scrollHeight;
    requestAnimationFrame(() => {
      this._programmatic = false;
    });
  }

  private _onScroll(): void {
    const pane = this._pane;
    if (!pane || this._programmatic) {
      return;
    }
    const atBottom =
      pane.scrollHeight - pane.scrollTop - pane.clientHeight <= BOTTOM_MARGIN;
    if (!atBottom) {
      this._follow = false;
    } else if (!this._manualPause) {
      this._follow = true;
    }
  }

  private _toggleFollow(): void {
    if (this._follow) {
      this._manualPause = true;
      this._follow = false;
    } else {
      this._jumpToNewest();
    }
  }

  private _jumpToNewest(): void {
    this._manualPause = false;
    this._follow = true;
    this._scrollToBottom();
  }

  // ---- preferences ----

  private _save(): void {
    writePreferences({
      wrap: this._wrap,
      timestamps: this._timestamps,
      size: this._sizeIndex,
    });
  }

  private _toggleWrap(): void {
    this._wrap = !this._wrap;
    this._save();
  }

  private _toggleTimestamps(): void {
    this._timestamps = !this._timestamps;
    this._save();
  }

  private _smaller(): void {
    this._sizeIndex = Math.max(0, this._sizeIndex - 1);
    this._save();
  }

  private _larger(): void {
    this._sizeIndex = Math.min(
      TERMINAL_TEXT_SIZES.length - 1,
      this._sizeIndex + 1
    );
    this._save();
  }

  // ---- search ----

  private _searchChanged(ev: HASSDomTargetEvent<HaInputSearch>): void {
    this._search = ev.target.value ?? "";
  }

  private _toggleOnlyMatches(): void {
    this._onlyMatches = !this._onlyMatches;
  }

  private _step(direction: 1 | -1): void {
    const next = stepMatch(this._matches, this._matchPos, direction);
    if (next < 0) {
      return;
    }
    this._matchPos = next;
    this._manualPause = true;
    this._follow = false;
    this.updateComplete.then(() => {
      const id = this._shown[this._matches[next]]?.id;
      Array.from(this._rows)
        .find((row) => row.dataset.id === String(id))
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  private _previousMatch(): void {
    this._step(-1);
  }

  private _nextMatch(): void {
    this._step(1);
  }

  private _searchKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._step(ev.shiftKey ? -1 : 1);
    }
  }

  private _toggleLevel(ev: HaDropdownSelectEvent): void {
    const level = ev.detail.item.value as LogLevel;
    if (!ALL_LEVELS.includes(level)) {
      return;
    }
    const next = new Set(this._levels);
    if (next.has(level)) {
      next.delete(level);
    } else {
      next.add(level);
    }
    this._levels = next;
  }

  // ---- copy and export ----

  private async _copy(text: string): Promise<void> {
    if (!text) {
      this._toast(this._l("nothing_to_copy"));
      return;
    }
    try {
      await copyToClipboard(text, this);
      this._toast(this._l("copied"));
    } catch (_err) {
      this._toast(this._l("copy_failed"));
    }
  }

  private _toast(message: string): void {
    showToast(this, { message });
  }

  private _selectionText(): string {
    const root = this.shadowRoot as ShadowRoot & {
      getSelection?: () => Selection | null;
    };
    const selection = root.getSelection?.() ?? window.getSelection();
    return selection?.toString() ?? "";
  }

  private _copyAction(ev: HaDropdownSelectEvent): void {
    switch (ev.detail.item.value) {
      case "all":
        void this._copy(linesAsText(this._shown, this._timestamps));
        break;
      case "selection":
        void this._copy(this._selectionText());
        break;
      case "text":
        this._download("txt", exportAsText(this._shown), "text/plain");
        break;
      case "jsonl":
        this._download(
          "jsonl",
          exportAsJsonLines(this._shown),
          "application/x-ndjson"
        );
        break;
    }
  }

  private _download(extension: string, content: string, type: string): void {
    const url = URL.createObjectURL(
      new Blob([content], { type: `${type};charset=utf-8` })
    );
    fileDownload(url, exportFileName(this.name, Date.now(), extension));
  }

  private _copyLine(ev: Event): void {
    // The row itself selects a line on a click: this button only copies it.
    ev.stopPropagation();
    const id = Number((ev.currentTarget as HTMLElement).dataset.id);
    const line = this._shown.find((candidate) => candidate.id === id);
    if (line) {
      void this._copy(lineAsText(line, this._timestamps));
    }
  }

  // ---- lines ----

  private _selectLine(ev: Event): void {
    const id = Number((ev.currentTarget as HTMLElement).dataset.id);
    this._selectedId = this._selectedId === id ? undefined : id;
  }

  // ---- keyboard ----

  private _paneKeydown(ev: KeyboardEvent): void {
    const pane = this._pane;
    if (!pane) {
      return;
    }
    const line = parseFloat(getComputedStyle(pane).lineHeight) || 20;
    switch (ev.key) {
      case "ArrowDown":
        pane.scrollBy({ top: line });
        break;
      case "ArrowUp":
        pane.scrollBy({ top: -line });
        break;
      case "PageDown":
        pane.scrollBy({ top: pane.clientHeight - line });
        break;
      case "PageUp":
        pane.scrollBy({ top: -(pane.clientHeight - line) });
        break;
      case "Home":
        pane.scrollTo({ top: 0 });
        break;
      case "End":
        pane.scrollTo({ top: pane.scrollHeight });
        break;
      case "f":
      case "F":
        if (ev.ctrlKey || ev.metaKey) {
          this._searchField?.focus();
          break;
        }
        return;
      case "Escape":
        // Leave the pane without closing the dialog around it.
        ev.stopPropagation();
        this._firstTool?.focus();
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  // ---- render ----

  protected render(): TemplateResult {
    const error = queryError(this._search);
    const total = this._matches.length;
    const searching = !!this._search.trim();
    const samples = this.lines.slice(-50).map((line) => searchableText(line));
    return html`
      <div class="toolbar">
        <div class="search-row">
          <ha-input-search
            appearance="outlined"
            .value=${this._search}
            .placeholder=${this._l("search")}
            .patternSamples=${samples}
            @input=${this._searchChanged}
            @keydown=${this._searchKeydown}
          ></ha-input-search>
          <span class="count" role="status">
            ${
              !searching
                ? nothing
                : error
                  ? nothing
                  : total
                    ? this._l("match_count", {
                        current: this._matchPos < 0 ? 0 : this._matchPos + 1,
                        total,
                      })
                    : this._l("no_matches")
            }
          </span>
          <ha-icon-button
            .path=${mdiChevronUp}
            .label=${this._l("previous_match")}
            .disabled=${!total}
            @click=${this._previousMatch}
          ></ha-icon-button>
          <ha-icon-button
            .path=${mdiChevronDown}
            .label=${this._l("next_match")}
            .disabled=${!total}
            @click=${this._nextMatch}
          ></ha-icon-button>
        </div>
        ${
          error
            ? html`<p class="problem" role="status">
                ${this._t(`ui.regex.filter_error.${error}`)}
              </p>`
            : nothing
        }
        <div class="tools" role="toolbar" aria-label=${this._l("tools")}>
          <ha-icon-button
            data-first
            .path=${this._follow ? mdiPause : mdiPlay}
            .label=${this._follow ? this._l("pause") : this._l("resume")}
            aria-pressed=${this._follow ? "false" : "true"}
            @click=${this._toggleFollow}
          ></ha-icon-button>
          <ha-icon-button
            .path=${this._wrap ? mdiWrapDisabled : mdiWrap}
            .label=${this._wrap ? this._l("wrap_off") : this._l("wrap_on")}
            @click=${this._toggleWrap}
          ></ha-icon-button>
          <ha-icon-button
            .path=${mdiClockOutline}
            .label=${
              this._timestamps
                ? this._l("timestamps_off")
                : this._l("timestamps_on")
            }
            aria-pressed=${this._timestamps ? "true" : "false"}
            @click=${this._toggleTimestamps}
          ></ha-icon-button>
          <ha-icon-button
            .path=${mdiFormatFontSizeDecrease}
            .label=${this._l("smaller")}
            .disabled=${this._sizeIndex === 0}
            @click=${this._smaller}
          ></ha-icon-button>
          <ha-icon-button
            .path=${mdiFormatFontSizeIncrease}
            .label=${this._l("larger")}
            .disabled=${this._sizeIndex === TERMINAL_TEXT_SIZES.length - 1}
            @click=${this._larger}
          ></ha-icon-button>
          <ha-icon-button
            .path=${mdiFilterOutline}
            .label=${
              this._onlyMatches
                ? this._l("show_all_lines")
                : this._l("only_matches")
            }
            aria-pressed=${this._onlyMatches ? "true" : "false"}
            @click=${this._toggleOnlyMatches}
          ></ha-icon-button>
          <ha-dropdown @wa-select=${this._toggleLevel}>
            <ha-icon-button
              slot="trigger"
              .path=${mdiFilterVariant}
              .label=${this._l("levels")}
            ></ha-icon-button>
            ${ALL_LEVELS.map(
              (level) =>
                html`<ha-dropdown-item
                  type="checkbox"
                  .value=${level}
                  .checked=${this._levels.has(level)}
                  >${this._l(`level.${level}`)}</ha-dropdown-item
                >`
            )}
          </ha-dropdown>
          <ha-dropdown @wa-select=${this._copyAction}>
            <ha-icon-button
              slot="trigger"
              .path=${mdiContentCopy}
              .label=${this._l("copy_and_export")}
            ></ha-icon-button>
            <ha-dropdown-item value="all"
              >${this._l("copy_all")}</ha-dropdown-item
            >
            <ha-dropdown-item value="selection"
              >${this._l("copy_selection")}</ha-dropdown-item
            >
            <ha-dropdown-item value="text">
              <ha-svg-icon
                slot="icon"
                .path=${mdiFileDocumentOutline}
              ></ha-svg-icon>
              ${this._l("export_text")}
            </ha-dropdown-item>
            <ha-dropdown-item value="jsonl">
              <ha-svg-icon slot="icon" .path=${mdiCodeJson}></ha-svg-icon>
              ${this._l("export_json")}
            </ha-dropdown-item>
          </ha-dropdown>
        </div>
      </div>
      <div class="frame">
        <div
          class=${classMap({ pane: true, "ha-scrollbar": true, nowrap: !this._wrap })}
          style=${styleMap({
            "--log-terminal-font-size": `${TERMINAL_TEXT_SIZES[this._sizeIndex]}px`,
          })}
          role="region"
          aria-label=${this._l("label")}
          tabindex="0"
          @scroll=${this._onScroll}
          @keydown=${this._paneKeydown}
        >
          ${
            this.dropped > 0
              ? html`<div class="dropped">
                  ${this._l("dropped", { count: this.dropped })}
                </div>`
              : nothing
          }
          ${
            this._shown.length
              ? repeat(
                  this._shown,
                  (line) => line.id,
                  (line, index) => this._renderLine(line, index)
                )
              : html`<div class="empty">
                  ${this.lines.length ? this._l("no_lines") : this._l("empty")}
                </div>`
          }
        </div>
        ${
          this._follow
            ? nothing
            : html`<button class="jump" @click=${this._jumpToNewest}>
                <ha-svg-icon .path=${mdiArrowCollapseDown}></ha-svg-icon>
                ${this._l("jump_to_newest")}
              </button>`
        }
      </div>
      <div class="visually-hidden" role="status" aria-live="polite">
        ${this._announcement}
      </div>
    `;
  }

  private _renderLine(line: LogLine, index: number): TemplateResult {
    const text = searchableText(line);
    const ranges = this._search.trim() ? matchRanges(this._search, text) : [];
    const segments = markSegments(parseAnsiSegments(line.text), ranges);
    const isCurrent =
      this._matchPos >= 0 && this._matches[this._matchPos] === index;
    const selected = this._selectedId === line.id;
    return html`<div
      class=${classMap({
        line: true,
        [`level-${line.level}`]: true,
        [`source-${line.source}`]: true,
        current: isCurrent,
        selected,
      })}
      data-id=${line.id}
      @click=${this._selectLine}
    >
      ${
        this._timestamps && line.source !== "note"
          ? html`<span class="time" aria-hidden="true"
              >${new Date(line.time).toTimeString().slice(0, 8)}</span
            >`
          : nothing
      }
      ${
        line.level === "error"
          ? html`<span class="mark error"
              ><ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon
              ><span class="mark-word">${this._l("level.error")}</span></span
            >`
          : line.level === "warning"
            ? html`<span class="mark warning"
                ><ha-svg-icon .path=${mdiAlert}></ha-svg-icon
                ><span class="mark-word"
                  >${this._l("level.warning")}</span
                ></span
              >`
            : nothing
      }<span class="text"
        >${segments.map(
          (segment) =>
            html`<span
              class=${classMap({
                ...Object.fromEntries(segment.classes.map((c) => [c, true])),
                match: segment.match,
              })}
              >${segment.text}</span
            >`
        )}</span
      ><button
        class="copy-line"
        data-id=${line.id}
        aria-label=${this._l("copy_line")}
        title=${this._l("copy_line")}
        @click=${this._copyLine}
      >
        <ha-svg-icon .path=${mdiContentCopy}></ha-svg-icon>
      </button>
    </div>`;
  }

  static styles = [
    haStyle,
    haStyleScrollbar,
    ansiStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      .toolbar {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        margin-bottom: var(--ha-space-2);
      }
      .search-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        min-width: 0;
      }
      ha-input-search {
        flex: 1;
        min-width: 0;
      }
      .count {
        flex: none;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        white-space: nowrap;
      }
      .problem {
        margin: 0;
        color: var(--error-color);
        font-size: var(--ha-font-size-s);
      }
      .tools {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1);
      }
      ha-icon-button {
        --ha-icon-button-size: 44px;
      }
      ha-icon-button[aria-pressed="true"] {
        color: var(--primary-color);
      }
      .frame {
        position: relative;
        min-width: 0;
      }
      .pane {
        box-sizing: border-box;
        height: var(--log-terminal-height, 320px);
        overflow: auto;
        padding: var(--ha-space-2);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-md, 8px);
        background: var(
          --code-editor-background-color,
          var(--card-background-color)
        );
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--log-terminal-font-size, 13px);
        line-height: 1.45;
        user-select: text;
        outline: none;
      }
      .pane:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .line {
        position: relative;
        display: flex;
        align-items: baseline;
        gap: var(--ha-space-2);
        padding-inline-end: 36px;
        min-height: 1.45em;
        content-visibility: auto;
        contain-intrinsic-size: auto 1.45em;
      }
      .text {
        flex: 1;
        min-width: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .nowrap .line {
        width: max-content;
        min-width: 100%;
      }
      .nowrap .text {
        white-space: pre;
        overflow-wrap: normal;
      }
      .time {
        flex: none;
        user-select: none;
        color: var(--secondary-text-color);
      }
      .mark {
        flex: none;
        user-select: none;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-weight: var(--ha-font-weight-medium);
      }
      .mark ha-svg-icon {
        --mdc-icon-size: 1.1em;
      }
      .mark.error {
        color: var(--error-color);
      }
      .mark.warning {
        color: var(--warning-color);
      }
      .level-error .text {
        color: var(--error-color);
      }
      .level-warning .text {
        color: var(--warning-color);
      }
      .level-debug .text {
        color: var(--secondary-text-color);
      }
      .source-note {
        margin-block: var(--ha-space-2) var(--ha-space-1);
        padding-block: var(--ha-space-1);
        border-block: 1px solid var(--divider-color);
        font-weight: var(--ha-font-weight-medium);
        color: var(--primary-text-color);
      }
      .source-note .text {
        color: inherit;
      }
      .match {
        background: var(
          --ha-color-fill-primary-normal-resting,
          rgba(3, 169, 244, 0.3)
        );
        border-radius: 2px;
        outline: 1px solid var(--primary-color);
      }
      .line.current {
        background: var(
          --ha-color-fill-primary-quiet-resting,
          rgba(3, 169, 244, 0.12)
        );
      }
      .line.selected {
        background: var(--secondary-background-color);
      }
      .copy-line {
        position: absolute;
        inset-block-start: 0;
        inset-inline-end: 0;
        display: none;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 100%;
        min-height: 28px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      .copy-line ha-svg-icon {
        --mdc-icon-size: 16px;
      }
      .line:hover .copy-line,
      .line:focus-within .copy-line,
      .line.selected .copy-line {
        display: inline-flex;
      }
      .copy-line:focus-visible {
        outline: 2px solid var(--primary-color);
      }
      @media (pointer: coarse) {
        .line:hover:not(.selected) .copy-line {
          display: none;
        }
        .line.selected .copy-line {
          width: 44px;
          min-height: 44px;
        }
      }
      .dropped,
      .empty {
        color: var(--secondary-text-color);
        font-family: var(--ha-font-family-body);
        font-size: var(--ha-font-size-s);
        padding-block: var(--ha-space-1);
      }
      .jump {
        position: absolute;
        inset-block-end: var(--ha-space-3);
        inset-inline-end: var(--ha-space-4);
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1);
        min-height: 44px;
        padding: 0 var(--ha-space-4);
        border: none;
        border-radius: var(--ha-border-radius-pill, 999px);
        background: var(--primary-color);
        color: var(--text-primary-color);
        font: inherit;
        font-weight: var(--ha-font-weight-medium);
        cursor: pointer;
        box-shadow: var(--ha-box-shadow-m, 0 2px 6px rgba(0, 0, 0, 0.3));
      }
      .jump:focus-visible {
        outline: 2px solid var(--primary-text-color);
        outline-offset: 2px;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      @media (prefers-reduced-motion: reduce) {
        .pane {
          scroll-behavior: auto;
        }
      }
    `,
  ];
}
