import {
  mdiChevronDown,
  mdiChevronUp,
  mdiContentCopy,
  mdiDeleteOutline,
  mdiDownload,
  mdiInformationOutline,
  mdiLifebuoy,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import type { SupportTicket } from "../../../common/locks/support-tickets";
import {
  DETAILS_LIMIT,
  readTickets,
  SUBJECT_LIMIT,
  subscribeTickets,
  validateTicket,
  withoutTicket,
  withTicket,
  writeTickets,
} from "../../../common/locks/support-tickets";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-checkbox";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-textarea";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import { fetchProblemLog } from "../../../data/problem_log";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import { showToast } from "../../../util/toast";
import type { BundleProblem } from "./support-bundle";
import { buildSupportBundle, supportBundleFileName } from "./support-bundle";
import type {
  BundleReference,
  TicketDeskStatus,
  TicketExtras,
  TicketRow,
} from "./ticket-view-logic";
import {
  addNote,
  countByStatus,
  newExtra,
  NOTE_LIMIT,
  PAGE_LIMIT,
  pruneExtras,
  readExtras,
  transitionExtra,
  viewTickets,
  writeExtras,
} from "./ticket-view-logic";

/**
 * The support desk as a page. Tickets are made and kept in this browser only
 * and nothing is sent anywhere. Beside it, a support bundle: a plain text
 * summary built here from what this instance already reports, redacted, shown
 * in full, and copied or saved only when the person presses a button.
 */
@customElement("ha-config-support")
class HaConfigSupport extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _tickets: SupportTicket[] = readTickets().tickets;

  @state() private _extras: TicketExtras = readExtras();

  @state() private _query = "";

  @state() private _statusFilter: TicketDeskStatus | "all" = "all";

  @state() private _openNumber?: string;

  @state() private _noteDraft = "";

  @state() private _noteError = "";

  @state() private _page = "";

  @state() private _attach = false;

  @state() private _error = "";

  @state() private _showHow = false;

  @state() private _subject = "";

  @state() private _details = "";

  @state() private _bundle?: string;

  @state() private _bundleBusy = false;

  private _bundleDate?: Date;

  private _bundleSize = 0;

  private _unsubscribe?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribeTickets((store) => {
      this._tickets = store.tickets;
      this._extras = readExtras();
    });
    this._tickets = readTickets().tickets;
    this._extras = readExtras();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.support.${key}` as any,
      values
    ) as string;
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this._l("caption")}
      >
        <div class="content">
          <div class="intro">
            <h2>${this._l("caption")}</h2>
            <p>${this._l("summary")}</p>
          </div>
          <p class="callout" role="note">
            <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
            <span>${this._l("nothing_sent")}</span>
          </p>
          <div class="columns">
            <div class="column">
              ${this._renderTickets()} ${this._renderForm()}
              ${this._renderWhere()}
            </div>
            <div class="column">${this._renderBundle()}</div>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderTickets(): TemplateResult {
    const all = viewTickets(this._tickets, this._extras, { query: "" });
    const rows = viewTickets(this._tickets, this._extras, {
      query: this._query,
      status: this._statusFilter,
    });
    const counts = countByStatus(all);
    const searching = this._query.trim() !== "" || this._statusFilter !== "all";
    const search = this._l("tickets_search");
    const buttons = [
      { value: "all", label: `${this._l("filter_all")} ${all.length}` },
      ...(["open", "waiting", "closed"] as const).map((status) => ({
        value: status,
        label: `${this._l(`desk_status_${status}`)} ${counts[status]}`,
      })),
    ];
    return html`<section class="card">
      <h3>${this._l("tickets_title")}</h3>
      <p class="note">${this._l("tickets_note")}</p>
      ${
        all.length
          ? html`<ha-input-search
                appearance="outlined"
                .placeholder=${search}
                .accessibleLabel=${search}
                .value=${this._query}
                .patternSamples=${this._tickets.map((item) => item.subject)}
                @input=${this._queryChanged}
              ></ha-input-search>
              <ha-button-toggle-group
                class="filter"
                full-width
                .ariaLabel=${this._l("filter_label")}
                .buttons=${buttons}
                .active=${this._statusFilter}
                @value-changed=${this._statusFilterChanged}
              ></ha-button-toggle-group>
              ${
                searching
                  ? html`<p class="note" role="status">
                      ${this._l("tickets_matches", {
                        count: rows.length,
                        total: all.length,
                      })}
                    </p>`
                  : nothing
              }
              ${
                rows.length
                  ? html`<ul class="tickets">
                      ${rows.map((row) => this._renderTicket(row))}
                    </ul>`
                  : html`<p class="note" role="status">
                      ${this._l("tickets_empty_search")}
                    </p>`
              }`
          : html`<p class="note" role="status">${this._l("no_tickets")}</p>`
      }
    </section>`;
  }

  private _formatTime(at: number): string {
    return new Date(at).toLocaleString(this.hass.language);
  }

  private _renderTicket(row: TicketRow): TemplateResult {
    const { ticket, extra } = row;
    const isOpen = this._openNumber === ticket.number;
    const label = this._l("ticket_label", { number: ticket.number });
    return html`<li>
      <div class="head">
        <span class="num">${label}</span>
        <span
          class=${classMap({ state: true, done: extra.status === "closed" })}
          >${this._l(`desk_status_${extra.status}`)}</span
        >
        <ha-button
          appearance="plain"
          aria-expanded=${isOpen ? "true" : "false"}
          .ticketNumber=${ticket.number}
          .title=${this._l(isOpen ? "ticket_hide" : "ticket_read", {
            number: ticket.number,
          })}
          @click=${this._toggleTicket}
        >
          <ha-svg-icon
            slot="start"
            .path=${isOpen ? mdiChevronUp : mdiChevronDown}
          ></ha-svg-icon>
          ${this._l(isOpen ? "ticket_hide" : "ticket_read", {
            number: ticket.number,
          })}
        </ha-button>
      </div>
      <p class="text">${ticket.subject}</p>
      ${isOpen ? this._renderTicketDetail(row) : nothing}
    </li>`;
  }

  private _renderTicketDetail(row: TicketRow): TemplateResult {
    const { ticket, extra } = row;
    const moves: { to: TicketDeskStatus; key: string }[] =
      extra.status === "open"
        ? [
            { to: "waiting", key: "mark_waiting" },
            { to: "closed", key: "close_ticket" },
          ]
        : extra.status === "waiting"
          ? [
              { to: "open", key: "mark_open" },
              { to: "closed", key: "close_ticket" },
            ]
          : [{ to: "open", key: "reopen_ticket" }];
    return html`<div class="detail">
      <p class="note">
        ${this._l("ticket_opened", { time: this._formatTime(ticket.created) })}
      </p>
      ${
        extra.page
          ? html`<p class="note text">
              ${this._l("ticket_page", { page: extra.page })}
            </p>`
          : nothing
      }
      <p class="text">${ticket.details || this._l("ticket_no_details")}</p>
      ${
        extra.bundle
          ? html`<p class="note text">
              ${this._l("ticket_bundle", {
                name: extra.bundle.name,
                size: extra.bundle.size,
              })}
            </p>`
          : nothing
      }
      <h4>${this._l("notes_title")}</h4>
      ${
        extra.notes.length
          ? html`<ul class="notes">
              ${extra.notes.map(
                (note) =>
                  html`<li>
                    <span class="note">${this._formatTime(note.at)}</span>
                    <span class="text">${note.text}</span>
                  </li>`
              )}
            </ul>`
          : html`<p class="note">${this._l("notes_none")}</p>`
      }
      <ha-textarea
        rows="2"
        maxlength=${NOTE_LIMIT}
        .label=${this._l("note_label")}
        .value=${this._noteDraft}
        @input=${this._noteChanged}
      ></ha-textarea>
      ${
        this._noteError
          ? html`<p class="error" role="alert">${this._noteError}</p>`
          : nothing
      }
      <div class="buttons">
        <ha-button
          appearance="outlined"
          .ticketNumber=${ticket.number}
          @click=${this._addNote}
          >${this._l("note_add")}</ha-button
        >
        ${moves.map(
          (move) =>
            html`<ha-button
              appearance=${move.to === "closed" ? "filled" : "outlined"}
              .ticketNumber=${ticket.number}
              .moveTo=${move.to}
              @click=${this._move}
              >${this._l(move.key)}</ha-button
            >`
        )}
        <ha-button
          appearance="plain"
          .ticketNumber=${ticket.number}
          .title=${this._l("remove_ticket", { number: ticket.number })}
          @click=${this._remove}
        >
          <ha-svg-icon slot="start" .path=${mdiDeleteOutline}></ha-svg-icon>
          ${this._l("remove")}
        </ha-button>
      </div>
    </div>`;
  }

  private _renderForm(): TemplateResult {
    return html`<section class="card">
      <h3>${this._l("form_title")}</h3>
      <ha-input
        autocomplete="off"
        maxlength=${SUBJECT_LIMIT}
        .label=${this._l("subject")}
        .value=${this._subject}
        @input=${this._subjectChanged}
      ></ha-input>
      <ha-textarea
        rows="3"
        maxlength=${DETAILS_LIMIT}
        .label=${this._l("details")}
        .value=${this._details}
        @input=${this._detailsChanged}
      ></ha-textarea>
      <ha-input
        autocomplete="off"
        maxlength=${PAGE_LIMIT}
        .label=${this._l("form_page")}
        .hint=${this._l("form_page_hint")}
        .value=${this._page}
        @input=${this._pageChanged}
      ></ha-input>
      <label class="attach">
        <ha-checkbox
          .checked=${this._attach && this._bundle !== undefined}
          ?disabled=${this._bundle === undefined}
          @change=${this._attachChanged}
        ></ha-checkbox>
        <span>
          ${this._l("form_attach")}
          <span class="note"
            >${
              this._bundle === undefined
                ? this._l("form_attach_none")
                : this._l("form_attach_hint")
            }</span
          >
        </span>
      </label>
      <p class="note">${this._l("details_hint")}</p>
      ${
        this._error
          ? html`<p class="error" role="alert">${this._error}</p>`
          : nothing
      }
      <div class="buttons">
        <ha-button @click=${this._open}>${this._l("open_ticket")}</ha-button>
      </div>
    </section>`;
  }

  private _renderWhere(): TemplateResult {
    return html`<section class="card">
      <h3>${this._l("where_title")}</h3>
      <p>${this._l("where_text")}</p>
      <div class="address-row">
        <span class="address">${window.location.host}</span>
        <ha-button appearance="plain" @click=${this._copyAddress}>
          <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
          ${this._l("copy_address")}
        </ha-button>
      </div>
      <div class="buttons">
        <ha-button
          appearance="outlined"
          aria-expanded=${this._showHow ? "true" : "false"}
          @click=${this._toggleHow}
          >${this._showHow ? this._l("hide_how") : this._l("show_how")}</ha-button
        >
      </div>
      ${
        this._showHow
          ? html`<ol class="steps">
                <li>${this._l("step_open_settings")}</li>
                <li>${this._l("step_clear")}</li>
                <li>${this._l("step_reload")}</li>
              </ol>
              <p class="note">${this._l("clear_warning")}</p>`
          : nothing
      }
      <p class="note">${this._l("never_deletes")}</p>
    </section>`;
  }

  private _renderBundle(): TemplateResult {
    return html`<section class="card">
      <div class="title-row">
        <ha-svg-icon .path=${mdiLifebuoy}></ha-svg-icon>
        <h3>${this._l("bundle_title")}</h3>
      </div>
      <p>${this._l("bundle_text")}</p>
      ${
        this._bundle === undefined
          ? html`<div class="buttons">
              <ha-button
                ?disabled=${this._bundleBusy}
                @click=${this._makeBundle}
                >${this._l("bundle_make")}</ha-button
              >
              ${
                this._bundleBusy
                  ? html`<ha-spinner size="small"></ha-spinner>`
                  : nothing
              }
            </div>`
          : html`<pre
                class="bundle"
                tabindex="0"
                aria-label=${this._l("bundle_label")}
              >
${this._bundle}</pre>
              <div class="buttons">
                <ha-button appearance="plain" @click=${this._makeBundle}
                  >${this._l("bundle_refresh")}</ha-button
                >
                <ha-button appearance="outlined" @click=${this._copyBundle}>
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiContentCopy}
                  ></ha-svg-icon>
                  ${this._l("bundle_copy")}
                </ha-button>
                <ha-button @click=${this._downloadBundle}>
                  <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
                  ${this._l("bundle_download")}
                </ha-button>
              </div>`
      }
      <p class="note">${this._l("bundle_note")}</p>
    </section>`;
  }

  private _subjectChanged(ev: Event): void {
    this._subject = (ev.target as HaInput).value ?? "";
  }

  private _detailsChanged(ev: Event): void {
    this._details = (ev.target as HTMLTextAreaElement).value ?? "";
  }

  private _pageChanged(ev: Event): void {
    this._page = (ev.target as HaInput).value ?? "";
  }

  private _attachChanged(ev: Event): void {
    this._attach = (ev.target as HTMLInputElement).checked;
  }

  private _queryChanged(ev: Event): void {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _statusFilterChanged(ev: CustomEvent<{ value: string }>): void {
    ev.stopPropagation();
    const value = ev.detail.value;
    this._statusFilter =
      value === "open" || value === "waiting" || value === "closed"
        ? value
        : "all";
  }

  private _noteChanged(ev: Event): void {
    this._noteDraft = (ev.target as HTMLTextAreaElement).value ?? "";
  }

  private _ticketNumber(ev: Event): string {
    return (ev.currentTarget as HTMLElement & { ticketNumber: string })
      .ticketNumber;
  }

  private _toggleTicket(ev: Event): void {
    const number = this._ticketNumber(ev);
    this._openNumber = this._openNumber === number ? undefined : number;
    this._noteDraft = "";
    this._noteError = "";
  }

  private _saveExtras(extras: TicketExtras): void {
    writeExtras(extras);
    this._extras = readExtras();
  }

  private _open(): void {
    if (validateTicket(this._subject)) {
      this._error = this._l("subject_required");
      return;
    }
    this._error = "";
    const now = Date.now();
    const store = withTicket(readTickets(), this._subject, this._details, now);
    const created = store.tickets[store.tickets.length - 1];
    writeTickets(store);
    const reference: BundleReference | undefined =
      this._attach && this._bundle !== undefined
        ? {
            name: supportBundleFileName(this._bundleDate ?? new Date(now)),
            size: this._bundleSize,
            at: (this._bundleDate ?? new Date(now)).getTime(),
          }
        : undefined;
    this._tickets = readTickets().tickets;
    if (created) {
      this._saveExtras({
        ...pruneExtras(readExtras(), this._tickets),
        [created.number]: newExtra(now, this._page, reference),
      });
      this._openNumber = created.number;
    }
    this._subject = "";
    this._details = "";
    this._page = "";
    this._attach = false;
  }

  private _addNote(ev: Event): void {
    const number = this._ticketNumber(ev);
    const extras = readExtras();
    const base = extras[number] ?? newExtra(Date.now());
    const next = addNote(base, this._noteDraft, Date.now());
    if (!next) {
      this._noteError = this._noteDraft.trim()
        ? this._l("note_full")
        : this._l("note_required");
      return;
    }
    this._noteError = "";
    this._noteDraft = "";
    this._saveExtras({ ...extras, [number]: next });
  }

  private _move(ev: Event): void {
    const number = this._ticketNumber(ev);
    const to = (ev.currentTarget as HTMLElement & { moveTo: TicketDeskStatus })
      .moveTo;
    const extras = readExtras();
    const next = transitionExtra(
      extras[number] ?? newExtra(Date.now()),
      to,
      Date.now()
    );
    if (next) {
      this._saveExtras({ ...extras, [number]: next });
    }
  }

  private _remove(ev: Event): void {
    const number = this._ticketNumber(ev);
    writeTickets(withoutTicket(readTickets(), number));
    this._tickets = readTickets().tickets;
    this._saveExtras(pruneExtras(readExtras(), this._tickets));
    if (this._openNumber === number) {
      this._openNumber = undefined;
    }
  }

  private _toggleHow(): void {
    this._showHow = !this._showHow;
  }

  private async _copyAddress(): Promise<void> {
    await copyToClipboard(window.location.host, this);
    showToast(this, { message: this._l("address_copied") });
  }

  private async _makeBundle(): Promise<void> {
    this._bundleBusy = true;
    try {
      let problems: BundleProblem[] = [];
      let problemsUnavailable = false;
      try {
        const overview = await fetchProblemLog(this.hass);
        problems = overview.problems.map((problem) => ({
          title: problem.title,
          logger: problem.logger,
          level: problem.level,
          version: problem.version,
          count: problem.count,
          last_seen: problem.last_seen,
        }));
      } catch (_err) {
        problemsUnavailable = true;
      }
      const config = this.hass.config;
      const generatedAt = new Date();
      this._bundle = buildSupportBundle({
        generatedAt,
        version: config.version,
        language: this.hass.language,
        timeZone: config.time_zone,
        state: config.state,
        safeMode: Boolean(config.safe_mode),
        recoveryMode: Boolean(config.recovery_mode),
        components: config.components,
        problems,
        problemsUnavailable,
        userAgent: navigator.userAgent,
      });
      this._bundleDate = generatedAt;
      this._bundleSize = new Blob([this._bundle]).size;
    } finally {
      this._bundleBusy = false;
    }
  }

  private async _copyBundle(): Promise<void> {
    if (this._bundle === undefined) {
      return;
    }
    await copyToClipboard(this._bundle, this);
    showToast(this, { message: this._l("bundle_copied") });
  }

  private _downloadBundle(): void {
    if (this._bundle === undefined) {
      return;
    }
    const url = URL.createObjectURL(
      new Blob([this._bundle], { type: "text/plain" })
    );
    fileDownload(url, supportBundleFileName(this._bundleDate ?? new Date()));
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  static styles: CSSResultGroup = [
    haStyle,
    css`
      :host {
        display: block;
        height: 100%;
      }
      .content {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .content {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
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
      }
      .callout {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        margin: 0;
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-xl);
        border: 1px solid var(--divider-color);
      }
      .callout ha-svg-icon {
        flex-shrink: 0;
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
        gap: var(--ha-space-4);
        align-items: start;
      }
      .column {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
        min-width: 0;
      }
      .card {
        display: grid;
        gap: var(--ha-space-3);
        padding: var(--ha-space-5);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--secondary-background-color);
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-l, 1.1rem);
      }
      p {
        margin: 0;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .note {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .error {
        color: var(--error-color);
      }
      .tickets {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ha-space-2);
      }
      .tickets li {
        display: grid;
        gap: var(--ha-space-1);
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-xl);
        background: var(--card-background-color);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      .num {
        flex: 1;
        font-weight: 500;
      }
      .head ha-button {
        min-height: 44px;
        min-width: 44px;
      }
      .state {
        padding: 0 var(--ha-space-2);
        border-radius: var(--ha-border-radius-pill);
        background: var(--divider-color);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .state.done {
        background: color-mix(in srgb, var(--success-color) 28%, transparent);
      }
      .text {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .detail {
        display: grid;
        gap: var(--ha-space-2);
        padding-top: var(--ha-space-2);
        border-top: 1px solid var(--divider-color);
      }
      .detail h4 {
        margin: 0;
        font-size: var(--ha-font-size-m, 1rem);
      }
      .notes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ha-space-2);
      }
      .tickets .notes li {
        display: grid;
        gap: 0;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-inline-start: 3px solid var(--primary-color);
        border-radius: 0;
        background: transparent;
      }
      .filter {
        display: block;
        min-width: 0;
        overflow-x: auto;
      }
      .attach {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-2);
        min-height: 44px;
        --ha-checkbox-min-touch-size: 44px;
      }
      .attach > span {
        display: grid;
        gap: var(--ha-space-1);
        min-width: 0;
        align-self: center;
      }
      .buttons ha-button {
        min-height: 44px;
      }
      .bundle:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .buttons {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .address-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-xl);
        background: var(--card-background-color);
      }
      .address {
        flex: 1;
        min-width: 0;
        font-family: var(--ha-font-family-code, monospace);
        overflow-wrap: anywhere;
      }
      .steps {
        margin: 0;
        padding-inline-start: var(--ha-space-5, 20px);
        display: grid;
        gap: var(--ha-space-1);
      }
      .bundle {
        margin: 0;
        max-height: 420px;
        overflow: auto;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-xl);
        background: var(--card-background-color);
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s, 0.85rem);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-support": HaConfigSupport;
  }
}
