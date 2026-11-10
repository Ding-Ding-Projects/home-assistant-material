/* eslint-disable lit/prefer-query-decorators -- the fields are read when the form is sent */
import { mdiClose, mdiDeleteOutline, mdiInformationOutline } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { getLockLocalize } from "../../common/locks/element-lock-session";
import type {
  SupportTicket,
  TicketStatus,
} from "../../common/locks/support-tickets";
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
} from "../../common/locks/support-tickets";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import { lockPanelStyles } from "../locks/lock-panel-styles";
import { anchorStyle, isNarrow, onNarrowChange } from "../locks/lock-text";

/** The wording of the support desk. Falls back to the key until wording is loaded. */
export const supportText = (
  key: string,
  values?: Record<string, string | number>
): string => {
  const localize = getLockLocalize() as
    | ((key: string, values?: Record<string, string | number>) => string)
    | undefined;
  return (localize ? localize(`ui.support_desk.${key}`, values) : "") || key;
};

/**
 * A support desk that is a joke and says so. Tickets are made and kept in
 * this browser only; no request is made, nobody reads them, and the status
 * moves on with the clock. Its one real use is the explanation of how to
 * clear this site's stored data for this address, which is the only way to
 * remove locks that cannot be unlocked. It never clears anything itself.
 */
@customElement("ha-support-desk")
export class HaSupportDesk extends LitElement {
  @property({ attribute: false }) public anchor?: Element;

  @state() private _tickets: SupportTicket[] = readTickets().tickets;

  @state() private _now = Date.now();

  @state() private _error = "";

  @state() private _showHow = false;

  @state() private _narrow = isNarrow();

  private _unsubscribe?: () => void;

  private _stopNarrow?: () => void;

  private _timer?: number;

  private _returnTo?: HTMLElement;

