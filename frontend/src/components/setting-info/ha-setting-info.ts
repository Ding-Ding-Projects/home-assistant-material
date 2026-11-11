import { mdiClose, mdiInformationOutline } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { parseHelpAddress } from "../help/help-article-path";
import { openHelpArticle } from "../help/open-help-article";
import type { HomeAssistant } from "../../types";
import "../ha-slider";
import "../ha-switch";
import "../ha-svg-icon";
import "../input/ha-input";
import type { PractiseSpec, SettingInfoExample } from "./practise-logic";
import {
  evaluatePractise,
  initialPractiseValue,
  usableExamples,
} from "./practise-logic";

export type {
  PractiseNumberSpec,
  PractiseSpec,
  PractiseSwitchSpec,
  PractiseTextSpec,
  SettingInfoExample,
} from "./practise-logic";

/** The words the popover uses for its own headings and buttons. */
export interface SettingInfoLabels {
  /** The accessible name of the button, with `{name}` for the setting. */
  button: string;
  close: string;
  what: string;
  defaultValue: string;
  reach: string;
  holding: string;
  holdingNothing: string;
  openHelp: string;
  example: string;
  exampleInput: string;
  exampleResult: string;
  practise: string;
  /** Says in words that the practise control saves and sends nothing. */
  practiseNote: string;
  practiseReset: string;
  /** The accessible name of the practise control, with `{name}`. */
  practiseControl: string;
}

const LABEL_KEYS: Record<keyof SettingInfoLabels, string> = {
  button: "button",
  close: "close",
  what: "what",
  defaultValue: "default",
  reach: "reach",
  holding: "holding",
  holdingNothing: "holding_nothing",
  openHelp: "open_help",
  example: "example",
  exampleInput: "example_input",
  exampleResult: "example_result",
  practise: "practise",
  practiseNote: "practise_note",
  practiseReset: "practise_reset",
  practiseControl: "practise_control",
};

const FOCUSABLE = "button, ha-switch, ha-slider, ha-input";

let nextId = 0;

/**
 * An information button for one setting or field. It opens a small panel that
 * says what the setting does, its default, where it takes effect, what holds
 * it right now (School mode, a schedule, a shared default) and, when there is
 * a bundled help article for it, a link to that article.
 *
 * A page can also give a worked `example` (pairs of input and result) and a
 * `practise` spec. The spec names a control type (switch, number with a range,
 * or text with a validation rule); the panel then shows a sandbox control that
 * validates live with the real rule and says that nothing is saved and
 * nothing is sent. See `practise-logic.ts`.
 *
 * The button is a real button: Enter and Space open it, Escape closes it and
 * puts the focus back on the button, and so does the close button. While the
 * panel is open, Tab and Shift+Tab stay inside it. It stays inside the screen
 * on a phone. Text arrives already localized; only the headings are the
 * component's own, and a page can replace them through `labels`.
 */
