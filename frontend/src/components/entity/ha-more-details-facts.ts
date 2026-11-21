import type { ContextType } from "@lit/context";
import { mdiChevronDown, mdiChevronUp, mdiContentCopy } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import { consume } from "../../common/decorators/consume";
import { modeText } from "../../common/language-mode/language-mode";
import { motionKindTiming } from "../../common/motion/page-entry";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { configContext, internationalizationContext } from "../../data/context";
import type { DetailFact } from "../../data/entity-details";
import { factsCopyText } from "../../data/entity-details";
import type { HomeAssistant } from "../../types";
import { bytesToString } from "../../util/bytes-to-string";
import { detailsLabelFit } from "./details-label-fit";
import { showToast } from "../../util/toast";
import "../ha-button";
import "../ha-icon-button";
import "../ha-svg-icon";

/** A string from the "Show more details" block in the chosen language mode. */
export const detailsText = (
  hass: Pick<HomeAssistant, "localize">,
  key: string,
  values?: Record<string, string | number>
): string =>
  modeText(hass.localize, `ui.components.entity_details.${key}`, values);

/**
 * Lets a details panel arrive with a short drop-in, through the "cards"
 * motion kind, so it follows the person's animation settings and is absent
 * under reduced motion and low stimulation.
 */
export const playDetailsOpen = (element: Element | null | undefined) => {
  if (!element || typeof element.animate !== "function") {
    return;
  }
  const timing = motionKindTiming("cards");
  if (!timing.enabled) {
    return;
  }
  element.animate(
    [
      { opacity: 0, transform: "translateY(-8px)" },
      { opacity: 1, transform: "none" },
    ],
    {
      duration: Math.min(timing.duration, 320),
      easing: "cubic-bezier(.2, .9, .3, 1)",
      fill: "backwards",
    }
  );
};

/** Rows, section headings and actions shared by every details panel. */
export const detailsStyles = css`
  /* The details are their own size container: the label and the value sit
     side by side or stacked by the width of the panel, not of the window. */
  .details {
    display: flex;
    flex-direction: column;
    min-width: 0;
    container: more-details / inline-size;
    /* A table keeps its rows on one line; details opened inside a table row
       must still wrap their labels and values. */
    white-space: normal;
  }
  .heading {
    margin: var(--ha-space-3) 0 var(--ha-space-1);
    font-size: var(--ha-font-size-s, 12px);
    font-weight: var(--ha-font-weight-bold, 700);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--ha-space-2);
    padding: var(--ha-space-1) 0;
    border-top: 1px solid var(--divider-color);
    min-height: 48px;
    box-sizing: border-box;
  }
  .label {
    flex: 0 0 104px;
    min-width: 0;
    padding-top: 13px;
    font-size: var(--ha-font-size-s, 12px);
    line-height: 18px;
    color: var(--secondary-text-color);
    /* The label wraps inside its own column and never runs into the value. */
    white-space: normal;
    overflow-wrap: anywhere;
    overflow: hidden;
  }
  /* A label wider than its column (often one written in both languages)
     goes on a line of its own above its value. */
  .row.label-over-narrow {
    flex-wrap: wrap;
    row-gap: 0;
  }
  .row.label-over-narrow .label {
    flex: 1 0 100%;
    padding-top: var(--ha-space-2);
  }
  .row.label-over-narrow .value {
    padding-top: 0;
  }
  .value {
    flex: 1;
    min-width: 0;
    padding-top: 13px;
    padding-bottom: var(--ha-space-2);
    font-size: var(--ha-font-size-m, 14px);
    line-height: 20px;
    color: var(--primary-text-color);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .value.mono {
    font-family: var(--ha-font-family-code, ui-monospace, monospace);
    font-size: 13px;
  }
  .value.folded {
    max-height: 80px;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, black 60%, transparent);
  }
  .value a {
    color: var(--primary-color);
  }
  .note {
    display: block;
    margin-top: var(--ha-space-1);
    font-size: var(--ha-font-size-s, 12px);
    color: var(--warning-color);
  }
  .row-tools {
    display: flex;
    flex: none;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
    margin-top: var(--ha-space-3);
  }
  .more {
    align-self: flex-start;
    margin-top: var(--ha-space-1);
  }
  .details-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1);
    min-height: 48px;
    max-width: 100%;
    padding: 0 var(--ha-space-4);
    border: 1px solid var(--primary-color);
    border-radius: 24px;
    background: transparent;
    color: var(--primary-color);
    font: inherit;
    font-size: var(--ha-font-size-m, 14px);
    font-weight: var(--ha-font-weight-medium, 500);
    text-align: start;
    cursor: pointer;
  }
  .details-toggle:hover {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .details-toggle:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .details-toggle ha-svg-icon {
    flex: none;
    --mdc-icon-size: 18px;
  }
  @container more-details (min-width: 520px) {
    .label {
      flex-basis: 168px;
    }
    /* A wide panel's label column holds labels up to 168 px beside their
       value. */
    .row.label-over-narrow:not(.label-over-wide) {
      flex-wrap: nowrap;
    }
    .row.label-over-narrow:not(.label-over-wide) .label {
      flex: 0 0 168px;
      padding-top: 13px;
    }
    .row.label-over-narrow:not(.label-over-wide) .value {
      padding-top: 13px;
    }
  }
  /* A narrow panel (a phone, a quick bar row, a card) puts the label above
     its value, so the value keeps the full width and never breaks a letter
     at a time. */
  @container more-details (max-width: 319px) {
    .row {
      flex-wrap: wrap;
      row-gap: 0;
    }
    .label {
      flex: 1 0 100%;
      padding-top: var(--ha-space-2);
    }
    .value {
      padding-top: 0;
    }
  }
`;

