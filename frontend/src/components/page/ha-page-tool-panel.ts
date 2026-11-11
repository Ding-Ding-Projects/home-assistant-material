import type { ContextType } from "@lit/context";
import {
  mdiArrowLeft,
  mdiClose,
  mdiContentCopy,
  mdiDownload,
  mdiExportVariant,
  mdiFormatPaint,
  mdiHelpCircleOutline,
  mdiHistory,
  mdiLock,
  mdiLockOpenVariantOutline,
  mdiPrinter,
  mdiRefresh,
  mdiStop,
  mdiVolumeHigh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  ACCESSIBILITY_STORAGE_KEY,
  canReadAloud,
  collectReadableText,
  readAloud,
  stopReadingAloud,
} from "../../common/accessibility/accessibility-tools";
import { reloadAppearance } from "../../common/appearance/appearance-session";
import {
  kindLabel,
  resolveElementPath,
} from "../../common/appearance/element-appearance";
import { consume } from "../../common/decorators/consume";
import { getStorage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import type {
  HistoryEntry,
  HistorySubject,
} from "../../common/history/local-history";
import {
  clearHistory,
  HISTORY_LIMIT,
  HISTORY_SUBJECTS,
  noteLocalChange,
  readHistory,
} from "../../common/history/local-history";
import type { LockStore } from "../../common/locks/element-locks";
import {
  elementLockKey,
  isLocked,
  lockedElementPaths,
  pageLockKey,
  PIN_PATTERN,
  readLocks,
  subscribeLocks,
  tryPin,
  UNLOCK_HOLD_MS,
  withLock,
  withPin,
  writeLocks,
} from "../../common/locks/element-locks";
import type { ExportFormat, PageExport } from "../../common/page/export-page";
import {
  collectPageExport,
  EXPORT_FORMATS,
  exportContent,
  exportFileName,
  selectedRowCount,
  selectionOnly,
  toHtml,
} from "../../common/page/export-page";
import { FIND_LIMIT, PageFinder } from "../../common/page/find-in-page";
import type { HelpArticle } from "../../common/page/help-articles";
import { HELP_ARTICLES } from "../../common/page/help-articles";
import { searchMatcher } from "../../common/regex/filter";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { internationalizationContext } from "../../data/context";
import { fileDownload } from "../../util/file_download";
import "../ha-button";
import "../ha-icon-button";
import "../ha-svg-icon";
import "../locks/ha-lock-list";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import type { PageTool, PageToolRequest } from "./ha-page-tools";
import { isPageChrome } from "./ha-page-tools";

const PREVIEW_LENGTH = 1500;

const TOOL_ICONS: Record<Exclude<PageTool, "tools">, string> = {
  export: mdiExportVariant,
  history: mdiHistory,
  lock: mdiLock,
  help: mdiHelpCircleOutline,
};

/**
 * The panel the page tools open in: export, local history, the lock and
 * help. One per window, beside the page, which stays usable.
 */
@customElement("ha-page-tool-panel")
export class HaPageToolPanel extends LitElement {
  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _tool?: PageTool;

  @state() private _title = "";

  @state() private _export?: PageExport;

  @state() private _format: ExportFormat = "json";

  @state() private _tableIndex = 0;

  @state() private _selectionOnly = false;

  @state() private _status = "";

  @state() private _entries: HistoryEntry[] = [];

  @state() private _historyQuery = "";

  @state() private _historyScope: "page" | "all" = "page";

  @state() private _confirmClear = false;

  @state() private _locks: LockStore = readLocks();

  @state() private _now = Date.now();

  /** What is being held to unlock: the page, or the key of an element. */
  @state() private _holding?: string;

  @state() private _pinError = "";

  @state() private _helpQuery = "";

  @state() private _article?: HelpArticle;

  @state() private _findQuery = "";

  @state() private _findTotal = 0;

  @state() private _findPosition = 0;

  @state() private _reading = false;

  @query("#panel") private _panel?: HTMLElement;

  private _root?: HTMLElement;

  private _opener?: HTMLElement;

  private _finder = new PageFinder();

  private _holdTimer?: number;

  private _tick?: number;

  private _unsubscribeLocks?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribeLocks = subscribeLocks((locks) => {
      this._locks = locks;
    });
    window.addEventListener("keydown", this._keydown);
    window.addEventListener("local-history-changed", this._historyChanged);
    window.addEventListener("location-changed", this._pageChanged);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeLocks?.();
    this._unsubscribeLocks = undefined;
    window.removeEventListener("keydown", this._keydown);
    window.removeEventListener("local-history-changed", this._historyChanged);
    window.removeEventListener("location-changed", this._pageChanged);
    window.clearTimeout(this._holdTimer);
    window.clearInterval(this._tick);
  }

  public get isOpen(): boolean {
    return !!this._panel?.matches(":popover-open");
  }

  public async open(request: PageToolRequest): Promise<void> {
    if (!this.isOpen) {
      const active = this._deepActive();
      this._opener = active instanceof HTMLElement ? active : undefined;
    }
    this._root = request.root;
    this._title = request.title;
    this._show(request.tool);
    await this.updateComplete;
    if (this._panel && !this._panel.matches(":popover-open")) {
      this._panel.showPopover();
    }
    this._panel?.querySelector<HTMLElement>("h2")?.focus();
  }

  public close(): void {
    if (this._panel?.matches(":popover-open")) {
      this._panel.hidePopover();
    }
    if (this._findQuery) {
      this._finder.clear();
      this._findQuery = "";
    }
    window.clearInterval(this._tick);
    this._tick = undefined;
    this._tool = undefined;
    this._opener?.focus();
    this._opener = undefined;
  }

  private _deepActive(): Element | null {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  private _show(tool: PageTool): void {
    this._tool = tool;
    this._status = "";
    this._pinError = "";
    this._confirmClear = false;
    if (tool === "export") {
      this._readPage();
    } else if (tool === "history") {
      this._entries = readHistory();
    } else if (tool === "lock") {
      this._locks = readLocks();
      this._now = Date.now();
      window.clearInterval(this._tick);
      this._tick = window.setInterval(() => {
        this._now = Date.now();
      }, 1000);
    }
  }

  private _keydown = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape" && this.isOpen) {
      if (ev.composedPath().includes(this)) {
        ev.stopPropagation();
        this.close();
      }
      return;
    }
    if (
      ev.key.toLowerCase() === "l" &&
      ev.ctrlKey &&
      ev.shiftKey &&
      !ev.altKey &&
      !ev.metaKey
    ) {
      ev.preventDefault();
      const key = pageLockKey(window.location.pathname);
      const locks = readLocks();
      if (isLocked(locks, key)) {
        // Unlocking is always a deliberate act in the panel.
        this.open({
          tool: "lock",
          root: this._root ?? document.body,
          title: this._title || document.title,
        });
      } else {
        writeLocks(withLock(locks, key, true));
      }
    }
  };

  private _historyChanged = (): void => {
    if (this._tool === "history") {
      this._entries = readHistory();
    }
  };

  private _pageChanged = (): void => {
    if (this.isOpen && this._tool !== "help" && this._tool !== "history") {
      this.close();
    }
  };

  protected render(): TemplateResult {
    const localize = this._i18n.localize;
    const tool = this._tool;
    const heading = tool
      ? localize(
          tool === "tools"
            ? "ui.page_tools.label"
            : `ui.page_tools.${tool === "lock" ? "lock_title" : tool}`
        )
      : "";
    return html`
      <div id="panel" popover="manual" role="dialog" aria-labelledby="heading">
        <header>
          <div class="headings">
            <h2 id="heading" tabindex="-1">${heading}</h2>
            <span class="page">${this._title}</span>
          </div>
          <ha-icon-button
            .label=${localize("ui.page_tools.close")}
            .path=${mdiClose}
            @click=${this.close}
          ></ha-icon-button>
        </header>
        ${
          tool && tool !== "tools"
            ? html`<nav
                class="chips"
                aria-label=${localize("ui.page_tools.label")}
              >
                ${(["export", "history", "lock", "help"] as const).map(
                  (item) => html`
                    <button
                      type="button"
                      class=${classMap({ chip: true, on: item === tool })}
                      aria-pressed=${item === tool ? "true" : "false"}
                      data-tool=${item}
                      @click=${this._switchTool}
                    >
                      <ha-svg-icon .path=${TOOL_ICONS[item]}></ha-svg-icon>
                      ${localize(
                        `ui.page_tools.${item === "lock" ? "lock_title" : item}`
                      )}
                    </button>
                  `
                )}
              </nav>`
            : nothing
        }
        <div class="body">
          ${
            tool === "tools"
              ? this._renderTools()
              : tool === "export"
                ? this._renderExport()
                : tool === "history"
                  ? this._renderHistory()
                  : tool === "lock"
                    ? this._renderLock()
                    : tool === "help"
                      ? this._renderHelp()
                      : nothing
          }
        </div>
        ${
          this._status
            ? html`<div class="status" role="status">${this._status}</div>`
            : nothing
        }
      </div>
    `;
  }

  private _switchTool(ev: Event): void {
    this._show((ev.currentTarget as HTMLElement).dataset.tool as PageTool);
  }

  private _renderTools(): TemplateResult {
    const localize = this._i18n.localize;
    const locked = isLocked(this._locks, pageLockKey(window.location.pathname));
    return html`
      <ha-input-search
        appearance="outlined"
        .placeholder=${localize("ui.page_tools.find")}
        .accessibleLabel=${localize("ui.page_tools.find")}
        .value=${this._findQuery}
        @input=${this._findInput}
        @keydown=${this._findKeydown}
      ></ha-input-search>
      ${
        this._findQuery.trim()
          ? html`<p class="note" role="status">
              ${
                this._finder.invalid
                  ? localize("ui.page_tools.find_invalid")
                  : this._findTotal
                    ? localize(
                        this._findTotal >= FIND_LIMIT
                          ? "ui.page_tools.find_count_limit"
                          : "ui.page_tools.find_count",
                        {
                          current: this._findPosition + 1,
                          total: this._findTotal,
                        }
                      )
                    : localize("ui.page_tools.find_none")
              }
            </p>`
          : nothing
      }
      <div class="tool-list">
        <button type="button" class="tool" @click=${this._editAppearance}>
          <ha-svg-icon .path=${mdiFormatPaint}></ha-svg-icon>
          ${localize("ui.page_tools.appearance")}
        </button>
        ${
          canReadAloud()
            ? html`<button
                type="button"
                class="tool"
                @click=${this._toggleReading}
              >
                <ha-svg-icon
                  .path=${this._reading ? mdiStop : mdiVolumeHigh}
                ></ha-svg-icon>
                ${localize(
                  this._reading
                    ? "ui.page_tools.stop_reading"
                    : "ui.page_tools.read_aloud"
                )}
              </button>`
            : nothing
        }
        ${(["history", "export", "lock", "help"] as const).map(
          (item) => html`
            <button
              type="button"
              class="tool"
              data-tool=${item}
              @click=${this._switchTool}
            >
              <ha-svg-icon
                .path=${
                  item === "lock" && !locked
                    ? mdiLockOpenVariantOutline
                    : TOOL_ICONS[item]
                }
              ></ha-svg-icon>
              ${localize(
                `ui.page_tools.${item === "lock" ? "lock_title" : item}`
              )}
            </button>
          `
        )}
      </div>
      <p class="note">${localize("ui.page_tools.find_note")}</p>
    `;
  }

  private _findInput(ev: Event): void {
    this._findQuery = (ev.target as HaInputSearch).value ?? "";
    if (!this._root || !this._findQuery.trim()) {
      this._finder.clear();
      this._findTotal = 0;
      return;
    }
    this._finder.search(this._root, this._findQuery, isPageChrome);
    this._findTotal = this._finder.ranges.length;
    this._findPosition = this._finder.current;
  }

  private _findKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._finder.step(ev.shiftKey ? -1 : 1);
      this._findTotal = this._finder.ranges.length;
      this._findPosition = this._finder.current;
    }
  }

  private _editAppearance(): void {
    this.close();
    fireEvent(this, "hass-pick-appearance");
  }

  private _toggleReading(): void {
    if (this._reading) {
      stopReadingAloud();
      this._reading = false;
      return;
    }
    const chunks = this._root ? collectReadableText(this._root) : [];
    if (!chunks.length) {
      return;
    }
    this._reading = true;
    readAloud(chunks, this._i18n.language, () => {
      this._reading = false;
    });
  }

  private _readPage(): void {
    if (!this._root) {
      return;
    }
    this._export = collectPageExport(this._root, this._title);
    this._tableIndex = 0;
    if (!selectedRowCount(this._export)) {
      this._selectionOnly = false;
    }
    const tabular = this._format === "csv" || this._format === "tsv";
    if (tabular && !this._export.tables.length) {
      this._format = "json";
    } else if (this._export.tables.length && this._format === "json") {
      this._format = "csv";
    }
  }

  private _renderExport(): TemplateResult | typeof nothing {
    const localize = this._i18n.localize;
    const page = this._export;
    if (!page) {
      return nothing;
    }
    const rows = page.tables.reduce(
      (total, table) => total + table.rows.length,
      0
    );
    const selected = selectedRowCount(page);
    // The tables that can be exported now: with "selected rows only" a table
    // without a ticked row is not part of the export, so it is not offered.
    const offered = this._selectionOnly
      ? selectionOnly(page).tables
      : page.tables;
    const tableIndex = Math.min(
      this._tableIndex,
      Math.max(offered.length - 1, 0)
    );
    const { content } = exportContent(
      page,
      this._format,
      tableIndex,
      this._selectionOnly
    );
    return html`
      <p class="summary">
        ${localize("ui.page_tools.export_panel.summary", {
          tables: page.tables.length,
          rows,
          lines: page.text.length,
        })}
      </p>
      <div
        class="chips"
        role="group"
        aria-label=${localize("ui.page_tools.export_panel.format")}
      >
        ${EXPORT_FORMATS.map(
          (format) => html`
            <button
              type="button"
              class=${classMap({ chip: true, on: format === this._format })}
              aria-pressed=${format === this._format ? "true" : "false"}
              data-format=${format}
              ?disabled=${
                (format === "csv" || format === "tsv") && !page.tables.length
              }
              @click=${this._pickFormat}
            >
              ${localize(`ui.page_tools.export_panel.formats.${format}`)}
            </button>
          `
        )}
      </div>
      ${
        selected
          ? html`<div
              class="chips"
              role="group"
              aria-label=${localize("ui.page_tools.export_panel.rows_group")}
            >
              <button
                type="button"
                class=${classMap({ chip: true, on: !this._selectionOnly })}
                aria-pressed=${this._selectionOnly ? "false" : "true"}
                @click=${this._exportAllRows}
              >
                ${localize("ui.page_tools.export_panel.all_rows")}
              </button>
              <button
                type="button"
                class=${classMap({ chip: true, on: this._selectionOnly })}
                aria-pressed=${this._selectionOnly ? "true" : "false"}
                @click=${this._exportSelectedRows}
              >
                ${localize("ui.page_tools.export_panel.selection_only", {
                  count: selected,
                })}
              </button>
            </div>`
          : nothing
      }
      ${
        !page.tables.length
          ? html`<p class="note">
              ${localize("ui.page_tools.export_panel.no_table")}
            </p>`
          : nothing
      }
      ${
        (this._format === "csv" || this._format === "tsv") && offered.length > 1
          ? html`<div
              class="chips"
              role="group"
              aria-label=${localize("ui.page_tools.export_panel.table")}
            >
              ${offered.map(
                (table, index) => html`
                  <button
                    type="button"
                    class=${classMap({
                      chip: true,
                      on: index === tableIndex,
                    })}
                    aria-pressed=${index === tableIndex ? "true" : "false"}
                    data-index=${index}
                    @click=${this._pickTable}
                  >
                    ${localize("ui.page_tools.export_panel.table_number", {
                      number: index + 1,
                      rows: table.rows.length,
                    })}
                  </button>
                `
              )}
            </div>`
          : nothing
      }
      <pre
        class="preview"
        tabindex="0"
        aria-label=${localize("ui.page_tools.export_panel.preview")}
        .textContent=${content.slice(0, PREVIEW_LENGTH)}
      ></pre>
      ${
        content.length > PREVIEW_LENGTH
          ? html`<p class="note">
              ${localize("ui.page_tools.export_panel.preview_more", {
                shown: PREVIEW_LENGTH,
                total: content.length,
              })}
            </p>`
          : nothing
      }
      <div class="actions">
        <ha-button size="s" @click=${this._download}>
          <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
          ${localize("ui.page_tools.export_panel.download")}
        </ha-button>
        <ha-button size="s" appearance="filled" @click=${this._copy}>
          <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
          ${localize("ui.page_tools.export_panel.copy")}
        </ha-button>
        <ha-button size="s" appearance="filled" @click=${this._print}>
          <ha-svg-icon slot="start" .path=${mdiPrinter}></ha-svg-icon>
          ${localize("ui.page_tools.export_panel.print")}
        </ha-button>
        <ha-button size="s" appearance="plain" @click=${this._readPage}>
          <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
          ${localize("ui.page_tools.export_panel.refresh")}
        </ha-button>
      </div>
      <p class="note">${localize("ui.page_tools.export_panel.note")}</p>
    `;
  }

  private _pickFormat(ev: Event): void {
    this._format = (ev.currentTarget as HTMLElement).dataset
      .format as ExportFormat;
    this._status = "";
  }

  private _exportAllRows(): void {
    this._selectionOnly = false;
    this._tableIndex = 0;
  }

  private _exportSelectedRows(): void {
    this._selectionOnly = true;
    this._tableIndex = 0;
  }

  /** The picked table, kept inside the tables that are offered now. */
  private _currentTableIndex(): number {
    if (!this._export) {
      return 0;
    }
    const count = this._selectionOnly
      ? selectionOnly(this._export).tables.length
      : this._export.tables.length;
    return Math.min(this._tableIndex, Math.max(count - 1, 0));
  }

  private _pickTable(ev: Event): void {
    this._tableIndex = Number((ev.currentTarget as HTMLElement).dataset.index);
  }

  private _download(): void {
    if (!this._export) {
      return;
    }
    const { content, mime, extension } = exportContent(
      this._export,
      this._format,
      this._currentTableIndex(),
      this._selectionOnly
    );
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const name = exportFileName(this._export, extension);
    fileDownload(url, name);
    this._status = this._i18n.localize(
      "ui.page_tools.export_panel.downloaded",
      { name }
    );
  }

  private async _copy(): Promise<void> {
    if (!this._export) {
      return;
    }
    await copyToClipboard(
      exportContent(
        this._export,
        this._format,
        this._currentTableIndex(),
        this._selectionOnly
      ).content
    );
    this._status = this._i18n.localize("ui.page_tools.export_panel.copied");
  }

  private _print(): void {
    if (!this._export) {
      return;
    }
    // The document is printed from a frame of its own, so the print is the
    // exported page and not the interface around it. It runs no script.
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.style.cssText =
      "position:fixed;width:0;height:0;border:0;visibility:hidden";
    frame.srcdoc = toHtml(
      this._selectionOnly ? selectionOnly(this._export) : this._export
    );
    frame.addEventListener("load", () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 60000);
    });
    document.body.append(frame);
  }

  private _visibleEntries(): HistoryEntry[] {
    const localize = this._i18n.localize;
    const page = window.location.pathname;
    const matches = searchMatcher(this._historyQuery);
    return this._entries
      .filter((entry) => this._historyScope === "all" || entry.page === page)
      .filter((entry) =>
        matches(
          localize(`ui.page_tools.history_panel.subjects.${entry.subject}`),
          entry.page,
          this._time(entry.at)
        )
      )
      .reverse();
  }

  private _time(at: number): string {
    return new Date(at).toLocaleString(this._i18n.language, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  }

  private _renderHistory(): TemplateResult {
    const localize = this._i18n.localize;
    const entries = this._visibleEntries();
    return html`
      <div
        class="chips"
        role="group"
        aria-label=${localize("ui.page_tools.history_panel.scope")}
      >
        ${(["page", "all"] as const).map(
          (scope) => html`
            <button
              type="button"
              class=${classMap({
                chip: true,
                on: scope === this._historyScope,
              })}
              aria-pressed=${scope === this._historyScope ? "true" : "false"}
              data-scope=${scope}
              @click=${this._pickScope}
            >
              ${localize(`ui.page_tools.history_panel.scope_${scope}`)}
            </button>
          `
        )}
      </div>
      <ha-input-search
        appearance="outlined"
        .placeholder=${localize("ui.page_tools.history_panel.search")}
        .accessibleLabel=${localize("ui.page_tools.history_panel.search")}
        .value=${this._historyQuery}
        .patternSamples=${this._entries.map(
          (entry) =>
            `${localize(
              `ui.page_tools.history_panel.subjects.${entry.subject}`
            )} ${entry.page}`
        )}
        @input=${this._historyInput}
      ></ha-input-search>
      ${
        !entries.length
          ? html`<p class="empty">
              ${localize(
                this._entries.length
                  ? "ui.page_tools.history_panel.no_match"
                  : "ui.page_tools.history_panel.empty"
              )}
            </p>`
          : html`<ul class="entries">
              ${entries.map(
                (entry) => html`
                  <li>
                    <div class="entry-text">
                      <strong
                        >${localize("ui.page_tools.history_panel.changed", {
                          subject: localize(
                            `ui.page_tools.history_panel.subjects.${entry.subject}`
                          ),
                        })}</strong
                      >
                      <span>${this._time(entry.at)}</span>
                      <span class="path">${entry.page}</span>
                      ${
                        entry.kept
                          ? nothing
                          : html`<span
                              >${localize(
                                "ui.page_tools.history_panel.not_kept"
                              )}</span
                            >`
                      }
                    </div>
                    ${
                      entry.kept
                        ? html`<div class="entry-actions">
                            <ha-button
                              size="s"
                              appearance="filled"
                              data-id=${entry.id}
                              data-side="before"
                              @click=${this._restore}
                            >
                              ${localize("ui.page_tools.history_panel.undo")}
                            </ha-button>
                            <ha-button
                              size="s"
                              appearance="plain"
                              data-id=${entry.id}
                              data-side="after"
                              @click=${this._restore}
                            >
                              ${localize("ui.page_tools.history_panel.apply")}
                            </ha-button>
                          </div>`
                        : nothing
                    }
                  </li>
                `
              )}
            </ul>`
      }
      ${
        this._entries.length
          ? html`<div class="actions">
              ${
                this._confirmClear
                  ? html`
                      <span class="confirm"
                        >${localize(
                          "ui.page_tools.history_panel.clear_confirm",
                          { count: this._entries.length }
                        )}</span
                      >
                      <ha-button
                        size="s"
                        variant="danger"
                        @click=${this._clearHistory}
                      >
                        ${localize("ui.page_tools.history_panel.clear_yes")}
                      </ha-button>
                      <ha-button
                        size="s"
                        appearance="plain"
                        @click=${this._cancelClear}
                      >
                        ${localize("ui.page_tools.history_panel.clear_no")}
                      </ha-button>
                    `
                  : html`<ha-button
                      size="s"
                      appearance="plain"
                      variant="danger"
                      @click=${this._askClear}
                    >
                      ${localize("ui.page_tools.history_panel.clear")}
                    </ha-button>`
              }
            </div>`
          : nothing
      }
      <p class="note">
        ${localize("ui.page_tools.history_panel.note", {
          limit: HISTORY_LIMIT,
        })}
      </p>
    `;
  }

  private _pickScope(ev: Event): void {
    this._historyScope = (ev.currentTarget as HTMLElement).dataset.scope as
      "page" | "all";
  }

  private _historyInput(ev: Event): void {
    this._historyQuery = (ev.target as HaInputSearch).value ?? "";
  }

  private _restore(ev: Event): void {
    const { id, side } = (ev.currentTarget as HTMLElement).dataset;
    const entry = this._entries.find((item) => item.id === id);
    if (!entry?.kept) {
      return;
    }
    this._putBack(
      entry.subject,
      (side === "before" ? entry.before : entry.after) ?? null
    );
    this._status = this._i18n.localize("ui.page_tools.history_panel.restored");
  }

  /** Puts a stored choice back and has its owner apply it at once. */
  private _putBack(subject: HistorySubject, raw: string | null): void {
    const key = HISTORY_SUBJECTS[subject].key;
    if (subject === "appearance") {
      try {
        if (raw === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, raw);
        }
      } catch (_err) {
        return;
      }
      reloadAppearance();
      noteLocalChange("appearance");
      return;
    }
    if (
      subject === "accessibility" ||
      subject === "tabs" ||
      subject === "tabOrder" ||
      subject === "tabPins"
    ) {
      let value: unknown;
      try {
        value = raw === null ? undefined : JSON.parse(raw);
      } catch (_err) {
        return;
      }
      getStorage().setValue(
        subject === "accessibility" ? ACCESSIBILITY_STORAGE_KEY : key,
        value
      );
    }
  }

  private _askClear(): void {
    this._confirmClear = true;
  }

  private _cancelClear(): void {
    this._confirmClear = false;
  }

  private _clearHistory(): void {
    clearHistory();
    this._confirmClear = false;
    this._entries = [];
  }

  private _renderLock(): TemplateResult {
    const localize = this._i18n.localize;
    const key = pageLockKey(window.location.pathname);
    const locked = isLocked(this._locks, key);
    const hasPin = !!this._locks.pin;
    const wait = Math.max(
      0,
      Math.ceil((this._locks.blockedUntil - this._now) / 1000)
    );
    const others = this._locks.locked.filter(
      (item) => item.startsWith("page:") && item !== key
    );
    const page = window.location.pathname;
    // Locks with their own credentials are in the list of locks below.
    const elements = lockedElementPaths(this._locks, page).filter(
      (path) => !this._locks.records?.[elementLockKey(page, path)]
    );
    return html`
      <p class=${classMap({ state: true, locked })}>
        <ha-svg-icon
          .path=${locked ? mdiLock : mdiLockOpenVariantOutline}
        ></ha-svg-icon>
        ${localize(
          locked
            ? "ui.page_tools.lock_panel.state_locked"
            : "ui.page_tools.lock_panel.state_unlocked"
        )}
      </p>
      ${
        !locked
          ? html`<ha-button @click=${this._lockPage}>
              <ha-svg-icon slot="start" .path=${mdiLock}></ha-svg-icon>
              ${localize("ui.page_tools.lock")}
            </ha-button>`
          : hasPin
            ? html`
                <form class="pin-form" @submit=${this._unlockWithPin}>
                  <ha-input
                    name="pin"
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    .label=${localize("ui.page_tools.lock_panel.pin_label")}
                    ?disabled=${wait > 0}
                  ></ha-input>
                  <ha-button type="submit" ?disabled=${wait > 0}>
                    ${localize("ui.page_tools.lock_panel.unlock")}
                  </ha-button>
                </form>
                ${
                  wait > 0
                    ? html`<p class="error" role="status">
                        ${localize("ui.page_tools.lock_panel.wait", {
                          seconds: wait,
                        })}
                      </p>`
                    : nothing
                }
              `
            : html`<button
                type="button"
                class=${classMap({
                  hold: true,
                  holding: this._holding === "page",
                })}
                data-key="page"
                @pointerdown=${this._holdStart}
                @pointerup=${this._holdEnd}
                @pointerleave=${this._holdEnd}
                @pointercancel=${this._holdEnd}
                @keydown=${this._holdKeydown}
                @keyup=${this._holdKeyup}
                @blur=${this._holdEnd}
              >
                <span class="fill"></span>
                <span class="hold-label"
                  >${localize(
                    this._holding === "page"
                      ? "ui.page_tools.lock_panel.holding"
                      : "ui.page_tools.lock_panel.hold"
                  )}</span
                >
              </button>`
      }
      ${
        this._pinError
          ? html`<p class="error" role="alert">${this._pinError}</p>`
          : nothing
      }

      <h3>${localize("ui.page_tools.lock_panel.elements")}</h3>
      ${
        elements.length
          ? html`<ul class="elements">
                ${elements.map((path) => {
                  const elementKey = elementLockKey(page, path);
                  return html`<li>
                    <span class="element-name"
                      >${this._describeElement(path)}</span
                    >
                    ${
                      hasPin
                        ? nothing
                        : html`<button
                            type="button"
                            class=${classMap({
                              hold: true,
                              small: true,
                              holding: this._holding === elementKey,
                            })}
                            data-key=${elementKey}
                            @pointerdown=${this._holdStart}
                            @pointerup=${this._holdEnd}
                            @pointerleave=${this._holdEnd}
                            @pointercancel=${this._holdEnd}
                            @keydown=${this._holdKeydown}
                            @keyup=${this._holdKeyup}
                            @blur=${this._holdEnd}
                          >
                            <span class="fill"></span>
                            <span class="hold-label"
                              >${localize("ui.page_tools.lock_panel.hold")}</span
                            >
                          </button>`
                    }
                  </li>`;
                })}
              </ul>
              ${
                hasPin
                  ? html`<form
                      class="pin-form"
                      @submit=${this._unlockElementsWithPin}
                    >
                      <ha-input
                        name="pin"
                        type="password"
                        inputmode="numeric"
                        autocomplete="off"
                        .label=${localize("ui.page_tools.lock_panel.pin_label")}
                        ?disabled=${wait > 0}
                      ></ha-input>
                      <ha-button type="submit" ?disabled=${wait > 0}>
                        ${localize("ui.page_tools.lock_panel.unlock_elements")}
                      </ha-button>
                    </form>`
                  : nothing
              }`
          : html`<p class="note">
              ${localize("ui.page_tools.lock_panel.no_elements")}
            </p>`
      }

      <h3>${localize("ui.page_tools.lock_panel.pin_title")}</h3>
      <p class="note">
        ${localize(
          hasPin
            ? "ui.page_tools.lock_panel.pin_set"
            : "ui.page_tools.lock_panel.pin_none"
        )}
      </p>
      <form class="pin-form column" @submit=${this._savePin}>
        ${
          hasPin
            ? html`<ha-input
                name="current"
                type="password"
                inputmode="numeric"
                autocomplete="off"
                .label=${localize("ui.page_tools.lock_panel.pin_current")}
              ></ha-input>`
            : nothing
        }
        <ha-input
          name="pin"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          .label=${localize("ui.page_tools.lock_panel.pin_new")}
        ></ha-input>
        <ha-input
          name="repeat"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          .label=${localize("ui.page_tools.lock_panel.pin_repeat")}
        ></ha-input>
        <div class="actions">
          <ha-button size="s" type="submit" appearance="filled">
            ${localize("ui.page_tools.lock_panel.pin_save")}
          </ha-button>
          ${
            hasPin
              ? html`<ha-button
                  size="s"
                  appearance="plain"
                  variant="danger"
                  @click=${this._removePin}
                >
                  ${localize("ui.page_tools.lock_panel.pin_remove")}
                </ha-button>`
              : nothing
          }
        </div>
      </form>

      <h3>${localize("ui.page_tools.lock_panel.locked_pages")}</h3>
      ${
        others.length
          ? html`<ul class="paths">
              ${others.map(
                (item) =>
                  html`<li><a href=${item.slice(5)}>${item.slice(5)}</a></li>`
              )}
            </ul>`
          : html`<p class="note">
              ${localize("ui.page_tools.lock_panel.none_locked")}
            </p>`
      }
      <ha-lock-list></ha-lock-list>
      <p class="note">${localize("ui.page_tools.lock_panel.shortcut")}</p>
      <p class="note">${localize("ui.page_tools.lock_panel.note")}</p>
    `;
  }

  private _lockPage(): void {
    writeLocks(
      withLock(readLocks(), pageLockKey(window.location.pathname), true)
    );
    this._pinError = "";
  }

  private _unlockPage(): void {
    writeLocks(
      withLock(readLocks(), pageLockKey(window.location.pathname), false)
    );
    this._pinError = "";
    this._status = this._i18n.localize("ui.page_tools.lock_panel.unlocked");
  }

  private _formValue(form: HTMLFormElement, name: string): string {
    return form.querySelector<HaInput>(`ha-input[name="${name}"]`)?.value ?? "";
  }

  private _clearForm(form: HTMLFormElement): void {
    form.querySelectorAll<HaInput>("ha-input").forEach((input) => {
      input.value = "";
    });
  }

  private _checkPin(pin: string): boolean {
    const result = tryPin(readLocks(), pin, Date.now());
    writeLocks(result.store);
    this._now = Date.now();
    if (result.outcome === "ok") {
      this._pinError = "";
      return true;
    }
    // While a wait runs, the countdown says so; the message would repeat it.
    this._pinError =
      result.outcome === "wait" || result.waitMs
        ? ""
        : this._i18n.localize("ui.page_tools.lock_panel.wrong");
    return false;
  }

  private _unlockWithPin(ev: SubmitEvent): void {
    ev.preventDefault();
    const form = ev.currentTarget as HTMLFormElement;
    const pin = this._formValue(form, "pin");
    this._clearForm(form);
    if (this._checkPin(pin)) {
      this._unlockPage();
    }
  }

  private _savePin(ev: SubmitEvent): void {
    ev.preventDefault();
    const localize = this._i18n.localize;
    const form = ev.currentTarget as HTMLFormElement;
    const current = this._formValue(form, "current");
    const pin = this._formValue(form, "pin");
    const repeat = this._formValue(form, "repeat");
    if (!PIN_PATTERN.test(pin)) {
      this._pinError = localize("ui.page_tools.lock_panel.pin_invalid");
      return;
    }
    if (pin !== repeat) {
      this._pinError = localize("ui.page_tools.lock_panel.pin_mismatch");
      return;
    }
    if (readLocks().pin && !this._checkPin(current)) {
      this._clearForm(form);
      return;
    }
    writeLocks(withPin(readLocks(), pin));
    this._clearForm(form);
    this._pinError = "";
    this._status = localize("ui.page_tools.lock_panel.pin_saved");
  }

  private _removePin(ev: Event): void {
    const form = (ev.currentTarget as HTMLElement).closest("form");
    if (!form) {
      return;
    }
    const current = this._formValue(form, "current");
    this._clearForm(form);
    if (!this._checkPin(current)) {
      return;
    }
    writeLocks(withPin(readLocks(), undefined));
    this._status = this._i18n.localize("ui.page_tools.lock_panel.pin_removed");
  }

  private _holdStart(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key;
    if (this._holding || !key) {
      return;
    }
    this._holding = key;
    this._holdTimer = window.setTimeout(() => {
      this._holding = undefined;
      if (key === "page") {
        this._unlockPage();
      } else {
        writeLocks(withLock(readLocks(), key, false));
        this._status = this._i18n.localize("ui.page_tools.lock_panel.unlocked");
      }
    }, UNLOCK_HOLD_MS);
  }

  private _holdEnd(): void {
    if (!this._holding) {
      return;
    }
    this._holding = undefined;
    window.clearTimeout(this._holdTimer);
  }

  private _holdKeydown(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      ev.preventDefault();
      this._holdStart(ev);
    }
  }

  /** What a locked element is, in a few words, for the list of locks. */
  private _describeElement(path: string): string {
    const element = resolveElementPath(path);
    if (!element) {
      return this._i18n.localize("ui.page_tools.lock_panel.element_gone");
    }
    const text = collectReadableText(element)[0]?.slice(0, 60);
    const kind = kindLabel(element.localName);
    return text ? `${kind}: ${text}` : kind;
  }

  private _unlockElementsWithPin(ev: SubmitEvent): void {
    ev.preventDefault();
    const form = ev.currentTarget as HTMLFormElement;
    const pin = this._formValue(form, "pin");
    this._clearForm(form);
    if (!this._checkPin(pin)) {
      return;
    }
    const page = window.location.pathname;
    let locks = readLocks();
    lockedElementPaths(locks, page).forEach((path) => {
      locks = withLock(locks, elementLockKey(page, path), false);
    });
    writeLocks(locks);
    this._status = this._i18n.localize("ui.page_tools.lock_panel.unlocked");
  }

  private _holdKeyup(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      this._holdEnd();
    }
  }

  private _renderHelp(): TemplateResult {
    const localize = this._i18n.localize;
    if (this._article) {
      const base =
        `ui.page_tools.help_panel.articles.${this._article}` as const;
      return html`
        <button type="button" class="back" @click=${this._closeArticle}>
          <ha-svg-icon .path=${mdiArrowLeft}></ha-svg-icon>
          ${localize("ui.page_tools.help_panel.back")}
        </button>
        <article>
          <h3>${localize(`${base}.title`)}</h3>
          ${localize(`${base}.body`)
            .split("\n")
            .map((paragraph) => html`<p>${paragraph}</p>`)}
        </article>
      `;
    }
    const matches = searchMatcher(this._helpQuery);
    const articles = HELP_ARTICLES.filter((id) =>
      matches(
        localize(`ui.page_tools.help_panel.articles.${id}.title`),
        localize(`ui.page_tools.help_panel.articles.${id}.body`)
      )
    );
    return html`
      <ha-input-search
        appearance="outlined"
        .placeholder=${localize("ui.page_tools.help_panel.search")}
        .accessibleLabel=${localize("ui.page_tools.help_panel.search")}
        .value=${this._helpQuery}
        .patternSamples=${HELP_ARTICLES.map((id) =>
          localize(`ui.page_tools.help_panel.articles.${id}.title`)
        )}
        @input=${this._helpInput}
      ></ha-input-search>
      ${
        articles.length
          ? html`<ul class="articles">
              ${articles.map(
                (id) => html`
                  <li>
                    <button
                      type="button"
                      class="article"
                      data-article=${id}
                      @click=${this._openArticle}
                    >
                      <strong
                        >${localize(
                          `ui.page_tools.help_panel.articles.${id}.title`
                        )}</strong
                      >
                      <span
                        >${
                          localize(
                            `ui.page_tools.help_panel.articles.${id}.body`
                          ).split("\n")[0]
                        }</span
                      >
                    </button>
                  </li>
                `
              )}
            </ul>`
          : html`<p class="empty">
              ${localize("ui.page_tools.help_panel.no_match")}
            </p>`
      }
      <p class="note">${localize("ui.page_tools.help_panel.note")}</p>
    `;
  }

  private _helpInput(ev: Event): void {
    this._helpQuery = (ev.target as HaInputSearch).value ?? "";
  }

  private _openArticle(ev: Event): void {
    this._article = (ev.currentTarget as HTMLElement).dataset
      .article as HelpArticle;
  }

  private _closeArticle(): void {
    this._article = undefined;
  }

  static styles: CSSResultGroup = css`
    :host {
      font-family: var(--ha-font-family-body);
    }
    [popover] {
      border: none;
      margin: 0;
      padding: 0;
      inset: auto;
    }
    #panel {
      position: fixed;
      top: var(--ha-space-4);
      bottom: var(--ha-space-4);
      inset-inline-end: var(--ha-space-4);
      width: min(420px, calc(100vw - var(--ha-space-8)));
      height: auto;
      max-height: calc(100vh - var(--ha-space-8));
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      overflow: hidden;
    }
    #panel:popover-open {
      display: flex;
      flex-direction: column;
    }
    header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-4) var(--ha-space-3) var(--ha-space-2)
        var(--ha-space-5);
    }
    .headings {
      flex: 1;
      min-width: 0;
    }
    h2 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
      outline: none;
    }
    .page {
      display: block;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    h3 {
      margin: var(--ha-space-5) 0 var(--ha-space-1);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    nav.chips {
      padding: 0 var(--ha-space-5) var(--ha-space-3);
      border-bottom: 1px solid var(--divider-color);
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: var(--ha-space-4) var(--ha-space-5);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .body > * {
      flex: none;
    }
    p {
      margin: 0;
      line-height: var(--ha-line-height-normal);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    button {
      font: inherit;
      color: inherit;
      background: none;
      border: none;
      cursor: pointer;
      text-align: start;
    }
    button:focus-visible,
    .preview:focus-visible,
    a:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid var(--outline-color);
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 16px;
    }
    .chip.on {
      border-color: transparent;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .chip[disabled] {
      opacity: 0.45;
      cursor: default;
    }
    .note,
    .empty {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .empty {
      padding: var(--ha-space-6) 0;
      text-align: center;
    }
    .summary {
      font-weight: var(--ha-font-weight-medium);
    }
    .preview {
      margin: 0;
      padding: var(--ha-space-3);
      min-height: 120px;
      max-height: 280px;
      overflow: auto;
      border-radius: var(--ha-border-radius-lg);
      background: var(--primary-background-color);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .confirm {
      font-size: var(--ha-font-size-s);
    }
    .status {
      padding: var(--ha-space-3) var(--ha-space-5);
      border-top: 1px solid var(--divider-color);
      background: var(--primary-background-color);
      font-size: var(--ha-font-size-s);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .entries li {
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--primary-background-color);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .entry-text {
      display: flex;
      flex-direction: column;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .entry-text strong {
      font-size: var(--ha-font-size-m);
      color: var(--primary-text-color);
    }
    .entry-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .path {
      font-family: var(--ha-font-family-code);
      overflow-wrap: anywhere;
    }
    .state {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
    }
    .state.locked {
      color: var(--primary-color);
    }
    .pin-form {
      display: flex;
      align-items: flex-end;
      gap: var(--ha-space-2);
    }
    .pin-form.column {
      flex-direction: column;
      align-items: stretch;
    }
    .pin-form ha-input {
      flex: 1;
    }
    .error {
      color: var(--error-color);
      font-size: var(--ha-font-size-s);
    }
    .hold {
      position: relative;
      overflow: hidden;
      min-height: var(--ha-space-12);
      border-radius: var(--ha-border-radius-pill);
      border: 2px solid var(--primary-color);
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
      text-align: center;
      touch-action: none;
      user-select: none;
    }
    .hold.small {
      flex: none;
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-4);
      font-size: var(--ha-font-size-s);
    }
    .elements li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--primary-background-color);
    }
    .element-name {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-font-size-s);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hold .fill {
      position: absolute;
      inset: 0;
      background: var(--primary-color);
      opacity: 0.25;
      transform: scaleX(0);
      transform-origin: left;
    }
    .hold.holding .fill {
      transform: scaleX(1);
      transition: transform 1500ms linear;
    }
    .hold-label {
      position: relative;
    }
    .paths a {
      color: var(--primary-color);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    .tool-list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .tool {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: var(--ha-space-12);
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
    }
    .tool:hover,
    .article:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .article {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      width: 100%;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--primary-background-color);
    }
    .article span {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      align-self: flex-start;
      min-height: var(--ha-space-10);
      padding: 0 var(--ha-space-3) 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      color: var(--primary-color);
    }
    article {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    article h3 {
      margin: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .hold.holding .fill {
        transition: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-tool-panel": HaPageToolPanel;
  }
}