@customElement("ha-setting-info")
export class HaSettingInfo extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  /** The name of the setting, used for the button name and the panel title. */
  @property() public label = "";

  /** What the setting does. */
  @property() public description = "";

  /** The default as words, or empty when there is none to show. */
  @property({ attribute: "default-text" }) public defaultText = "";

  /** Where the setting takes effect. */
  @property() public reach = "";

  /** What holds the value right now, or empty when nothing does. */
  @property() public holding = "";

  /** A bundled help article path. The link is left out when it is not one. */
  @property({ attribute: "help-path" }) public helpPath = "";

  /** Replaces the headings, for a page that has its own language mode. */
  @property({ attribute: false }) public labels?: Partial<SettingInfoLabels>;

  /** A short list of input and result pairs that show the setting at work. */
  @property({ attribute: false }) public example?: SettingInfoExample[];

  /** A sandbox control to try the setting's rule. Nothing is saved or sent. */
  @property({ attribute: false }) public practise?: PractiseSpec;

  @state() private _open = false;

  /** The sandbox value: a boolean, or the raw text of a number or text field. */
  @state() private _practiseValue: boolean | string = "";

  @state() private _placement: Record<string, string> = {};

  @query(".trigger") private _trigger?: HTMLButtonElement;

  @query(".panel") private _panel?: HTMLElement;

  private _id = `setting-info-${nextId++}`;

  private _lang = new LanguageModeController(this);

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unlisten();
  }

  /** Localized text for a key under `ui.components.setting_info`. */
  private _key(name: string, values?: Record<string, string>): string {
    return this.hass
      ? this._lang.text(
          this.hass.localize as any,
          `ui.components.setting_info.${name}`,
          values
        )
      : "";
  }

  private _text(key: keyof SettingInfoLabels, values?: Record<string, string>) {
    const override = this.labels?.[key];
    const raw = override ?? this._key(LABEL_KEYS[key], values);
    return values && override
      ? Object.entries(values).reduce(
          (text, [name, value]) => text.split(`{${name}}`).join(value),
          override
        )
      : raw;
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("practise")) {
      this._resetPractise();
    }
  }

  private _resetPractise() {
    this._practiseValue = this.practise
      ? this.practise.type === "switch"
        ? Boolean(initialPractiseValue(this.practise))
        : String(initialPractiseValue(this.practise))
      : "";
  }

  protected updated(changed: PropertyValues) {
    if (changed.has("_open")) {
      if (this._open) {
        this._resetPractise();
        this._listen();
        this._place();
        this._panel?.focus({ preventScroll: true });
      } else {
        this._unlisten();
      }
    }
  }

  private _listen() {
    document.addEventListener("pointerdown", this._outside, true);
    document.addEventListener("keydown", this._escape, true);
    window.addEventListener("resize", this._place);
    window.addEventListener("scroll", this._place, true);
  }

  private _unlisten() {
    document.removeEventListener("pointerdown", this._outside, true);
    document.removeEventListener("keydown", this._escape, true);
    window.removeEventListener("resize", this._place);
    window.removeEventListener("scroll", this._place, true);
  }

  /** Puts the panel under the button and keeps it inside the screen. */
  private _place = () => {
    const trigger = this._trigger;
    if (!trigger) {
      return;
    }
    const margin = 16;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - margin * 2);
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - margin - width)
    );
    const below = rect.bottom + 4;
    const room = window.innerHeight - below - margin;
    const above = rect.top - 4 - margin;
    const placeAbove = room < 160 && above > room;
    this._placement = placeAbove
      ? {
          left: `${left}px`,
          width: `${width}px`,
          bottom: `${window.innerHeight - rect.top + 4}px`,
          maxHeight: `${Math.max(120, above)}px`,
        }
      : {
          left: `${left}px`,
          width: `${width}px`,
          top: `${below}px`,
          maxHeight: `${Math.max(120, room)}px`,
        };
  };

  private _outside = (ev: Event) => {
    if (!ev.composedPath().includes(this)) {
      this._close(false);
    }
  };

  private _escape = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && this._open) {
      ev.stopPropagation();
      this._close(true);
    }
  };

  /** Keeps Tab and Shift+Tab inside the open panel. */
  private _trapFocus = (ev: KeyboardEvent) => {
    if (ev.key !== "Tab" || !this._open || !this._panel) {
      return;
    }
    const items = Array.from(
      this._panel.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((item) => !item.hasAttribute("disabled"));
    if (!items.length) {
      ev.preventDefault();
      return;
    }
    const active = this.shadowRoot?.activeElement ?? null;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && (active === first || active === this._panel)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  };

  private _focusOut = (ev: FocusEvent) => {
    const next = ev.relatedTarget as Node | null;
    if (
      this._open &&
      next &&
      !this.shadowRoot?.contains(next) &&
      next !== this
    ) {
      this._close(false);
    }
  };

  private _toggle() {
    if (this._open) {
      this._close(true);
    } else {
      this._open = true;
    }
  }

  private _close(returnFocus: boolean) {
    this._open = false;
    if (returnFocus) {
      this._trigger?.focus();
    }
  }

  private _closeButton = () => {
    this._close(true);
  };

  private _openHelp = () => {
    this._close(false);
    openHelpArticle(this, this.helpPath);
  };

  private _practiseSwitch = (ev: Event) => {
    this._practiseValue = (ev.target as HTMLInputElement).checked;
  };

  private _practiseText = (ev: Event) => {
    this._practiseValue = String((ev.target as HTMLInputElement).value ?? "");
  };

  private _practiseReset = () => {
    this._resetPractise();
  };

  private _renderExample(): TemplateResult | typeof nothing {
    const rows = usableExamples(this.example);
    if (!rows.length) {
      return nothing;
    }
    return html`<div class="section">
      <span class="heading">${this._text("example")}</span>
      <ul class="example">
        ${rows.map(
          (row) =>
            html`<li>
              <span class="in" title=${this._text("exampleInput")}
                >${row.input}</span
              >
              <span class="arrow" aria-hidden="true">→</span>
              <span class="out" title=${this._text("exampleResult")}
                >${row.result}</span
              >
            </li>`
        )}
      </ul>
    </div>`;
  }

  private _renderPractise(): TemplateResult | typeof nothing {
    const spec = this.practise;
    if (!spec) {
      return nothing;
    }
    const value = this._practiseValue;
    const result = evaluatePractise(spec, value);
    const message = this._key(`practise_msg_${result.code}`, result.params);
    const control = this._text("practiseControl", { name: this.label });
    let field: TemplateResult;
    if (spec.type === "switch") {
      field = html`<ha-switch
        .checked=${Boolean(value)}
        aria-label=${control}
        @change=${this._practiseSwitch}
      ></ha-switch>`;
    } else if (spec.type === "number") {
      field = html`<div class="number">
        <ha-slider
          .min=${Math.min(spec.min, spec.max)}
          .max=${Math.max(spec.min, spec.max)}
          .step=${spec.step ?? 1}
          .value=${Number(result.value)}
          aria-label=${control}
          @input=${this._practiseText}
        ></ha-slider>
        <ha-input
          class="entry"
          type="text"
          inputmode="decimal"
          .value=${String(value)}
          .accessibleLabel=${control}
          @input=${this._practiseText}
        ></ha-input>
        ${spec.unit ? html`<span class="unit">${spec.unit}</span>` : nothing}
      </div>`;
    } else {
      field = html`<ha-input
        class="entry"
        type="text"
        .value=${String(value)}
        .placeholder=${spec.placeholder ?? ""}
        .accessibleLabel=${control}
        @input=${this._practiseText}
      ></ha-input>`;
    }
    return html`<div class="section practise">
      <span class="heading">${this._text("practise")}</span>
      <p class="note">${this._text("practiseNote")}</p>
      ${field}
      <p class="result" data-state=${result.state} role="status">${message}</p>
      <button type="button" class="help" @click=${this._practiseReset}>
        ${this._text("practiseReset")}
      </button>
    </div>`;
  }

  protected render(): TemplateResult {
    const name = this._text("button", { name: this.label });
    const hasHelp = !!this.helpPath && !!parseHelpAddress(this.helpPath);
    const panelId = `${this._id}-panel`;
    const titleId = `${this._id}-title`;
    return html`
      <button
        type="button"
        class="trigger"
        aria-label=${name}
        aria-haspopup="dialog"
        aria-expanded=${this._open ? "true" : "false"}
        aria-controls=${panelId}
        @click=${this._toggle}
      >
        <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
      </button>
      ${
        this._open
          ? html`<div
              class="panel"
              id=${panelId}
              role="dialog"
              aria-labelledby=${titleId}
              tabindex="-1"
              style=${styleMap(this._placement)}
              @focusout=${this._focusOut}
              @keydown=${this._trapFocus}
            >
              <div class="head">
                <h3 id=${titleId}>${this.label}</h3>
                <button
                  type="button"
                  class="close"
                  aria-label=${this._text("close")}
                  @click=${this._closeButton}
                >
                  <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
                </button>
              </div>
              ${this._section("what", this.description)}
              ${this._section("defaultValue", this.defaultText)}
              ${this._section("reach", this.reach)}
              ${this._section(
                "holding",
                this.holding || this._text("holdingNothing")
              )}
              ${this._renderExample()} ${this._renderPractise()}
              ${
                hasHelp
                  ? html`<button
                      type="button"
                      class="help"
                      @click=${this._openHelp}
                    >
                      ${this._text("openHelp")}
                    </button>`
                  : nothing
              }
            </div>`
          : nothing
      }
    `;
  }

  private _section(
    heading: keyof SettingInfoLabels,
    body: string
  ): TemplateResult | typeof nothing {
    if (!body) {
      return nothing;
    }
    return html`<div class="section">
      <span class="heading">${this._text(heading)}</span>
      <p>${body}</p>
    </div>`;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: inline-flex;
    }
    .trigger,
    .close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--secondary-text-color);
      font: inherit;
      cursor: pointer;
    }
    .trigger:hover,
    .close:hover {
      background: var(--secondary-background-color);
    }
    .trigger:focus-visible,
    .close:focus-visible,
    .help:focus-visible,
    .panel:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .trigger[aria-expanded="true"] {
      color: var(--primary-color);
    }
    .panel {
      position: fixed;
      z-index: 8;
      box-sizing: border-box;
      overflow-y: auto;
      padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-4);
      border-radius: 16px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      text-align: start;
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal, 1.4);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    h3 {
      margin: 0;
      min-width: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .section {
      margin-top: var(--ha-space-2);
    }
    .heading {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs, 12px);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      margin: var(--ha-space-1) 0 0;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    .example {
      margin: var(--ha-space-1) 0 0;
      padding: 0;
      list-style: none;
    }
    .example li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1) var(--ha-space-2);
      padding: var(--ha-space-1) 0;
      overflow-wrap: anywhere;
    }
    .example .in {
      font-family: var(--ha-font-family-code, monospace);
    }
    .example .arrow {
      color: var(--secondary-text-color);
    }
    .practise {
      padding: var(--ha-space-2);
      border-radius: 12px;
      background: var(--secondary-background-color);
    }
    .note {
      color: var(--secondary-text-color);
    }
    .number {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    .number ha-slider {
      flex: 1 1 140px;
      min-width: 0;
      width: auto;
    }
    .entry {
      display: block;
      min-width: 0;
      margin-top: var(--ha-space-2);
    }
    .number .entry {
      flex: 0 1 120px;
      margin-top: 0;
    }
    .unit {
      color: var(--secondary-text-color);
    }
    .result {
      min-height: 1.4em;
    }
    .result[data-state="invalid"] {
      color: var(--error-color);
    }
    .result[data-state="adjusted"] {
      color: var(--warning-color, var(--primary-text-color));
    }
    .help {
      min-height: 44px;
      margin-top: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      border: 0;
      background: none;
      color: var(--primary-color);
      font: inherit;
      cursor: pointer;
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-setting-info": HaSettingInfo;
  }
}
