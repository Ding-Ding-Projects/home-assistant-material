import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { formatTimeWithSeconds } from "../../../common/datetime/format_time";
import { fireEvent } from "../../../common/dom/fire_event";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-relative-time";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/input/ha-input-search";
import {
  ACTIVITY_RECORD_PAGE_SIZE,
  fetchActivityRecordDay,
  fetchActivityRecordDays,
  fetchActivityRecordStatus,
  formatRecordSize,
  pushActivityRecord,
  searchActivityRecord,
  setActivityRecordRemote,
} from "../../../data/activity_record";
import type {
  ActivityRecordDay,
  ActivityRecordEntry,
  ActivityRecordSearchResult,
  ActivityRecordStatus,
} from "../../../data/activity_record";
import { isValidDashboardRemote } from "../../../data/dashboard_repos";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

/** Days listed before Show more days. */
const DAYS_SHOWN = 60;

/**
 * The permanent record of the Activity page: what is kept, the days that have
 * entries, the entries of one day, a search over every day, and the Git
 * remote the record can be pushed to.
 */
@customElement("ha-config-activity-record")
export class HaConfigActivityRecord extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _status?: ActivityRecordStatus;

  @state() private _days: ActivityRecordDay[] = [];

  @state() private _daysShown = DAYS_SHOWN;

  @state() private _day?: string;

  @state() private _entries: ActivityRecordEntry[] = [];

  @state() private _total = 0;

  @state() private _hasMore = false;

  @state() private _loading = true;

  @state() private _dayLoading = false;

  @state() private _error?: string;

  @state() private _search = "";

  @state() private _searchText = "";

  @state() private _searchStart = "";

  @state() private _searchEnd = "";

  @state() private _searching = false;

  @state() private _result?: ActivityRecordSearchResult;

  @state() private _searchError?: string;

  @state() private _remoteInput = "";

  @state() private _remoteBusy = false;

  @state() private _pushing = false;

  @state() private _pushResult?: { ok: boolean; text: string };

  private _dayRequest = 0;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.activity_record.${key}` as any,
      values
    );
  }

  private _errorText(err: unknown): string {
    const message = (err as { message?: unknown } | undefined)?.message;
    return typeof message === "string" ? message : String(err);
  }

  protected firstUpdated(changed: PropertyValues<this>) {
    super.firstUpdated(changed);
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = undefined;
    try {
      const [status, days] = await Promise.all([
        fetchActivityRecordStatus(this.hass),
        fetchActivityRecordDays(this.hass),
      ]);
      this._status = status;
      this._days = days.days;
      this._remoteInput = status.remote ?? "";
      const day = this._day ?? days.days[0]?.day;
      if (day) {
        await this._openDay(day);
      }
    } catch (err) {
      this._error = this._errorText(err);
    } finally {
      this._loading = false;
    }
  }

  private async _refreshStatus() {
    this._status = await fetchActivityRecordStatus(this.hass);
  }

  private async _openDay(day: string) {
    const request = ++this._dayRequest;
    this._day = day;
    this._dayLoading = true;
    this._entries = [];
    this._search = "";
    try {
      const page = await fetchActivityRecordDay(this.hass, day);
      if (request !== this._dayRequest) {
        return;
      }
      this._entries = page.entries;
      this._total = page.total;
      this._hasMore = page.has_more;
    } catch (err) {
      if (request === this._dayRequest) {
        this._error = this._errorText(err);
      }
    } finally {
      if (request === this._dayRequest) {
        this._dayLoading = false;
      }
    }
  }

  private async _loadMore() {
    if (!this._day) {
      return;
    }
    const request = ++this._dayRequest;
    this._dayLoading = true;
    try {
      const page = await fetchActivityRecordDay(
        this.hass,
        this._day,
        this._entries.length,
        ACTIVITY_RECORD_PAGE_SIZE
      );
      if (request !== this._dayRequest) {
        return;
      }
      this._entries = [...this._entries, ...page.entries];
      this._total = page.total;
      this._hasMore = page.has_more;
    } catch (err) {
      if (request === this._dayRequest) {
        this._error = this._errorText(err);
      }
    } finally {
      if (request === this._dayRequest) {
        this._dayLoading = false;
      }
    }
  }

  private _dayDate(day: string): Date {
    return new Date(`${day}T12:00:00Z`);
  }

  private _formatDay(day: string): string {
    return new Intl.DateTimeFormat(this.hass.locale.language, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(this._dayDate(day));
  }

  private _formatTime(entry: ActivityRecordEntry): string {
    return formatTimeWithSeconds(
      new Date(entry.when),
      this.hass.locale,
      this.hass.config
    );
  }

  private _cause(entry: ActivityRecordEntry): string | undefined {
    if (entry.context_entity_id_name || entry.context_entity_id) {
      return entry.context_entity_id_name || entry.context_entity_id;
    }
    if (entry.context_name) {
      return entry.context_name;
    }
    if (entry.context_domain && entry.context_service) {
      return `${entry.context_domain}.${entry.context_service}`;
    }
    return undefined;
  }

  private _text(entry: ActivityRecordEntry): string {
    if (entry.message) {
      return entry.message;
    }
    if (entry.state !== undefined) {
      return this._l("changed_to", { state: entry.state });
    }
    return "";
  }

  private _entryValues(entry: ActivityRecordEntry): string[] {
    return [
      entry.name ?? "",
      this._text(entry),
      entry.entity_id ?? "",
      this._cause(entry) ?? "",
    ];
  }

  private _visibleEntries(): ActivityRecordEntry[] {
    if (!this._search.trim()) {
      return this._entries;
    }
    const matches = searchMatcher(this._search);
    return this._entries.filter((entry) =>
      matches(...this._entryValues(entry))
    );
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/logbook"
        .header=${this._l("caption")}
        .breadcrumb=${[
          this.hass.localize("panel.config"),
          this._l("caption"),
        ].join(", ")}
      >
        <div class="page">
          <h1>${this._l("title")}</h1>
          <p class="statement">${this._l("description")}</p>
          ${
            this._error
              ? html`<ha-alert
                  alert-type="error"
                  .title=${this._l("load_failed")}
                  >${this._error}</ha-alert
                >`
              : nothing
          }
          ${
            this._loading
              ? html`<p class="empty">${this._l("loading")}</p>`
              : html`${this._renderStatus()}
                  <div class="columns">
                    ${this._renderDays()}
                    <div class="main">
                      ${this._renderDay()} ${this._renderSearchAll()}
                    </div>
                  </div>
                  ${this._renderRemote()}`
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderStatus() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    const commit = status.last_commit;
    return html`
      <ha-card class="detail">
        <div class="detail-title">
          <h2>${this._l("status_title")}</h2>
          <span class="secondary"
            >${
              status.recording ? this._l("recording") : this._l("not_recording")
            }</span
          >
        </div>
        <dl class="facts">
          <div>
            <dt>${this._l("entries_today_label")}</dt>
            <dd>
              ${status.entries_today.toLocaleString(this.hass.locale.language)}
            </dd>
          </div>
          <div>
            <dt>${this._l("entries_total_label")}</dt>
            <dd>
              ${status.entries_total.toLocaleString(this.hass.locale.language)}
            </dd>
          </div>
          <div>
            <dt>${this._l("days_label")}</dt>
            <dd>${status.files.toLocaleString(this.hass.locale.language)}</dd>
          </div>
          <div>
            <dt>${this._l("size_label")}</dt>
            <dd>${formatRecordSize(status.bytes)}</dd>
          </div>
          <div>
            <dt>${this._l("last_commit_label")}</dt>
            <dd>
              ${
                commit
                  ? html`<ha-relative-time
                      .hass=${this.hass}
                      .datetime=${new Date(commit.timestamp * 1000)}
                    ></ha-relative-time>`
                  : this._l("no_commit")
              }
            </dd>
          </div>
        </dl>
        <p class="secondary">
          ${this._l("location", { path: status.path })}
          ${this._l("commit_note", { seconds: status.commit_interval })}
        </p>
        ${
          status.uncommitted_entries
            ? html`<p class="secondary">
                ${this._l("uncommitted", { count: status.uncommitted_entries })}
              </p>`
            : nothing
        }
        ${
          status.dropped_total
            ? html`<ha-alert alert-type="warning"
                >${this._l("dropped", { count: status.dropped_total })}</ha-alert
              >`
            : nothing
        }
        ${
          status.last_error
            ? html`<ha-alert alert-type="error"
                >${this._l("last_error", { error: status.last_error })}</ha-alert
              >`
            : nothing
        }
      </ha-card>
    `;
  }

  private _renderDays() {
    const shown = this._days.slice(0, this._daysShown);
    return html`
      <ha-card class="detail days">
        <div class="detail-title">
          <h2>${this._l("days_title")}</h2>
        </div>
        ${
          this._days.length
            ? html`<ul class="day-list">
                  ${shown.map(
                    (item) =>
                      html`<li>
                        <button
                          class=${classMap({
                            day: true,
                            selected: item.day === this._day,
                          })}
                          aria-current=${item.day === this._day ? "true" : "false"}
                          @click=${this._dayClicked}
                          .day=${item.day}
                        >
                          <span>${this._formatDay(item.day)}</span>
                          <span class="secondary"
                            >${this._l("entry_count", { count: item.entries })}</span
                          >
                        </button>
                      </li>`
                  )}
                </ul>
                ${
                  this._days.length > shown.length
                    ? html`<ha-button
                        appearance="plain"
                        @click=${this._showMoreDays}
                        >${this._l("show_more_days")}</ha-button
                      >`
                    : nothing
                }`
            : html`<p class="empty">${this._l("days_empty")}</p>`
        }
      </ha-card>
    `;
  }

  private _dayClicked(ev: Event) {
    const day = (ev.currentTarget as HTMLElement & { day: string }).day;
    this._openDay(day);
  }

  private _showMoreDays() {
    this._daysShown += DAYS_SHOWN;
  }

  private _renderEntry(entry: ActivityRecordEntry) {
    const cause = this._cause(entry);
    const name = entry.name || entry.entity_id || "";
    const text = this._text(entry);
    const opens = !!entry.entity_id && !!this.hass.states[entry.entity_id];
    const body = html`
      <span class="time">${this._formatTime(entry)}</span>
      <span class="what">
        <span class="name">${name}</span>
        <span class="message">${text}</span>
        ${
          cause || entry.context_user_id
            ? html`<span class="secondary cause"
                >${
                  cause
                    ? this._l("caused_by", { cause })
                    : this._l("caused_by_person")
                }</span
              >`
            : nothing
        }
      </span>
    `;
    return opens
      ? html`<li>
          <button
            class="entry open"
            .entityId=${entry.entity_id}
            aria-label=${this._l("open_entity", { name })}
            @click=${this._openEntity}
          >
            ${body}
          </button>
        </li>`
      : html`<li><div class="entry">${body}</div></li>`;
  }

  private _openEntity(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    fireEvent(this, "hass-more-info", { entityId });
  }

  private _renderDay() {
    if (!this._day) {
      return nothing;
    }
    const visible = this._visibleEntries();
    const filtering = !!this._search.trim();
    return html`
      <ha-card class="detail">
        <div class="detail-title">
          <h2>
            ${this._l("day_heading", { day: this._formatDay(this._day) })}
          </h2>
          <span class="secondary"
            >${this._l("showing", {
              shown: this._entries.length,
              total: this._total,
            })}</span
          >
        </div>
        <div class="toolbar">
          <ha-input-search
            appearance="outlined"
            .value=${this._search}
            .placeholder=${this._l("search_day")}
            .accessibleLabel=${this._l("search_day")}
            .patternSamples=${this._entries
              .slice(0, 50)
              .map((entry) => this._entryValues(entry).join(" "))}
            @input=${this._searchChanged}
          ></ha-input-search>
        </div>
        ${
          filtering
            ? html`<p class="secondary" role="status">
                ${this._l("search_matches", { count: visible.length })}
              </p>`
            : nothing
        }
        ${
          this._dayLoading && !this._entries.length
            ? html`<p class="empty">${this._l("loading")}</p>`
            : visible.length
              ? html`<ul class="entries">
                  ${visible.map((entry) => this._renderEntry(entry))}
                </ul>`
              : html`<p class="empty">
                  ${
                    filtering
                      ? this._l("search_no_match")
                      : this._l("day_empty")
                  }
                </p>`
        }
        ${
          this._hasMore
            ? html`<div class="buttons">
                <ha-button
                  appearance="plain"
                  .disabled=${this._dayLoading}
                  @click=${this._loadMore}
                  >${this._l("load_more")}</ha-button
                >
              </div>`
            : nothing
        }
      </ha-card>
    `;
  }

  private _searchChanged(ev: Event) {
    this._search = (ev.target as HaInput).value ?? "";
  }

  private _renderSearchAll() {
    const result = this._result;
    return html`
      <ha-card class="detail">
        <div class="detail-title">
          <h2>${this._l("search_all_title")}</h2>
          <span class="secondary">${this._l("search_all_description")}</span>
        </div>
        <div class="range">
          <ha-input
            appearance="outlined"
            type="date"
            .label=${this._l("search_from")}
            .value=${this._searchStart}
            @input=${this._startChanged}
          ></ha-input>
          <ha-input
            appearance="outlined"
            type="date"
            .label=${this._l("search_to")}
            .value=${this._searchEnd}
            @input=${this._endChanged}
          ></ha-input>
        </div>
        <ha-input
          appearance="outlined"
          .label=${this._l("search_text")}
          .value=${this._searchText}
          @input=${this._textChanged}
          @keydown=${this._searchKey}
        ></ha-input>
        <div class="buttons">
          <ha-button
            .disabled=${this._searching || !this._searchText.trim()}
            @click=${this._searchAll}
            >${this._l("search_all")}</ha-button
          >
        </div>
        ${
          this._searching
            ? html`<p class="secondary" role="status">
                ${this._l("search_running")}
              </p>`
            : nothing
        }
        ${
          this._searchError
            ? html`<ha-alert alert-type="error">${this._searchError}</ha-alert>`
            : nothing
        }
        ${
          result
            ? html`<p class="secondary" role="status">
                  ${this._l("search_result", { count: result.entries.length })}
                </p>
                ${
                  result.truncated
                    ? html`<ha-alert alert-type="info"
                        >${
                          result.reason === "bytes"
                            ? this._l("search_truncated_bytes", {
                                size: formatRecordSize(result.scanned_bytes),
                              })
                            : this._l("search_truncated_rows")
                        }</ha-alert
                      >`
                    : nothing
                }
                <ul class="entries">
                  ${result.entries.map(
                    (entry) => html`
                      <li class="result-day">
                        <span class="secondary"
                          >${this._formatDay(entry.when.slice(0, 10))}</span
                        >
                      </li>
                      ${this._renderEntry(entry)}
                    `
                  )}
                </ul>`
            : nothing
        }
      </ha-card>
    `;
  }

  private _startChanged(ev: Event) {
    this._searchStart = (ev.target as HaInput).value ?? "";
  }

  private _endChanged(ev: Event) {
    this._searchEnd = (ev.target as HaInput).value ?? "";
  }

  private _textChanged(ev: Event) {
    this._searchText = (ev.target as HaInput).value ?? "";
  }

  private _searchKey(ev: KeyboardEvent) {
    if (ev.key === "Enter" && this._searchText.trim() && !this._searching) {
      this._searchAll();
    }
  }

  private async _searchAll() {
    this._searching = true;
    this._searchError = undefined;
    try {
      this._result = await searchActivityRecord(this.hass, {
        text: this._searchText.trim(),
        ...(this._searchStart ? { start: this._searchStart } : {}),
        ...(this._searchEnd ? { end: this._searchEnd } : {}),
      });
    } catch (err) {
      this._result = undefined;
      this._searchError = this._errorText(err);
    } finally {
      this._searching = false;
    }
  }

  private get _remoteError(): string | undefined {
    const address = this._remoteInput.trim();
    return address && !isValidDashboardRemote(address)
      ? this._l("remote_invalid")
      : undefined;
  }

  private _renderRemote() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    const error = this._remoteError;
    const saved = status.remote ?? "";
    const dirty = this._remoteInput.trim() !== saved;
    const last = status.last_push;
    const canPush =
      !!status.remote &&
      !status.remote_unusable &&
      !dirty &&
      !this._pushing &&
      !this._remoteBusy;
    const canSave =
      dirty && !!this._remoteInput.trim() && !error && !this._remoteBusy;
    const canRemove =
      (!!status.remote || status.remote_unusable) && !this._remoteBusy;
    return html`
      <ha-card class="detail remote">
        <div class="detail-title">
          <h2>${this._l("remote_title")}</h2>
          <span class="secondary">${this._l("remote_description")}</span>
        </div>
        ${
          status.remote_unusable
            ? html`<ha-alert alert-type="warning"
                >${this._l("remote_unsafe")}</ha-alert
              >`
            : nothing
        }
        <div class="remote-line">
          <span class="secondary">${this._l("remote_current")}</span>
          <code class="remote-address"
            >${status.remote ?? this._l("remote_none")}</code
          >
        </div>
        <ha-alert alert-type="warning">${this._l("privacy_text")}</ha-alert>
        <ha-input
          appearance="outlined"
          type="url"
          .label=${this._l("remote_label")}
          .hint=${this._l("remote_hint")}
          .placeholder=${"https://example.com/team/activity.git"}
          .value=${this._remoteInput}
          .invalid=${!!error}
          .validationMessage=${error ?? ""}
          .disabled=${this._remoteBusy}
          @input=${this._remoteChanged}
        ></ha-input>
        <div class="buttons">
          <ha-button .disabled=${!canSave} @click=${this._saveRemote}
            >${this._l("remote_save")}</ha-button
          >
          <ha-button
            appearance="plain"
            .disabled=${!canRemove}
            @click=${this._removeRemote}
            >${this._l("remote_remove")}</ha-button
          >
        </div>
        <h3>${this._l("push_heading")}</h3>
        <p class="statement">
          ${
            status.remote
              ? this._l("push_statement", { address: status.remote })
              : this._l("push_statement_no_remote")
          }
        </p>
        <div class="buttons">
          <ha-button .disabled=${!canPush} @click=${this._push}
            >${this._l("push_now")}</ha-button
          >
        </div>
        ${
          dirty && status.remote
            ? html`<p class="secondary">${this._l("push_save_first")}</p>`
            : nothing
        }
        ${
          this._pushResult
            ? html`<ha-alert
                role="status"
                alert-type=${this._pushResult.ok ? "success" : "error"}
                >${this._pushResult.text}</ha-alert
              >`
            : nothing
        }
        ${
          last
            ? html`<p class="secondary">
                ${
                  last.ok
                    ? this._l("last_push_ok")
                    : this._l("last_push_failed", { error: last.error ?? "" })
                }
                <ha-relative-time
                  .hass=${this.hass}
                  .datetime=${new Date(last.at * 1000)}
                ></ha-relative-time>
              </p>`
            : html`<p class="secondary">${this._l("never_pushed")}</p>`
        }
      </ha-card>
    `;
  }

  private _remoteChanged(ev: Event) {
    this._remoteInput = (ev.target as HaInput).value ?? "";
  }

  private async _saveRemote() {
    if (this._remoteError) {
      return;
    }
    const current = this._status?.remote;
    const next = this._remoteInput.trim();
    if (current && next && next !== current) {
      const replace = await showConfirmationDialog(this, {
        title: this._l("remote_replace_title"),
        text: this._l("remote_replace_text", { old: current, new: next }),
        confirmText: this._l("remote_replace"),
        destructive: true,
      });
      if (!replace) {
        return;
      }
    }
    this._remoteBusy = true;
    try {
      await setActivityRecordRemote(this.hass, next || null);
      await this._refreshStatus();
      this._remoteInput = this._status?.remote ?? "";
      this._pushResult = undefined;
    } catch (err) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
      });
    } finally {
      this._remoteBusy = false;
    }
  }

  private async _removeRemote() {
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("remote_remove_title"),
      text: this._l("remote_remove_text"),
      confirmText: this._l("remote_remove"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._remoteBusy = true;
    try {
      await setActivityRecordRemote(this.hass, null);
      await this._refreshStatus();
      this._remoteInput = "";
      this._pushResult = undefined;
    } catch (err) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
      });
    } finally {
      this._remoteBusy = false;
    }
  }

  private async _push() {
    const remote = this._status?.remote;
    if (!remote) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("push_confirm_title"),
      text: this._l("push_statement", { address: remote }),
      confirmText: this._l("push_now"),
    });
    if (!confirmed) {
      return;
    }
    this._pushing = true;
    this._pushResult = undefined;
    try {
      await pushActivityRecord(this.hass);
      this._pushResult = { ok: true, text: this._l("push_done") };
    } catch (err) {
      this._pushResult = {
        ok: false,
        text: this._l("push_failed", { error: this._errorText(err) }),
      };
    } finally {
      this._pushing = false;
    }
    try {
      await this._refreshStatus();
    } catch (_err) {
      // The result above already says what happened to the push.
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .page {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      padding: var(--ha-space-6);
      max-width: 1320px;
      margin: 0 auto;
    }
    :host([narrow]) .page {
      padding: var(--ha-space-4);
    }
    h1 {
      margin: 0;
      font-size: var(--ha-font-size-2xl);
      font-weight: var(--ha-font-weight-normal);
      overflow-wrap: anywhere;
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    h3 {
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      margin: 0;
    }
    .statement {
      overflow-wrap: anywhere;
    }
    .secondary {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .empty {
      padding: var(--ha-space-4);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .detail {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-4);
      min-width: 0;
    }
    .detail-title {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .columns {
      display: grid;
      grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
      gap: var(--ha-space-4);
      align-items: start;
    }
    :host([narrow]) .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .main {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      min-width: 0;
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: var(--ha-space-3);
      margin: 0;
    }
    .facts dt {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .facts dd {
      margin: 0;
      font-size: var(--ha-font-size-l);
      overflow-wrap: anywhere;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .day-list {
      max-height: 420px;
      overflow-y: auto;
    }
    :host([narrow]) .day-list {
      max-height: 260px;
    }
    button.day,
    button.entry {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      margin: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      border-radius: var(--ha-border-radius-md);
    }
    button.day {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-3);
    }
    button.day.selected {
      background: var(--ha-color-fill-primary-quiet-resting);
      color: var(--primary-color);
    }
    button.day:hover,
    button.entry.open:hover {
      background: var(--ha-color-fill-neutral-quiet-hover, rgba(0, 0, 0, 0.05));
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .entry {
      display: flex;
      gap: var(--ha-space-3);
      align-items: baseline;
      padding: var(--ha-space-2) var(--ha-space-3);
      min-height: 44px;
      box-sizing: border-box;
      content-visibility: auto;
      contain-intrinsic-size: auto 56px;
    }
    button.entry:not(.open) {
      cursor: default;
    }
    .time {
      flex: 0 0 auto;
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
      font-size: var(--ha-font-size-s);
    }
    .what {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
    }
    .result-day {
      padding: var(--ha-space-3) var(--ha-space-3) 0;
    }
    .toolbar,
    .range {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .toolbar ha-input-search {
      flex: 1 1 240px;
      min-width: 0;
    }
    .range ha-input {
      flex: 1 1 140px;
      min-width: 0;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .remote-line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ha-space-2);
    }
    .remote-address {
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-activity-record": HaConfigActivityRecord;
  }
}
