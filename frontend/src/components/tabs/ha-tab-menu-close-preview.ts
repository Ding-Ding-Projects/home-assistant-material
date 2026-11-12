import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { ClosePlan } from "../../common/tabs/tab-close-plans";
import type { HomeAssistant } from "../../types";
import "../ha-checkbox";
import { tabSharedStyles } from "./tab-shared-styles";

declare global {
  interface HASSDomEvents {
    "tab-close-include-pinned": { value: boolean };
    "tab-close-confirm": undefined;
    "tab-close-cancel": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-tab-menu-close-preview": HaTabMenuClosePreview;
  }
}

/**
 * @element ha-tab-menu-close-preview
 *
 * @summary
 * What a close would do, shown before it happens: how the text was read, how
 * many tabs close and which, which tabs are protected and why, and a choice to
 * include the pinned tabs that is off until chosen. It closes nothing itself.
 * The owner builds the plan and listens for the events.
 *
 * @fires tab-close-include-pinned - The choice to include pinned tabs changed.
 * @fires tab-close-confirm - Close the tabs in the plan.
 * @fires tab-close-cancel - Leave without closing.
 */
@customElement("ha-tab-menu-close-preview")
export class HaTabMenuClosePreview extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The plan to show. Absent while there is nothing to preview yet. */
  @property({ attribute: false }) public plan?: ClosePlan;

  /** The visible label of every tab, by id. */
  @property({ attribute: false }) public labels: Record<string, string> = {};

  /** The pinned tabs the plan keeps when pinned tabs are not included. */
  @property({ attribute: false }) public pinnedKept: string[] = [];

  @property({ type: Boolean, attribute: "include-pinned" })
  public includePinned = false;

  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  private _name(id: string): string {
    return this.labels[id] ?? id;
  }

  protected render(): TemplateResult | typeof nothing {
    const plan = this.plan;
    if (!plan || !this.hass) {
      return nothing;
    }
    const base = "ui.page_tabs.close_by_text.";
    const count = plan.ids.length;
    const blocked = plan.blocked;
    return html`
      <div class="preview">
        ${
          blocked
            ? html`<p class="note" role="status">
                ${this._t(`${base}blocked_${blocked}`)}
              </p>`
            : html`
                ${
                  plan.matchMode
                    ? html`<p class="note">
                        ${this._t(`${base}mode_${plan.matchMode}`)}
                      </p>`
                    : nothing
                }
                <p class="summary" role="status">
                  ${this._t(`${base}summary`, { count })}
                </p>
                ${
                  count
                    ? html`<ul
                        class="list"
                        aria-label=${this._t(`${base}will_close`)}
                      >
                        ${plan.ids.map(
                          (id) =>
                            html`<li class="closing">${this._name(id)}</li>`
                        )}
                      </ul>`
                    : nothing
                }
                ${
                  plan.protected.length
                    ? html`
                        <p class="heading">
                          ${this._t(`${base}protected_heading`, {
                            count: plan.protected.length,
                          })}
                        </p>
                        <ul
                          class="list"
                          aria-label=${this._t(`${base}protected_heading`, {
                            count: plan.protected.length,
                          })}
                        >
                          ${plan.protected.map(
                            (item) =>
                              html`<li class="kept">
                                <span>${this._name(item.id)}</span>
                                <span class="why"
                                  >${item.reasons
                                    .map((reason) =>
                                      this._t(`${base}reason_${reason}`)
                                    )
                                    .join(", ")}</span
                                >
                              </li>`
                          )}
                        </ul>
                      `
                    : nothing
                }
                ${
                  this.pinnedKept.length || this.includePinned
                    ? html`<label class="include">
                        <ha-checkbox
                          .checked=${this.includePinned}
                          @change=${this._includeChanged}
                        ></ha-checkbox>
                        <span
                          >${this._t(`${base}include_pinned`, {
                            names: this.pinnedKept
                              .map((id) => this._name(id))
                              .join(", "),
                          })}</span
                        >
                      </label>`
                    : nothing
                }
              `
        }
        <div class="buttons">
          <button class="text-button quiet" @click=${this._cancel}>
            ${this._t(`${base}cancel`)}
          </button>
          <button
            class="text-button"
            ?disabled=${!count || Boolean(blocked)}
            @click=${this._confirm}
          >
            ${this._t(`${base}confirm`, { count })}
          </button>
        </div>
      </div>
    `;
  }

  private _includeChanged(ev: Event) {
    ev.stopPropagation();
    fireEvent(this, "tab-close-include-pinned", {
      value: (ev.target as HTMLInputElement).checked,
    });
  }

  private _confirm() {
    fireEvent(this, "tab-close-confirm");
  }

  private _cancel() {
    fireEvent(this, "tab-close-cancel");
  }

  static styles: CSSResultGroup = [
    tabSharedStyles,
    css`
      :host {
        display: block;
      }
      .preview {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      p {
        margin: 0;
      }
      .note,
      .why {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .summary,
      .heading {
        font-weight: var(--ha-font-weight-medium);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 160px;
        overflow-y: auto;
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
      }
      .list li {
        padding: var(--ha-space-2) var(--ha-space-3);
        overflow-wrap: anywhere;
      }
      .list li + li {
        border-top: 1px solid var(--divider-color);
      }
      .kept {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .include {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
        cursor: pointer;
      }
      .buttons {
        display: flex;
        justify-content: flex-end;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      .text-button {
        min-height: 44px;
      }
      .text-button.quiet {
        background: none;
        color: var(--primary-color);
      }
    `,
  ];
}
