import { mdiMagnify, mdiRegex } from "@mdi/js";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { stopPropagation } from "../../common/dom/stop_propagation";
import { regexQuery } from "../../common/regex/filter";
import type { LocalizeKeys } from "../../common/translations/localize";
import type { HaRegexWorkbench } from "../regex/ha-regex-workbench";
import { HaInput } from "./ha-input";

/**
 * Home Assistant search input component
 *
 * @element ha-input-search
 * @extends {HaInput}
 *
 * @summary
 * A pre-configured search input that extends `ha-input` with a magnify icon, clear button,
 * and a localized "Search" placeholder. Autocomplete is disabled by default.
 *
 * Plain text is the default. A button after the input opens the pattern
 * workbench beside the field, where a regular expression can be built, tested
 * and sent back to the field as `/pattern/flags`. Each field owns its
 * workbench; nothing is shared between fields.
 *
 * @attr {boolean} no-pattern-builder - Leaves out the pattern workbench button. Use only where the text is not a filter, such as a web address.
 */
@customElement("ha-input-search")
export class HaInputSearch extends HaInput {
  @property({ type: Boolean, attribute: "no-pattern-builder" })
  public noPatternBuilder = false;

  /** Items of the list this field filters, offered as test text. */
  @property({ attribute: false }) public patternSamples?: string[];

  @state() private _workbenchLoaded = false;

  @query("ha-regex-workbench") private _workbench?: HaRegexWorkbench;

  constructor() {
    super();
    this.withClear = true;
    this.autocomplete = this.autocomplete || "off";
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);

    if (
      !this.label &&
      !this.placeholder &&
      (!this.hasUpdated || changedProps.has("_i18n"))
    ) {
      this.placeholder = this.i18n?.localize?.("ui.common.search") || "Search";
    }
  }

  protected render() {
    return html`${super.render()}${
      this._workbenchLoaded
        ? html`<ha-regex-workbench
            .fieldLabel=${this.label || this.placeholder || ""}
            .samples=${this.patternSamples}
            @regex-apply=${this._applyPattern}
            @input=${stopPropagation}
            @change=${stopPropagation}
            @keydown=${stopPropagation}
          ></ha-regex-workbench>`
        : nothing
    }`;
  }

  protected renderStartDefault() {
    return html`<ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>`;
  }

  protected renderEndFixed(): TemplateResult | typeof nothing {
    if (this.noPatternBuilder || this.disabled || this.readonly) {
      return nothing;
    }
    const pattern = regexQuery(this.value);
    const label = pattern?.error
      ? this._localizePattern(`filter_error.${pattern.error}`)
      : this._localizePattern(pattern ? "open_active" : "open");
    return html`<ha-icon-button
      slot="end"
      class=${classMap({
        pattern: true,
        active: !!pattern,
        error: !!pattern?.error,
      })}
      .label=${label}
      .path=${mdiRegex}
      aria-haspopup="dialog"
      aria-pressed=${pattern ? "true" : "false"}
      @click=${this._openWorkbench}
    ></ha-icon-button>`;
  }

  private _localizePattern(key: string): string {
    return (
      this.i18n?.localize?.(`ui.regex.${key}` as LocalizeKeys) ||
      "Pattern workbench"
    );
  }

  private async _openWorkbench(ev: Event) {
    ev.stopPropagation();
    ev.preventDefault();
    if (!this._workbenchLoaded) {
      await import("../regex/ha-regex-workbench");
      this._workbenchLoaded = true;
      await this.updateComplete;
    }
    this._workbench?.show(this, this.value ?? "");
  }

  private _applyPattern(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    this.value = ev.detail.value;
    // Consumers filter on `input`, the same event typing fires.
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    // Put focus back in the field, where the person continues. The button
    // just pressed is inside this element, and focusing an element that
    // already holds focus does nothing, so let go of it first.
    this.updateComplete.then(() => {
      (this.shadowRoot?.activeElement as HTMLElement | null)?.blur();
      this.focus();
    });
  }

  static styles = [
    ...HaInput.styles,
    css`
      :host([appearance="outlined"]) wa-input.no-label::part(base) {
        height: var(--ha-input-search-height, 40px);
        border-radius: var(
          --ha-input-search-border-radius,
          var(--ha-border-radius-md)
        );
      }
      .pattern {
        --ha-icon-button-size: 32px;
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
        margin-inline-end: calc(var(--ha-space-1) * -1);
      }
      .pattern.active {
        color: var(--primary-color);
        background: var(--ha-color-fill-primary-quiet-resting);
        border-radius: var(--ha-border-radius-pill);
      }
      .pattern.error {
        color: var(--error-color);
        background: var(--ha-color-fill-danger-quiet-resting);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-input-search": HaInputSearch;
  }
}
