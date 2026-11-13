import { mdiLock, mdiTabRemove } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { BulkCloseMode } from "../../common/tabs/bulk-close";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import { phoneOverlayStyles, trapTab } from "./phone-overlay";
import type { ActionReason, PhonePage } from "./phone-page-actions";
import { planTitleBulkClose, planTitleBulkLock } from "./phone-page-actions";

declare global {
  interface HASSDomEvents {
    "phone-bulk-confirm": { ids: string[]; planned: number; kept: number };
    "phone-bulk-dismiss": undefined;
    "phone-bulk-lock": { ids: string[] };
  }
}

const REASON_KEYS: Partial<Record<ActionReason, string>> = {
  pinned: "ui.phone.kept_pinned",
  locked: "ui.phone.kept_locked",
  current: "ui.phone.kept_current",
};

/**
 * @element ha-phone-bulk-close
 *
 * @summary
 * The review step of "Close pages containing text" and "Close pages not
 * containing text" in the Pages sheet. It has its own search field, plain
 * text by default with the pattern workbench beside it, matches the visible
 * title only, and shows the mode, how many pages would close, the pages that
 * would close and the pages that are kept and why. Nothing closes until the
 * confirm button is pressed, and an empty text or an unusable pattern never
 * enables it.
 *
 * @fires phone-bulk-confirm - `detail.ids` are the pages to close.
 * @fires phone-bulk-dismiss - Back out without closing anything.
 */
@customElement("ha-phone-bulk-close")
export class HaPhoneBulkClose extends LitElement {
  @property() public mode: BulkCloseMode = "matching";

  @property({ attribute: false }) public pages: PhonePage[] = [];

  @property({ attribute: false }) public currentId?: string;

  /** Localizes a key in the chosen language mode. */
  @property({ attribute: false }) public text!: (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  @state() private _query = "";

  @query("#bulk-search") private _search?: HTMLElement;

  protected firstUpdated(changed: PropertyValues) {
    super.firstUpdated(changed);
    this._search?.focus();
  }

  protected render(): TemplateResult {
    const t = this.text;
    const preview = planTitleBulkClose(
      this.pages,
      this._query,
      this.mode,
      this.currentId
    );
    const lockPlan = planTitleBulkLock(this.pages, this._query, this.mode);
    const heading = t(
      this.mode === "matching"
        ? "ui.phone.action_bulk_contain"
        : "ui.phone.action_bulk_not_contain"
    );
    const titleOf = (id: string) =>
      this.pages.find((page) => page.id === id)?.title ?? id;
    return html`
      <button
        class="scrim"
        tabindex="-1"
        aria-hidden="true"
        @click=${this._dismiss}
      ></button>
      <div
        class="panel"
        role="dialog"
        aria-label=${heading}
        @keydown=${this._keydown}
      >
        <div class="panel-head">
          <h2 class="panel-title">${heading}</h2>
        </div>
        <p class="note">
          ${t(
            this.mode === "matching"
              ? "ui.phone.bulk_mode_contain"
              : "ui.phone.bulk_mode_not_contain"
          )}
        </p>
        <ha-input-search
          id="bulk-search"
          appearance="outlined"
          .value=${this._query}
          .placeholder=${t("ui.phone.bulk_field")}
          .accessibleLabel=${t("ui.phone.bulk_field")}
          .patternSamples=${this.pages.map((page) => page.title)}
          @input=${this._queryChanged}
        ></ha-input-search>
        <div class="review" role="status">
          ${this._renderReview(preview, titleOf)}
        </div>
        <div class="buttons">
          <button class="text-button back" @click=${this._dismiss}>
            ${t("ui.phone.bulk_back")}
          </button>
          <button
            class="text-button lock-pages"
            ?disabled=${!lockPlan.ids.length}
            @click=${this._lock}
          >
            <ha-svg-icon .path=${mdiLock}></ha-svg-icon>
            ${t("ui.phone.bulk_lock", { count: lockPlan.ids.length })}
          </button>
          <button
            class="text-button confirm"
            ?disabled=${!preview.ids.length}
            @click=${this._confirm}
          >
            <ha-svg-icon .path=${mdiTabRemove}></ha-svg-icon>
            ${t("ui.phone.bulk_confirm", { count: preview.ids.length })}
          </button>
        </div>
      </div>
    `;
  }

  private _renderReview(
    preview: ReturnType<typeof planTitleBulkClose>,
    titleOf: (id: string) => string
  ): TemplateResult {
    const t = this.text;
    if (preview.blocked === "empty") {
      return html`<p class="note">${t("ui.phone.bulk_empty")}</p>`;
    }
    if (preview.blocked === "invalid") {
      return html`<p class="note">${t("ui.page_tabs.bulk_invalid")}</p>`;
    }
    return html`
      <p class="count">
        ${t("ui.phone.bulk_preview", { count: preview.ids.length })}
      </p>
      ${
        preview.ids.length
          ? html`<ul class="names">
              ${preview.ids.map((id) => html`<li>${titleOf(id)}</li>`)}
            </ul>`
          : nothing
      }
      ${
        preview.kept.length
          ? html`<p class="count">
                ${t("ui.phone.bulk_kept", { count: preview.kept.length })}
              </p>
              <ul class="names">
                ${preview.kept.map(
                  (page) =>
                    html`<li>
                      ${page.title}
                      <span class="note"
                        >${t(REASON_KEYS[page.reason] ?? "ui.phone.kept_current")}</span
                      >
                    </li>`
                )}
              </ul>`
          : nothing
      }
    `;
  }

  private _queryChanged(ev: Event) {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _confirm() {
    // Worked out again from the current pages, so a page that changed while
    // the review was open is never closed by an old preview.
    const preview = planTitleBulkClose(
      this.pages,
      this._query,
      this.mode,
      this.currentId
    );
    if (!preview.ids.length) {
      return;
    }
    fireEvent(this, "phone-bulk-confirm", {
      ids: preview.ids,
      planned: preview.ids.length,
      kept: preview.kept.length,
    });
  }

  // One wizard locks every page that matches; the pages are worked out again
  // from the current list, like the close.
  private _lock() {
    const plan = planTitleBulkLock(this.pages, this._query, this.mode);
    if (plan.ids.length) {
      fireEvent(this, "phone-bulk-lock", { ids: plan.ids });
    }
  }

  private _dismiss() {
    fireEvent(this, "phone-bulk-dismiss");
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this._dismiss();
      return;
    }
    if (this.shadowRoot) {
      trapTab(ev, this.shadowRoot);
    }
  }

  static styles: CSSResultGroup = [
    phoneOverlayStyles,
    css`
      p {
        margin: 0;
      }
      #bulk-search {
        --ha-input-search-height: 48px;
        --ha-input-search-border-radius: var(--ha-border-radius-pill);
      }
      .review {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        min-height: 0;
      }
      .count {
        font-weight: var(--ha-font-weight-medium);
      }
      .names {
        margin: 0;
        padding-inline-start: var(--ha-space-5);
        max-height: 20vh;
        overflow-y: auto;
        overflow-wrap: break-word;
        word-break: normal;
      }
      .buttons {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--ha-space-2);
      }
      .back {
        background: none;
        border: 1px solid var(--divider-color);
      }
      .confirm {
        color: var(--error-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-phone-bulk-close": HaPhoneBulkClose;
  }
}