/**
 * "Show more details" for something that is not an entity: a device, an
 * integration entry, an area, a backup, an automation row or an update row.
 * It shows the raw identifiers and facts the page already has, in place, with
 * a copy button per line and one for everything. It never asks the server for
 * anything.
 */
@customElement("ha-more-details-facts")
export class HaMoreDetailsFacts extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config?: ContextType<typeof configContext>;

  @property({ attribute: false }) public facts: DetailFact[] = [];

  /** Starts open, for pages where the details have a section of their own. */
  @property({ type: Boolean }) public open = false;

  /** Always open, without its own button, where something else opens it. */
  @property({ type: Boolean, attribute: "no-toggle" }) public noToggle = false;

  @state() private _open?: boolean;

  private get _isOpen() {
    return this.noToggle || (this._open ?? this.open);
  }

  protected render() {
    if (!this._i18n || !this.facts.length) {
      return nothing;
    }
    const isOpen = this._isOpen;
    const toggleText = detailsText(
      this._i18n,
      isOpen ? "show_fewer" : "show_more"
    );
    return html`
      ${
        this.noToggle
          ? nothing
          : html`<button
              type="button"
              class="details-toggle"
              aria-expanded=${isOpen ? "true" : "false"}
              aria-controls="facts"
              @click=${this._toggle}
            >
              ${toggleText}
              <ha-svg-icon
                .path=${isOpen ? mdiChevronUp : mdiChevronDown}
              ></ha-svg-icon>
            </button>`
      }
      ${
        isOpen
          ? html`<div
              class="details"
              id="facts"
              role="region"
              aria-label=${
                this.noToggle
                  ? detailsText(this._i18n, "section.facts")
                  : toggleText
              }
            >
              ${this.facts.map((item) => this._renderFact(item))}
              <div class="actions">
                <ha-button appearance="plain" @click=${this._copyAll}>
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiContentCopy}
                  ></ha-svg-icon>
                  ${detailsText(this._i18n!, "copy_everything")}
                </ha-button>
              </div>
            </div>`
          : nothing
      }
    `;
  }

  private _label(item: DetailFact) {
    return detailsText(this._i18n!, `fact.${item.key}`);
  }

  private _written(item: DetailFact): string {
    if (item.kind === "time") {
      const date = new Date(item.value);
      return Number.isNaN(date.getTime())
        ? item.value
        : this._config
          ? formatDateTimeWithSeconds(
              date,
              this._i18n!.locale,
              this._config.config
            )
          : item.value;
    }
    if (item.kind === "bytes") {
      const bytes = Number(item.value);
      return Number.isFinite(bytes)
        ? `${bytesToString(bytes)} (${bytes} B)`
        : item.value;
    }
    if (item.kind === "yesno") {
      return detailsText(
        this._i18n!,
        item.value === "true" ? "value.yes" : "value.no"
      );
    }
    return item.value;
  }

  private _renderFact(item: DetailFact) {
    const label = this._label(item);
    const written = this._written(item);
    const external = item.href?.startsWith("http");
    return html`<div
      class=${classMap({ row: true, ...detailsLabelFit(label) })}
    >
      <span class="label">${label}</span>
      <span
        class=${classMap({
          value: true,
          mono: item.kind === "mono" || item.kind === "link",
        })}
        >${
          item.href
            ? html`<a
                href=${item.href}
                target=${external ? "_blank" : "_self"}
                rel=${external ? "noreferrer" : ""}
                >${written}</a
              >`
            : written
        }</span
      >
      <div class="row-tools">
        <ha-icon-button
          .path=${mdiContentCopy}
          .label=${detailsText(this._i18n!, "copy_value", { name: label })}
          data-value=${item.value}
          @click=${this._copyOne}
        ></ha-icon-button>
      </div>
    </div>`;
  }

  @query(".details") private _details?: HTMLElement;

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("_open") && this._open) {
      playDetailsOpen(this._details);
    }
  }

  private _toggle() {
    this._open = !this._isOpen;
  }

  private async _copyOne(ev: Event) {
    ev.stopPropagation();
    await this._copy((ev.currentTarget as HTMLElement).dataset.value ?? "");
  }

  private async _copyAll() {
    await this._copy(factsCopyText(this.facts));
  }

  private async _copy(text: string) {
    await copyToClipboard(text);
    showToast(this, {
      message: modeText(this._i18n!.localize, "ui.common.copied_clipboard"),
    });
  }

  static styles = [
    detailsStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .details {
        margin-top: var(--ha-space-2);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-details-facts": HaMoreDetailsFacts;
  }
}
