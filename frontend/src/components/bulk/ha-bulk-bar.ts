import { mdiAlertCircle, mdiCheck, mdiClose, mdiMinus } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../common/dom/fire_event";
import "../ha-button";
import "../ha-icon-button";
import "../ha-svg-icon";
import type {
  BulkAction,
  BulkPreview,
  BulkPreviewKind,
} from "./bulk-selection";
import { nextConfirmStep } from "./bulk-selection";

const PREVIEW_ICONS: Record<BulkPreviewKind, string> = {
  change: mdiCheck,
  same: mdiMinus,
  skip: mdiAlertCircle,
};

declare global {
  interface HASSDomEvents {
    "bulk-select-page": undefined;
    "bulk-select-matches": undefined;
    "bulk-invert": undefined;
    "bulk-clear": undefined;
    "bulk-action": { id: string };
    "bulk-confirm": { id: string };
  }
}

/**
 * The bar a list shows while items are selected: how many are selected, how to
 * select more, and the actions the page supplies. An action marked `preview`
 * first shows what will change, from `getPreview`, and runs only after a
 * confirmation; a destructive one asks a second time before it runs.
 *
 * The page owns the selection and does the work. It listens for
 * `bulk-select-page`, `bulk-select-matches`, `bulk-invert`, `bulk-clear`,
 * `bulk-action` (an action without a preview) and `bulk-confirm`. Anything
 * a page puts in the `actions` slot, such as a menu button, sits in the bar
 * beside the plain action buttons.
 */
