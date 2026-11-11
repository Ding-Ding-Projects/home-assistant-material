import {
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
import type {
  SupportTicket,
  TicketStatus,
} from "../../../common/locks/support-tickets";
import {
  DETAILS_LIMIT,
  hasReply,
  nextStatusIn,
  readTickets,
  SUBJECT_LIMIT,
  subscribeTickets,
  ticketStatus,
  validateTicket,
  withoutTicket,
  withTicket,
  writeTickets,
} from "../../../common/locks/support-tickets";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import { fetchProblemLog } from "../../../data/problem_log";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import { showToast } from "../../../util/toast";
import type { BundleProblem } from "./support-bundle";
import { buildSupportBundle, supportBundleFileName } from "./support-bundle";

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

  @state() private _now = Date.now();

  @state() private _error = "";

  @state() private _showHow = false;

  @state() private _subject = "";

  @state() private _details = "";

  @state() private _bundle?: string;

  @state() private _bundleBusy = false;

  private _bundleDate?: Date;

  private _unsubscribe?: () => void;

  private _timer?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribeTickets((store) => {
      this._tickets = store.tickets;
      this._schedule();
    });
    this._tickets = readTickets().tickets;
    this._schedule();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    window.clearTimeout(this._timer);
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.support.${key}` as any,
      values
    ) as string;
  }

  /** Draws again when the next ticket changes status. */
  private _schedule(): void {
    window.clearTimeout(this._timer);
    this._now = Date.now();
    const waits = this._tickets
      .map((ticket) => nextStatusIn(ticket, this._now))
      .filter((wait): wait is number => wait !== undefined);
    if (waits.length) {
      this._timer = window.setTimeout(
        () => this._schedule(),
        Math.min(...waits) + 50
      );
    }
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
    const tickets = [...this._tickets].reverse();
    return html`<section class="card">
      <h3>${this._l("tickets_title")}</h3>
      <p class="note">${this._l("tickets_note")}</p>
      ${
        tickets.length
          ? html`<ul class="tickets">
              ${tickets.map((ticket) => this._renderTicket(ticket))}
            </ul>`
          : html`<p class="note" role="status">${this._l("no_tickets")}</p>`
      }
    </section>`;
  }

  private _renderTicket(ticket: SupportTicket): TemplateResult {
    const status: TicketStatus = ticketStatus(ticket, this._now);
    return html`<li>
      <div class="head">
        <span class="num"
          >${this._l("ticket_label", { number: ticket.number })}</span
        >
        <span class=${classMap({ state: true, done: status === "resolved" })}
          >${this._l(`status_${status}`)}</span
        >
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
      <p class="text">${ticket.subject}</p>
      ${ticket.details ? html`<p class="note text">${ticket.details}</p>` : nothing}
      ${
        hasReply(status)
          ? html`<p class="reply">${this._l("first_reply")}</p>`
          : nothing
      }
    </li>`;
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
      <label class="area">
        <span>${this._l("details")}</span>
        <textarea
          rows="3"
          maxlength=${DETAILS_LIMIT}
          autocomplete="off"
          .value=${this._details}
          @input=${this._detailsChanged}
        ></textarea>
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
    this._details = (ev.target as HTMLTextAreaElement).value;
  }

  private _open(): void {
    if (validateTicket(this._subject)) {
      this._error = this._l("subject_required");
      return;
    }
    this._error = "";
    writeTickets(
      withTicket(readTickets(), this._subject, this._details, Date.now())
    );
    this._subject = "";
    this._details = "";
    this._tickets = readTickets().tickets;
    this._schedule();
  }

  private _remove(ev: Event): void {
    const number = (ev.currentTarget as HTMLElement & { ticketNumber: string })
      .ticketNumber;
    writeTickets(withoutTicket(readTickets(), number));
    this._tickets = readTickets().tickets;
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
      .reply {
        padding-inline-start: var(--ha-space-3);
        border-inline-start: 3px solid var(--primary-color);
        color: var(--secondary-text-color);
      }
      .area {
        display: grid;
        gap: var(--ha-space-1);
        font-size: var(--ha-font-size-s, 0.85rem);
        color: var(--secondary-text-color);
      }
      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 44px;
        resize: vertical;
        padding: var(--ha-space-2) var(--ha-space-3);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font: inherit;
      }
      textarea:focus-visible,
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