  public connectedCallback(): void {
    super.connectedCallback();
    const active = document.activeElement;
    this._returnTo =
      active instanceof HTMLElement && active !== document.body
        ? active
        : (this.anchor as HTMLElement | undefined);
    this._unsubscribe = subscribeTickets((store) => {
      this._tickets = store.tickets;
    });
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
    });
    this._tickets = readTickets().tickets;
    this._schedule();
    window.addEventListener("keydown", this._escape, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._stopNarrow?.();
    window.clearTimeout(this._timer);
    window.removeEventListener("keydown", this._escape, true);
  }

  protected firstUpdated(): void {
    this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>("ha-input")?.focus?.();
    });
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

  private _escape = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    }
  };

  private _close(): void {
    const target = this._returnTo;
    this.remove();
    if (target?.isConnected) {
      target.focus?.();
    }
  }

  protected render(): TemplateResult {
    const style = this._narrow ? {} : anchorStyle(this.anchor, 520);
    return html`<div
      class=${classMap({ panel: true, sheet: this._narrow })}
      role="dialog"
      aria-modal="false"
      aria-labelledby="title"
      style=${styleMap(style)}
    >
      <header>
        <div class="titles">
          <h2 id="title">${supportText("title")}</h2>
        </div>
        <button
          type="button"
          class="close"
          aria-label=${supportText("close")}
          @click=${this._close}
        >
          <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
        </button>
      </header>
      <p class="callout plain" role="note">
        <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
        <span>${supportText("nothing_sent")}</span>
      </p>
      <p>${supportText("intro")}</p>
      ${this._renderForm()} ${this._renderTickets()} ${this._renderHow()}
    </div>`;
  }

  private _renderForm(): TemplateResult {
    return html`<form @submit=${this._open} novalidate>
      <h3>${supportText("form_title")}</h3>
      <ha-input
        name="subject"
        autocomplete="off"
        maxlength=${SUBJECT_LIMIT}
        .label=${supportText("subject")}
      ></ha-input>
      <label class="area">
        <span>${supportText("details")}</span>
        <textarea
          name="details"
          rows="3"
          maxlength=${DETAILS_LIMIT}
          autocomplete="off"
        ></textarea>
      </label>
      <p class="note">${supportText("details_hint")}</p>
      ${
        this._error
          ? html`<p class="callout error" role="alert">${this._error}</p>`
          : nothing
      }
      <div class="buttons">
        <span></span>
        <button type="submit" class="primary">
          ${supportText("open_ticket")}
        </button>
      </div>
    </form>`;
  }

  private _statusText(status: TicketStatus): string {
    return supportText(`status_${status}`);
  }

  private _renderTickets(): TemplateResult {
    const tickets = [...this._tickets].reverse();
    return html`<section>
      <h3>${supportText("tickets_title")}</h3>
      ${
        tickets.length
          ? html`<ul class="tickets">
              ${tickets.map((ticket) => {
                const status = ticketStatus(ticket, this._now);
                return html`<li data-number=${ticket.number}>
                  <div class="head">
                    <span class="num"
                      >${supportText("ticket_label", {
                        number: ticket.number,
                      })}</span
                    >
                    <span
                      class=${classMap({ state: true, done: status === "resolved" })}
                      >${this._statusText(status)}</span
                    >
                    <button
                      type="button"
                      class="remove"
                      data-number=${ticket.number}
                      aria-label=${supportText("remove_ticket", {
                        number: ticket.number,
                      })}
                      @click=${this._remove}
                    >
                      <ha-svg-icon .path=${mdiDeleteOutline}></ha-svg-icon>
                    </button>
                  </div>
                  <p class="subject">${ticket.subject}</p>
                  ${
                    ticket.details
                      ? html`<p class="note details">${ticket.details}</p>`
                      : nothing
                  }
                  ${
                    hasReply(status)
                      ? html`<p class="reply">${supportText("first_reply")}</p>`
                      : nothing
                  }
                </li>`;
              })}
            </ul>`
          : html`<p class="note">${supportText("no_tickets")}</p>`
      }
    </section>`;
  }

  private _renderHow(): TemplateResult {
    return html`<section>
      <h3>${supportText("resolution_title")}</h3>
      <p>${supportText("resolution_intro")}</p>
      <button
        type="button"
        class="text"
        aria-expanded=${this._showHow ? "true" : "false"}
        @click=${this._toggleHow}
      >
        ${this._showHow ? supportText("hide_how") : supportText("show_how")}
      </button>
      ${
        this._showHow
          ? html`<p class="note">
                ${supportText("address")}:
                <span class="address">${window.location.host}</span>
              </p>
              <ol class="steps">
                <li>${supportText("step_open_settings")}</li>
                <li>${supportText("step_clear")}</li>
                <li>${supportText("step_reload")}</li>
              </ol>
              <p class="note">${supportText("clear_warning")}</p>`
          : nothing
      }
    </section>`;
  }

  private _toggleHow(): void {
    this._showHow = !this._showHow;
  }

  private _open(ev: SubmitEvent): void {
    ev.preventDefault();
    const form = ev.currentTarget as HTMLFormElement;
    const input = form.querySelector<HaInput>("ha-input");
    const area = form.querySelector<HTMLTextAreaElement>("textarea");
    const subject = input?.value ?? "";
    if (validateTicket(subject)) {
      this._error = supportText("subject_required");
      return;
    }
    this._error = "";
    writeTickets(
      withTicket(readTickets(), subject, area?.value ?? "", Date.now())
    );
    if (input) {
      input.value = "";
    }
    if (area) {
      area.value = "";
    }
    this._tickets = readTickets().tickets;
    this._schedule();
  }

  private _remove(ev: Event): void {
    const number = (ev.currentTarget as HTMLElement).dataset.number ?? "";
    writeTickets(withoutTicket(readTickets(), number));
    this._tickets = readTickets().tickets;
  }

  static styles: CSSResultGroup = [
    lockPanelStyles,
    css`
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-m, 1rem);
      }
      form,
      section {
        display: grid;
        gap: var(--ha-space-2);
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
        resize: vertical;
        padding: var(--ha-space-2) var(--ha-space-3);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font: inherit;
      }
      textarea:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .callout.plain {
        font-weight: 500;
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
        border-radius: var(--ha-border-radius-xl, 16px);
        background: var(--secondary-background-color);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .num {
        flex: 1;
        font-weight: 500;
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
      .remove {
        width: 44px;
        padding: 0;
        border-color: transparent;
        background: none;
      }
      .subject,
      .details {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .reply {
        padding-inline-start: var(--ha-space-3);
        border-inline-start: 3px solid var(--primary-color);
        color: var(--secondary-text-color);
      }
      .steps {
        margin: 0;
        padding-inline-start: var(--ha-space-5, 20px);
        display: grid;
        gap: var(--ha-space-1);
      }
      .address {
        font-family: var(--ha-font-family-code, monospace);
        overflow-wrap: anywhere;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-support-desk": HaSupportDesk;
  }
}

/** Opens the support desk. One at a time. */
export const openSupportDesk = (anchor?: Element): void => {
  document.querySelectorAll("ha-support-desk").forEach((old) => old.remove());
  const desk = document.createElement("ha-support-desk");
  desk.anchor = anchor;
  document.body.append(desk);
};