@customElement("ha-bulk-bar")
export class HaBulkBar extends LitElement {
  @property({ attribute: false }) public localize!: (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  /** How many items are selected. */
  @property({ type: Number }) public count = 0;

  /** How many items the list shows on this page. */
  @property({ type: Number, attribute: "page-count" }) public pageCount = 0;

  /** How many items match the current search or filter in all. */
  @property({ type: Number, attribute: "match-count" }) public matchCount = 0;

  /** How many of the selected items the search or filter hides now. */
  @property({ type: Number, attribute: "hidden-count" }) public hiddenCount = 0;

  @property({ attribute: false }) public actions: BulkAction[] = [];

  /** Builds the preview of an action from the current selection. */
  @property({ attribute: false }) public getPreview?: (
    id: string
  ) => BulkPreview | undefined;

  @state() private _pending?: string;

  @state() private _armed = false;

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("count") && this._pending) {
      // The selection changed under an open preview, so the preview is stale.
      this._cancel();
    }
  }

  protected render() {
    if (!this.count) {
      return nothing;
    }
    const preview = this._pending
      ? this.getPreview?.(this._pending)
      : undefined;
    const action = this.actions.find((item) => item.id === this._pending);
    const shownSelected = this.count - this.hiddenCount;
    return html`
      <div
        class="bar"
        role="toolbar"
        aria-label=${this.localize("ui.bulk.toolbar")}
      >
        <strong class="count" role="status"
          >${this.localize("ui.bulk.selected", { count: this.count })}</strong
        >
        <ha-button
          size="s"
          appearance="plain"
          ?disabled=${shownSelected >= this.pageCount}
          @click=${this._selectPage}
        >
          ${this.localize("ui.bulk.select_page", { count: this.pageCount })}
        </ha-button>
        ${
          this.matchCount > this.pageCount
            ? html`<ha-button
                size="s"
                appearance="plain"
                ?disabled=${shownSelected >= this.matchCount}
                @click=${this._selectMatches}
              >
                ${this.localize("ui.bulk.select_matches", {
                  count: this.matchCount,
                })}
              </ha-button>`
            : nothing
        }
        <ha-button size="s" appearance="plain" @click=${this._invert}>
          ${this.localize("ui.bulk.invert")}
        </ha-button>
        ${
          this.hiddenCount > 0
            ? html`<span class="hidden-note"
                >${this.localize("ui.bulk.hidden_selected", {
                  count: this.hiddenCount,
                })}</span
              >`
            : nothing
        }
        <span class="spacer"></span>
        <slot name="actions"></slot>
        ${this.actions.map(
          (item) => html`
            <ha-button
              size="s"
              appearance=${item.id === this._pending ? "filled" : "outlined"}
              variant=${item.destructive ? "danger" : "brand"}
              data-action=${item.id}
              ?disabled=${item.disabled}
              @click=${this._actionClicked}
            >
              ${
                item.path
                  ? html`<ha-svg-icon
                      slot="start"
                      .path=${item.path}
                    ></ha-svg-icon>`
                  : nothing
              }
              ${item.label}
            </ha-button>
          `
        )}
        <ha-icon-button
          .label=${this.localize("ui.bulk.clear")}
          .path=${mdiClose}
          @click=${this._clear}
        ></ha-icon-button>
      </div>
      ${
        preview && action
          ? html`
              <section class="preview" aria-label=${preview.title}>
                <h2>${preview.title}</h2>
                <ul>
                  ${preview.items.map(
                    (item) => html`
                      <li class=${classMap({ [item.kind]: true })}>
                        <ha-svg-icon
                          .path=${PREVIEW_ICONS[item.kind]}
                        ></ha-svg-icon>
                        <span>${item.text}</span>
                      </li>
                    `
                  )}
                </ul>
                ${
                  action.destructive && this._armed
                    ? html`<p class="warning" role="alert">
                        ${this.localize("ui.bulk.confirm_again")}
                      </p>`
                    : nothing
                }
                <div class="footer">
                  <span class="note">${preview.note ?? ""}</span>
                  <ha-button
                    size="s"
                    appearance="outlined"
                    @click=${this._cancel}
                  >
                    ${this.localize("ui.bulk.cancel")}
                  </ha-button>
                  <ha-button
                    size="s"
                    appearance="filled"
                    variant=${action.destructive ? "danger" : "brand"}
                    ?disabled=${preview.changeCount <= 0}
                    @click=${this._confirm}
                  >
                    ${
                      action.destructive && this._armed
                        ? this.localize("ui.bulk.confirm_destructive", {
                            label: preview.confirmLabel,
                          })
                        : preview.confirmLabel
                    }
                  </ha-button>
                </div>
              </section>
            `
          : nothing
      }
    `;
  }

  private _selectPage(): void {
    fireEvent(this, "bulk-select-page");
  }

  private _selectMatches(): void {
    fireEvent(this, "bulk-select-matches");
  }

  private _invert(): void {
    fireEvent(this, "bulk-invert");
  }

  private _clear(): void {
    this._cancel();
    fireEvent(this, "bulk-clear");
  }

  private _actionClicked(ev: Event): void {
    const id = (ev.currentTarget as HTMLElement).dataset.action!;
    const action = this.actions.find((item) => item.id === id);
    if (!action) {
      return;
    }
    if (action.preview || action.destructive) {
      this._pending = this._pending === id ? undefined : id;
      this._armed = false;
      return;
    }
    fireEvent(this, "bulk-action", { id });
  }

  private _cancel(): void {
    this._pending = undefined;
    this._armed = false;
  }

  private _confirm(): void {
    const id = this._pending;
    const action = this.actions.find((item) => item.id === id);
    const preview = id ? this.getPreview?.(id) : undefined;
    if (!id || !action || !preview) {
      return;
    }
    const step = nextConfirmStep(
      !!action.destructive,
      this._armed,
      preview.changeCount
    );
    if (step === "ask-again") {
      this._armed = true;
    } else if (step === "run") {
      this._cancel();
      fireEvent(this, "bulk-confirm", { id });
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-2)
        var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-neutral-10, #1b1b1f);
      color: var(--ha-color-on-neutral-loud, #fff);
      --ha-button-theme-color: currentColor;
    }
    .count {
      margin-inline-end: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
    }
    .hidden-note {
      font-size: var(--ha-font-size-s);
      opacity: 0.8;
    }
    ::slotted([slot="actions"]) {
      --ha-button-theme-color: currentColor;
    }
    .spacer {
      flex: 1 1 0;
    }
    ha-icon-button {
      color: inherit;
    }
    .preview {
      box-sizing: border-box;
      max-width: 420px;
      margin-top: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      box-shadow: var(--ha-box-shadow-m, 0 2px 8px rgba(0, 0, 0, 0.2));
    }
    .preview h2 {
      margin: 0 0 var(--ha-space-3);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .preview ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      max-height: 40vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .preview li {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-2);
      overflow-wrap: anywhere;
    }
    .preview li ha-svg-icon {
      flex: none;
      --mdc-icon-size: 20px;
    }
    li.change {
      color: var(--success-color);
    }
    li.same {
      color: var(--primary-text-color);
    }
    li.skip {
      color: var(--error-color);
    }
    .warning {
      margin: var(--ha-space-3) 0 0;
      color: var(--error-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-4);
    }
    .note {
      flex: 1 1 140px;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-bulk-bar": HaBulkBar;
  }
}
